'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { uploadToStorage } from '@/lib/supabase-storage';

export interface ProductRecord {
    id: string;
    name: string;
    brand: string | null;
    category: string;
    color: string | null;
    unit: string;
    image_thumb_url: string | null;
    notes: string | null;
    stock_current: number;
    threshold_min: number | null;
    supplier: string | null;
    link: string | null;
    unit_cost: number | null;
    created_at: string;
    updated_at: string;
}

interface ProductListFilters {
    search?: string;
    category?: string;
    color?: string;
    activeOnly?: boolean;
}

interface ProductImagePayload {
    thumbBase64: string;
    fullBase64: string;
    thumbMimeType: string;
    fullMimeType: string;
}

interface CreateProductInput {
    name: string;
    brand?: string;
    category: string;
    color?: string;
    unit: string;
    notes?: string;
    thresholdMin?: number | null;
    stockInitial?: number;
    supplier?: string;
    link?: string;
    unitCost?: number;
    imagePayload?: ProductImagePayload | null;
}

interface UpdateProductInput {
    id: string;
    name?: string;
    brand?: string;
    category?: string;
    color?: string;
    unit?: string;
    notes?: string;
    thresholdMin?: number | null;
    supplier?: string;
    link?: string;
    unitCost?: number;
    imagePayload?: ProductImagePayload | null;
}

function sanitizeOptionalText(value?: string | null) {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function sanitizeRequiredText(value: string) {
    return value.trim();
}

function slugifyName(name: string) {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function buildInternalQrCode() {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomUUID().split('-')[0].toUpperCase();
    return `INV-${stamp}-${random}`;
}

async function getAuthenticatedUser() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesion invalida. Vuelve a iniciar sesion.');
    return { supabase, user };
}

async function logItemEdit(
    supabase: Awaited<ReturnType<typeof createClient>>,
    itemId: string,
    userEmail: string,
    changes: Record<string, { before: unknown; after: unknown }>,
    motivo: string = 'Edicion de item'
) {
    const rows = Object.entries(changes)
        .filter(([, { before, after }]) => String(before ?? '') !== String(after ?? ''))
        .map(([campo, { before, after }]) => ({
            id_registro: itemId,
            tabla_origen: 'inventario_items',
            campo_modificado: campo,
            valor_anterior: before != null ? String(before) : null,
            valor_nuevo: after != null ? String(after) : null,
            usuario_editor: userEmail,
            usuario_email: userEmail,
            motivo_edicion: motivo,
        }));

    if (rows.length === 0) return;
    await supabase.from('historial_ediciones').insert(rows);
}

async function uploadProductImages(productName: string, payload: ProductImagePayload) {
    const baseName = slugifyName(productName) || 'producto';
    const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const thumbUpload = await uploadToStorage(
        'inventory-products',
        `${baseName}-${suffix}-thumb.webp`,
        payload.thumbBase64,
        payload.thumbMimeType || 'image/webp'
    );

    if (!thumbUpload.success) {
        return { success: false as const, error: thumbUpload.error || 'No se pudo subir la miniatura' };
    }

    const fullUpload = await uploadToStorage(
        'inventory-products',
        `${baseName}-${suffix}-full.webp`,
        payload.fullBase64,
        payload.fullMimeType || 'image/webp'
    );

    if (!fullUpload.success) {
        return { success: false as const, error: fullUpload.error || 'No se pudo subir la imagen completa' };
    }

    return {
        success: true as const,
        thumbUrl: thumbUpload.publicUrl || null,
        fullUrl: fullUpload.publicUrl || null,
    };
}

export async function listInventoryProducts(filters: ProductListFilters = {}) {
    const supabase = await createClient();

    let query = supabase
        .from('inventario_items')
        .select(`
            id,
            name:nombre,
            brand:marca,
            category:categoria,
            color:area,
            unit:unidad_medida,
            image_thumb_url:imagen_url,
            notes:descripcion,
            stock_current:stock_actual,
            threshold_min:stock_minimo,
            created_at,
            updated_at
        `)
        .order('nombre', { ascending: true })
        .limit(500);

    const search = sanitizeOptionalText(filters.search);
    if (search) {
        const escapedSearch = search.replace(/,/g, ' ');
        query = query.or(`nombre.ilike.%${escapedSearch}%,marca.ilike.%${escapedSearch}%,categoria.ilike.%${escapedSearch}%,area.ilike.%${escapedSearch}%`);
    }

    const category = sanitizeOptionalText(filters.category);
    if (category && category !== 'Todos') {
        query = query.eq('categoria', category);
    }

    const color = sanitizeOptionalText(filters.color);
    if (color && color !== 'Todos') {
        query = query.eq('area', color);
    }

    const { data, error } = await query;
    if (error) {
        return { success: false, error: error.message, products: [] as ProductRecord[] };
    }

    // Adapt to interface expected by UI
    const products = (data || []).map((p: any) => ({
        id: p.id,
        name: p.nombre,
        brand: p.marca,
        category: p.categoria,
        color: p.area,
        unit: p.unidad_medida,
        image_thumb_url: p.imagen_url,
        notes: p.descripcion,
        stock_current: Number(p.stock_actual || 0),
        threshold_min: Number(p.stock_minimo || 0),
        supplier: p.proveedor,
        link: p.link,
        unit_cost: Number(p.costo_unitario || 0),
        created_at: p.created_at,
        updated_at: p.updated_at,
    })) as ProductRecord[];

    return { success: true, products };
}

export async function createInventoryProduct(input: CreateProductInput) {
    try {
        const { supabase, user } = await getAuthenticatedUser();

        const name = sanitizeRequiredText(input.name || '');
        const category = sanitizeRequiredText(input.category || '');
        const unit = sanitizeRequiredText(input.unit || '');

        if (!name || !category || !unit) {
            return { success: false, error: 'Completa nombre, categoria y unidad.' };
        }

        let imageUrl: string | null = null;

        if (input.imagePayload) {
            const upload = await uploadProductImages(name, input.imagePayload);
            if (!upload.success) {
                return { success: false, error: upload.error };
            }
            imageUrl = upload.thumbUrl;
        }

        const stockInitial = Math.max(0, Number(input.stockInitial || 0));

        const insertPayload = {
            nombre: name,
            marca: sanitizeOptionalText(input.brand),
            categoria: category,
            area: sanitizeOptionalText(input.color),
            unidad_medida: unit,
            imagen_url: imageUrl,
            descripcion: sanitizeOptionalText(input.notes),
            stock_actual: stockInitial,
            stock_minimo: input.thresholdMin ?? null,
            proveedor: sanitizeOptionalText(input.supplier),
            link: sanitizeOptionalText(input.link),
            costo_unitario: input.unitCost ?? null,
        };

        const { data, error } = await supabase
            .from('inventario_items')
            .insert(insertPayload)
            .select('id')
            .single();

        if (error) {
            return { success: false, error: error.message };
        }

        revalidatePath('/inventario/productos');
        revalidatePath('/inventario');

        return { success: true, productId: data.id };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo crear el producto',
        };
    }
}

