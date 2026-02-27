'use server';

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { awardAchievement, updateGoalProgressByCode } from './worker-portal';

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// Fetch BNA VENTA rate directly (same source as /api/bna-cotizacion)
async function fetchBnaVenta(): Promise<number> {
    try {
        const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
            next: { revalidate: 300 },
        });
        if (res.ok) {
            const data = await res.json();
            return Number(data.venta) || 1050;
        }
    } catch {
        // fall through to fallback
    }
    return 1050;
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export interface LiquidacionResult {
    id: string;
    personal_id: string;
    mes: string;
    modelo_pago: 'hora_ars' | 'prestacion_usd';
    total_horas?: number;
    valor_hora_snapshot?: number;
    total_ars: number;
    total_usd?: number;
    tc_bna_venta: number;
    tc_liquidacion: number;
    prestaciones_validadas: number;
    prestaciones_pendientes: number;
    breakdown: Record<string, unknown>;
    estado: 'pending' | 'approved' | 'paid' | 'rejected';
    fecha_pago?: string;
    observaciones?: string;
    created_at?: string;
}

export interface UpdateLiquidacionManualInput {
    id: string;
    modelo_pago: 'hora_ars' | 'prestacion_usd';
    moneda: 'ARS' | 'USD';
    precio_unitario: number;
    cantidad: number;
    tc_liquidacion: number;
    observaciones?: string;
}

function round(value: number, decimals = 2): number {
    const factor = 10 ** decimals;
    return Math.round((value + Number.EPSILON) * factor) / factor;
}

function normalizeEstado(raw: string | null | undefined): LiquidacionResult['estado'] {
    const value = (raw || '').toLowerCase();
    if (value === 'approved' || value === 'aprobado') return 'approved';
    if (value === 'paid' || value === 'pagado') return 'paid';
    if (value === 'rejected' || value === 'anulado' || value === 'rechazado') return 'rejected';
    return 'pending';
}

