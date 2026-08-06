export type EstadoCajaFisica = 'no_configurada' | 'sin_abrir' | 'abierto' | 'abierto_anterior' | 'cerrado';

export interface SaldoCajaFisica {
    activa: boolean;
    fecha_activacion: string | null;
    estado: EstadoCajaFisica;
    arqueo_id?: string | null;
    arqueo_fecha?: string | null;
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
        arqueo_fecha: raw?.arqueo_fecha || null,
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

export function resolveSaldoCajaFisicaForDate(
    saldo: SaldoCajaFisica,
    arqueoFecha: string | null | undefined,
    requestedFecha: string,
): SaldoCajaFisica {
    if (
        saldo.estado === 'abierto'
        && arqueoFecha
        && arqueoFecha < requestedFecha
    ) {
        return {
            ...saldo,
            estado: 'abierto_anterior',
            arqueo_fecha: arqueoFecha,
        };
    }

    if (
        saldo.estado === 'cerrado'
        && arqueoFecha
        && arqueoFecha < requestedFecha
    ) {
        return {
            ...saldo,
            estado: 'sin_abrir',
            arqueo_id: null,
            arqueo_fecha: arqueoFecha,
        };
    }

    return {
        ...saldo,
        arqueo_fecha: arqueoFecha || saldo.arqueo_fecha || null,
    };
}

export function canOpenCajaFisica(
    saldo: Pick<SaldoCajaFisica, 'activa' | 'estado'>,
    categoria: string | null | undefined,
): boolean {
    return saldo.activa
        && ['sin_abrir', 'cerrado'].includes(saldo.estado)
        && ['owner', 'admin', 'reception', 'developer'].includes(categoria || '');
}
