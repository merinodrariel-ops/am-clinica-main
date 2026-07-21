'use server';

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
        const { count: patientsCount } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', false);

        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();
        const todayStart = new Date(year, month, day).toISOString();
        const monthStart = new Date(year, month, 1).toISOString();

        const { data: todayMovs } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .gte('fecha_hora', todayStart)
            .eq('estado', 'pagado')
            .eq('is_deleted', false);

        const todayIncome = todayMovs?.reduce((sum: number, m: { usd_equivalente: unknown }) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;

        const { data: monthMovs } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .gte('fecha_hora', monthStart)
            .eq('estado', 'pagado')
            .eq('is_deleted', false);

        const monthIncome = monthMovs?.reduce((sum: number, m: { usd_equivalente: unknown }) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;

        const { count: newPatientsCount } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .is('is_deleted', false)
            .gte('fecha_alta', monthStart);

        // Admin cash balance (last closure saldos)
        const { data: lastArqueo } = await supabase
            .from('caja_admin_arqueos')
            .select('saldos_finales')
            .eq('estado', 'cerrado')
            .order('fecha_cierre', { ascending: false })
            .limit(1)
            .maybeSingle();

        const saldos = (lastArqueo?.saldos_finales as Record<string, number>) || {};
        const adminCash = { ars: 0, usd: 0 };
        // Sum all saldos — cuentas ARS/USD split is handled elsewhere; return totals
        Object.values(saldos).forEach(v => { adminCash.ars += Number(v) || 0; });

        const yearStart = new Date(year, 0, 1).toISOString();

        const { count: limpiezasMes } = await supabase
            .from('agenda_appointments')
            .select('*', { count: 'exact', head: true })
            .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
            .not('status', 'in', '("cancelled","no_show")')
            .gte('start_time', monthStart);

        const { count: limpiezasAnio } = await supabase
            .from('agenda_appointments')
            .select('*', { count: 'exact', head: true })
            .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
            .not('status', 'in', '("cancelled","no_show")')
            .gte('start_time', yearStart);

        return {
            patientsCount: patientsCount || 0,
            newPatientsCount: newPatientsCount || 0,
            todayIncome: Math.round(todayIncome),
            monthIncome: Math.round(monthIncome),
            adminCash,
            limpiezasMes: limpiezasMes || 0,
            limpiezasAnio: limpiezasAnio || 0,
        };
    } catch (error) {
        console.error('getDashboardStatsAction:', error);
        return { patientsCount: 0, newPatientsCount: 0, todayIncome: 0, monthIncome: 0, adminCash: { ars: 0, usd: 0 }, limpiezasMes: 0, limpiezasAnio: 0 };
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
        const now = new Date();
        const year = targetYear ?? now.getFullYear();
        const month = targetMonth ?? now.getMonth();
        const monthsToCompare = 6;
        const monthStart = new Date(year, month, 1).toISOString().split('T')[0];
        const nextMonthStart = new Date(year, month + 1, 1).toISOString().split('T')[0];
        const previousMonthStart = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
        const previousMonthLastDay = new Date(year, month, 0).getDate();
        const previousComparisonDay = Math.min(now.getDate(), previousMonthLastDay);
        const previousComparisonEnd = isCurrentMonth
            ? new Date(year, month - 1, previousComparisonDay + 1).toISOString().split('T')[0]
            : monthStart;
        const previousMonthLabel = new Date(year, month - 1, 1)
            .toLocaleDateString('es-AR', { month: 'long' });
        const egresosComparacionLabel = isCurrentMonth
            ? `vs. mismo corte de ${previousMonthLabel}`
            : `vs. ${previousMonthLabel}`;
        const comparisonMonthStart = new Date(year, month - (monthsToCompare - 1), 1).toISOString().split('T')[0];
        const rawMonthWindows = Array.from({ length: monthsToCompare }, (_, index) => {
            const date = new Date(year, month - (monthsToCompare - 1) + index, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const shortLabel = date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').slice(0, 3);
            const label = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
            return { key, shortLabel, label, year: date.getFullYear() };
        });
        const monthWindows = rawMonthWindows.filter(w => w.year >= 2026).map(({ year: _y, ...rest }) => rest);

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
        const limpiezasWindowStart = new Date(year, month - (monthsToCompare - 1), 1).toISOString();
        const { data: limpiezasData } = await supabase
            .from('agenda_appointments')
            .select('start_time')
            .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
            .not('status', 'in', '("cancelled","no_show")')
            .gte('start_time', limpiezasWindowStart)
            .lt('start_time', new Date(year, month + 1, 1).toISOString());

        const limpiezasCounts = monthWindows.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});
        (limpiezasData || []).forEach((row: { start_time: string }) => {
            const key = row.start_time.slice(0, 7);
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
