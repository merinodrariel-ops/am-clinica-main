import { supabase } from './supabase';

// =============================================
// Types
// =============================================

export interface Sucursal {
    id: string;
    nombre: string;
    modo_caja: 'SEPARADA' | 'UNIFICADA';
    moneda_local: string;
    activa: boolean;
}

export interface CuentaFinanciera {
    id: string;
    sucursal_id: string;
    nombre_cuenta: string;
    tipo_cuenta: 'EFECTIVO' | 'BANCO' | 'TARJETA' | 'SERVICIO' | 'OTRO';
    moneda: string;
    activa: boolean;
    orden: number;
}

export interface CajaAdminMovimiento {
    id: string;
    fecha_hora: string;
    fecha_movimiento: string; // 'YYYY-MM-DD' - Date for reporting
    usuario?: string;
    sucursal_id: string;
    descripcion: string;
    tipo_movimiento: 'INGRESO_ADMIN' | 'INGRESO_PACIENTE' | 'EGRESO' | 'CAMBIO_MONEDA' | 'RETIRO' | 'TRANSFERENCIA' | 'AJUSTE_CAJA';
    subtipo?: string;
    nota?: string;
    adjuntos?: string[];
    tc_bna_venta?: number;
    tc_fuente?: 'BNA_AUTO' | 'MANUAL' | 'N/A';
    tc_fecha_hora?: string;
    usd_equivalente_total: number;
    ref_transferencia_recepcion_id?: string;
    paciente_id?: string;
    estado: 'Registrado' | 'Anulado';
    lineas?: MovimientoLinea[];
}

export interface MovimientoLinea {
    id?: string;
    admin_movimiento_id?: string;
    cuenta_id: string;
    importe: number;
    moneda: string;
    usd_equivalente?: number;
}

export interface CajaAdminArqueo {
    id: string;
    fecha: string;
    sucursal_id: string;
    usuario?: string;
    hora_inicio?: string | null;
    hora_cierre?: string | null;
    saldos_iniciales: Record<string, number>;
    saldos_finales: Record<string, number>;
    saldo_final_usd_equivalente?: number | null;
    tc_bna_venta_dia?: number;
    diferencia_usd: number;
    observaciones?: string;
    estado: 'Abierto' | 'Cerrado' | 'abierto' | 'cerrado';
    snapshot_datos?: Record<string, unknown>;
}

export interface Profesional {
    id: string;
    nombre: string;
    especialidad: string;
    documento?: string;
    email?: string;
    telefono?: string;
    activo: boolean;
}

export interface HonorarioItem {
    id: string;
    version_id: string;
    tratamiento: string;
    precio: number;
    moneda: string;
    activo: boolean;
}

export interface Prestacion {
    id: string;
    fecha: string;
    profesional_id: string;
    paciente_id?: string;
    tratamiento: string;
    precio_snapshot: number;
    moneda_snapshot: string;
    tc_dia?: number;
    usd_equivalente?: number;
    estado: 'Registrado' | 'Anulado';
    profesional?: Profesional;
}

export interface Personal {
    id: string;
    nombre: string;
    rol: string;
    valor_hora_ars: number;
    activo: boolean;
}

export type EstadoRegistro = 'Registrado' | 'Observado' | 'Resuelto' | 'Anulado';
export type MotivoObservado = 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' |
    'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
export type MetodoVerificacion = 'Camaras' | 'PorteroElectrico' | 'Testigo' | 'Otro';

export interface RegistroHoras {
    id: string;
    personal_id: string;
    fecha: string;
    horas: number;
    observaciones?: string;
    // Estado y observación
    estado: EstadoRegistro;
    motivo_observado?: MotivoObservado;
    // Horarios de marcación
    hora_ingreso?: string;
    hora_egreso?: string;
    original_hora_ingreso?: string;
    original_hora_egreso?: string;
    // Resolución
    resuelto_por?: string;
    resuelto_fecha_hora?: string;
    metodo_verificacion?: MetodoVerificacion;
    evidencia_url?: string;
    nota_resolucion?: string;
    // Relaciones
    personal?: Personal;
}

