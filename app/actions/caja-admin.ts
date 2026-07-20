'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { calculateExchangeAmounts, isUuid } from '@/lib/caja-admin/exchange';

interface MovimientoLineaInput {
    id?: string;
    cuenta_id: string;
    importe: number;
    moneda: string;
    usd_equivalente?: number;
}

interface CreateCajaAdminExchangeInput {
    sucursalId: string;
    fechaMovimiento: string;
    descripcion: string;
    nota?: string;
    adjuntos?: string[];
    usdAmount: number;
    exchangeRate: number;
    bnaReference?: number | null;
    usdAccountId: string;
    arsAccountId: string;
    idempotencyKey: string;
}

async function getAuthorizedCajaAdminClient() {
    const authClient = await createClient();
    const {
        data: { user },
        error: userError,
    } = await authClient.auth.getUser();

    if (userError || !user) {
        return { error: 'Sesion invalida. Vuelve a iniciar sesion.' } as const;
    }

    const { data: profile } = await authClient
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    const role = (profile?.categoria || user.user_metadata?.role || '').toLowerCase();
    if (role !== 'owner' && role !== 'admin') {
        return { error: 'Permiso denegado: solo Admin/Dueno puede operar Caja Administracion.' } as const;
    }

    return { authClient, user, role } as const;
}

export async function createCajaAdminExchangeSecure(input: CreateCajaAdminExchangeInput) {
    try {
        const auth = await getAuthorizedCajaAdminClient();
        if ('error' in auth) {
            return { success: false, error: auth.error };
        }

        if (!isUuid(input.sucursalId) || !isUuid(input.usdAccountId) || !isUuid(input.arsAccountId)) {
            return { success: false, error: 'Sucursal o cuentas de efectivo invalidas.' };
        }

        if (!isUuid(input.idempotencyKey)) {
            return { success: false, error: 'No se pudo identificar de forma segura este movimiento.' };
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(input.fechaMovimiento)) {
            return { success: false, error: 'La fecha del movimiento no es valida.' };
        }

        if (!input.descripcion.trim()) {
            return { success: false, error: 'La descripcion es requerida.' };
        }

        const amounts = calculateExchangeAmounts(input.usdAmount, input.exchangeRate);
        const normalizedAttachments = (input.adjuntos || [])
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 20);

        const bnaReference = Number(input.bnaReference);
        const { data, error } = await auth.authClient.rpc('create_caja_admin_exchange', {
            p_sucursal_id: input.sucursalId,
            p_fecha_movimiento: input.fechaMovimiento,
            p_descripcion: input.descripcion.trim(),
            p_nota: input.nota?.trim() || null,
            p_adjuntos: normalizedAttachments,
            p_usd_amount: amounts.usdAmount,
            p_exchange_rate: amounts.exchangeRate,
            p_bna_reference: Number.isFinite(bnaReference) && bnaReference > 0 ? bnaReference : null,
            p_usd_account_id: input.usdAccountId,
            p_ars_account_id: input.arsAccountId,
            p_idempotency_key: input.idempotencyKey,
        });

        if (error) {
            return { success: false, error: error.message };
        }

        const result = (data || {}) as {
            id?: string;
            duplicate?: boolean;
            duplicate_reason?: 'recent_match' | 'idempotency';
        };

        if (result.duplicate && result.duplicate_reason === 'recent_match') {
            return {
                success: false,
                duplicate: true,
                error: 'Ya existe un cambio identico registrado por este usuario en los ultimos 5 minutos. No se volvio a guardar.',
            };
        }

        revalidatePath('/caja-admin');
        return {
            success: true,
            duplicate: Boolean(result.duplicate),
            movimientoId: result.id || null,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error inesperado al registrar el cambio de moneda',
        };
    }
}

export async function anularCajaAdminMovimientoSecure(input: {
    movimientoId: string;
    motivo: string;
}) {
    try {
        const auth = await getAuthorizedCajaAdminClient();
        if ('error' in auth) {
            return { success: false, error: auth.error };
        }

        if (!isUuid(input.movimientoId)) {
            return { success: false, error: 'El movimiento no es valido.' };
        }

        const motivo = input.motivo.trim();
        if (motivo.length < 5) {
            return { success: false, error: 'Ingresa un motivo de anulacion claro.' };
        }

        const { data: current, error: currentError } = await auth.authClient
            .from('caja_admin_movimientos')
            .select('id, estado, cierre_id')
            .eq('id', input.movimientoId)
            .maybeSingle();

        if (currentError) {
            return { success: false, error: currentError.message };
        }

        if (!current) {
            return { success: false, error: 'No se encontro el movimiento.' };
        }

        if (current.estado === 'Anulado') {
            return { success: true, alreadyAnulled: true };
        }

        if (current.cierre_id) {
            return { success: false, error: 'No se puede anular un movimiento incluido en un cierre de caja.' };
        }

        const now = new Date().toISOString();
        const { data: updated, error: updateError } = await auth.authClient
            .from('caja_admin_movimientos')
            .update({
                estado: 'Anulado',
                motivo_anulacion: motivo,
                anulado_por: auth.user.id,
                anulado_fecha_hora: now,
                updated_by: auth.user.id,
                updated_at: now,
                registro_editado: true,
            })
            .eq('id', input.movimientoId)
            .eq('estado', 'Registrado')
            .select('id')
            .maybeSingle();

        if (updateError) {
            return { success: false, error: updateError.message };
        }

        if (!updated) {
            return { success: false, error: 'El movimiento cambio de estado antes de poder anularlo. Recarga la caja.' };
        }

        const { error: historyError } = await auth.authClient
            .from('historial_ediciones')
            .insert({
                id_registro: input.movimientoId,
                tabla_origen: 'caja_admin_movimientos',
                campo_modificado: 'estado',
                valor_anterior: 'Registrado',
                valor_nuevo: 'Anulado',
                usuario_editor: auth.user.id,
                usuario_email: auth.user.email || null,
                motivo_edicion: motivo,
            });

        if (historyError) {
            console.error('No se pudo registrar el historial visible de la anulacion:', historyError.message);
        }

        revalidatePath('/caja-admin');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error inesperado al anular el movimiento',
        };
    }
}

