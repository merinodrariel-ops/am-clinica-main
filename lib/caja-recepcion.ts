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
        .eq('fecha_movimiento', targetDate)
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

export async function getUltimoCierre(fechaLimite?: string): Promise<CajaArqueo | null> {
    let query = supabase
        .from('caja_recepcion_arqueos')
        .select('*')
        .eq('estado', 'cerrado')
        .order('fecha', { ascending: false })
        .limit(1);

    if (fechaLimite) {
        query = query.lt('fecha', fechaLimite);
    }

    const { data, error } = await query.single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
    }
    return data;
}

export async function cerrarCajaDelDia(
    fecha: string,
    usuario: string,
    saldoFinalUsd: number,
    saldoFinalArs: number,
    tcBnaVenta: number,
    snapshot: unknown,
    observaciones?: string
): Promise<string> {
    // Calculate totals for verification
    const { data: movimientos } = await supabase
        .from('caja_recepcion_movimientos')
        .select('usd_equivalente')
        .eq('fecha_movimiento', fecha)
        .is('cierre_id', null)
        .neq('estado', 'anulado');

    const totalIngresosUsd = movimientos?.reduce((sum: number, m: { usd_equivalente: number }) => sum + (m.usd_equivalente || 0), 0) || 0;

    const { data: transferencias } = await supabase
        .from('transferencias_caja')
        .select('usd_equivalente')
        .gte('fecha_hora', `${fecha}T00:00:00`)
        .lt('fecha_hora', `${fecha}T23:59:59`)
        .eq('estado', 'confirmada');

    const totalTransferenciasUsd = transferencias?.reduce((sum: number, t: { usd_equivalente: number }) => sum + (t.usd_equivalente || 0), 0) || 0;

    // Calculate difference
    const ultimo = await getUltimoCierre(fecha);
    const saldoInicialUsd = ultimo?.saldo_final_usd_billete || 0;
    const saldoInicialArs = ultimo?.saldo_final_ars_billete || 0;

    const saldoInicialEq = saldoInicialUsd + (tcBnaVenta > 0 ? saldoInicialArs / tcBnaVenta : 0);
    const saldoFinalEq = saldoFinalUsd + (tcBnaVenta > 0 ? saldoFinalArs / tcBnaVenta : 0);

    const esperado = saldoInicialEq + totalIngresosUsd - totalTransferenciasUsd;
    const diferenciaUsd = Math.round((saldoFinalEq - esperado) * 100) / 100;

    const { data, error } = await supabase.rpc('cerrar_caja_recepcion', {
        p_fecha: fecha,
        p_usuario: usuario,
        p_saldo_final_usd: saldoFinalUsd,
        p_saldo_final_ars: saldoFinalArs,
        p_saldo_final_usd_eq: Math.round(saldoFinalEq * 100) / 100, // Added
        p_total_ingresos_usd: Math.round(totalIngresosUsd * 100) / 100,
        p_total_transferencias_usd: Math.round(totalTransferenciasUsd * 100) / 100,
        p_diferencia_usd: diferenciaUsd,
        p_tc_bna: tcBnaVenta,
        p_observaciones: observaciones,
        p_snapshot: snapshot
    });

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
    // Today's movements
    const { data: movHoyRaw } = await supabase
        .from('caja_recepcion_movimientos')
        .select('usd_equivalente, metodo_pago, categoria, estado')
        .eq('fecha_movimiento', today);

    const movHoy = movHoyRaw as unknown as {
        usd_equivalente: number;
        metodo_pago: string;
        categoria: string | null;
        estado: string;
    }[] | null;

    // Month's movements
    const { data: movMes } = await supabase
        .from('caja_recepcion_movimientos')
        .select('usd_equivalente')
        .gte('fecha_movimiento', firstDayOfMonth)
        .lte('fecha_movimiento', today)
        .neq('estado', 'anulado');

    const pagadosHoy = (movHoy || []).filter((m) => m.estado !== 'anulado');
    const pendientesHoy = (movHoy || []).filter((m) => m.estado === 'pendiente');

    // Aggregate by method
    const porMetodo: Record<string, number> = {};
    pagadosHoy.forEach((m) => {
        const metodo = m.metodo_pago as string;
        porMetodo[metodo] = (porMetodo[metodo] || 0) + (m.usd_equivalente || 0);
    });

    // Aggregate by category
    const porCategoria: Record<string, number> = {};
    pagadosHoy.forEach((m) => {
        if (m.categoria) {
            const cat = m.categoria as string;
            porCategoria[cat] = (porCategoria[cat] || 0) + (m.usd_equivalente || 0);
        }
    });

    return {
        totalDiaUsd: Math.round(pagadosHoy.reduce((sum: number, m) => sum + (m.usd_equivalente || 0), 0) * 100) / 100,
        totalMesUsd: Math.round((movMes || []).reduce((sum: number, m: { usd_equivalente: number }) => sum + (m.usd_equivalente || 0), 0) * 100) / 100,
        porMetodo,
        porCategoria,
        movimientosHoy: pagadosHoy.length,
        pendientes: pendientesHoy.length,
    };
}

// =============================================
// Alertas
// =============================================

export interface DiaSinCierre {
    fecha: string;
    cantidad: number;
    ultimo_usuario: string;
}

export async function getDiasSinCierreRecepcion(): Promise<DiaSinCierre[]> {
    const { data, error } = await supabase.rpc('get_dias_sin_cierre_recepcion');
    if (error) {
        console.error('Error checking alerts:', error);
        return [];
    }
    return data || [];
}

export async function logMovimientoEdit(
    registroId: string,
    tabla: string,
    campo: string,
    valorAnterior: string | null,
    valorNuevo: string | null,
    motivo: string
) {
    const { error } = await supabase.rpc('log_field_edit', {
        p_registro_id: registroId,
        p_tabla: tabla,
        p_campo: campo,
        p_valor_anterior: valorAnterior,
        p_valor_nuevo: valorNuevo,
        p_motivo: motivo
    });
    if (error) console.error('Error logging edit:', error);
}