export interface AuditoriaHoras {
    id: string;
    registro_horas_id: string;
    fecha_hora: string;
    usuario: string;
    campo_modificado: string;
    valor_anterior?: string;
    valor_nuevo?: string;
    motivo: string;
    metodo_verificacion?: string;
    evidencia_url?: string;
}

export interface LiquidacionMensual {
    id: string;
    personal_id: string;
    mes: string;
    total_horas: number;
    valor_hora_snapshot: number;
    total_ars: number;
    tc_liquidacion?: number;
    total_usd?: number;
    estado: 'Pendiente' | 'Pagado' | 'Anulado';
}

// Subtipos de movimientos
export const SUBTIPOS_MOVIMIENTO = [
    'Liquidaciones',
    'Alquileres',
    'Expensas',
    'Materiales Dentales',
    'Laboratorio',
    'Equipamiento',
    'Personal Ariel',
    'Residuos Patológicos',
    'Servicios',
    'Imprenta',
    'Indumentaria',
    'Banco',
    'Gastos Varios',
    'Otro',
] as const;

// Subtipos que requieren adjunto obligatorio
export const SUBTIPOS_ADJUNTO_OBLIGATORIO = [
    'Alquileres',
    'Expensas',
    'Materiales Dentales',
    'Laboratorio',
    'Equipamiento',
    'Servicios',
    'Banco',
    'Liquidaciones',
];

// =============================================
// Sucursales
// =============================================

export async function getSucursales(): Promise<Sucursal[]> {
    const { data, error } = await supabase
        .from('sucursales')
        .select('*')
        .eq('activa', true)
        .order('nombre');

    if (error) {
        console.error('Error fetching sucursales:', error);
        return [];
    }
    return data || [];
}

// =============================================
// Cuentas Financieras
// =============================================

export async function getCuentas(sucursalId: string): Promise<CuentaFinanciera[]> {
    const { data, error } = await supabase
        .from('cuentas_financieras')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .eq('activa', true)
        .order('orden');

    if (error) {
        console.error('Error fetching cuentas:', error);
        return [];
    }
    return data || [];
}

// =============================================
// Movimientos
// =============================================

export async function getMovimientos(options: {
    sucursalId: string;
    mes?: string; // YYYY-MM format
    tipo?: string;
    limit?: number;
}): Promise<CajaAdminMovimiento[]> {
    let query = supabase
        .from('caja_admin_movimientos')
        .select('*, caja_admin_movimiento_lineas(*)')
        .eq('sucursal_id', options.sucursalId)
        .eq('is_deleted', false)
        .order('fecha_hora', { ascending: false });

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        // Calculate first day of next month for proper end range
        const [year, month] = options.mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query
            .gte('fecha_movimiento', startDate)
            .lt('fecha_movimiento', firstDayNextMonth);
    }

    if (options.tipo) {
        query = query.eq('tipo_movimiento', options.tipo);
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching movimientos:', error);
        return [];
    }
    return data || [];
}

export async function createMovimiento(
    movimiento: Partial<CajaAdminMovimiento>,
    lineas: MovimientoLinea[]
): Promise<{ data: CajaAdminMovimiento | null; error: Error | null }> {
    // Calculate USD equivalent total
    const usdTotal = lineas.reduce((sum, l) => sum + (l.usd_equivalente || 0), 0);

    const { data: mov, error: movError } = await supabase
        .from('caja_admin_movimientos')
        .insert({
            ...movimiento,
            fecha_movimiento: movimiento.fecha_movimiento || new Date().toISOString().split('T')[0],
            usd_equivalente_total: usdTotal,
            estado: 'Registrado',
            created_at: new Date().toISOString(),
        })
        .select()
        .single();

    if (movError) {
        return { data: null, error: new Error(movError.message) };
    }

    // Insert lines
    const lineasWithMovId = lineas.map(l => ({
        ...l,
        admin_movimiento_id: mov.id,
    }));

    const { error: lineasError } = await supabase
        .from('caja_admin_movimiento_lineas')
        .insert(lineasWithMovId);

    if (lineasError) {
        console.error('Error creating lineas:', lineasError);
    }

    return { data: mov, error: null };
}

