'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import type { ProductRecord } from '@/app/actions/inventory-products';

interface DeviceInfo {
    source?: string;
    match_mode?: 'barcode' | 'manual' | 'visual' | 'unknown';
    visual_score?: number;
    visual_confidence?: 'ALTO' | 'MEDIO' | 'BAJO';
    userAgent?: string;
    platform?: string;
    screen?: string;
}

const VISUAL_SEARCH_LIMIT_PER_MINUTE = 12;
const VISUAL_SEARCH_WINDOW_MS = 60_000;
const visualSearchMemoryLog = new Map<string, number[]>();

export type VisualMatchCandidate = ProductRecord;

export interface StockMovementRecord {
    id: string;
    product_id: string;
    type: 'IN' | 'OUT' | 'ADJUST';
    qty: number;
    note: string | null;
    created_by: string;
    created_at: string;
    device_info: Record<string, unknown> | null;
    product: {
        id: string;
        name: string;
        unit: string;
        category: string;
    } | null;
    created_by_label: string;
}

interface MovementFilters {
    productId?: string;
    type?: 'IN' | 'OUT' | 'ADJUST' | 'ALL';
    dateFrom?: string;
    dateTo?: string;
    search?: string;
    limit?: number;
}

function sanitizeCode(raw: string) {
    return raw.trim();
}

function consumeVisualRateFromMemory(userId: string) {
    const now = Date.now();
    const recent = (visualSearchMemoryLog.get(userId) || []).filter(
        timestamp => now - timestamp <= VISUAL_SEARCH_WINDOW_MS
    );

    if (recent.length >= VISUAL_SEARCH_LIMIT_PER_MINUTE) {
        visualSearchMemoryLog.set(userId, recent);
        return false;
    }

    recent.push(now);
    visualSearchMemoryLog.set(userId, recent);
    return true;
}

async function consumeVisualRateLimit(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string
) {
    const fromIso = new Date(Date.now() - VISUAL_SEARCH_WINDOW_MS).toISOString();

    const { count, error: countError } = await supabase
        .from('inventory_visual_search_log')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', fromIso);

    if (countError) {
        const allowedByMemory = consumeVisualRateFromMemory(userId);
        if (!allowedByMemory) {
            return {
                success: false as const,
                error: 'Demasiadas busquedas visuales. Espera 1 minuto e intenta nuevamente.',
            };
        }

        return { success: true as const };
    }

    if ((count || 0) >= VISUAL_SEARCH_LIMIT_PER_MINUTE) {
        return {
            success: false as const,
            error: 'Limite excedido: maximo 12 busquedas visuales por minuto.',
        };
    }

    const { error: insertError } = await supabase
        .from('inventory_visual_search_log')
        .insert({ user_id: userId });

    if (insertError) {
        const allowedByMemory = consumeVisualRateFromMemory(userId);
        if (!allowedByMemory) {
            return {
                success: false as const,
                error: 'Demasiadas busquedas visuales. Espera 1 minuto e intenta nuevamente.',
            };
        }
    }

    return { success: true as const };
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
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

    const role = (profile?.role || user.user_metadata?.role || '').toLowerCase();
    return { supabase, user, role, error: null as string | null };
}

async function fetchProductByCode(supabase: Awaited<ReturnType<typeof createClient>>, code: string) {
    const fields = 'id, name, brand, category, color, unit, barcode, qr_code, image_thumb_url, image_full_url, notes, stock_current, threshold_min, is_active, created_at, updated_at';

    const byBarcode = await supabase
        .from('products')
        .select(fields)
        .eq('is_active', true)
        .eq('barcode', code)
        .maybeSingle();

    if (byBarcode.data) {
        return byBarcode.data as ProductRecord;
    }

    const byQr = await supabase
        .from('products')
        .select(fields)
        .eq('is_active', true)
        .eq('qr_code', code)
        .maybeSingle();

    return (byQr.data || null) as ProductRecord | null;
}

