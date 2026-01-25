import { supabase, CajaMovimiento, TarifarioItem, CajaArqueo, TransferenciaCaja, Paciente } from './supabase';

/**
 * Caja Recepción Business Logic
 */

// ===================== TARIFARIO =====================

export async function getTarifarioVigente(): Promise<TarifarioItem[]> {
    const { data, error } = await supabase
        .from('tarifario_items')
        .select(`
            *,
            tarifario_versiones!inner(estado)
        `)
        .eq('tarifario_versiones.estado', 'vigente')
        .eq('activo', true)
        .order('categoria')
        .order('concepto_nombre');

    if (error) throw error;
    return data || [];
}

export async function getTarifarioByCategoria(): Promise<Record<string, TarifarioItem[]>> {
    const items = await getTarifarioVigente();
    return items.reduce((acc, item) => {
        if (!acc[item.categoria]) {
            acc[item.categoria] = [];
        }
        acc[item.categoria].push(item);
        return acc;
    }, {} as Record<string, TarifarioItem[]>);
}

// ===================== PACIENTES =====================

export async function searchPacientes(query: string): Promise<Paciente[]> {
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, telefono, email, documento')
        .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,documento.ilike.%${query}%`)
        .limit(10);

    if (error) throw error;
    return data || [];
}

export async function getPacienteById(id: string): Promise<Paciente | null> {
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, telefono, email, documento')
        .eq('id_paciente', id)
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data;
}

// ===================== MOVIMIENTOS =====================

export interface NuevoMovimientoInput {
    paciente_id: string;
    concepto_id?: string;
    concepto_nombre: string;
    categoria?: string;
    precio_lista_usd?: number;
    monto: number;
    moneda: 'USD' | 'ARS' | 'USDT';
    metodo_pago: 'Efectivo' | 'Transferencia' | 'MercadoPago' | 'Cripto';
    canal_destino?: 'Empresa' | 'Personal' | 'MP' | 'USDT';
    tipo_comprobante?: 'Factura A' | 'Tipo C' | 'Sin factura' | 'Otro';
    cuota_nro?: number;
    cuotas_total?: number;
    interes_mensual_pct?: number;
    estado?: 'pagado' | 'pendiente' | 'parcial';
    observaciones?: string;
    tc_bna_venta?: number;
    tc_fuente?: 'BNA_AUTO' | 'MANUAL' | 'N/A';
    usuario?: string;
}

export async function crearMovimiento(input: NuevoMovimientoInput): Promise<CajaMovimiento> {
    // Calculate USD equivalent for ARS payments
    let usd_equivalente = input.monto;
    if (input.moneda === 'ARS' && input.tc_bna_venta && input.tc_bna_venta > 0) {
        usd_equivalente = Math.round((input.monto / input.tc_bna_venta) * 100) / 100;
    }

    const { data, error } = await supabase
        .from('caja_recepcion_movimientos')
        .insert({
            ...input,
            usd_equivalente,
            tc_fecha_hora: input.moneda === 'ARS' ? new Date().toISOString() : null,
            tc_fuente: input.moneda === 'ARS' ? input.tc_fuente : 'N/A',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function getMovimientosDelDia(fecha?: string): Promise<CajaMovimiento[]> {
    const targetDate = fecha || new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
        .from('caja_recepcion_movimientos')
        .select(`
            *,
            paciente:pacientes(id_paciente, nombre, apellido)
        `)
        .gte('fecha_hora', `${targetDate}T00:00:00`)
        .lt('fecha_hora', `${targetDate}T23:59:59`)
        .order('fecha_hora', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function getMovimientosPorPaciente(pacienteId: string): Promise<CajaMovimiento[]> {
    const { data, error } = await supabase
        .from('caja_recepcion_movimientos')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha_hora', { ascending: false });

    if (error) throw error;
    return data || [];
}

export async function anularMovimiento(
    movimientoId: string,
    motivo: string,
    usuario: string
): Promise<void> {
    const { error } = await supabase
        .from('caja_recepcion_movimientos')
        .update({
            estado: 'anulado',
            motivo_anulacion: motivo,
            anulado_por: usuario,
            anulado_fecha_hora: new Date().toISOString(),
        })
        .eq('id', movimientoId);

    if (error) throw error;
}

// ===================== ARQUEO =====================

export async function getArqueoAbierto(usuario: string): Promise<CajaArqueo | null> {
    const { data, error } = await supabase
        .from('caja_recepcion_arqueos')
        .select('*')
        .eq('usuario', usuario)
        .eq('estado', 'abierto')
        .single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data;
}

export async function iniciarArqueo(
    usuario: string,
    saldoInicialUsd: number,
    saldoInicialArs: number,
    tcBnaVenta: number
): Promise<CajaArqueo> {
    const saldoInicialUsdEquivalente = saldoInicialUsd + (tcBnaVenta > 0 ? saldoInicialArs / tcBnaVenta : 0);

    const { data, error } = await supabase
        .from('caja_recepcion_arqueos')
        .insert({
            fecha: new Date().toISOString().split('T')[0],
            usuario,
            saldo_inicial_usd_billete: saldoInicialUsd,
            saldo_inicial_ars_billete: saldoInicialArs,
            saldo_inicial_usd_equivalente: Math.round(saldoInicialUsdEquivalente * 100) / 100,
            tc_bna_venta_dia: tcBnaVenta,
            estado: 'abierto',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

export async function cerrarArqueo(
    arqueoId: string,
    saldoFinalUsd: number,
    saldoFinalArs: number,
    observaciones?: string
): Promise<CajaArqueo> {
    // First get the arqueo to calculate totals
    const { data: arqueo } = await supabase
        .from('caja_recepcion_arqueos')
        .select('*')
        .eq('id', arqueoId)
        .single();

    if (!arqueo) throw new Error('Arqueo not found');

    // Get total income for the day
    const { data: movimientos } = await supabase
        .from('caja_recepcion_movimientos')
        .select('usd_equivalente')
        .gte('fecha_hora', `${arqueo.fecha}T00:00:00`)
        .lt('fecha_hora', `${arqueo.fecha}T23:59:59`)
        .neq('estado', 'anulado');

    const totalIngresosUsd = movimientos?.reduce((sum, m) => sum + (m.usd_equivalente || 0), 0) || 0;

    // Get total transfers to admin
    const { data: transferencias } = await supabase
        .from('transferencias_caja')
        .select('usd_equivalente')
        .gte('fecha_hora', `${arqueo.fecha}T00:00:00`)
        .lt('fecha_hora', `${arqueo.fecha}T23:59:59`)
        .eq('estado', 'confirmada');

    const totalTransferenciasUsd = transferencias?.reduce((sum, t) => sum + (t.usd_equivalente || 0), 0) || 0;

    // Calculate expected vs actual
    const tcBna = arqueo.tc_bna_venta_dia || 1;
    const saldoFinalUsdEquivalente = saldoFinalUsd + (tcBna > 0 ? saldoFinalArs / tcBna : 0);
    const esperado = arqueo.saldo_inicial_usd_equivalente + totalIngresosUsd - totalTransferenciasUsd;
    const diferencia = Math.round((saldoFinalUsdEquivalente - esperado) * 100) / 100;

    const { data, error } = await supabase
        .from('caja_recepcion_arqueos')
        .update({
            hora_cierre: new Date().toISOString(),
            saldo_final_usd_billete: saldoFinalUsd,
            saldo_final_ars_billete: saldoFinalArs,
            total_ingresos_dia_usd: Math.round(totalIngresosUsd * 100) / 100,
            total_transferencias_admin_usd: Math.round(totalTransferenciasUsd * 100) / 100,
            diferencia_usd: diferencia,
            observaciones,
            estado: 'cerrado',
        })
        .eq('id', arqueoId)
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ===================== TRANSFERENCIAS =====================

export async function crearTransferencia(
    monto: number,
    moneda: 'ARS' | 'USD',
    motivo: string,
    tcBnaVenta: number | null,
    usuario: string,
    observaciones?: string
): Promise<TransferenciaCaja> {
    const usd_equivalente = moneda === 'USD'
        ? monto
        : (tcBnaVenta && tcBnaVenta > 0 ? Math.round((monto / tcBnaVenta) * 100) / 100 : monto);

    const { data, error } = await supabase
        .from('transferencias_caja')
        .insert({
            moneda,
            monto,
            tc_bna_venta: moneda === 'ARS' ? tcBnaVenta : null,
            usd_equivalente,
            motivo,
            observaciones,
            usuario,
            estado: 'confirmada',
        })
        .select()
        .single();

    if (error) throw error;
    return data;
}

// ===================== DASHBOARD =====================

export interface DashboardStats {
    totalDiaUsd: number;
    totalMesUsd: number;
    porMetodo: Record<string, number>;
    porCategoria: Record<string, number>;
    movimientosHoy: number;
    pendientes: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
    const today = new Date().toISOString().split('T')[0];
    const firstDayOfMonth = `${today.substring(0, 7)}-01`;

    // Today's movements
    const { data: movHoy } = await supabase
        .from('caja_recepcion_movimientos')
        .select('usd_equivalente, metodo_pago, categoria, estado')
        .gte('fecha_hora', `${today}T00:00:00`)
        .lt('fecha_hora', `${today}T23:59:59`);

    // Month's movements
    const { data: movMes } = await supabase
        .from('caja_recepcion_movimientos')
        .select('usd_equivalente')
        .gte('fecha_hora', `${firstDayOfMonth}T00:00:00`)
        .neq('estado', 'anulado');

    const pagadosHoy = (movHoy || []).filter(m => m.estado !== 'anulado');
    const pendientesHoy = (movHoy || []).filter(m => m.estado === 'pendiente');

    // Aggregate by method
    const porMetodo: Record<string, number> = {};
    pagadosHoy.forEach(m => {
        porMetodo[m.metodo_pago] = (porMetodo[m.metodo_pago] || 0) + (m.usd_equivalente || 0);
    });

    // Aggregate by category
    const porCategoria: Record<string, number> = {};
    pagadosHoy.forEach(m => {
        if (m.categoria) {
            porCategoria[m.categoria] = (porCategoria[m.categoria] || 0) + (m.usd_equivalente || 0);
        }
    });

    return {
        totalDiaUsd: Math.round(pagadosHoy.reduce((sum, m) => sum + (m.usd_equivalente || 0), 0) * 100) / 100,
        totalMesUsd: Math.round((movMes || []).reduce((sum, m) => sum + (m.usd_equivalente || 0), 0) * 100) / 100,
        porMetodo,
        porCategoria,
        movimientosHoy: pagadosHoy.length,
        pendientes: pendientesHoy.length,
    };
}