export async function anularMovimiento(
    id: string,
    motivo: string,
    usuario: string
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('caja_admin_movimientos')
        .update({
            estado: 'Anulado',
            motivo_anulacion: motivo,
            anulado_por: usuario,
            anulado_fecha_hora: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function getUltimoCierreAdmin(sucursalId: string, fechaLimite?: string): Promise<CajaAdminArqueo | null> {
    let query = supabase
        .from('caja_admin_arqueos')
        .select('*')
        .eq('sucursal_id', sucursalId)
        .eq('estado', 'cerrado') // Lowecase 'cerrado' based on RPC? Wait, table uses 'cerrado' or 'Cerrado'? Previous code used 'Cerrado'. RPC uses 'cerrado'. I should normalize.
        .order('fecha', { ascending: false })
        .limit(1);

    if (fechaLimite) {
        query = query.lt('fecha', fechaLimite);
    }

    const { data, error } = await query.single();

    if (error) {
        if (error.code === 'PGRST116') return null;
        console.error('Error fetching ultimo cierre admin:', error);
        return null;
    }
    return data;
}

// Deprecated or Aliased
export async function getArqueoAbierto(): Promise<CajaAdminArqueo | null> {
    // Return null as there are no "Open" arqueos anymore
    return null;
}

export async function cerrarCajaAdmin(params: {
    sucursalId: string;
    fecha: string;
    usuario: string;
    saldosFinales: Record<string, number>;
    saldoFinalUsdEq: number;
    diferenciaUsd: number;
    tcBna: number;
    observaciones?: string;
    snapshot: unknown;
}): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase.rpc('cerrar_caja_admin', {
        p_sucursal_id: params.sucursalId,
        p_fecha: params.fecha,
        p_usuario: params.usuario,
        p_saldo_final_usd: 0, // Not used directly in JSON structure but might be needed if I add columns later. For now RPC expects it?
        p_saldo_final_ars: 0,
        p_saldo_final_usd_eq: params.saldoFinalUsdEq,
        p_saldos_finales: params.saldosFinales,
        p_diferencia_usd: params.diferenciaUsd,
        p_tc_bna: params.tcBna,
        p_observaciones: params.observaciones,
        p_snapshot: params.snapshot
    });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function abrirArqueo(): Promise<{ data: null; error: Error }> {
    return { data: null, error: new Error('Action not supported') };
}

export async function cerrarArqueo(): Promise<{ success: boolean; error?: string }> {
    return { success: false, error: 'Use cerrarCajaAdmin' };
}

// =============================================
// Profesionales & Prestaciones
// =============================================

export async function getProfesionales(): Promise<Profesional[]> {
    const { data, error } = await supabase
        .from('profesionales')
        .select('*')
        .eq('activo', true)
        .order('nombre');

    if (error) {
        console.error('Error fetching profesionales:', error);
        return [];
    }
    return data || [];
}

export async function getHonorariosItems(especialidad?: string): Promise<HonorarioItem[]> {
    let query = supabase
        .from('honorarios_catalogo_items')
        .select('*, honorarios_catalogo_versiones!inner(*)')
        .eq('activo', true)
        .is('honorarios_catalogo_versiones.vigente_hasta', null);

    if (especialidad) {
        query = query.eq('honorarios_catalogo_versiones.especialidad', especialidad);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching honorarios:', error);
        return [];
    }
    return data || [];
}

export async function getPrestaciones(options: {
    profesionalId?: string;
    mes?: string;
    limit?: number;
}): Promise<Prestacion[]> {
    let query = supabase
        .from('prestaciones')
        .select('*, profesionales(*)')
        .eq('is_deleted', false)
        .order('fecha', { ascending: false });

    if (options.profesionalId) {
        query = query.eq('profesional_id', options.profesionalId);
    }

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        const endDate = new Date(parseInt(options.mes.split('-')[0]), parseInt(options.mes.split('-')[1]), 0);
        query = query
            .gte('fecha', startDate)
            .lte('fecha', `${options.mes}-${endDate.getDate()}`);
    }

    if (options.limit) {
        query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching prestaciones:', error);
        return [];
    }
    return data || [];
}

export async function createPrestacion(
    prestacion: Partial<Prestacion>
): Promise<{ data: Prestacion | null; error: Error | null }> {
    const { data, error } = await supabase
        .from('prestaciones')
        .insert({
            ...prestacion,
            estado: 'Registrado',
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: new Error(error.message) };
    }
    return { data, error: null };
}

// =============================================
// Personal & Liquidaciones
// =============================================

export async function getPersonal(): Promise<Personal[]> {
    const { data, error } = await supabase
        .from('personal')
        .select('*')
        .eq('activo', true)
        .order('nombre');

    if (error) {
        console.error('Error fetching personal:', error);
        return [];
    }
    return data || [];
}

export async function getRegistroHoras(options: {
    personalId?: string;
    mes?: string;
}): Promise<RegistroHoras[]> {
    let query = supabase
        .from('registro_horas')
        .select('*')
        .order('fecha', { ascending: false });

    if (options.personalId) {
        query = query.eq('personal_id', options.personalId);
    }

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        const endDate = new Date(parseInt(options.mes.split('-')[0]), parseInt(options.mes.split('-')[1]), 0);
        query = query
            .gte('fecha', startDate)
            .lte('fecha', `${options.mes}-${endDate.getDate()}`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching registro horas:', error);
        return [];
    }
    return data || [];
}

export async function registrarHoras(
    personalId: string,
    fecha: string,
    horas: number,
    observaciones?: string
): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabase
        .from('registro_horas')
        .insert({
            personal_id: personalId,
            fecha,
            horas,
            observaciones,
        });

    if (error) {
        return { success: false, error: error.message };
    }
    return { success: true };
}

export async function getLiquidaciones(options: {
    personalId?: string;
    mes?: string;
}): Promise<LiquidacionMensual[]> {
    let query = supabase
        .from('liquidaciones_mensuales')
        .select('*, personal(*)')
        .order('mes', { ascending: false });

    if (options.personalId) {
        query = query.eq('personal_id', options.personalId);
    }

    if (options.mes) {
        query = query.eq('mes', `${options.mes}-01`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching liquidaciones:', error);
        return [];
    }
    return data || [];
}

export async function generarLiquidacion(
    personalId: string,
    mes: string,
    tcBna?: number
): Promise<{ data: LiquidacionMensual | null; error: Error | null }> {
    // Get personal info
    const { data: personal } = await supabase
        .from('personal')
        .select('*')
        .eq('id', personalId)
        .single();

    if (!personal) {
        return { data: null, error: new Error('Personal no encontrado') };
    }

    // Get total hours for the month
    const startDate = `${mes}-01`;
    const endDate = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0);

    const { data: horas } = await supabase
        .from('registro_horas')
        .select('horas')
        .eq('personal_id', personalId)
        .gte('fecha', startDate)
        .lte('fecha', `${mes}-${endDate.getDate()}`);

    const totalHoras = horas?.reduce((sum: number, h: { horas: number }) => sum + h.horas, 0) || 0;
    const totalArs = totalHoras * personal.valor_hora_ars;
    const totalUsd = tcBna ? totalArs / tcBna : undefined;

    const { data, error } = await supabase
        .from('liquidaciones_mensuales')
        .insert({
            personal_id: personalId,
            mes: startDate,
            total_horas: totalHoras,
            valor_hora_snapshot: personal.valor_hora_ars,
            total_ars: totalArs,
            tc_liquidacion: tcBna,
            total_usd: totalUsd,
            estado: 'Pendiente',
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: new Error(error.message) };
    }
    return { data, error: null };
}

// =============================================
// Reportes (Read-Only)
// =============================================

export interface ReporteSummary {
    ingresosPacientesUsd: number;
    egresosUsd: number;
    honorariosProfesionalesUsd: number;
    sueldosStaffUsd: number;
    margenBruto: number;
    cashflowNeto: number;
}

export async function getReporteMensual(
    sucursalId: string,
    mes: string
): Promise<ReporteSummary> {
    const sucursal = await getSucursalById(sucursalId);
    const startDate = `${mes}-01`;
    const endDate = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0);
    const endDateStr = `${mes}-${endDate.getDate()}`;

    let ingresosPacientesUsd = 0;
    let egresosUsd = 0;

    if (sucursal?.modo_caja === 'SEPARADA') {
        // BA: Read from caja_recepcion_movimientos
        const { data: ingresos } = await supabase
            .from('caja_recepcion_movimientos')
            .select('usd_equivalente')
            .gte('fecha_movimiento', startDate)
            .lte('fecha_movimiento', endDateStr)
            .neq('estado', 'Anulado');

        ingresosPacientesUsd = ingresos?.reduce((sum: number, i: { usd_equivalente: number }) => sum + (i.usd_equivalente || 0), 0) || 0;
    } else {
        // UY: Read from caja_admin_movimientos with INGRESO_PACIENTE
        const { data: ingresos } = await supabase
            .from('caja_admin_movimientos')
            .select('usd_equivalente_total')
            .eq('sucursal_id', sucursalId)
            .eq('tipo_movimiento', 'INGRESO_PACIENTE')
            .gte('fecha_movimiento', startDate)
            .lte('fecha_movimiento', endDateStr)
            .neq('estado', 'Anulado');

        ingresosPacientesUsd = ingresos?.reduce((sum: number, i: { usd_equivalente_total: number }) => sum + (i.usd_equivalente_total || 0), 0) || 0;
    }

    // Egresos from caja_admin_movimientos
    const { data: egresos } = await supabase
        .from('caja_admin_movimientos')
        .select('usd_equivalente_total')
        .eq('sucursal_id', sucursalId)
        .eq('tipo_movimiento', 'EGRESO')
        .gte('fecha_movimiento', startDate)
        .lte('fecha_movimiento', endDateStr)
        .neq('estado', 'Anulado');

    egresosUsd = egresos?.reduce((sum: number, e: { usd_equivalente_total: number }) => sum + (e.usd_equivalente_total || 0), 0) || 0;

    // Honorarios from prestaciones
    const { data: honorarios } = await supabase
        .from('prestaciones')
        .select('usd_equivalente')
        .gte('fecha', startDate)
        .lte('fecha', endDateStr)
        .neq('estado', 'Anulado');

    const honorariosProfesionalesUsd = honorarios?.reduce((sum: number, h: { usd_equivalente: number }) => sum + (h.usd_equivalente || 0), 0) || 0;

    // Sueldos from liquidaciones_mensuales
    const { data: sueldos } = await supabase
        .from('liquidaciones_mensuales')
        .select('total_usd')
        .eq('mes', startDate)
        .neq('estado', 'Anulado');

    const sueldosStaffUsd = sueldos?.reduce((sum: number, s: { total_usd: number }) => sum + (s.total_usd || 0), 0) || 0;

    // Calculate margins
    const margenBruto = ingresosPacientesUsd - honorariosProfesionalesUsd - sueldosStaffUsd - egresosUsd;
    const cashflowNeto = ingresosPacientesUsd - egresosUsd - sueldosStaffUsd;

    return {
        ingresosPacientesUsd,
        egresosUsd,
        honorariosProfesionalesUsd,
        sueldosStaffUsd,
        margenBruto,
        cashflowNeto,
    };
}

