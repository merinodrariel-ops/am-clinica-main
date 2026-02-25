import { supabase } from './supabase';
import { getGlobalAdminCashBalance } from './caja-admin';

export interface DashboardStats {
    patientsCount: number;
    newPatientsCount: number;
    todayIncome: number;
    monthIncome: number;
    adminCash: {
        ars: number;
        usd: number;
    };
}

export async function getDashboardStats(): Promise<DashboardStats> {
    try {
        // 1. Total Patients (active)
        const { count: patientsCount, error: pError } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', false);

        if (pError) throw pError;

        // 2. Income Stats
        // Use local dates for filtering
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const day = now.getDate();

        // ISO strings for start of today and start of month
        const todayStart = new Date(year, month, day).toISOString();
        const monthStart = new Date(year, month, 1).toISOString();

        // Today's Income (Reception)
        // We sum 'usd_equivalente' to handle multiple currencies (ARS/USD/USDT) uniformly
        const { data: todayMovs, error: tError } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .gte('fecha_hora', todayStart)
            .eq('estado', 'pagado')
            .eq('is_deleted', false);

        if (tError) throw tError;
        const todayIncome = todayMovs?.reduce((sum, m) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;

        // Monthly Income (Reception)
        const { data: monthMovs, error: mError } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .gte('fecha_hora', monthStart)
            .eq('estado', 'pagado')
            .eq('is_deleted', false);

        if (mError) throw mError;
        const monthIncome = monthMovs?.reduce((sum, m) => sum + (Number(m.usd_equivalente) || 0), 0) || 0;

        // 3. New Patients This Month
        const { count: newPatientsCount, error: npError } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .is('is_deleted', false)
            .gte('fecha_alta', monthStart);

        if (npError) throw npError;

        // 4. Admin Cash Balance (Last Closure)
        const adminCash = await getGlobalAdminCashBalance();

        return {
            patientsCount: patientsCount || 0,
            newPatientsCount: newPatientsCount || 0,
            todayIncome: Math.round(todayIncome),
            monthIncome: Math.round(monthIncome),
            adminCash
        };
    } catch (error) {
        console.error('Error in getDashboardStats:', error);
        return {
            patientsCount: 0,
            newPatientsCount: 0,
            todayIncome: 0,
            monthIncome: 0,
            adminCash: { ars: 0, usd: 0 }
        };
    }
}

export interface ReferralStat {
    name: string;
    value: number;
}

export async function getReferralStats(): Promise<ReferralStat[]> {
    try {
        const { data, error } = await supabase
            .from('pacientes')
            .select('referencia_origen')
            .is('is_deleted', false);

        if (error) throw error;

        const counts: Record<string, number> = {};
        data?.forEach((p) => {
            const raw = p.referencia_origen || 'Otro / Desconocido';
            // Clean up common variations (lower case, trim)
            const clean = raw.trim();
            counts[clean] = (counts[clean] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    } catch (error) {
        console.error('Error in getReferralStats:', error);
        return [];
    }
}

// =============================================
// Owner Dashboard Stats
// =============================================

export interface OwnerDashboardStats {
    totalPacientes: number;
    primeraVezMes: number;
    listaPrimeraVez: Array<{ nombre: string; apellido: string; primera_consulta_fecha: string }>;
    ingresosMesUsd: number;
    egresosMesUsd: number;
    personasEnFinanciacion: number;
    deudaTotalUsd: number;
    planesFinanciacion: Array<{
        id: string;
        paciente_nombre: string;
        tratamiento: string;
        cuotas_total: number;
        cuotas_pagadas: number;
        monto_cuota_usd: number;
        saldo_restante_usd: number;
        estado: string;
    }>;
}

export async function getOwnerDashboardStats(): Promise<OwnerDashboardStats> {
    try {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();
        const monthStart = new Date(year, month, 1).toISOString().split('T')[0];
        const nextMonthStart = new Date(year, month + 1, 1).toISOString().split('T')[0];

        // 1. Total Patients (active)
        const { count: totalPacientes } = await supabase
            .from('pacientes')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', false);

        // 2. First-time patients this month (based on actual first consultation date)
        const { data: primeraVezData, count: primeraVezMes } = await supabase
            .from('pacientes')
            .select('nombre, apellido, primera_consulta_fecha', { count: 'exact' })
            .eq('is_deleted', false)
            .gte('primera_consulta_fecha', monthStart)
            .lt('primera_consulta_fecha', nextMonthStart)
            .order('primera_consulta_fecha', { ascending: false });

        // 3. Monthly Income (Reception) — pagado, this month
        const { data: incomeData } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .eq('is_deleted', false)
            .eq('estado', 'pagado')
            .gte('fecha_movimiento', monthStart)
            .lt('fecha_movimiento', nextMonthStart);

        const ingresosMesUsd = incomeData?.reduce(
            (sum, m) => sum + (Number(m.usd_equivalente) || 0), 0
        ) || 0;

        // 4. Monthly Expenses (Admin) — EGRESO type, not annulled
        const { data: expenseData } = await supabase
            .from('caja_admin_movimientos')
            .select('usd_equivalente_total')
            .eq('is_deleted', false)
            .eq('tipo_movimiento', 'EGRESO')
            .neq('estado', 'Anulado')
            .gte('fecha_movimiento', monthStart)
            .lt('fecha_movimiento', nextMonthStart);

        const egresosMesUsd = expenseData?.reduce(
            (sum, m) => sum + (Number(m.usd_equivalente_total) || 0), 0
        ) || 0;

        // 5 & 6. Financing plans — active count + total debt
        const { data: financData } = await supabase
            .from('planes_financiacion')
            .select('id, paciente_nombre, tratamiento, cuotas_total, cuotas_pagadas, monto_cuota_usd, saldo_restante_usd, estado')
            .eq('estado', 'En curso');

        const personasEnFinanciacion = financData?.length || 0;
        const deudaTotalUsd = financData?.reduce(
            (sum, p) => sum + (Number(p.saldo_restante_usd) || 0), 0
        ) || 0;

        return {
            totalPacientes: totalPacientes || 0,
            primeraVezMes: primeraVezMes || 0,
            listaPrimeraVez: (primeraVezData || []).map(p => ({
                nombre: p.nombre,
                apellido: p.apellido,
                primera_consulta_fecha: p.primera_consulta_fecha,
            })),
            ingresosMesUsd: Math.round(ingresosMesUsd),
            egresosMesUsd: Math.round(egresosMesUsd),
            personasEnFinanciacion,
            deudaTotalUsd: Math.round(deudaTotalUsd),
            planesFinanciacion: financData || [],
        };
    } catch (error) {
        console.error('Error in getOwnerDashboardStats:', error);
        return {
            totalPacientes: 0,
            primeraVezMes: 0,
            listaPrimeraVez: [],
            ingresosMesUsd: 0,
            egresosMesUsd: 0,
            personasEnFinanciacion: 0,
            deudaTotalUsd: 0,
            planesFinanciacion: [],
        };
    }
}