export async function updateCajaAdminMovimientoSecure(input: {
    movimientoId: string;
    fecha_movimiento: string;
    descripcion: string;
    nota?: string;
    adjuntos?: string[];
    registro_editado?: boolean;
    lines: MovimientoLineaInput[];
    usdTotalOverride?: number;
}) {
    try {
        const authClient = await createClient();
        const {
            data: { user },
            error: userError,
        } = await authClient.auth.getUser();

        if (userError || !user) {
            return { success: false, error: 'Sesion invalida. Vuelve a iniciar sesion.' };
        }

        const { data: profile } = await authClient
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .maybeSingle();

        const role = (profile?.categoria || user.user_metadata?.role || '').toLowerCase();
        if (role !== 'owner' && role !== 'admin') {
            return { success: false, error: 'Permiso denegado: solo Admin/Dueno puede editar Caja Administracion.' };
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const writeClient: SupabaseClient = (supabaseUrl && serviceKey)
            ? createSupabaseClient(supabaseUrl, serviceKey)
            : authClient;

        const normalizedLines = (input.lines || []).map((line) => {
            const importe = Math.max(0, Number(line.importe || 0));
            const moneda = (line.moneda || '').toUpperCase();
            const usdEquivalente = Number.isFinite(Number(line.usd_equivalente))
                ? Number(line.usd_equivalente)
                : (moneda === 'USD' ? importe : 0);

            return {
                cuenta_id: String(line.cuenta_id || ''),
                importe,
                moneda: moneda || 'USD',
                usd_equivalente: Math.max(0, usdEquivalente),
            };
        }).filter((line) => line.cuenta_id && line.importe > 0);

        const normalizedAttachments = (input.adjuntos || [])
            .filter((value): value is string => typeof value === 'string')
            .map((value) => value.trim())
            .filter(Boolean)
            .slice(0, 20);

        if ((input.lines || []).length > 0 && normalizedLines.length === 0) {
            return { success: false, error: 'No hay lineas validas para guardar. Completa importes mayores a 0.' };
        }

        let usdTotal = 0;
        if (normalizedLines.length > 0) {
            usdTotal = normalizedLines.reduce((sum, line) => sum + Number(line.usd_equivalente || 0), 0);
        } else if (typeof input.usdTotalOverride === 'number' && Number.isFinite(input.usdTotalOverride)) {
            usdTotal = Math.max(0, input.usdTotalOverride);
        } else {
            const { data: currentMov, error: currentMovError } = await writeClient
                .from('caja_admin_movimientos')
                .select('usd_equivalente_total')
                .eq('id', input.movimientoId)
                .maybeSingle();

            if (currentMovError) {
                return { success: false, error: currentMovError.message };
            }

            usdTotal = Number(currentMov?.usd_equivalente_total || 0);
        }

        const { error: updateMovError } = await writeClient
            .from('caja_admin_movimientos')
            .update({
                fecha_movimiento: input.fecha_movimiento,
                descripcion: input.descripcion,
                nota: input.nota ?? null,
                adjuntos: normalizedAttachments,
                registro_editado: Boolean(input.registro_editado),
                usd_equivalente_total: usdTotal,
                updated_at: new Date().toISOString(),
            })
            .eq('id', input.movimientoId);

        if (updateMovError) {
            return { success: false, error: updateMovError.message };
        }

        const { error: deleteLinesError } = await writeClient
            .from('caja_admin_movimiento_lineas')
            .delete()
            .eq('admin_movimiento_id', input.movimientoId);

        if (deleteLinesError) {
            return { success: false, error: `No se pudieron reemplazar lineas (delete): ${deleteLinesError.message}` };
        }

        if (normalizedLines.length > 0) {
            const linesPayload = normalizedLines.map((line) => ({
                admin_movimiento_id: input.movimientoId,
                cuenta_id: line.cuenta_id,
                importe: line.importe,
                moneda: line.moneda,
                usd_equivalente: line.usd_equivalente,
            }));

            const { error: insertLinesError } = await writeClient
                .from('caja_admin_movimiento_lineas')
                .insert(linesPayload);

            if (insertLinesError) {
                return { success: false, error: `No se pudieron reemplazar lineas (insert): ${insertLinesError.message}` };
            }
        }

        revalidatePath('/caja-admin');
        return { success: true };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Error inesperado al actualizar movimiento',
        };
    }
}
