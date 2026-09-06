import type { SupabaseClient } from '@supabase/supabase-js';
import type { DashboardStats } from './dashboard';
import { normalizeSaldoCajaFisica } from './caja-fisica-model';
import { getDashboardDates } from './dashboard-dates';

async function loadPhysicalCash(supabase: SupabaseClient, date: string) {
    const { data: branches, error } = await supabase.from('sucursales')
        .select('id, nombre, moneda_local').eq('activa', true).order('nombre');
    if (error) throw error;
    const branch = branches?.find(row => row.moneda_local === 'ARS' && !row.nombre.toLowerCase().includes('montevideo')) ?? branches?.[0];
    if (!branch) throw new Error('No hay una sucursal activa');
    const response = await supabase.rpc('caja_saldo_fisico', { p_sucursal_id: branch.id, p_hasta_fecha: date });
    if (response.error) throw response.error;
    const balance = normalizeSaldoCajaFisica(response.data);
    return { data: { ars: balance.ars, usd: balance.usd }, error: null };
}

async function loadIncomeTotal(supabase: SupabaseClient, start: string, end: string) {
    let total = 0;
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase.from('caja_recepcion_movimientos').select('usd_equivalente')
            .gte('fecha_hora', start).lt('fecha_hora', end).eq('estado', 'pagado').eq('is_deleted', false)
            .order('id').range(offset, offset + pageSize - 1);
        if (error) throw error;
        total += (data || []).reduce((sum, row) => sum + (Number(row.usd_equivalente) || 0), 0);
        if (!data || data.length < pageSize) return { data: total, error: null };
    }
}

export async function loadDashboardStats(supabase: SupabaseClient, now = new Date()): Promise<DashboardStats> {
        const dates = getDashboardDates(now);
        const results = await Promise.all([
            supabase.from('pacientes').select('*', { count: 'exact', head: true }).eq('is_deleted', false),
            loadIncomeTotal(supabase, dates.todayStart, dates.tomorrowStart),
            loadIncomeTotal(supabase, dates.monthStartInstant, dates.nextMonthStartInstant),
            supabase.from('pacientes').select('*', { count: 'exact', head: true })
                .eq('is_deleted', false).gte('fecha_alta', dates.monthStartInstant).lt('fecha_alta', dates.nextMonthStartInstant),
            loadPhysicalCash(supabase, dates.today),
            supabase.from('agenda_appointments').select('*', { count: 'exact', head: true })
                .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
                .not('status', 'in', '("cancelled","no_show")')
                .gte('start_time', dates.monthStartInstant).lt('start_time', dates.nextMonthStartInstant),
            supabase.from('agenda_appointments').select('*', { count: 'exact', head: true })
                .in('type', ['limpieza', 'limpieza_convencional', 'limpieza_laser'])
                .not('status', 'in', '("cancelled","no_show")')
                .gte('start_time', dates.yearStartInstant).lt('start_time', dates.nextYearStartInstant),
        ]);
        const failed = results.find(result => result.error);
        if (failed?.error) throw failed.error;
        const [{ count: patientsCount }, { data: todayIncome }, { data: monthIncome },
            { count: newPatientsCount }, { data: physicalCash }, { count: limpiezasMes }, { count: limpiezasAnio }] = results;
        const adminCash = physicalCash;

        return {
            patientsCount: patientsCount || 0,
            newPatientsCount: newPatientsCount || 0,
            todayIncome: Math.round(todayIncome),
            monthIncome: Math.round(monthIncome),
            adminCash,
            limpiezasMes: limpiezasMes || 0,
            limpiezasAnio: limpiezasAnio || 0,
        };
}
