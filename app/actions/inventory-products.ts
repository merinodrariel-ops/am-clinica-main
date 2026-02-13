'use server';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { uploadToStorage } from '@/lib/supabase-storage';

export interface ProductRecord {
    id: string;
    name: string;
    brand: string | null;
    category: string;
    unit: string;
    barcode: string | null;
    qr_code: string | null;
    image_thumb_url: string | null;
    image_full_url: string | null;
    notes: string | null;
    stock_current: number;
    threshold_min: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface ProductListFilters {
    search?: string;
    category?: string;
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
    unit: string;
    barcode?: string;
    qrCode?: string;
    notes?: string;
    thresholdMin?: number | null;
    stockInitial?: number;
    isActive?: boolean;
    imagePayload?: ProductImagePayload | null;
}

interface UpdateProductInput {
    id: string;
    name: string;
    brand?: string;
    category: string;
    unit: string;
    barcode?: string;
    qrCode?: string;
    notes?: string;
    thresholdMin?: number | null;
    isActive?: boolean;
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

async function getSessionRole() {
    const supabase = await createClient();
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return { error: 'Sesion invalida. Vuelve a iniciar sesion.', user: null as null, role: null as null };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const role = (profile?.role || user.user_metadata?.role || '').toLowerCase();
    return { error: null as string | null, user, role };
}

function getWriteClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
        return null;
    }

    return createSupabaseAdminClient(supabaseUrl, serviceKey);
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
    const authClient = await createClient();

    let query = authClient
        .from('products')
        .select('id, name, brand, category, unit, barcode, qr_code, image_thumb_url, image_full_url, notes, stock_current, threshold_min, is_active, created_at, updated_at')
        .order('name', { ascending: true })
        .limit(500);

    const search = sanitizeOptionalText(filters.search);
    if (search) {
        const escapedSearch = search.replace(/,/g, ' ');
        query = query.or(`name.ilike.%${escapedSearch}%,brand.ilike.%${escapedSearch}%,category.ilike.%${escapedSearch}%,barcode.ilike.%${escapedSearch}%,qr_code.ilike.%${escapedSearch}%`);
    }

    const category = sanitizeOptionalText(filters.category);
    if (category && category !== 'Todos') {
        query = query.eq('category', category);
    }

    if (filters.activeOnly !== false) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) {
        return { success: false, error: error.message, products: [] as ProductRecord[] };
    }

    return { success: true, products: (data || []) as ProductRecord[] };
}

export async function createInventoryProduct(input: CreateProductInput) {
    const auth = await getSessionRole();
    if (auth.error || !auth.user) {
        return { success: false, error: auth.error || 'Sesion invalida' };
    }

    if (!['owner', 'admin'].includes(auth.role || '')) {
        return { success: false, error: 'Solo Admin/Dueno puede crear productos.' };
    }

    const name = sanitizeRequiredText(input.name || '');
    const category = sanitizeRequiredText(input.category || '');
    const unit = sanitizeRequiredText(input.unit || '');

    if (!name || !category || !unit) {
        return { success: false, error: 'Completa nombre, categoria y unidad.' };
    }

    const writeClient = getWriteClient() || (await createClient());

    let imageThumbUrl: string | null = null;
    let imageFullUrl: string | null = null;

    if (input.imagePayload) {
        const upload = await uploadProductImages(name, input.imagePayload);
        if (!upload.success) {
            return { success: false, error: upload.error };
        }

        imageThumbUrl = upload.thumbUrl;
        imageFullUrl = upload.fullUrl;
    }

    const barcode = sanitizeOptionalText(input.barcode);
    const qrCode = sanitizeOptionalText(input.qrCode) || buildInternalQrCode();
    const stockInitial = Math.max(0, Number(input.stockInitial || 0));

    const insertPayload = {
        name,
        brand: sanitizeOptionalText(input.brand),
        category,
        unit,
        barcode,
        qr_code: qrCode,
        image_thumb_url: imageThumbUrl,
        image_full_url: imageFullUrl,
        notes: sanitizeOptionalText(input.notes),
        stock_current: stockInitial,
        threshold_min: input.thresholdMin ?? null,
        is_active: input.isActive !== false,
        created_by: auth.user.id,
        updated_by: auth.user.id,
    };

    const { data, error } = await writeClient
        .from('products')
        .insert(insertPayload)
        .select('id')
        .single();

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un producto con ese barcode o QR.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario/productos');
    revalidatePath('/inventario');

    return { success: true, productId: data.id };
}

export async function updateInventoryProduct(input: UpdateProductInput) {
    const auth = await getSessionRole();
    if (auth.error || !auth.user) {
        return { success: false, error: auth.error || 'Sesion invalida' };
    }

    if (!['owner', 'admin'].includes(auth.role || '')) {
        return { success: false, error: 'Solo Admin/Dueno puede editar productos.' };
    }

    const name = sanitizeRequiredText(input.name || '');
    const category = sanitizeRequiredText(input.category || '');
    const unit = sanitizeRequiredText(input.unit || '');

    if (!name || !category || !unit) {
        return { success: false, error: 'Completa nombre, categoria y unidad.' };
    }

    const writeClient = getWriteClient() || (await createClient());

    let imagePatch: { image_thumb_url?: string | null; image_full_url?: string | null } = {};
    if (input.imagePayload) {
        const upload = await uploadProductImages(name, input.imagePayload);
        if (!upload.success) {
            return { success: false, error: upload.error };
        }

        imagePatch = {
            image_thumb_url: upload.thumbUrl,
            image_full_url: upload.fullUrl,
        };
    }

    const patchPayload = {
        name,
        brand: sanitizeOptionalText(input.brand),
        category,
        unit,
        barcode: sanitizeOptionalText(input.barcode),
        qr_code: sanitizeOptionalText(input.qrCode),
        threshold_min: input.thresholdMin ?? null,
        is_active: input.isActive !== false,
        updated_by: auth.user.id,
        notes: sanitizeOptionalText(input.notes),
        ...imagePatch,
    };

    const { error } = await writeClient
        .from('products')
        .update(patchPayload)
        .eq('id', input.id);

    if (error) {
        if (error.code === '23505') {
            return { success: false, error: 'Ya existe un producto con ese barcode o QR.' };
        }
        return { success: false, error: error.message };
    }

    revalidatePath('/inventario/productos');
    revalidatePath('/inventario');

    return { success: true };
}