export async function updateInventoryProduct(input: UpdateProductInput) {
    try {
        const { supabase, user } = await getAuthenticatedUser();

        const name = sanitizeRequiredText(input.name || '');
        const category = sanitizeRequiredText(input.category || '');
        const unit = sanitizeRequiredText(input.unit || '');

        if (!name || !category || !unit) {
            return { success: false, error: 'Completa nombre, categoria y unidad.' };
        }

        // Read current values for audit log
        const { data: before } = await supabase
            .from('inventario_items')
            .select('nombre, marca, categoria, area, unidad_medida, stock_minimo, descripcion, proveedor, link, costo_unitario')
            .eq('id', input.id)
            .maybeSingle();

        let imageUrl: string | null = null;
        if (input.imagePayload) {
            const upload = await uploadProductImages(name, input.imagePayload);
            if (!upload.success) {
                return { success: false, error: upload.error };
            }
            imageUrl = upload.thumbUrl;
        }

        const patchPayload = {
            nombre: name,
            marca: sanitizeOptionalText(input.brand),
            categoria: category,
            area: sanitizeOptionalText(input.color),
            unidad_medida: unit,
            stock_minimo: input.thresholdMin ?? null,
            descripcion: sanitizeOptionalText(input.notes),
            proveedor: sanitizeOptionalText(input.supplier),
            link: sanitizeOptionalText(input.link),
            costo_unitario: input.unitCost ?? null,
            ...(imageUrl !== null ? { imagen_url: imageUrl } : {}),
        };

        const { error } = await supabase
            .from('inventario_items')
            .update(patchPayload)
            .eq('id', input.id);

        if (error) {
            return { success: false, error: error.message };
        }

        // Audit log — only records fields that actually changed
        if (before) {
            await logItemEdit(supabase, input.id, user.email || '', {
                nombre:       { before: before.nombre,       after: patchPayload.nombre },
                marca:        { before: before.marca,        after: patchPayload.marca },
                categoria:    { before: before.categoria,    after: patchPayload.categoria },
                area:         { before: before.area,         after: patchPayload.area },
                unidad_medida:{ before: before.unidad_medida,after: patchPayload.unidad_medida },
                stock_minimo: { before: before.stock_minimo, after: patchPayload.stock_minimo },
                descripcion:  { before: before.descripcion,  after: patchPayload.descripcion },
                proveedor:    { before: before.proveedor,    after: patchPayload.proveedor },
                link:         { before: before.link,         after: patchPayload.link },
                costo_unitario:{ before: before.costo_unitario, after: patchPayload.costo_unitario },
            });
        }

        revalidatePath('/inventario/productos');
        revalidatePath('/inventario');

        return { success: true };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo actualizar el producto',
        };
    }
}

export async function updateInventoryProductImage(input: {
    id: string;
    imagePayload: ProductImagePayload;
}) {
    try {
        const { supabase, user } = await getAuthenticatedUser();

        const { data: current, error: currentError } = await supabase
            .from('inventario_items')
            .select('id, nombre')
            .eq('id', input.id)
            .maybeSingle();

        if (currentError || !current) {
            return { success: false, error: currentError?.message || 'Producto no encontrado.' };
        }

        const upload = await uploadProductImages(current.nombre || 'producto', input.imagePayload);
        if (!upload.success) {
            return { success: false, error: upload.error };
        }

        const { error } = await supabase
            .from('inventario_items')
            .update({
                imagen_url: upload.thumbUrl,
            })
            .eq('id', input.id);

        if (error) {
            return { success: false, error: error.message };
        }

        revalidatePath('/inventario/productos');
        revalidatePath('/inventario');
        revalidatePath(`/inventario/productos/${input.id}`);

        return { success: true };
    } catch (error: unknown) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'No se pudo actualizar imagen del producto',
        };
    }
}

export async function listInventoryMovements() {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('inventario_movimientos')
            .select('*, item:inventario_items(nombre, unidad_medida)')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            console.error('Error listing inventory movements:', error);
            return { success: false, error: 'Error al cargar el historial' };
        }

        return { success: true, data };
    } catch (err) {
        console.error('Unexpected error listing movements:', err);
        return { success: false, error: 'Error inesperado' };
    }
}