async function buildCreatorLabels(
    supabase: Awaited<ReturnType<typeof createClient>>,
    rows: Array<{ created_by: string }>
) {
    const userIds = Array.from(new Set(rows.map(row => row.created_by).filter(Boolean)));
    if (userIds.length === 0) return new Map<string, string>();

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds);

    const labelMap = new Map<string, string>();
    (profiles || []).forEach((profile: { id: string; full_name?: string | null; email?: string | null }) => {
        labelMap.set(profile.id, profile.full_name || profile.email || profile.id.slice(0, 8));
    });

    return labelMap;
}

function inRangeByDate(value: string, dateFrom?: string, dateTo?: string) {
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return false;

    if (dateFrom) {
        const fromTime = new Date(`${dateFrom}T00:00:00`).getTime();
        if (time < fromTime) return false;
    }
    if (dateTo) {
        const toTime = new Date(`${dateTo}T23:59:59`).getTime();
        if (time > toTime) return false;
    }
    return true;
}

function buildSearchHaystack(movement: StockMovementRecord) {
    return [
        movement.product?.name || '',
        movement.product?.category || '',
        movement.note || '',
        movement.created_by_label || '',
    ]
        .join(' ')
        .toLowerCase();
}

export async function lookupInventoryProductByCode(rawCode: string) {
    const code = sanitizeCode(rawCode || '');
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
        .from('products')
        .select('id, name, brand, category, color, unit, barcode, qr_code, image_thumb_url, image_full_url, notes, stock_current, threshold_min, is_active, created_at, updated_at')
        .eq('is_active', true)
        .or(`name.ilike.%${escaped}%,brand.ilike.%${escaped}%,category.ilike.%${escaped}%,color.ilike.%${escaped}%,barcode.ilike.%${escaped}%,qr_code.ilike.%${escaped}%`)
        .order('name', { ascending: true })
        .limit(8);

    if (queryError) {
        return { success: false, error: queryError.message, products: [] as ProductRecord[] };
    }

    return { success: true, products: (data || []) as ProductRecord[] };
}

export async function listInventoryStockMovements(filters: MovementFilters = {}) {
    const { supabase, error } = await getAuthAndRole();
    if (error) {
        return { success: false, error, movements: [] as StockMovementRecord[] };
    }

    let query = supabase
        .from('stock_movements')
        .select('id, product_id, type, qty, note, created_by, created_at, device_info, product:products(id, name, unit, category)')
        .order('created_at', { ascending: false })
        .limit(Math.min(Math.max(Number(filters.limit || 200), 10), 800));

    if (filters.productId) {
        query = query.eq('product_id', filters.productId);
    }

    if (filters.type && filters.type !== 'ALL') {
        query = query.eq('type', filters.type);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
        return { success: false, error: queryError.message, movements: [] as StockMovementRecord[] };
    }

    const baseRows = (data || []) as Array<{
        id: string;
        product_id: string;
        type: 'IN' | 'OUT' | 'ADJUST';
        qty: number;
        note: string | null;
        created_by: string;
        created_at: string;
        device_info: Record<string, unknown> | null;
        product:
            | {
                  id: string;
                  name: string;
                  unit: string;
                  category: string;
              }
            | Array<{
                  id: string;
                  name: string;
                  unit: string;
                  category: string;
              }>
            | null;
    }>;

    const creatorLabels = await buildCreatorLabels(supabase, baseRows);

    let movements: StockMovementRecord[] = baseRows.map(row => {
        const product = Array.isArray(row.product) ? row.product[0] || null : row.product;

        return {
            ...row,
            product,
            qty: Number(row.qty || 0),
            created_by_label: creatorLabels.get(row.created_by) || row.created_by.slice(0, 8),
        };
    });

    if (filters.dateFrom || filters.dateTo) {
        movements = movements.filter(movement => inRangeByDate(movement.created_at, filters.dateFrom, filters.dateTo));
    }

    const search = (filters.search || '').trim().toLowerCase();
    if (search) {
        movements = movements.filter(movement => buildSearchHaystack(movement).includes(search));
    }

    return { success: true, movements };
}

