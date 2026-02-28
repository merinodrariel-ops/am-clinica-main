
import { supabase } from '@/lib/supabase';
import { type Personal } from '@/lib/caja-admin';

// =============================================
// Tarifario de Prestaciones & Liquidaciones Profesionales
// =============================================


export interface PrestacionLista {
    id: string;
    nombre: string;
    area_id?: string;
    area_nombre?: string;
    precio_base: number;
    moneda: 'ARS' | 'USD';
    terminos?: string;
    codigo_interno?: string;
    activo: boolean;
}

export interface PrestacionRealizada {
    id: string;
    profesional_id: string;
    paciente_nombre: string;
    prestacion_id?: string;
    prestacion_nombre: string;
    fecha_realizacion: string;
    valor_cobrado: number;
    moneda_cobro: 'ARS' | 'USD';
    porcentaje_honorarios?: number;
    monto_honorarios: number;
    estado_pago: 'pendiente' | 'liquidado' | 'pagado';
    liquidacion_id?: string;
    notas?: string;
    profesional?: Personal;
}

export interface CreatePrestacionListaInput {
    nombre: string;
    area_nombre?: string;
    precio_base: number;
    moneda: 'ARS' | 'USD';
    terminos?: string;
}

export async function getPrestacionesLista(areaId?: string): Promise<PrestacionLista[]> {
    let query = supabase
        .from('prestaciones_lista')
        .select('*')
        .eq('activo', true)
        .order('area_nombre')
        .order('nombre');

    if (areaId) {
        query = query.eq('area_id', areaId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching prestaciones lista:', error);
        return [];
    }
    return (data || []) as PrestacionLista[];
}

export async function registrarPrestacionRealizada(input: Omit<PrestacionRealizada, 'id' | 'created_at' | 'profesional'>): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('prestaciones_realizadas')
        .insert(input);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function createPrestacionListaItem(input: CreatePrestacionListaInput): Promise<{ success: boolean; data?: PrestacionLista; error?: string }> {
    const payload = {
        nombre: input.nombre.trim(),
        area_nombre: input.area_nombre?.trim() || null,
        precio_base: Number(input.precio_base || 0),
        moneda: input.moneda,
        terminos: input.terminos?.trim() || null,
        activo: true,
    };

    if (!payload.nombre) {
        return { success: false, error: 'Nombre de prestación obligatorio' };
    }

    const { data, error } = await supabase
        .from('prestaciones_lista')
        .insert(payload)
        .select('*')
        .single();

    if (error) {
        return { success: false, error: error.message };
    }

    return { success: true, data: data as PrestacionLista };
}

export async function getPrestacionesRealizadas(options: {
    profesionalId?: string;
    estadoPago?: 'pendiente' | 'liquidado' | 'pagado';
    mes?: string; // YYYY-MM
}): Promise<PrestacionRealizada[]> {
    let query = supabase
        .from('prestaciones_realizadas')
        .select('*, profesional:personal!inner(*)') // Inner join to ensure professional data
        .order('fecha_realizacion', { ascending: false });

    if (options.profesionalId) {
        query = query.eq('profesional_id', options.profesionalId);
    }
    if (options.estadoPago) {
        query = query.eq('estado_pago', options.estadoPago);
    }
    if (options.mes) {
        // Parse dates in local time to avoid timezone issues with string comparisons
        // Assuming YYYY-MM
        const [year, month] = options.mes.split('-').map(Number);
        const startDate = `${options.mes}-01`;
        // Last day of month
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        query = query.gte('fecha_realizacion', startDate).lte('fecha_realizacion', endDate);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching prestaciones realizadas:', error);
        return [];
    }
    return (data || []) as unknown as PrestacionRealizada[];
}

export async function marcarPrestacionesComoLiquidadas(ids: string[], liquidacionId?: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('prestaciones_realizadas')
        .update({
            estado_pago: 'liquidado',
            liquidacion_id: liquidacionId,
            // updated_at: new Date().toISOString() // Removed as it might not be in schema, rely on db trigger if exists
        })
        .in('id', ids);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function generarLiquidacionProfesional(
    personalId: string,
    mes: string,
    prestaciones: PrestacionRealizada[]
): Promise<{ success: boolean; error?: string }> {
    const [year, month] = mes.split('-').map(Number);
    const startDate = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDateStr = `${mes}-${String(lastDay).padStart(2, '0')}`;
    const criticalThreshold = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

    // Block liquidation when there are unresolved critical observed records.
    const { count: criticalCount, error: criticalErr } = await supabase
        .from('registro_horas')
        .select('id', { count: 'exact', head: true })
        .eq('personal_id', personalId)
        .in('estado', ['Observado', 'observado'])
        .gte('fecha', startDate)
        .lte('fecha', endDateStr)
        .lt('created_at', criticalThreshold);

    if (criticalErr) {
        return { success: false, error: `Error validando observados críticos: ${criticalErr.message}` };
    }

    if ((criticalCount || 0) > 0) {
        return {
            success: false,
            error: `No se puede liquidar: hay ${criticalCount} observado(s) crítico(s) sin resolver en ${mes}.`,
        };
    }

    // Calculate totals
    const totalArs = prestaciones
        .filter(p => p.moneda_cobro === 'ARS')
        .reduce((sum, p) => sum + (p.monto_honorarios || 0), 0);

    const totalUsd = prestaciones
        .filter(p => p.moneda_cobro === 'USD')
        .reduce((sum, p) => sum + (p.monto_honorarios || 0), 0);

    // Check existing or create new liquidation
    const { data: existing } = await supabase
        .from('liquidaciones_mensuales')
        .select('id')
        .eq('personal_id', personalId)
        .eq('mes', startDate)
        .maybeSingle();

    let liquidacionId = existing?.id;

    if (liquidacionId) {
        const { error } = await supabase
            .from('liquidaciones_mensuales')
            .update({
                total_ars: totalArs,
                total_usd: totalUsd,
                estado: 'Pendiente',
            })
            .eq('id', liquidacionId);
        if (error) return { success: false, error: error.message };
    } else {
        const { data: newLiq, error } = await supabase
            .from('liquidaciones_mensuales')
            .insert({
                personal_id: personalId,
                mes: startDate,
                total_horas: 0,
                valor_hora_snapshot: 0,
                total_ars: totalArs,
                total_usd: totalUsd,
                estado: 'Pendiente'
            })
            .select()
            .single();

        if (error) return { success: false, error: error.message };
        liquidacionId = newLiq.id;
    }

    // Link prestaciones
    const ids = prestaciones.map(p => p.id);
    if (ids.length > 0 && liquidacionId) {
        return await marcarPrestacionesComoLiquidadas(ids, liquidacionId);
    }

    return { success: true };
}
