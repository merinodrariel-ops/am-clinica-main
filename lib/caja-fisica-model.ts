export type EstadoCajaFisica = 'no_configurada' | 'sin_abrir' | 'abierto' | 'cerrado';

export interface SaldoCajaFisica {
    activa: boolean;
    fecha_activacion: string | null;
    estado: EstadoCajaFisica;
    arqueo_id?: string | null;
    ars: number;
    usd: number;
    saldo_inicial_ars?: number;
    saldo_inicial_usd?: number;
    movimientos_recepcion_ars?: number;
    movimientos_recepcion_usd?: number;
    movimientos_admin_ars?: number;
    movimientos_admin_usd?: number;
}

export function normalizeSaldoCajaFisica(
    raw: Partial<SaldoCajaFisica> | null,
): SaldoCajaFisica {
    return {
        activa: Boolean(raw?.activa),
        fecha_activacion: raw?.fecha_activacion || null,
        estado: raw?.estado || 'no_configurada',
        arqueo_id: raw?.arqueo_id || null,
        ars: Number(raw?.ars || 0),
        usd: Number(raw?.usd || 0),
        saldo_inicial_ars: Number(raw?.saldo_inicial_ars || 0),
        saldo_inicial_usd: Number(raw?.saldo_inicial_usd || 0),
        movimientos_recepcion_ars: Number(raw?.movimientos_recepcion_ars || 0),
        movimientos_recepcion_usd: Number(raw?.movimientos_recepcion_usd || 0),
        movimientos_admin_ars: Number(raw?.movimientos_admin_ars || 0),
        movimientos_admin_usd: Number(raw?.movimientos_admin_usd || 0),
    };
}