export async function getInventoryProductDetail(productId: string) {
    const { supabase, error } = await getAuthAndRole();
    if (error) {
        return {
            success: false,
            error,
            product: null as ProductRecord | null,
            movements: [] as StockMovementRecord[],
        };
    }

    const productRes = await supabase
        .from('products')
        .select('id, name, brand, category, color, unit, barcode, qr_code, image_thumb_url, image_full_url, notes, stock_current, threshold_min, is_active, created_at, updated_at')
        .eq('id', productId)
        .maybeSingle();

    if (productRes.error) {
        return {
            success: false,
            error: productRes.error.message,
            product: null as ProductRecord | null,
            movements: [] as StockMovementRecord[],
        };
    }

    if (!productRes.data) {
        return {
            success: false,
            error: 'Producto no encontrado',
            product: null as ProductRecord | null,
            movements: [] as StockMovementRecord[],
        };
    }

    const movementsRes = await listInventoryStockMovements({ productId, limit: 60 });
    if (!movementsRes.success) {
        return {
            success: true,
            product: productRes.data as ProductRecord,
            movements: [] as StockMovementRecord[],
            movementError: movementsRes.error,
        };
    }

    return {
        success: true,
        product: productRes.data as ProductRecord,
        movements: movementsRes.movements,
    };
}

export async function listInventoryVisualMatchCandidates(limit = 80) {
    const auth = await getAuthAndRole();
    if (auth.error || !auth.user) {
        return { success: false, error: auth.error || 'Sesion invalida', products: [] as VisualMatchCandidate[] };
    }

    const { supabase, role, user } = auth;

    const allowed = ['owner', 'admin', 'reception', 'laboratorio', 'developer'];
    if (!allowed.includes(role || '')) {
        return {
            success: false,
            error: 'No tienes permisos para usar busqueda visual.',
            products: [] as VisualMatchCandidate[],
        };
    }

    const rateCheck = await consumeVisualRateLimit(supabase, user.id);
    if (!rateCheck.success) {
        return {
            success: false,
            error: rateCheck.error,
            products: [] as VisualMatchCandidate[],
        };
    }

    const safeLimit = Math.min(Math.max(Number(limit || 80), 10), 200);
    const { data, error: queryError } = await supabase
        .from('products')
        .select('id, name, brand, category, color, unit, barcode, qr_code, image_thumb_url, image_full_url, notes, stock_current, threshold_min, is_active, created_at, updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(safeLimit);

    if (queryError) {
        return { success: false, error: queryError.message, products: [] as VisualMatchCandidate[] };
    }

    const products = ((data || []) as VisualMatchCandidate[]).filter(
        product => Boolean(product.image_thumb_url || product.image_full_url)
    );

    return { success: true, products };
}

export async function registerInventoryIngress(input: {
    productId: string;
    qty: number;
    note?: string;
    deviceInfo?: DeviceInfo;
}) {
    const qty = Number(input.qty || 0);
    if (!input.productId || qty <= 0) {
        return { success: false, error: 'Producto y cantidad valida son obligatorios.' };
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
        .from('stock_movements')
        .insert({
            product_id: input.productId,
            type: 'IN',
            qty,
            note: (input.note || '').trim() || null,
            device_info: input.deviceInfo || {},
            created_by: user.id,
        })
        .select('id')
        .single();

    if (insertError) {
        return { success: false, error: insertError.message };
    }

    const { data: product, error: productError } = await supabase
        .from('products')
        .select('id, stock_current')
        .eq('id', input.productId)
        .single();

    if (productError) {
        return { success: true, movementId: inserted.id };
    }

    revalidatePath('/inventario/productos');
    revalidatePath('/inventario/escanear');

    return {
        success: true,
        movementId: inserted.id,
        stock_current: Number(product.stock_current || 0),
    };
}
