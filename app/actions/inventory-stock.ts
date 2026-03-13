'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import type { ProductRecord } from '@/app/actions/inventory-products';

export type VisualMatchCandidate = ProductRecord & { image_full_url?: string };

interface DeviceInfo {
    source?: string;
    match_mode?: 'barcode' | 'manual' | 'visual' | 'unknown';
    visual_score?: number;
    visual_confidence?: 'ALTO' | 'MEDIO' | 'BAJO';
    userAgent?: string;
    platform?: string;
    screen?: string;
}

export interface StockMovementRecord {
    id: string;
    item_id: string;
    tipo_movimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo: string | null;
    usuario: string; // email in the new schema
    created_at: string;
    paciente_id?: string | null;
    paciente_nombre?: string | null;
    item: {
        id: string;
        nombre: string;
        unidad_medida: string;
        categoria: string;
    } | null;
}

interface MovementFilters {
    productId?: string;
    type?: 'ENTRADA' | 'SALIDA' | 'AJUSTE' | 'ALL';
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
}

const ITEM_FIELDS = 'id, nombre, marca, categoria, area, unidad_medida, barcode, qr_code, imagen_url, descripcion, stock_actual, stock_minimo, created_at, updated_at';

function mapToProductRecord(p: any): ProductRecord {
    return {
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
        supplier: p.proveedor || null,
        link: p.link || null,
        unit_cost: Number(p.costo_unitario || 0),
        created_at: p.created_at,
        updated_at: p.updated_at,
    };
}

export async function listInventoryVisualMatchCandidates(limit = 80): Promise<{ success: boolean; products: ProductRecord[]; error?: string }> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('inventario_items')
        .select(ITEM_FIELDS)
        .not('imagen_url', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching visual candidates:', error);
        return { success: false, products: [], error: 'Error cargando items con imagen' };
    }

    return { success: true, products: (data || []).map(mapToProductRecord) };
}

async function getAuthAndRole() {
    const supabase = await createClient();
    const {
        data: { user },
        error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
        return { supabase, user: null as null, role: null as null, error: 'Sesion invalida. Inicia sesion nuevamente.' };
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    const role = (profile?.categoria || '').toLowerCase();
    return { supabase, user, role, error: null as string | null };
}

async function fetchProductByCode(supabase: any, code: string) {
    const byBarcode = await supabase
        .from('inventario_items')
        .select(ITEM_FIELDS)
        .eq('barcode', code)
        .maybeSingle();

    if (byBarcode.data) {
        return mapToProductRecord(byBarcode.data);
    }

    const byQr = await supabase
        .from('inventario_items')
        .select(ITEM_FIELDS)
        .eq('qr_code', code)
        .maybeSingle();

    return byQr.data ? mapToProductRecord(byQr.data) : null;
}

export async function lookupInventoryProductByCode(rawCode: string) {
    const code = (rawCode || '').trim();
    if (!code) {
        return { success: false, error: 'Codigo vacio', product: null as ProductRecord | null };
    }

    const { supabase, error } = await getAuthAndRole();
    if (error) {
        return { success: false, error, product: null as ProductRecord | null };
    }

    const product = await fetchProductByCode(supabase, code);

    return {
        success: true,
        product,
        found: Boolean(product),
    };
}

export async function searchInventoryProductsQuick(search: string) {
    const term = (search || '').trim();
    if (!term) {
        return { success: true, products: [] as ProductRecord[] };
    }

    const { supabase, error } = await getAuthAndRole();
    if (error) {
        return { success: false, error, products: [] as ProductRecord[] };
    }

    const escaped = term.replace(/,/g, ' ');
    const { data, error: queryError } = await supabase
        .from('inventario_items')
        .select(ITEM_FIELDS)
        .or(`nombre.ilike.%${escaped}%,marca.ilike.%${escaped}%,categoria.ilike.%${escaped}%,area.ilike.%${escaped}%,barcode.ilike.%${escaped}%,qr_code.ilike.%${escaped}%`)
        .order('nombre', { ascending: true })
        .limit(8);

    if (queryError) {
        return { success: false, error: queryError.message, products: [] as ProductRecord[] };
    }

    return { success: true, products: (data || []).map(mapToProductRecord) };
}

export async function listInventoryStockMovements(filters: MovementFilters = {}) {
    const { supabase, error } = await getAuthAndRole();
    if (error) {
        return { success: false, error, movements: [] as StockMovementRecord[] };
    }

    let query = supabase
        .from('inventario_movimientos')
        .select('id, item_id, tipo_movimiento, cantidad, motivo, usuario, created_at, item:inventario_items(id, nombre, unidad_medida, categoria)')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(Number(filters.limit || 200), 10), 800));

    if (filters.productId) {
        query = query.eq('item_id', filters.productId);
    }

    if (filters.type && filters.type !== 'ALL') {
        query = query.eq('tipo_movimiento', filters.type);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
        return { success: false, error: queryError.message, movements: [] as StockMovementRecord[] };
    }

    let movements: StockMovementRecord[] = (data || []).map((row: any) => {
        const item = Array.isArray(row.item) ? row.item[0] || null : row.item;
        return {
            ...row,
            item,
            cantidad: Number(row.cantidad || 0),
        };
    });

    // Date filtering
    if (filters.dateFrom || filters.dateTo) {
        movements = movements.filter(m => {
            const time = new Date(m.created_at).getTime();
            if (filters.dateFrom) {
                const from = new Date(`${filters.dateFrom}T00:00:00`).getTime();
                if (time < from) return false;
            }
            if (filters.dateTo) {
                const to = new Date(`${filters.dateTo}T23:59:59`).getTime();
                if (time > to) return false;
            }
            return true;
        });
    }

    // Search filtering
    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
        movements = movements.filter(m => {
            const haystack = [
                m.item?.nombre || '',
                m.item?.categoria || '',
                m.motivo || '',
                m.usuario || '',
            ].join(' ').toLowerCase();
            return haystack.includes(search);
        });
    }

    return { success: true, movements };
}

