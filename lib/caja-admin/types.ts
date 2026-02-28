
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
    tipo_movimiento: 'INGRESO_ADMIN' | 'INGRESO_PACIENTE' | 'EGRESO' | 'CAMBIO_MONEDA' | 'RETIRO' | 'TRANSFERENCIA' | 'AJUSTE_CAJA' | 'APORTE_CAPITAL' | 'GIRO_ACTIVO';
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
    caja_admin_movimiento_lineas?: MovimientoLinea[];
}

export interface MovimientoLinea {
    id?: string;
    admin_movimiento_id?: string;
    cuenta_id: string;
    importe: number;
    moneda: string;
    usd_equivalente?: number;
}

export interface CajaAdminCategoria {
    id: string;
    sucursal_id: string;
    nombre: string;
    tipo_movimiento: string;
    requiere_adjunto: boolean;
    activo: boolean;
    orden: number;
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
    user_id?: string | null;  // Linked auth user (null if not yet linked)
    nombre: string;
    apellido?: string;
    tipo: 'prestador' | 'profesional';
    area: string;
    rol: string;
    email?: string;
    whatsapp?: string;
    documento?: string;
    dni_frente_url?: string;
    dni_dorso_url?: string;
    direccion?: string;
    barrio_localidad?: string;
    condicion_afip?: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    foto_url?: string;
    fecha_ingreso?: string;
    descripcion?: string;
    valor_hora_ars: number;
    activo: boolean;
    pagado_mes_actual?: boolean;
    ultimo_pago_fecha?: string;
    ultimo_pago_monto?: number;
    // Professional specific
    matricula_provincial?: string;
    especialidad?: string;
    poliza_url?: string;
    poliza_vencimiento?: string;
    consentimientos_urls?: string[];
    sanciones_notas?: string;
    porcentaje_honorarios?: number;
    created_at?: string;
    updated_at?: string;
}

export interface PersonalArea {
    id: string;
    nombre: string;
    descripcion?: string;
    tipo_personal: 'prestador' | 'profesional' | 'ambos';
    color: string;
    icono: string;
    activo: boolean;
    orden: number;
}

export type EstadoRegistro = 'Registrado' | 'Observado' | 'Resuelto' | 'Anulado';
export type MotivoObservado = 'FaltaIngreso' | 'FaltaEgreso' | 'HorasExcesivas' |
    'MarcacionesImpares' | 'ConflictoDuplicado' | 'Otro';
export type MetodoVerificacion = 'Camaras' | 'PorteroElectrico' | 'Testigo' | 'Otro';

export interface RegistroHoras {
    id: string;
    personal_id: string;
    fecha: string;
    created_at?: string;
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

export interface ReporteSummary {
    ingresosPacientesUsd: number;
    egresosUsd: number;
    honorariosProfesionalesUsd: number;
    sueldosStaffUsd: number;
    margenBruto: number;
    cashflowNeto: number;
}

export interface DiaSinCierreAdmin {
    fecha: string;
    cantidad: number;
    ultimo_usuario: string;
}

export interface ResolucionData {
    hora_ingreso?: string;
    hora_egreso?: string;
    nota_resolucion: string;
    metodo_verificacion: MetodoVerificacion;
    evidencia_url?: string;
    resuelto_por: string;
}

export interface CreatePersonalInput {
    nombre: string;
    apellido?: string;
    tipo: 'prestador' | 'profesional';
    area: string;
    rol?: string;
    email?: string;
    whatsapp?: string;
    documento?: string;
    direccion?: string;
    barrio_localidad?: string;
    condicion_afip?: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    valor_hora_ars?: number;
    descripcion?: string;
    fecha_ingreso?: string;
    // Professional fields
    matricula_provincial?: string;
    especialidad?: string;
    porcentaje_honorarios?: number;
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