export interface LiquidacionAdminRow {
    personal_id: string;
    nombre: string;
    apellido?: string;
    foto_url?: string;
    area?: string;
    tipo: string;
    modelo_pago: 'hora_ars' | 'prestacion_usd';
    liquidacion?: LiquidacionResult;
    tiene_pendientes: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE
// ─────────────────────────────────────────────────────────────────────────────

export async function generateLiquidacion(
    personalId: string,
    mes: string // 'YYYY-MM'
): Promise<LiquidacionResult> {
    const admin = getAdminClient();

    const { data: worker, error: workerError } = await admin
        .from('personal')
        .select('id, nombre, apellido, tipo, valor_hora_ars, porcentaje_honorarios, area, user_id')
        .eq('id', personalId)
        .single();

    if (workerError || !worker) throw new Error('Prestador no encontrado');

    const tcBnaVenta = await fetchBnaVenta();

    const [year, month] = mes.split('-').map(Number);
    const startDate = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${mes}-${String(lastDay).padStart(2, '0')}`;

    const isDoctor = worker.tipo === 'profesional';
    const modeloPago: 'hora_ars' | 'prestacion_usd' = isDoctor ? 'prestacion_usd' : 'hora_ars';

    let totalArs = 0;
    let totalUsd: number | undefined;
    let prestacionesValidadas = 0;
    let prestacionesPendientes = 0;
    let breakdown: Record<string, unknown> = {};

    if (isDoctor) {
        // Doctor: sum prestaciones_realizadas grouped by slides validation
        const { data: prestaciones } = await admin
            .from('prestaciones_realizadas')
            .select('id, prestacion_nombre, monto_honorarios, slides_url, fecha_realizacion')
            .eq('profesional_id', personalId)
            .gte('fecha_realizacion', startDate)
            .lte('fecha_realizacion', endDate);

        const withSlides = (prestaciones || []).filter(p => p.slides_url);
        const withoutSlides = (prestaciones || []).filter(p => !p.slides_url);

        prestacionesValidadas = withSlides.length;
        prestacionesPendientes = withoutSlides.length;

        const rawUsd = withSlides.reduce((s, p) => s + Number(p.monto_honorarios || 0), 0);
        totalUsd = Math.round(rawUsd * 100) / 100;
        totalArs = Math.round(rawUsd * tcBnaVenta * 100) / 100;

        breakdown = {
            con_slides: withSlides.map(p => ({
                id: p.id,
                descripcion: p.prestacion_nombre,
                monto_usd: p.monto_honorarios,
                fecha: p.fecha_realizacion,
            })),
            sin_slides: withoutSlides.map(p => ({
                id: p.id,
                descripcion: p.prestacion_nombre,
                monto_usd: p.monto_honorarios,
                fecha: p.fecha_realizacion,
            })),
            tc_bna_venta: tcBnaVenta,
            total_usd: totalUsd,
            total_ars: totalArs,
        };
    } else {
        // Staff: horas aprobadas/pendientes × valor_hora_ars
        const { data: logs } = await admin
            .from('registro_horas')
            .select('id, fecha, horas, estado')
            .eq('personal_id', personalId)
            .gte('fecha', startDate)
            .lte('fecha', endDate)
            .in('estado', ['Registrado', 'Observado', 'Resuelto']); // Updated states

        const totalHoras = (logs || []).reduce((s, l) => s + Number(l.horas || 0), 0);
        const valorHora = Number(worker.valor_hora_ars || 0);
        totalArs = Math.round(totalHoras * valorHora * 100) / 100;

        breakdown = {
            registros: (logs || []).map(l => ({
                id: l.id,
                fecha: l.fecha,
                horas: l.horas,
                estado: l.estado,
            })),
            total_horas: totalHoras,
            valor_hora_ars: valorHora,
            total_ars: totalArs,
        };
    }

    const mesDate = `${mes}-01`;

    const { data: liq, error: liqError } = await admin
        .from('liquidaciones_mensuales')
        .upsert(
            {
                personal_id: personalId,
                mes: mesDate,
                modelo_pago: modeloPago,
                total_ars: totalArs,
                total_usd: totalUsd ?? null,
                total_horas: isDoctor ? 0 : ((breakdown.total_horas as number) || 0),
                tc_bna_venta: tcBnaVenta,
                tc_liquidacion: tcBnaVenta,
                prestaciones_validadas: prestacionesValidadas,
                prestaciones_pendientes: prestacionesPendientes,
                breakdown,
                estado: 'pending',
            },
            { onConflict: 'personal_id,mes' }
        )
        .select()
        .single();

    if (liqError) throw new Error(liqError.message);

    revalidatePath('/admin/liquidaciones');

    // Evaluate badges after generating (non-blocking)
    checkAndAwardBadges(personalId).catch(console.error);

    return liq as LiquidacionResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE / PAY
// ─────────────────────────────────────────────────────────────────────────────

export async function approveLiquidacion(id: string): Promise<void> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('liquidaciones_mensuales')
        .update({ estado: 'approved' })
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/admin/liquidaciones');
}

export async function markLiquidacionPaid(id: string, fechaPago: string): Promise<void> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('liquidaciones_mensuales')
        .update({ estado: 'paid', fecha_pago: fechaPago })
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/admin/liquidaciones');
}

export async function rejectLiquidacion(id: string, motivo?: string): Promise<void> {
    const admin = getAdminClient();
    const { error } = await admin
        .from('liquidaciones_mensuales')
        .update({ estado: 'rejected', observaciones: motivo ?? null })
        .eq('id', id);

    if (error) throw new Error(error.message);
    revalidatePath('/admin/liquidaciones');
}

export async function updateLiquidacionManual(input: UpdateLiquidacionManualInput): Promise<void> {
    const admin = getAdminClient();

    const precioUnitario = Number(input.precio_unitario);
    const cantidad = Number(input.cantidad);
    const tcLiquidacion = Number(input.tc_liquidacion);

    if (!Number.isFinite(precioUnitario) || precioUnitario < 0) {
        throw new Error('Precio unitario inválido');
    }

    if (!Number.isFinite(cantidad) || cantidad <= 0) {
        throw new Error('Cantidad inválida');
    }

    if (!Number.isFinite(tcLiquidacion) || tcLiquidacion <= 0) {
        throw new Error('Tipo de cambio inválido');
    }

    const { data: current, error: currentError } = await admin
        .from('liquidaciones_mensuales')
        .select('id, tc_bna_venta, breakdown, total_horas, valor_hora_snapshot')
        .eq('id', input.id)
        .single();

    if (currentError || !current) {
        throw new Error('Liquidación no encontrada');
    }

    const montoBase = round(precioUnitario * cantidad, 2);
    const totalArs = input.moneda === 'USD'
        ? round(montoBase * tcLiquidacion, 2)
        : round(montoBase, 2);
    const totalUsd = input.moneda === 'USD'
        ? round(montoBase, 2)
        : round(montoBase / tcLiquidacion, 2);

    const breakdownActual =
        current.breakdown && typeof current.breakdown === 'object' && !Array.isArray(current.breakdown)
            ? current.breakdown as Record<string, unknown>
            : {};

    const { error } = await admin
        .from('liquidaciones_mensuales')
        .update({
            modelo_pago: input.modelo_pago,
            total_ars: totalArs,
            total_usd: totalUsd,
            tc_liquidacion: round(tcLiquidacion, 4),
            tc_bna_venta: current.tc_bna_venta ?? round(tcLiquidacion, 4),
            total_horas: input.modelo_pago === 'hora_ars' ? round(cantidad, 2) : current.total_horas,
            valor_hora_snapshot: input.modelo_pago === 'hora_ars' ? round(precioUnitario, 2) : current.valor_hora_snapshot,
            observaciones: input.observaciones?.trim() || null,
            breakdown: {
                ...breakdownActual,
                manual_override: {
                    moneda: input.moneda,
                    precio_unitario: round(precioUnitario, 2),
                    cantidad: round(cantidad, 2),
                    monto_base: montoBase,
                    tc_liquidacion: round(tcLiquidacion, 4),
                    total_ars: totalArs,
                    total_usd: totalUsd,
                    edited_at: new Date().toISOString(),
                },
            },
            updated_at: new Date().toISOString(),
        })
        .eq('id', input.id);

    if (error) throw new Error(error.message);
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/portal/liquidation');
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN LIST
// ─────────────────────────────────────────────────────────────────────────────

export async function getLiquidacionesAdmin(mes?: string): Promise<LiquidacionAdminRow[]> {
    const admin = getAdminClient();

    const mesDate = mes
        ? `${mes}-01`
        : `${new Date().toISOString().slice(0, 7)}-01`;

    const [workersRes, liqRes] = await Promise.all([
        admin
            .from('personal')
            .select('id, nombre, apellido, foto_url, area, tipo')
            .eq('activo', true)
            .order('nombre'),
        admin
            .from('liquidaciones_mensuales')
            .select('*')
            .eq('mes', mesDate),
    ]);

    const liqMap = new Map((liqRes.data || []).map(l => [l.personal_id, l]));

    return (workersRes.data || []).map(w => {
        const liq = liqMap.get(w.id);
        const liquidacionNormalizada = liq
            ? ({
                ...liq,
                estado: normalizeEstado(liq.estado),
            } as LiquidacionResult)
            : undefined;
        const isDoctor = w.tipo === 'profesional';
        return {
            personal_id: w.id,
            nombre: w.nombre,
            apellido: w.apellido,
            foto_url: w.foto_url,
            area: w.area,
            tipo: w.tipo || 'prestador',
            modelo_pago: isDoctor ? 'prestacion_usd' : 'hora_ars',
            liquidacion: liquidacionNormalizada,
            tiene_pendientes: Boolean(
                liquidacionNormalizada && Number(liquidacionNormalizada.prestaciones_pendientes) > 0
            ),
        };
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// BADGES
// ─────────────────────────────────────────────────────────────────────────────

export async function checkAndAwardBadges(personalId: string): Promise<void> {
    const admin = getAdminClient();

    const { data: worker } = await admin
        .from('personal')
        .select('id, area, tipo, user_id')
        .eq('id', personalId)
        .single();

    if (!worker) return;

    // Badge: master_evidencia — 10+ prestaciones with slides_url
    if (worker.tipo === 'profesional') {
        const { count: slidesCount } = await admin
            .from('prestaciones_realizadas')
            .select('id', { count: 'exact', head: true })
            .eq('personal_id', personalId)
            .not('slides_url', 'is', null);

        const total = slidesCount || 0;

        await updateGoalProgressByCode(personalId, 'slides_10', Math.min(total, 10)).catch(() => null);

        if (total >= 10) {
            await awardAchievement(personalId, 'master_evidencia').catch(() => null);
        }
    }

    // Badge: reloj_suizo — 20+ unique days in current month
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = String(now.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${curYear}-${curMonth}-01`;
    const lastDayOfMonth = new Date(curYear, now.getMonth() + 1, 0).getDate();
    const endOfMonth = `${curYear}-${curMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;

    const { data: diasReg } = await admin
        .from('registro_horas')
        .select('fecha')
        .eq('personal_id', personalId)
        .gte('fecha', startOfMonth)
        .lte('fecha', endOfMonth);

    const uniqueDays = new Set((diasReg || []).map(r => r.fecha)).size;

    await updateGoalProgressByCode(personalId, 'presencia_20', Math.min(uniqueDays, 20)).catch(() => null);

    if (uniqueDays >= 20) {
        await awardAchievement(personalId, 'reloj_suizo').catch(() => null);
    }

    // Badge: ninja_recepcion — 100+ appointments (via user_id → profiles)
    const areaLower = (worker.area || '').toLowerCase();
    if (areaLower.includes('recep') && worker.user_id) {
        const { count: turnCount } = await admin
            .from('agenda_appointments')
            .select('id', { count: 'exact', head: true })
            .eq('created_by', worker.user_id);

        const total = turnCount || 0;

        await updateGoalProgressByCode(personalId, 'turnos_100', Math.min(total, 100)).catch(() => null);

        if (total >= 100) {
            await awardAchievement(personalId, 'ninja_recepcion').catch(() => null);
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEADERBOARD
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
    personal_id: string;
    nombre: string;
    apellido?: string;
    foto_url?: string;
    area?: string;
    rol?: string;
    xp_total: number;
    badges_count: number;
    ranking: number;
}

export async function getMonthlyLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const admin = getAdminClient();

    const { data, error } = await admin
        .from('leaderboard_mensual')
        .select('*')
        .order('ranking', { ascending: true })
        .limit(limit);

    if (error) {
        console.error('Error fetching leaderboard:', error);
        return [];
    }

    return (data || []).map(row => ({
        personal_id: row.personal_id,
        nombre: row.nombre,
        apellido: row.apellido,
        foto_url: row.foto_url,
        area: row.area,
        rol: row.rol,
        xp_total: Number(row.xp_total || 0),
        badges_count: Number(row.badges_count || 0),
        ranking: Number(row.ranking),
    }));
}