export async function getInventoryProductDetail(productId: string) {
    const { supabase, error } = await getAuthAndRole();
    if (error) {
        return { success: false, error, product: null, movements: [] };
    }

    const { data: product, error: productErr } = await supabase
        .from('inventario_items')
        .select(ITEM_FIELDS)
        .eq('id', productId)
        .maybeSingle();

    if (productErr || !product) {
        return { success: false, error: productErr?.message || 'Producto no encontrado', product: null, movements: [] };
    }

    const mappedProduct = mapToProductRecord(product);
    const movementsRes = await listInventoryStockMovements({ productId, limit: 60 });

    return {
        success: true,
        product: mappedProduct,
        movements: movementsRes.movements || [],
    };
}

export async function registerInventoryIngress(input: {
    productId: string;
    qty: number;
    note?: string;
    deviceInfo?: DeviceInfo;
}) {
    const qty = Number(input.qty || 0);
    if (!input.productId || qty <= 0) {
        return { success: false, error: 'Producto y cantidad validos son obligatorios.' };
    }

    const { supabase, user, role, error } = await getAuthAndRole();
    if (error || !user) {
        return { success: false, error: error || 'Sesion invalida' };
    }

    const allowed = ['owner', 'admin', 'reception', 'laboratorio', 'developer'];
    if (!allowed.includes(role || '')) {
        return { success: false, error: 'No tienes permisos para registrar ingresos de stock.' };
    }

    const { error: insertError, data: inserted } = await supabase
        .from('inventario_movimientos')
        .insert({
            item_id: input.productId,
            tipo_movimiento: 'ENTRADA',
            cantidad: qty,
            motivo: (input.note || '').trim() || 'Ingreso manual',
            usuario: user.email,
        })
        .select('id')
        .single();

    if (insertError) {
        return { success: false, error: insertError.message };
    }

    revalidatePath('/inventario/productos');
    revalidatePath('/inventario');

    return {
        success: true,
        movementId: inserted.id,
    };
}

export async function registerInventoryEgress(input: {
    productId: string;
    qty: number;
    note?: string;
    deviceInfo?: DeviceInfo;
    pacienteId?: string;
    pacienteNombre?: string;
}) {
    const qty = Number(input.qty || 0);
    if (!input.productId || qty <= 0) {
        return { success: false, error: 'Producto y cantidad validos son obligatorios.' };
    }

    const { supabase, user, role, error } = await getAuthAndRole();
    if (error || !user) {
        return { success: false, error: error || 'Sesion invalida' };
    }

    const allowed = ['owner', 'admin', 'reception', 'laboratorio', 'developer'];
    if (!allowed.includes(role || '')) {
        return { success: false, error: 'No tienes permisos para registrar salidas de stock.' };
    }

    // Check availability
    const { data: current } = await supabase
        .from('inventario_items')
        .select('stock_actual, nombre')
        .eq('id', input.productId)
        .single();

    if (current && Number(current.stock_actual || 0) < qty) {
        return { success: false, error: `Stock insuficiente para ${current.nombre}. Disponible: ${current.stock_actual}` };
    }

    const { error: insertError, data: inserted } = await supabase
        .from('inventario_movimientos')
        .insert({
            item_id: input.productId,
            tipo_movimiento: 'SALIDA',
            cantidad: qty,
            motivo: (input.note || '').trim() || 'Salida manual',
            usuario: user.email,
            paciente_id: input.pacienteId || null,
            paciente_nombre: input.pacienteNombre || null,
        })
        .select('id')
        .single();

    if (insertError) {
        return { success: false, error: insertError.message };
    }

    revalidatePath('/inventario/productos');
    revalidatePath('/inventario');

    return {
        success: true,
        movementId: inserted.id,
    };
}

export interface PatientMaterialRecord {
    id: string;
    created_at: string;
    tipo_movimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo: string | null;
    usuario: string;
    item: {
        id: string;
        nombre: string;
        unidad_medida: string;
        categoria: string;
        area: string | null;
        descripcion: string | null;
    } | null;
}

export async function getPatientInventoryMaterials(
    pacienteId: string
): Promise<{ data: PatientMaterialRecord[]; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { data: [], error: 'No autenticado' };

    const { data, error } = await supabase
        .from('inventario_movimientos')
        .select('id, created_at, tipo_movimiento, cantidad, motivo, usuario, item:inventario_items(id, nombre, unidad_medida, categoria, area, descripcion)')
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: false });

    if (error) return { data: [], error: error.message };
    return {
        data: (data || []).map((row: any) => ({
            ...row,
            item: Array.isArray(row.item) ? row.item[0] || null : row.item,
            cantidad: Number(row.cantidad || 0),
        })) as PatientMaterialRecord[],
    };
}
