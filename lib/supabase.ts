import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Fail gracefully during build if env vars are missing
export const supabase = (supabaseUrl && supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseAnonKey)
    : {} as ReturnType<typeof createClient>;


// Types for Caja Recepción Module
export interface TarifarioVersion {
    id: string;
    nombre_version: string;
    vigente_desde: string;
    vigente_hasta: string | null;
    estado: 'borrador' | 'vigente' | 'archivado';
    created_at: string;
    created_by: string | null;
}

export interface TarifarioItem {
    id: string;
    tarifario_version_id: string;
    categoria: string;
    concepto_nombre: string;
    precio_base_usd: number;
    activo: boolean;
    notas: string | null;
    created_at: string;
}

export interface CajaMovimiento {
    id: string;
    fecha_hora: string;
    usuario: string | null;
    paciente_id: string;
    concepto_id: string | null;
    concepto_nombre: string;
    categoria: string | null;
    precio_lista_usd: number | null;
    monto: number;
    moneda: 'USD' | 'ARS' | 'USDT';
    metodo_pago: 'Efectivo' | 'Transferencia' | 'MercadoPago' | 'Cripto';
    canal_destino: 'Empresa' | 'Personal' | 'MP' | 'USDT' | null;
    tipo_comprobante: 'Factura A' | 'Tipo C' | 'Sin factura' | 'Otro' | null;
    cuota_nro: number | null;
    cuotas_total: number | null;
    interes_mensual_pct: number;
    estado: 'pagado' | 'pendiente' | 'parcial' | 'anulado';
    observaciones: string | null;
    tc_bna_venta: number | null;
    tc_fuente: 'BNA_AUTO' | 'MANUAL' | 'N/A' | null;
    tc_fecha_hora: string | null;
    usd_equivalente: number | null;
    precio_editado: boolean;
    motivo_cambio_precio: string | null;
    autorizado_por: string | null;
    autorizado_fecha_hora: string | null;
    motivo_anulacion: string | null;
    anulado_por: string | null;
    anulado_fecha_hora: string | null;
    created_at: string;
    // Joined data
    paciente?: {
        id_paciente: string;
        nombre: string;
        apellido: string;
    };
}

export interface TransferenciaCaja {
    id: string;
    fecha_hora: string;
    usuario: string | null;
    moneda: 'ARS' | 'USD';
    monto: number;
    tc_bna_venta: number | null;
    usd_equivalente: number | null;
    motivo: string | null;
    observaciones: string | null;
    estado: 'confirmada' | 'anulada';
    created_at: string;
}

export interface CajaArqueo {
    id: string;
    fecha: string;
    usuario: string;
    hora_inicio?: string | null;
    hora_cierre: string | null;
    saldo_inicial_usd_billete: number;
    saldo_inicial_ars_billete: number;
    saldo_inicial_usd_equivalente: number;
    saldo_final_usd_billete: number | null;
    saldo_final_ars_billete: number | null;
    saldo_final_usd_equivalente: number | null;
    tc_bna_venta_dia: number | null;
    total_ingresos_dia_usd: number | null;
    total_transferencias_admin_usd: number | null;
    diferencia_usd: number | null;
    observaciones: string | null;
    estado: 'abierto' | 'cerrado';
    snapshot_datos?: Record<string, unknown>;
    created_at: string;
}

export interface Paciente {
    id_paciente: string;
    nombre: string;
    apellido: string;
    telefono: string | null;
    email: string | null;
    documento: string | null;
}
