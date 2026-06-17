'use server';

import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { awardAchievement, updateGoalProgressByCode } from './worker-portal';
import { calculateAdjustedEarnings, type PayrollLog } from '@/lib/payroll-rules';

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

function normalizeText(value?: string | null) {
    return (value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

async function getHourlyDefaults(admin: ReturnType<typeof getAdminClient>) {
    const { data } = await admin
        .from('liquidacion_hour_values')
        .select('cleaning_hour_value, staff_general_hour_value')
        .eq('id', 1)
        .maybeSingle();

    return {
        cleaningHourValue: Number(data?.cleaning_hour_value || 0),
        staffGeneralHourValue: Number(data?.staff_general_hour_value || 0),
    };
}

function getEffectiveHourlyRate(
    personal: { valor_hora_ars?: number | null; area?: string | null; rol?: string | null },
    defaults: { cleaningHourValue: number; staffGeneralHourValue: number }
) {
    const directValue = Number(personal.valor_hora_ars || 0);
    if (directValue > 0) return directValue;

    const area = normalizeText(personal.area);
    const rol = normalizeText(personal.rol);
    const isCleaning = area.includes('limpieza') || rol.includes('limpieza');

    return isCleaning ? defaults.cleaningHourValue : defaults.staffGeneralHourValue;
}

async function getWorkerHistoricalSettings(
    admin: ReturnType<typeof getAdminClient>,
    personalId: string,
    mes: string,
    worker: {
        valor_hora_ars?: number | null;
        area?: string | null;
        rol?: string | null;
        recargo_sabado?: boolean;
        recargo_domingo_feriado?: boolean;
        recargo_nocturno?: boolean;
        horas_base?: number | null;
        costo_hora_extra?: number | null;
    },
    defaults: { cleaningHourValue: number; staffGeneralHourValue: number }
) {
    const normalizedMes = mes.slice(0, 7);
    const [year, month] = normalizedMes.split('-').map(Number);
    const lastDayDate = new Date(year, month + 1, 0);
    const lastDayStr = lastDayDate.toISOString().slice(0, 10);

    const { data: workerHist, error: workerHistError } = await admin
        .from('personal_valores_hora_historia')
        .select('valor_hora_ars, valor_hora_personalizado, recargo_sabado, recargo_domingo_feriado, recargo_nocturno, horas_base, costo_hora_extra')
        .eq('personal_id', personalId)
        .lte('fecha_desde', lastDayStr)
        .order('fecha_desde', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

    if (workerHistError) {
        console.error('Error fetching worker history settings:', workerHistError);
    }

    const hasHist = workerHist && workerHist.length > 0;
    const isCustom = hasHist && workerHist[0].valor_hora_personalizado;

    if (isCustom) {
        const h = workerHist[0];
        return {
            valor_hora_ars: Number(h.valor_hora_ars || 0),
            recargo_sabado: h.recargo_sabado ?? true,
            recargo_domingo_feriado: h.recargo_domingo_feriado ?? true,
            recargo_nocturno: h.recargo_nocturno ?? false,
            horas_base: h.horas_base !== undefined ? h.horas_base : null,
            costo_hora_extra: h.costo_hora_extra !== undefined ? h.costo_hora_extra : null,
        };
    }

    const { data: sucursalHist, error: sucursalHistError } = await admin
        .from('sucursal_valores_hora_historia')
        .select('valor_hora_staff_ars, valor_hora_limpieza_ars')
        .lte('fecha_desde', lastDayStr)
        .order('fecha_desde', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1);

    if (sucursalHistError) {
        console.error('Error fetching sucursal history settings:', sucursalHistError);
    }

    const area = normalizeText(worker.area);
    const rol = normalizeText(worker.rol);
    const isCleaning = area.includes('limpieza') || rol.includes('limpieza');

    let resolvedRate = 0;
    if (sucursalHist && sucursalHist.length > 0) {
        resolvedRate = Number(
            isCleaning ? sucursalHist[0].valor_hora_limpieza_ars : sucursalHist[0].valor_hora_staff_ars
        );
    }

    const finalRate = resolvedRate > 0 
        ? resolvedRate 
        : getEffectiveHourlyRate(worker, defaults);

    const h = hasHist ? workerHist[0] : null;

    return {
        valor_hora_ars: finalRate,
        recargo_sabado: h?.recargo_sabado ?? worker.recargo_sabado ?? true,
        recargo_domingo_feriado: h?.recargo_domingo_feriado ?? worker.recargo_domingo_feriado ?? true,
        recargo_nocturno: h?.recargo_nocturno ?? worker.recargo_nocturno ?? false,
        horas_base: h ? h.horas_base : (worker.horas_base ?? null),
        costo_hora_extra: h ? h.costo_hora_extra : (worker.costo_hora_extra ?? null),
    };
}

const ESTADO_DB_CANDIDATES: Record<LiquidacionResult['estado'], string[]> = {
    // Legacy DB in this project currently accepts Spanish states
    pending: ['Pendiente', 'pending', 'pendiente'],
    // No explicit "approved" state in legacy check; keep as pending-equivalent
    approved: ['Pendiente', 'Aprobado', 'approved', 'aprobado'],
    paid: ['Pagado', 'paid', 'pagado'],
    rejected: ['Anulado', 'rejected', 'anulado', 'Rechazado', 'rechazado'],
};

function isEstadoConstraintError(message: string | undefined): boolean {
    return (message || '').includes('liquidaciones_mensuales_estado_check');
}

export interface LiquidacionAdminRow {
    personal_id: string;
    nombre: string;
    apellido?: string;
    foto_url?: string;
    area?: string;
    app_role?: string;
    empresa_prestadora_id?: string | null;
    empresa_prestadora_nombre?: string | null;
    tipo: string;
    modelo_pago: 'hora_ars' | 'prestacion_usd';
    valor_hora_ars: number;
    liquidacion?: LiquidacionResult;
    tiene_pendientes: boolean;
    total_horas?: number;
    total_proyectado?: number;
}

export interface LiquidacionPagoCajaSuggestion {
    id: string;
    personal_id: string;
    personal_nombre: string;
    mes: string;
    estado: LiquidacionResult['estado'];
    modelo_pago: LiquidacionResult['modelo_pago'];
    total_ars: number;
    total_usd?: number | null;
    tc_liquidacion?: number | null;
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
        .select('id, nombre, apellido, tipo, valor_hora_ars, porcentaje_honorarios, area, user_id, horas_base, costo_hora_extra, recargo_sabado, recargo_domingo_feriado, recargo_nocturno')
        .eq('id', personalId)
        .single();

    if (workerError || !worker) throw new Error('Prestador no encontrado');

    const tcBnaVenta = await fetchBnaVenta();

    const [year, month] = mes.split('-').map(Number);
    const startDate = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${mes}-${String(lastDay).padStart(2, '0')}`;

    const isDoctor = worker.tipo === 'odontologo' || worker.tipo === 'profesional';
    const modeloPago: 'hora_ars' | 'prestacion_usd' = isDoctor ? 'prestacion_usd' : 'hora_ars';

    let totalArs = 0;
    let totalUsd: number | undefined;
    let prestacionesValidadas = 0;
    let prestacionesPendientes = 0;
    let totalHoras = 0;
    let valorHoraSnapshot = Number(worker.valor_hora_ars || 0);
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
            .select('id, fecha, horas, estado, hora_ingreso, hora_egreso')
            .eq('personal_id', personalId)
            .gte('fecha', startDate)
            .lte('fecha', endDate)
            .in('estado', ['Registrado', 'Observado', 'Resuelto', 'pending', 'observado', 'approved']);

        totalHoras = (logs || []).reduce((s, l) => s + Number(l.horas || 0), 0);
        const hourlyDefaults = await getHourlyDefaults(admin);
        const hist = await getWorkerHistoricalSettings(admin, personalId, mes, worker, hourlyDefaults);
        const valorHora = hist.valor_hora_ars;
        valorHoraSnapshot = valorHora;

        // Apply multipliers (holidays/weekends)
        totalArs = Math.round(calculateAdjustedEarnings(logs || [], valorHora, {
            area: worker.area || '',
            recargo_sabado: hist.recargo_sabado,
            recargo_domingo_feriado: hist.recargo_domingo_feriado,
            recargo_nocturno: hist.recargo_nocturno,
            horas_base: hist.horas_base,
            costo_hora_extra: hist.costo_hora_extra,
        }) * 100) / 100;

        breakdown = {
            registros: (logs || []).map(l => ({
                id: l.id,
                fecha: l.fecha,
                horas: l.horas,
                estado: l.estado,
            })),
            total_horas: totalHoras,
            valor_hora_ars: valorHora,
            valor_hora_origen: Number(worker.valor_hora_ars || 0) > 0 ? 'personal' : 'configuracion_global',
            total_ars: totalArs,
        };
    }

    const mesDate = `${mes}-01`;

    const payloadBase = {
        personal_id: personalId,
        mes: mesDate,
        modelo_pago: modeloPago,
        total_ars: totalArs,
        total_usd: totalUsd ?? null,
        total_horas: isDoctor ? 0 : totalHoras,
        valor_hora_snapshot: valorHoraSnapshot,
        tc_bna_venta: tcBnaVenta,
        tc_liquidacion: tcBnaVenta,
        prestaciones_validadas: prestacionesValidadas,
        prestaciones_pendientes: prestacionesPendientes,
        breakdown,
    };

    let liq: unknown = null;
    let liqError: { message?: string } | null = null;

    for (const estadoDb of ESTADO_DB_CANDIDATES.pending) {
        const result = await admin
            .from('liquidaciones_mensuales')
            .upsert(
                {
                    ...payloadBase,
                    estado: estadoDb,
                },
                { onConflict: 'personal_id,mes' }
            )
            .select()
            .single();

        liq = result.data;
        liqError = result.error;

        if (!liqError) break;
        if (!isEstadoConstraintError(liqError.message)) break;
    }

    if (liqError) throw new Error(liqError.message || 'Error al generar liquidación');

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');

    // Evaluate badges after generating (non-blocking)
    checkAndAwardBadges(personalId).catch(console.error);

    return liq as LiquidacionResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// APPROVE / PAY
// ─────────────────────────────────────────────────────────────────────────────

export async function approveLiquidacion(id: string): Promise<void> {
    const admin = getAdminClient();

    let lastError: { message?: string } | null = null;
    for (const estadoDb of ESTADO_DB_CANDIDATES.approved) {
        const { error } = await admin
            .from('liquidaciones_mensuales')
            .update({ estado: estadoDb })
            .eq('id', id);

        if (!error) {
            lastError = null;
            break;
        }

        lastError = error;
        if (!isEstadoConstraintError(error.message)) break;
    }

    if (lastError) throw new Error(lastError.message || 'Error al aprobar liquidación');
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
}

export async function markLiquidacionPaid(id: string, fechaPago: string): Promise<void> {
    const admin = getAdminClient();

    let lastError: { message?: string } | null = null;
    for (const estadoDb of ESTADO_DB_CANDIDATES.paid) {
        const { error } = await admin
            .from('liquidaciones_mensuales')
            .update({ estado: estadoDb, fecha_pago: fechaPago })
            .eq('id', id);

        if (!error) {
            lastError = null;
            break;
        }

        lastError = error;
        if (!isEstadoConstraintError(error.message)) break;
    }

    if (lastError) throw new Error(lastError.message || 'Error al registrar pago');
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
}

export async function registrarMensualidadFija(formData: FormData): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const personalId = String(formData.get('personalId') || '');
        const mes = String(formData.get('mes') || '');
        const moneda = String(formData.get('moneda') || 'USD') as 'ARS' | 'USD';
        const fechaPago = String(formData.get('fechaPago') || '');
        const observaciones = String(formData.get('observaciones') || '').trim();
        const monto = Number(formData.get('monto'));
        const tcInput = Number(formData.get('tcLiquidacion'));
        const comprobante = formData.get('comprobante');

        if (!personalId) throw new Error('Seleccioná un prestador');
        if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mes inválido');
        if (moneda !== 'ARS' && moneda !== 'USD') throw new Error('Moneda inválida');
        if (!fechaPago) throw new Error('Indicá la fecha de pago');
        if (!Number.isFinite(monto) || monto <= 0) throw new Error('Monto inválido');

        const { data: personal, error: personalError } = await admin
            .from('personal')
            .select('id, nombre, apellido, modelo_pago')
            .eq('id', personalId)
            .single();

        if (personalError || !personal) throw new Error('Prestador no encontrado');

        const tcLiquidacion = Number.isFinite(tcInput) && tcInput > 0 ? tcInput : await fetchBnaVenta();
        const totalUsd = moneda === 'USD' ? round(monto, 2) : round(monto / tcLiquidacion, 2);
        const totalArs = moneda === 'ARS' ? round(monto, 2) : round(monto * tcLiquidacion, 2);
        const mesDate = `${mes}-01`;
        let comprobanteUrl: string | null = null;
        let comprobanteNombre: string | null = null;

        if (comprobante instanceof File && comprobante.size > 0) {
            const safeName = comprobante.name
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-zA-Z0-9._-]+/g, '-')
                .replace(/^-+|-+$/g, '')
                || 'comprobante';
            const filePath = `${mes}/mensualidades/${personalId}-${Date.now()}-${safeName}`;
            const bytes = Buffer.from(await comprobante.arrayBuffer());
            const { data: uploadData, error: uploadError } = await admin.storage
                .from('caja-admin')
                .upload(filePath, bytes, {
                    contentType: comprobante.type || 'application/octet-stream',
                    upsert: false,
                });

            if (uploadError) throw new Error(`No se pudo subir el comprobante: ${uploadError.message}`);
            comprobanteUrl = `storage:caja-admin:${uploadData.path}`;
            comprobanteNombre = comprobante.name;
        }

        const payloadBase = {
            personal_id: personalId,
            mes: mesDate,
            modelo_pago: 'hora_ars',
            total_ars: totalArs,
            total_usd: totalUsd,
            total_horas: 0,
            valor_hora_snapshot: 0,
            tc_bna_venta: tcLiquidacion,
            tc_liquidacion: tcLiquidacion,
            prestaciones_validadas: 0,
            prestaciones_pendientes: 0,
            fecha_pago: fechaPago,
            observaciones: observaciones || null,
            breakdown: {
                tipo: 'mensualidad_fija',
                personal: `${personal.nombre || ''} ${personal.apellido || ''}`.trim(),
                monto,
                moneda,
                total_ars: totalArs,
                total_usd: totalUsd,
                tc_liquidacion: tcLiquidacion,
                fecha_pago: fechaPago,
                comprobante_url: comprobanteUrl,
                comprobante_nombre: comprobanteNombre,
                observaciones: observaciones || null,
                registrado_at: new Date().toISOString(),
            },
        };

        let lastError: { message?: string } | null = null;
        for (const estadoDb of ESTADO_DB_CANDIDATES.paid) {
            const { error } = await admin
                .from('liquidaciones_mensuales')
                .upsert(
                    {
                        ...payloadBase,
                        estado: estadoDb,
                    },
                    { onConflict: 'personal_id,mes' }
                );

            if (!error) {
                lastError = null;
                break;
            }

            lastError = error;
            if (!isEstadoConstraintError(error.message)) break;
        }

        if (lastError) throw new Error(lastError.message || 'Error al registrar mensualidad');

        revalidatePath('/admin/liquidaciones');
        revalidatePath('/caja-admin');
        revalidatePath('/caja-admin/liquidaciones');

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al registrar mensualidad',
        };
    }
}

export async function sincronizarLiquidacionDesdeMovimientoCaja(input: {
    movimientoId: string;
    personalId?: string;
    liquidacionId?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const { movimientoId, personalId, liquidacionId } = input;

        if (!movimientoId) throw new Error('Movimiento inválido');
        if (!personalId && !liquidacionId) throw new Error('Seleccioná una liquidación o un prestador');

        const { data: movimiento, error: movError } = await admin
            .from('caja_admin_movimientos')
            .select('id, fecha_movimiento, descripcion, subtipo, nota, adjuntos, tc_bna_venta, usd_equivalente_total, tipo_movimiento, caja_admin_movimiento_lineas(*)')
            .eq('id', movimientoId)
            .single();

        if (movError || !movimiento) throw new Error('Movimiento de caja no encontrado');
        if (movimiento.tipo_movimiento !== 'EGRESO') {
            throw new Error('Solo se sincronizan egresos de caja');
        }

        const fechaMovimiento = String(movimiento.fecha_movimiento || new Date().toISOString().slice(0, 10));
        const tcLiquidacion = Number(movimiento.tc_bna_venta || 0) > 0
            ? Number(movimiento.tc_bna_venta)
            : await fetchBnaVenta();

        const lines = Array.isArray(movimiento.caja_admin_movimiento_lineas)
            ? movimiento.caja_admin_movimiento_lineas as Array<{ importe?: number | null; moneda?: string | null; usd_equivalente?: number | null; cuenta_id?: string | null }>
            : [];
        const totalUsdMovimiento = round(
            Number(movimiento.usd_equivalente_total || 0) || lines.reduce((sum, line) => {
                const moneda = String(line.moneda || '').toUpperCase();
                const importe = Number(line.importe || 0);
                const usdEq = Number(line.usd_equivalente);
                if (Number.isFinite(usdEq) && usdEq > 0) return sum + usdEq;
                if (moneda === 'USD') return sum + importe;
                if (moneda === 'ARS' && tcLiquidacion > 0) return sum + (importe / tcLiquidacion);
                return sum;
            }, 0),
            2
        );
        const totalArsMovimiento = round(totalUsdMovimiento * tcLiquidacion, 2);
        const adjuntos = Array.isArray(movimiento.adjuntos) ? movimiento.adjuntos : [];

        if (liquidacionId) {
            const { data: liquidacion, error: liqError } = await admin
                .from('liquidaciones_mensuales')
                .select('id, personal_id, mes, estado, total_ars, total_usd, tc_liquidacion, breakdown, observaciones')
                .eq('id', liquidacionId)
                .single();

            if (liqError || !liquidacion) throw new Error('Liquidación no encontrada');

            const estado = normalizeEstado(liquidacion.estado);
            if (estado === 'paid') return { success: true };
            if (estado === 'rejected') throw new Error('No se puede pagar una liquidación rechazada');

            const breakdownActual =
                liquidacion.breakdown && typeof liquidacion.breakdown === 'object' && !Array.isArray(liquidacion.breakdown)
                    ? liquidacion.breakdown as Record<string, unknown>
                    : {};

            let lastError: { message?: string } | null = null;
            for (const estadoDb of ESTADO_DB_CANDIDATES.paid) {
                const { error } = await admin
                    .from('liquidaciones_mensuales')
                    .update({
                        estado: estadoDb,
                        fecha_pago: fechaMovimiento,
                        observaciones: liquidacion.observaciones || movimiento.nota || movimiento.descripcion || null,
                        breakdown: {
                            ...breakdownActual,
                            pago_caja_admin: {
                                origen: 'caja_admin_movimientos',
                                caja_movimiento_id: movimiento.id,
                                descripcion: movimiento.descripcion,
                                subtipo: movimiento.subtipo,
                                nota: movimiento.nota,
                                fecha_pago: fechaMovimiento,
                                total_movimiento_usd: totalUsdMovimiento,
                                total_movimiento_ars: totalArsMovimiento,
                                total_liquidacion_usd: liquidacion.total_usd ?? null,
                                total_liquidacion_ars: liquidacion.total_ars,
                                tc_liquidacion: tcLiquidacion,
                                adjuntos,
                                comprobante_url: adjuntos[0] || null,
                                lineas: lines.map((line) => ({
                                    cuenta_id: line.cuenta_id || null,
                                    importe: Number(line.importe || 0),
                                    moneda: line.moneda || null,
                                    usd_equivalente: Number(line.usd_equivalente || 0),
                                })),
                                sincronizado_at: new Date().toISOString(),
                            },
                        },
                    })
                    .eq('id', liquidacion.id);

                if (!error) {
                    lastError = null;
                    break;
                }

                lastError = error;
                if (!isEstadoConstraintError(error.message)) break;
            }

            if (lastError) throw new Error(lastError.message || 'Error al marcar liquidación como pagada');

            revalidatePath('/admin/liquidaciones');
            revalidatePath('/caja-admin');
            revalidatePath('/caja-admin/liquidaciones');

            return { success: true };
        }

        const { data: personal, error: personalError } = await admin
            .from('personal')
            .select('id, nombre, apellido, modelo_pago, monto_mensual, moneda_mensual')
            .eq('id', personalId!)
            .single();

        if (personalError || !personal) throw new Error('Prestador no encontrado');

        const mes = fechaMovimiento.slice(0, 7);
        const mesDate = `${mes}-01`;
        const totalUsd = round(
            totalUsdMovimiento,
            2
        );
        const totalArs = round(totalUsd * tcLiquidacion, 2);

        const payloadBase = {
            personal_id: personalId,
            mes: mesDate,
            modelo_pago: personal.modelo_pago === 'prestaciones' ? 'prestacion_usd' : 'hora_ars',
            total_ars: totalArs,
            total_usd: totalUsd,
            total_horas: 0,
            valor_hora_snapshot: 0,
            tc_bna_venta: tcLiquidacion,
            tc_liquidacion: tcLiquidacion,
            prestaciones_validadas: 0,
            prestaciones_pendientes: 0,
            fecha_pago: fechaMovimiento,
            observaciones: movimiento.nota || movimiento.descripcion || null,
            breakdown: {
                tipo: personal.modelo_pago === 'mensual' ? 'mensualidad_fija' : 'pago_liquidacion_caja_admin',
                origen: 'caja_admin_movimientos',
                caja_movimiento_id: movimiento.id,
                personal: `${personal.nombre || ''} ${personal.apellido || ''}`.trim(),
                descripcion: movimiento.descripcion,
                subtipo: movimiento.subtipo,
                nota: movimiento.nota,
                fecha_pago: fechaMovimiento,
                total_usd: totalUsd,
                total_ars: totalArs,
                tc_liquidacion: tcLiquidacion,
                adjuntos,
                comprobante_url: adjuntos[0] || null,
                lineas: lines.map((line) => ({
                    cuenta_id: line.cuenta_id || null,
                    importe: Number(line.importe || 0),
                    moneda: line.moneda || null,
                    usd_equivalente: Number(line.usd_equivalente || 0),
                })),
                sincronizado_at: new Date().toISOString(),
            },
        };

        let lastError: { message?: string } | null = null;
        for (const estadoDb of ESTADO_DB_CANDIDATES.paid) {
            const { error } = await admin
                .from('liquidaciones_mensuales')
                .upsert(
                    {
                        ...payloadBase,
                        estado: estadoDb,
                    },
                    { onConflict: 'personal_id,mes' }
                );

            if (!error) {
                lastError = null;
                break;
            }

            lastError = error;
            if (!isEstadoConstraintError(error.message)) break;
        }

        if (lastError) throw new Error(lastError.message || 'Error al sincronizar liquidación');

        revalidatePath('/admin/liquidaciones');
        revalidatePath('/caja-admin');
        revalidatePath('/caja-admin/liquidaciones');

        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error al sincronizar liquidación',
        };
    }
}

export async function getLiquidacionesPendientesParaCaja(): Promise<LiquidacionPagoCajaSuggestion[]> {
    const admin = getAdminClient();

    const { data, error } = await admin
        .from('liquidaciones_mensuales')
        .select('id, personal_id, mes, estado, modelo_pago, total_ars, total_usd, tc_liquidacion, personal!inner(nombre, apellido, activo)')
        .order('mes', { ascending: false })
        .limit(150);

    if (error) throw new Error(error.message);

    return (data || [])
        .map((row) => {
            const personal = Array.isArray(row.personal) ? row.personal[0] : row.personal;
            return {
                id: row.id,
                personal_id: row.personal_id,
                personal_nombre: `${personal?.nombre || ''} ${personal?.apellido || ''}`.trim(),
                mes: String(row.mes || '').slice(0, 7),
                estado: normalizeEstado(row.estado),
                modelo_pago: row.modelo_pago,
                total_ars: Number(row.total_ars || 0),
                total_usd: row.total_usd == null ? null : Number(row.total_usd),
                tc_liquidacion: row.tc_liquidacion == null ? null : Number(row.tc_liquidacion),
                activo: personal?.activo !== false,
            };
        })
        .filter((row) => row.activo && row.estado !== 'paid' && row.estado !== 'rejected' && row.total_ars > 0)
        .map(({ activo: _activo, ...row }) => row);
}

export async function rejectLiquidacion(id: string, motivo?: string): Promise<void> {
    const admin = getAdminClient();

    let lastError: { message?: string } | null = null;
    for (const estadoDb of ESTADO_DB_CANDIDATES.rejected) {
        const { error } = await admin
            .from('liquidaciones_mensuales')
            .update({ estado: estadoDb, observaciones: motivo ?? null })
            .eq('id', id);

        if (!error) {
            lastError = null;
            break;
        }

        lastError = error;
        if (!isEstadoConstraintError(error.message)) break;
    }

    if (lastError) throw new Error(lastError.message || 'Error al rechazar liquidación');
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
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
        })
        .eq('id', input.id);

    if (error) throw new Error(error.message);
    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
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

    const workersExtendedRes = await admin
        .from('personal')
        .select('id, nombre, apellido, foto_url, area, tipo, user_id, empresa_prestadora_id, empresas_prestadoras:empresa_prestadora_id(nombre), valor_hora_ars, horas_base, costo_hora_extra, recargo_sabado, recargo_domingo_feriado, recargo_nocturno')
        .eq('activo', true)
        .order('nombre');

    let workersData: Array<{
        id: string;
        nombre: string;
        apellido?: string;
        foto_url?: string;
        area?: string;
        tipo?: string;
        user_id?: string | null;
        empresa_prestadora_id?: string | null;
        empresas_prestadoras?: { nombre?: string } | Array<{ nombre?: string }> | null;
        valor_hora_ars?: number;
        horas_base?: number | null;
        costo_hora_extra?: number | null;
        recargo_sabado?: boolean;
        recargo_domingo_feriado?: boolean;
        recargo_nocturno?: boolean;
    }> = [];

    if (workersExtendedRes.error) {
        console.warn('Extended liquidaciones workers query failed, using fallback:', workersExtendedRes.error.message);

        const workersFallbackRes = await admin
            .from('personal')
            .select('id, nombre, apellido, foto_url, area, tipo, user_id, valor_hora_ars, horas_base, costo_hora_extra, recargo_sabado, recargo_domingo_feriado, recargo_nocturno')
            .eq('activo', true)
            .order('nombre');

        if (workersFallbackRes.error) {
            console.error('Error loading workers for liquidaciones:', workersFallbackRes.error);
            return [];
        }

        workersData = (workersFallbackRes.data || []).map((w) => ({
            ...w,
            empresa_prestadora_id: null,
            empresas_prestadoras: null,
        }));
    } else {
        workersData = workersExtendedRes.data || [];
    }

    const { data: liquidacionesData, error: liqError } = await admin
        .from('liquidaciones_mensuales')
        .select('*')
        .eq('mes', mesDate);

    if (liqError) {
        console.error('Error loading liquidaciones:', liqError);
        return [];
    }

    // Fetch all logs for the month to calculate projections
    const [year, month] = mesDate.split('-').map(Number);
    const startDate = `${mesDate}`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${mesDate.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;

    const { data: logsData } = await admin
        .from('registro_horas')
        .select('personal_id, fecha, horas, hora_ingreso, hora_egreso')
        .gte('fecha', startDate)
        .lte('fecha', endDate)
        .in('estado', ['Registrado', 'Observado', 'Resuelto', 'pending', 'observado', 'approved']);

    const logsByWorker = new Map<string, PayrollLog[]>();
    (logsData || []).forEach(log => {
        const list = logsByWorker.get(log.personal_id) || [];
        list.push(log);
        logsByWorker.set(log.personal_id, list);
    });

    const userIds = workersData
        .map((w) => w.user_id)
        .filter((id): id is string => Boolean(id));

    const profileRoles = userIds.length > 0
        ? await admin
            .from('profiles')
            .select('id, categoria')
            .in('id', userIds)
        : { data: [], error: null };

    const roleByUserId = new Map((profileRoles.data || []).map((p) => [p.id, p.categoria]));
    const liqMap = new Map((liquidacionesData || []).map(l => [l.personal_id, l]));

    const hourlyDefaults = await getHourlyDefaults(admin);

    const rows = await Promise.all(workersData.map(async (w) => {
        const liq = liqMap.get(w.id);
        const liquidacionNormalizada = liq
            ? ({
                ...liq,
                estado: normalizeEstado(liq.estado),
            } as LiquidacionResult)
            : undefined;

        const isDoctor = w.tipo === 'odontologo' || w.tipo === 'profesional';
        const workerLogs = logsByWorker.get(w.id) || [];
        const totalHoras = workerLogs.reduce((s, l) => s + Number(l.horas || 0), 0);
        
        const hist = await getWorkerHistoricalSettings(admin, w.id, mesDate, w, hourlyDefaults);

        const totalProyectado = calculateAdjustedEarnings(workerLogs, hist.valor_hora_ars, {
            area: w.area || '',
            recargo_sabado: hist.recargo_sabado,
            recargo_domingo_feriado: hist.recargo_domingo_feriado,
            recargo_nocturno: hist.recargo_nocturno,
            horas_base: hist.horas_base,
            costo_hora_extra: hist.costo_hora_extra,
        });

        return {
            personal_id: w.id,
            nombre: w.nombre,
            apellido: w.apellido,
            foto_url: w.foto_url,
            area: w.area,
            app_role: w.user_id ? roleByUserId.get(w.user_id) || undefined : undefined,
            empresa_prestadora_id: w.empresa_prestadora_id || null,
            empresa_prestadora_nombre: Array.isArray(w.empresas_prestadoras)
                ? (w.empresas_prestadoras[0]?.nombre || null)
                : (w.empresas_prestadoras?.nombre || null),
            tipo: w.tipo || 'prestador',
            modelo_pago: (isDoctor ? 'prestacion_usd' : 'hora_ars') as 'hora_ars' | 'prestacion_usd',
            valor_hora_ars: hist.valor_hora_ars,
            liquidacion: liquidacionNormalizada,
            tiene_pendientes: Boolean(
                liquidacionNormalizada && Number(liquidacionNormalizada.prestaciones_pendientes) > 0
            ),
            total_horas: totalHoras,
            total_proyectado: totalProyectado
        };
    }));

    return rows;
}

export async function generateLiquidacionesEmpresa(empresaId: string, mes: string): Promise<{ generated: number; skipped: number }> {
    const admin = getAdminClient();

    const { data: workers, error } = await admin
        .from('personal')
        .select('id')
        .eq('activo', true)
        .eq('empresa_prestadora_id', empresaId);

    if (error) throw new Error(error.message);

    let generated = 0;
    let skipped = 0;

    for (const worker of workers || []) {
        try {
            await generateLiquidacion(worker.id, mes);
            generated += 1;
        } catch {
            skipped += 1;
        }
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    return { generated, skipped };
}

export async function markLiquidacionesEmpresaPaid(empresaId: string, mes: string, fechaPago: string): Promise<{ updated: number; skipped: number }> {
    const admin = getAdminClient();
    const mesDate = `${mes}-01`;

    const { data: liquidaciones, error } = await admin
        .from('liquidaciones_mensuales')
        .select('id, estado, personal!inner(empresa_prestadora_id)')
        .eq('mes', mesDate)
        .eq('personal.empresa_prestadora_id', empresaId);

    if (error) throw new Error(error.message);

    let updated = 0;
    let skipped = 0;

    for (const liq of liquidaciones || []) {
        if (normalizeEstado(liq.estado) === 'paid') {
            skipped += 1;
            continue;
        }
        await markLiquidacionPaid(liq.id, fechaPago);
        updated += 1;
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/caja-admin/liquidaciones');
    return { updated, skipped };
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
    if (worker.tipo === 'odontologo' || worker.tipo === 'profesional') {
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

// ─────────────────────────────────────────────────────────────────────────────
// PRESTACIONES REALIZADAS — CRUD + RECÁLCULO
// ─────────────────────────────────────────────────────────────────────────────

export interface PrestacionRealizada {
    id: string;
    profesional_id: string;
    paciente_nombre: string;
    prestacion_nombre: string;
    fecha_realizacion: string;
    monto_honorarios: number;
    slides_url: string | null;
}

export interface UpsertPrestacionInput {
    id?: string;           // si undefined → INSERT, si presente → UPDATE
    profesional_id: string;
    paciente_nombre: string;
    prestacion_nombre: string;
    fecha_realizacion: string;   // 'YYYY-MM-DD'
    monto_honorarios: number;    // USD
    slides_url?: string | null;
}

export async function getPrestacionesDelMes(
    personalId: string,
    mes: string   // 'YYYY-MM'
): Promise<PrestacionRealizada[]> {
    const admin = getAdminClient();
    const [y, m] = mes.split('-').map(Number);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await admin
        .from('prestaciones_realizadas')
        .select('id, profesional_id, paciente_nombre, prestacion_nombre, fecha_realizacion, monto_honorarios, slides_url')
        .eq('profesional_id', personalId)
        .gte('fecha_realizacion', startDate)
        .lte('fecha_realizacion', endDate)
        .order('fecha_realizacion', { ascending: true });

    if (error) throw error;
    return (data || []) as PrestacionRealizada[];
}

export async function upsertPrestacion(
    input: UpsertPrestacionInput
): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        if (input.id) {
            const { error } = await admin
                .from('prestaciones_realizadas')
                .update({
                    paciente_nombre: input.paciente_nombre,
                    prestacion_nombre: input.prestacion_nombre,
                    fecha_realizacion: input.fecha_realizacion,
                    monto_honorarios: input.monto_honorarios,
                    slides_url: input.slides_url ?? null,
                })
                .eq('id', input.id);
            if (error) throw error;
        } else {
            const { error } = await admin
                .from('prestaciones_realizadas')
                .insert({
                    profesional_id: input.profesional_id,
                    paciente_nombre: input.paciente_nombre,
                    prestacion_nombre: input.prestacion_nombre,
                    fecha_realizacion: input.fecha_realizacion,
                    monto_honorarios: input.monto_honorarios,
                    slides_url: input.slides_url ?? null,
                });
            if (error) throw error;
        }
        revalidatePath('/admin/liquidaciones');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}

export async function deletePrestacion(
    id: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const { error } = await admin
            .from('prestaciones_realizadas')
            .delete()
            .eq('id', id);
        if (error) throw error;
        revalidatePath('/admin/liquidaciones');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}

export async function recalcularTotalesLiquidacion(
    liquidacionId: string,
    personalId: string,
    mes: string  // 'YYYY-MM'
): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const tcBnaVenta = await fetchBnaVenta();

        const prestaciones = await getPrestacionesDelMes(personalId, mes);
        const withSlides = prestaciones.filter(p => p.slides_url);
        const withoutSlides = prestaciones.filter(p => !p.slides_url);

        const rawUsd = withSlides.reduce((s, p) => s + Number(p.monto_honorarios || 0), 0);
        const totalUsd = Math.round(rawUsd * 100) / 100;
        const totalArs = Math.round(rawUsd * tcBnaVenta * 100) / 100;

        const breakdown = {
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

        const { error } = await admin
            .from('liquidaciones_mensuales')
            .update({
                total_usd: totalUsd,
                total_ars: totalArs,
                tc_liquidacion: tcBnaVenta,
                prestaciones_validadas: withSlides.length,
                prestaciones_pendientes: withoutSlides.length,
                breakdown,
                updated_at: new Date().toISOString(),
            })
            .eq('id', liquidacionId);

        if (error) throw error;
        revalidatePath('/admin/liquidaciones');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// REVERT LIQUIDACIÓN TO PENDING
// Admin utility: reset a paid/approved liquidación back to pending.
// ─────────────────────────────────────────────────────────────────────────────
export async function revertLiquidacionToPending(personalId: string, mes: string): Promise<{ success: boolean; error?: string }> {
    try {
        const admin = getAdminClient();
        const mesDate = mes.length === 7 ? `${mes}-01` : mes;

        let lastError: { message?: string } | null = null;
        for (const estadoDb of ESTADO_DB_CANDIDATES.pending) {
            const { error } = await admin
                .from('liquidaciones_mensuales')
                .update({ estado: estadoDb, fecha_pago: null })
                .eq('personal_id', personalId)
                .eq('mes', mesDate);

            if (!error) { lastError = null; break; }
            lastError = error;
            if (!isEstadoConstraintError(error.message)) break;
        }

        if (lastError) throw new Error(lastError.message || 'Error al revertir liquidación');
        revalidatePath('/admin/liquidaciones');
        revalidatePath('/caja-admin/liquidaciones');
        revalidatePath('/portal/liquidation');
        return { success: true };
    } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : 'Error' };
    }
}
