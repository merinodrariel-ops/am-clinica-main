'use server';

import { loadDashboardStats } from '@/lib/dashboard-queries';
import { getDashboardDates } from '@/lib/dashboard-dates';
import { getISODateInTimeZone } from '@/lib/local-date';
import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';
import { getExpenseCategoryComparisons, getFinanciacionMensualResumen } from '@/lib/dashboard';
import type { DashboardStats, OwnerDashboardStats, PlanFinanciacionDashboard, ReferralStat } from '@/lib/dashboard';

type PrimeraConsultaRow = {
    id_paciente: string;
    nombre: string;
    apellido: string;
    primera_consulta_fecha: string;
};

type PrimeraConsultaReciente = PrimeraConsultaRow & {
    monthKey: string;
};

type ExpenseDashboardRow = {
    subtipo: string | null;
    usd_equivalente_total: number | null;
    fecha_movimiento: string;
};

async function verifyAccess(allowedRoles: string[]) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthenticated');

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    if (!profile || !allowedRoles.includes(profile.categoria || '')) {
        throw new Error('Unauthorized');
    }
}

export async function getDashboardStatsAction(): Promise<DashboardStats> {
    await verifyAccess(['owner', 'admin', 'developer', 'partner_viewer', 'reception']);
    const supabase = createAdminClient();
    try {
        return await loadDashboardStats(supabase);
    } catch (error) {
        console.error('getDashboardStatsAction:', error);
        throw new Error('No se pudieron cargar los indicadores. Volvé a intentar.');
    }
}