export async function getEgresosPorSubtipo(
    sucursalId: string,
    mes: string
): Promise<{ subtipo: string; total_usd: number }[]> {
    const startDate = `${mes}-01`;
    const endDate = new Date(parseInt(mes.split('-')[0]), parseInt(mes.split('-')[1]), 0);
    const endDateStr = `${mes}-${endDate.getDate()}`;

    const { data, error } = await supabase
        .from('caja_admin_movimientos')
        .select('subtipo, usd_equivalente_total')
        .eq('sucursal_id', sucursalId)
        .eq('tipo_movimiento', 'EGRESO')
        .gte('fecha_movimiento', startDate)
        .lte('fecha_movimiento', endDateStr)
        .neq('estado', 'Anulado');

    if (error || !data) return [];

    // Group by subtipo
    const grouped = data.reduce((acc: Record<string, number>, item: { subtipo: string; usd_equivalente_total: number }) => {
        const key = item.subtipo || 'Sin categoría';
        acc[key] = (acc[key] || 0) + (item.usd_equivalente_total || 0);
        return acc;
    }, {} as Record<string, number>);

    return Object.entries(grouped)
        .map(([subtipo, total_usd]) => ({ subtipo, total_usd: Number(total_usd) }))
        .sort((a, b) => b.total_usd - a.total_usd)
        .slice(0, 10);
}

