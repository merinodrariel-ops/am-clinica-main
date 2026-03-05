'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';

interface MovimientoLineaInput {
    id?: string;
    cuenta_id: string;
    importe: number;
    moneda: string;
    usd_equivalente?: number;
}

export async function updateCajaAdminMovimientoSecure(input: {
    movimientoId: string;
    fecha_movimiento: string;
    descripcion: string;
    nota?: string;
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
