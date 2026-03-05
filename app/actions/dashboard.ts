'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import type { DashboardStats, OwnerDashboardStats, ReferralStat } from '@/lib/dashboard';

export async function getDashboardStatsAction(): Promise<DashboardStats> {
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

        return {
            patientsCount: patientsCount || 0,
            newPatientsCount: newPatientsCount || 0,
            todayIncome: Math.round(todayIncome),
            monthIncome: Math.round(monthIncome),
            adminCash,
        };
    } catch (error) {
        console.error('getDashboardStatsAction:', error);
        return { patientsCount: 0, newPatientsCount: 0, todayIncome: 0, monthIncome: 0, adminCash: { ars: 0, usd: 0 } };
    }
}

export async function getReferralStatsAction(): Promise<ReferralStat[]> {
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

export async function getOwnerDashboardStatsAction(): Promise<OwnerDashboardStats> {
    const supabase = createAdminClient();
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const monthsToCompare = 6;
        const monthStart = new Date(year, month, 1).toISOString().split('T')[0];
        const nextMonthStart = new Date(year, month + 1, 1).toISOString().split('T')[0];
        const comparisonMonthStart = new Date(year, month - (monthsToCompare - 1), 1).toISOString().split('T')[0];
        const monthWindows = Array.from({ length: monthsToCompare }, (_, index) => {
            const date = new Date(year, month - (monthsToCompare - 1) + index, 1);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const shortLabel = date.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '').slice(0, 3);
            const label = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
            return { key, shortLabel, label };
        });

        const { count: totalPacientes } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', false);

        const { data: primeraVezData } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido, primera_consulta_fecha')
            .eq('is_deleted', false)
            .gte('primera_consulta_fecha', comparisonMonthStart)
            .lt('primera_consulta_fecha', nextMonthStart)
            .order('primera_consulta_fecha', { ascending: false });

        const currentMonthKey = monthStart.slice(0, 7);
        const monthlyCounts = monthWindows.reduce<Record<string, number>>((acc, m) => { acc[m.key] = 0; return acc; }, {});

        const primerasConsultasRecientes = (primeraVezData || []).map((p: { id_paciente: string; nombre: string; apellido: string; primera_consulta_fecha?: string | null }) => {
            const monthKey = (p.primera_consulta_fecha || '').slice(0, 7);
            if (monthKey in monthlyCounts) monthlyCounts[monthKey] += 1;
            return { id_paciente: p.id_paciente, nombre: p.nombre, apellido: p.apellido, primera_consulta_fecha: p.primera_consulta_fecha, monthKey };
        });

        const primeraVezMensual = monthWindows.map((m) => ({ ...m, count: monthlyCounts[m.key] || 0 }));
        const listaPrimeraVez = primerasConsultasRecientes
            .filter((p: { monthKey: string }) => p.monthKey === currentMonthKey)
            .map(({ monthKey: _mk, ...rest }: { monthKey: string; id_paciente: string; nombre: string; apellido: string; primera_consulta_fecha?: string | null }) => rest);
        const primeraVezMes = monthlyCounts[currentMonthKey] || 0;

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
            .select('usd_equivalente_total')
            .eq('is_deleted', false)
            .eq('tipo_movimiento', 'EGRESO')
            .neq('estado', 'Anulado')
            .gte('fecha_movimiento', monthStart)
            .lt('fecha_movimiento', nextMonthStart);

        const egresosMesUsd = expenseData?.reduce((sum: number, m: { usd_equivalente_total: unknown }) => sum + (Number(m.usd_equivalente_total) || 0), 0) || 0;

        const { data: financData } = await supabase
            .from('planes_financiacion')
            .select('id, paciente_nombre, tratamiento, cuotas_total, cuotas_pagadas, monto_cuota_usd, saldo_restante_usd, estado')
            .eq('estado', 'En curso');

        return {
            totalPacientes: totalPacientes || 0,
            primeraVezMes,
            listaPrimeraVez,
            primeraVezMensual,
            primerasConsultasRecientes,
            ingresosMesUsd: Math.round(ingresosMesUsd),
            egresosMesUsd: Math.round(egresosMesUsd),
            personasEnFinanciacion: financData?.length || 0,
            deudaTotalUsd: Math.round(financData?.reduce((sum: number, p: { saldo_restante_usd: unknown }) => sum + (Number(p.saldo_restante_usd) || 0), 0) || 0),
            planesFinanciacion: financData || [],
        };
    } catch (error) {
        console.error('getOwnerDashboardStatsAction:', error);
        return { totalPacientes: 0, primeraVezMes: 0, listaPrimeraVez: [], primeraVezMensual: [], primerasConsultasRecientes: [], ingresosMesUsd: 0, egresosMesUsd: 0, personasEnFinanciacion: 0, deudaTotalUsd: 0, planesFinanciacion: [] };
    }
}
