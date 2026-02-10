import { supabase } from './supabase';
import { getGlobalAdminCashBalance } from './caja-admin';

export interface DashboardStats {
    patientsCount: number;
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

        // 3. Admin Cash Balance (Last Closure)
        const adminCash = await getGlobalAdminCashBalance();

        return {
            patientsCount: patientsCount || 0,
            todayIncome: Math.round(todayIncome),
            monthIncome: Math.round(monthIncome),
            adminCash
        };
    } catch (error) {
        console.error('Error in getDashboardStats:', error);
        return {
            patientsCount: 0,
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
