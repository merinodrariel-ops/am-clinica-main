import { createClient } from '@/utils/supabase/client';
import { getLocalISODate } from '@/lib/local-date';
import {
    normalizeSaldoCajaFisica,
    type SaldoCajaFisica,
} from '@/lib/caja-fisica-model';

export type { EstadoCajaFisica, SaldoCajaFisica } from '@/lib/caja-fisica-model';

export interface CajaFisicaArqueo {
    id: string;
    sucursal_id: string;
    fecha: string;
    estado: 'abierto' | 'cerrado';
    usuario_apertura: string;
    usuario_cierre?: string | null;
    hora_apertura: string;
    hora_cierre?: string | null;
    saldo_inicial_ars: number;
    saldo_inicial_usd: number;
    saldo_esperado_ars?: number | null;
    saldo_esperado_usd?: number | null;
    saldo_contado_ars?: number | null;
    saldo_contado_usd?: number | null;
    diferencia_ars?: number | null;
    diferencia_usd?: number | null;
    observaciones?: string | null;
}

export async function getSaldoCajaFisica(
    sucursalId: string,
    fecha = getLocalISODate(),
): Promise<SaldoCajaFisica> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('caja_saldo_fisico', {
        p_sucursal_id: sucursalId,
        p_hasta_fecha: fecha,
    });

    if (error) throw new Error(error.message);
    return normalizeSaldoCajaFisica(data as Partial<SaldoCajaFisica> | null);
}

export async function abrirCajaFisica(params: {
    sucursalId: string;
    usuario: string;
    tcBna?: number | null;
    fecha?: string;
}): Promise<CajaFisicaArqueo> {
    const supabase = createClient();
    const { data, error } = await supabase.rpc('abrir_caja_fisica', {
        p_sucursal_id: params.sucursalId,
        p_fecha: params.fecha || getLocalISODate(),
        p_usuario: params.usuario,
        p_tc_bna: params.tcBna || null,
    });

    if (error) throw new Error(error.message);
    return data as CajaFisicaArqueo;
}

export async function cerrarCajaFisica(params: {
    sucursalId: string;
    usuario: string;
    contadoArs: number;
    contadoUsd: number;
    tcBna?: number | null;
    observaciones?: string;
    fecha?: string;
}): Promise<CajaFisicaArqueo> {
    if (params.contadoArs < 0 || params.contadoUsd < 0) {
        throw new Error('El conteo físico no puede ser negativo.');
    }

    const supabase = createClient();
    const { data, error } = await supabase.rpc('cerrar_caja_fisica', {
        p_sucursal_id: params.sucursalId,
        p_fecha: params.fecha || getLocalISODate(),
        p_usuario: params.usuario,
        p_contado_ars: params.contadoArs,
        p_contado_usd: params.contadoUsd,
        p_tc_bna: params.tcBna || null,
        p_observaciones: params.observaciones || null,
    });

    if (error) throw new Error(error.message);
    return data as CajaFisicaArqueo;
}