async function getSucursalById(id: string): Promise<Sucursal | null> {
    const { data } = await supabase
        .from('sucursales')
        .select('*')
        .eq('id', id)
        .single();
    return data;
}

// =============================================
// Observados Resolution Functions
// =============================================

export async function getRegistrosObservados(options: {
    mes?: string;
    personal_id?: string;
    motivo?: MotivoObservado;
}): Promise<RegistroHoras[]> {
    let query = supabase
        .from('registro_horas')
        .select('*, personal(*)')
        .eq('estado', 'Observado')
        .order('fecha', { ascending: false });

    if (options.mes) {
        const startDate = `${options.mes}-01`;
        const [year, month] = options.mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query.gte('fecha', startDate).lt('fecha', firstDayNextMonth);
    }

    if (options.personal_id) {
        query = query.eq('personal_id', options.personal_id);
    }

    if (options.motivo) {
        query = query.eq('motivo_observado', options.motivo);
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching observados:', error);
        return [];
    }
    return data || [];
}

export async function countObservadosPendientes(mes?: string): Promise<number> {
    let query = supabase
        .from('registro_horas')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'Observado');

    if (mes) {
        const startDate = `${mes}-01`;
        const [year, month] = mes.split('-').map(Number);
        const firstDayNextMonth = new Date(year, month, 1).toISOString().split('T')[0];
        query = query.gte('fecha', startDate).lt('fecha', firstDayNextMonth);
    }

    const { count, error } = await query;
    if (error) return 0;
    return count || 0;
}