export async function getReferralStatsAction(): Promise<ReferralStat[]> {
    await verifyAccess(['owner', 'admin', 'developer', 'partner_viewer', 'reception']);
    const supabase = createAdminClient();
    try {
        const { data } = await supabase
            .from('pacientes')
            .select('referencia_origen')
            .is('is_deleted', false);

        const counts: Record<string, number> = {};
        data?.forEach((p: { referencia_origen?: string | null }) => {
            const clean = (p.referencia_origen || 'Otro / Desconocido').trim();
            counts[clean] = (counts[clean] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    } catch (error) {
        console.error('getReferralStatsAction:', error);
        return [];
    }
}

export async function getOwnerDashboardStatsAction(
    targetYear?: number,
    targetMonth?: number  // 0-based (0=enero, 11=diciembre)
): Promise<OwnerDashboardStats> {
    await verifyAccess(['owner', 'admin', 'developer']);
    const supabase = createAdminClient();
    try {
        const { year, month, monthStart, nextMonthStart, previousMonthStart,
            previousComparisonEnd, egresosComparacionLabel, comparisonMonthStart,
            monthWindows, nextMonthStartInstant } = getDashboardDates(new Date(), targetYear, targetMonth);

        const { count: totalPacientes } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', false);

        // ─── REGLA DE ORO AM CLÍNICA: Autocompletado JIT (Just-In-Time) ───
        // Sincronizamos las fechas de primera consulta para que el dashboard sea instantáneo.
        // Si el turno pasó el horario y no fue cancelado -> se considera completado y cuenta para el gráfico.
        await supabase.rpc('sync_primera_consulta_dates');

        // Contar primeras consultas desde pacientes.primera_consulta_fecha (fuente de verdad)
        // Este campo solo se setea cuando un turno tipo 'consulta' pasa a completado/arrived
        // y el paciente no tenía fecha previa — evita contar pacientes existentes puestos como notas en la agenda
        const { data: primerasConsultasData } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, primera_consulta_fecha')
            .gte('primera_consulta_fecha', comparisonMonthStart)
            .lt('primera_consulta_fecha', nextMonthStart)
            .eq('is_deleted', false)
            .order('primera_consulta_fecha', { ascending: false });

        const currentMonthKey = monthStart.slice(0, 7);
        const monthlyCounts = monthWindows.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});

        const primerasConsultasRecientes = ((primerasConsultasData || []) as PrimeraConsultaRow[]).map((p): PrimeraConsultaReciente => {
            const monthKey = p.primera_consulta_fecha.slice(0, 7);
            if (monthKey in monthlyCounts) monthlyCounts[monthKey] += 1;
            return { id_paciente: p.id_paciente, nombre: p.nombre, apellido: p.apellido, primera_consulta_fecha: p.primera_consulta_fecha, monthKey };
        });

        const primeraVezMensual = monthWindows.map((m) => ({ ...m, count: monthlyCounts[m.key] || 0 }));
        const listaPrimeraVez = primerasConsultasRecientes
            .filter((p) => p.monthKey === currentMonthKey)
            .map(({ monthKey: _mk, ...rest }) => rest);
        const primeraVezMes = monthlyCounts[currentMonthKey] || 0;

        // Limpiezas por mes (últimos 6 meses) — desde agenda_appointments por type
        const limpiezasWindowStart = `${comparisonMonthStart}T00:00:00-03:00`;
        const { data: limpiezasData } = await supabase
            .from('agenda_appointments')
            .select('start_time')
            .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
            .not('status', 'in', '("cancelled","no_show")')
            .gte('start_time', limpiezasWindowStart)
            .lt('start_time', nextMonthStartInstant);

        const limpiezasCounts = monthWindows.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});
        (limpiezasData || []).forEach((row: { start_time: string }) => {
            const key = getISODateInTimeZone(new Date(row.start_time)).slice(0, 7);
            if (key in limpiezasCounts) limpiezasCounts[key] += 1;
        });
        const limpiezasMensual = monthWindows.map((m) => ({ ...m, count: limpiezasCounts[m.key] || 0 }));

        const { data: incomeData } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .eq('is_deleted', false)
            .eq('estado', 'pagado')
            .gte('fecha_movimiento', monthStart)
            .lt('fecha_movimiento', nextMonthStart);

        const ingresosMesUsd = incomeData?.reduce((sum: number, m: { usd_equivalente: unknown }) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;

        const { data: expenseData } = await supabase
            .from('caja_admin_movimientos')
            .select('subtipo, usd_equivalente_total, fecha_movimiento')
            .eq('is_deleted', false)
            .eq('tipo_movimiento', 'EGRESO')
            .neq('estado', 'Anulado')
            .gte('fecha_movimiento', previousMonthStart)
            .lt('fecha_movimiento', nextMonthStart);

        const allExpenseRows = (expenseData || []) as ExpenseDashboardRow[];
        const currentExpenseRows = allExpenseRows.filter((row) =>
            row.fecha_movimiento >= monthStart && row.fecha_movimiento < nextMonthStart
        );
        const previousExpenseRows = allExpenseRows.filter((row) =>
            row.fecha_movimiento >= previousMonthStart && row.fecha_movimiento < previousComparisonEnd
        );
        const egresosMesUsd = currentExpenseRows.reduce(
            (sum, movement) => sum + (Number(movement.usd_equivalente_total) || 0),
            0,
        );
        const egresosPorCategoria = getExpenseCategoryComparisons(
            currentExpenseRows,
            previousExpenseRows,
        );

        const { data: financData } = await supabase
            .from('planes_financiacion')
            .select('id, paciente_nombre, tratamiento, cuotas_total, cuotas_pagadas, monto_cuota_usd, saldo_restante_usd, fecha_inicio, estado')
            .eq('estado', 'En curso');

        const planesFinanciacion = (financData || []) as PlanFinanciacionDashboard[];
        const { data: cuotaPaymentsData } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .eq('is_deleted', false)
            .eq('estado', 'pagado')
            .not('cuota_nro', 'is', null)
            .gte('fecha_movimiento', monthStart)
            .lt('fecha_movimiento', nextMonthStart);

        const cuotasCobradasMesUsd = cuotaPaymentsData?.reduce((sum: number, m: { usd_equivalente: unknown }) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;
        const financiacionMensual = getFinanciacionMensualResumen(planesFinanciacion, new Date(year, month, 1), cuotasCobradasMesUsd);

        return {
            totalPacientes: totalPacientes || 0,
            primeraVezMes,
            listaPrimeraVez,
            primeraVezMensual,
            primerasConsultasRecientes,
            limpiezasMensual,
            ingresosMesUsd: Math.round(ingresosMesUsd),
            egresosMesUsd: Math.round(egresosMesUsd),
            egresosPorCategoria,
            egresosComparacionLabel,
            personasEnFinanciacion: planesFinanciacion.length,
            cobroMensualFinanciacionUsd: Math.round(financiacionMensual.programadoUsd),
            financiacionMensualCobradoUsd: Math.round(financiacionMensual.cobradoUsd),
            financiacionMensualPendienteUsd: Math.round(financiacionMensual.pendienteUsd),
            deudaTotalUsd: Math.round(planesFinanciacion.reduce((sum, p) => sum + (Number(p.saldo_restante_usd) || 0), 0)),
            planesFinanciacion,
        };
    } catch (error) {
        console.error('getOwnerDashboardStatsAction:', error);
        return { totalPacientes: 0, primeraVezMes: 0, listaPrimeraVez: [], primeraVezMensual: [], primerasConsultasRecientes: [], limpiezasMensual: [], ingresosMesUsd: 0, egresosMesUsd: 0, egresosPorCategoria: [], egresosComparacionLabel: '', personasEnFinanciacion: 0, cobroMensualFinanciacionUsd: 0, financiacionMensualCobradoUsd: 0, financiacionMensualPendienteUsd: 0, deudaTotalUsd: 0, planesFinanciacion: [] };
    }
}