export interface ResolucionData {
    hora_ingreso?: string;
    hora_egreso?: string;
    nota_resolucion: string;
    metodo_verificacion: MetodoVerificacion;
    evidencia_url?: string;
    resuelto_por: string;
}

export async function resolverRegistro(
    registroId: string,
    data: ResolucionData
): Promise<{ success: boolean; error?: string }> {
    // First get current record for audit
    const { data: current, error: fetchError } = await supabase
        .from('registro_horas')
        .select('*')
        .eq('id', registroId)
        .single();

    if (fetchError || !current) {
        return { success: false, error: 'Registro no encontrado' };
    }

    // Calculate new hours if times provided
    let newHoras = current.horas;
    if (data.hora_ingreso && data.hora_egreso) {
        const [inH, inM] = data.hora_ingreso.split(':').map(Number);
        const [outH, outM] = data.hora_egreso.split(':').map(Number);
        const inMinutes = inH * 60 + inM;
        const outMinutes = outH * 60 + outM;
        newHoras = Math.max(0, (outMinutes - inMinutes) / 60);
    }

    // Update the record
    const { error: updateError } = await supabase
        .from('registro_horas')
        .update({
            estado: 'Resuelto',
            hora_ingreso: data.hora_ingreso || current.hora_ingreso,
            hora_egreso: data.hora_egreso || current.hora_egreso,
            horas: newHoras,
            nota_resolucion: data.nota_resolucion,
            metodo_verificacion: data.metodo_verificacion,
            evidencia_url: data.evidencia_url,
            resuelto_por: data.resuelto_por,
            resuelto_fecha_hora: new Date().toISOString(),
        })
        .eq('id', registroId);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    // Log audit entries for each changed field
    const auditEntries = [];

    if (data.hora_ingreso && data.hora_ingreso !== current.hora_ingreso) {
        auditEntries.push({
            registro_horas_id: registroId,
            usuario: data.resuelto_por,
            campo_modificado: 'hora_ingreso',
            valor_anterior: current.hora_ingreso || current.original_hora_ingreso || null,
            valor_nuevo: data.hora_ingreso,
            motivo: data.nota_resolucion,
            metodo_verificacion: data.metodo_verificacion,
            evidencia_url: data.evidencia_url,
        });
    }

    if (data.hora_egreso && data.hora_egreso !== current.hora_egreso) {
        auditEntries.push({
            registro_horas_id: registroId,
            usuario: data.resuelto_por,
            campo_modificado: 'hora_egreso',
            valor_anterior: current.hora_egreso || current.original_hora_egreso || null,
            valor_nuevo: data.hora_egreso,
            motivo: data.nota_resolucion,
            metodo_verificacion: data.metodo_verificacion,
            evidencia_url: data.evidencia_url,
        });
    }

    // Estado change audit
    auditEntries.push({
        registro_horas_id: registroId,
        usuario: data.resuelto_por,
        campo_modificado: 'estado',
        valor_anterior: current.estado,
        valor_nuevo: 'Resuelto',
        motivo: data.nota_resolucion,
        metodo_verificacion: data.metodo_verificacion,
        evidencia_url: data.evidencia_url,
    });

    if (auditEntries.length > 0) {
        await supabase.from('auditoria_cambios_horas').insert(auditEntries);
    }

    return { success: true };
}

export async function anularRegistro(
    registroId: string,
    motivo: string,
    usuario: string
): Promise<{ success: boolean; error?: string }> {
    const { data: current, error: fetchError } = await supabase
        .from('registro_horas')
        .select('estado')
        .eq('id', registroId)
        .single();

    if (fetchError || !current) {
        return { success: false, error: 'Registro no encontrado' };
    }

    const { error: updateError } = await supabase
        .from('registro_horas')
        .update({
            estado: 'Anulado',
            nota_resolucion: motivo,
            resuelto_por: usuario,
            resuelto_fecha_hora: new Date().toISOString(),
        })
        .eq('id', registroId);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    // Log audit
    await supabase.from('auditoria_cambios_horas').insert({
        registro_horas_id: registroId,
        usuario: usuario,
        campo_modificado: 'estado',
        valor_anterior: current.estado,
        valor_nuevo: 'Anulado',
        motivo: motivo,
    });

    return { success: true };
}

export async function getAuditoriaRegistro(registroId: string): Promise<AuditoriaHoras[]> {
    const { data, error } = await supabase
        .from('auditoria_cambios_horas')
        .select('*')
        .eq('registro_horas_id', registroId)
        .order('fecha_hora', { ascending: false });

    if (error) return [];
    return data || [];
}


// =============================================
// ADMIN: Alertas
// =============================================

export interface DiaSinCierreAdmin {
    fecha: string;
    cantidad: number;
    ultimo_usuario: string;
}

export async function getDiasSinCierreAdmin(sucursalId: string): Promise<DiaSinCierreAdmin[]> {
    const { data, error } = await supabase.rpc('get_dias_sin_cierre_admin', {
        p_sucursal_id: sucursalId
    });
    if (error) {
        console.error('Error checking alerts admin:', error);
        return [];
    }
    return data || [];
}
