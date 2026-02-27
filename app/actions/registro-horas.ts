'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface RegistroHoras {
    id: string;
    personal_id: string;
    fecha: string;
    horas: number;
    hora_ingreso: string | null;
    hora_egreso: string | null;
    estado: string;
    observaciones: string | null;
    created_at: string;
    // joins
    personal?: { nombre: string; apellido: string | null };
    correcciones_count?: number;
}

export interface CorreccionHoras {
    id: string;
    registro_id: string;
    editado_por: string;
    motivo: string;
    campo: string;
    valor_anterior: string | null;
    valor_nuevo: string;
    created_at: string;
    editor?: { full_name: string };
}

export interface EditarRegistroInput {
    registroId: string;
    motivo: string;
    cambios: {
        horas?: number;
        hora_ingreso?: string;
        hora_egreso?: string;
        fecha?: string;
    };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export async function getRegistrosHorasMes(
    mes: string, // 'YYYY-MM'
    personalId?: string
): Promise<RegistroHoras[]> {
    const admin = getAdminClient();
    const [year, month] = mes.split('-').map(Number);
    const start = `${mes}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${mes}-${String(lastDay).padStart(2, '0')}`;

    let query = admin
        .from('registro_horas')
        .select('*, personal!inner(nombre, apellido)')
        .gte('fecha', start)
        .lte('fecha', end)
        .order('fecha', { ascending: false });

    if (personalId) query = query.eq('personal_id', personalId);

    const { data } = await query;
    return (data || []) as RegistroHoras[];
}

export async function getCorreccionesDeRegistro(
    registroId: string
): Promise<CorreccionHoras[]> {
    const admin = getAdminClient();
    const { data } = await admin
        .from('registro_horas_correcciones')
        .select('*, profiles!editado_por(full_name)')
        .eq('registro_id', registroId)
        .order('created_at', { ascending: false });

    return (data || []).map((c: Record<string, unknown>) => ({
        ...(c as unknown as CorreccionHoras),
        editor: (Array.isArray(c.profiles) ? c.profiles[0] : c.profiles) as { full_name: string } | undefined,
    }));
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function editarRegistroHoras(
    input: EditarRegistroInput
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    // Fetch current values for audit log
    const { data: current, error: fetchErr } = await admin
        .from('registro_horas')
        .select('horas, hora_ingreso, hora_egreso, fecha')
        .eq('id', input.registroId)
        .single();

    if (fetchErr || !current) return { success: false, error: 'Registro no encontrado' };

    // Apply changes
    const { error: updateErr } = await admin
        .from('registro_horas')
        .update({
            ...input.cambios,
            observaciones: `[CORREGIDO] ${input.motivo}`,
        })
        .eq('id', input.registroId);

    if (updateErr) return { success: false, error: updateErr.message };

    // Insert audit records for each changed field
    const auditRows: object[] = [];
    const campos = ['horas', 'hora_ingreso', 'hora_egreso', 'fecha'] as const;

    for (const campo of campos) {
        if (input.cambios[campo] !== undefined) {
            const anterior = current[campo];
            const nuevo = input.cambios[campo];
            if (String(anterior) !== String(nuevo)) {
                auditRows.push({
                    registro_id: input.registroId,
                    editado_por: user.id,
                    motivo: input.motivo,
                    campo,
                    valor_anterior: anterior !== null && anterior !== undefined ? String(anterior) : null,
                    valor_nuevo: String(nuevo),
                });
            }
        }
    }

    if (auditRows.length > 0) {
        await admin.from('registro_horas_correcciones').insert(auditRows);
    }

    revalidatePath('/admin/liquidaciones');
    revalidatePath('/portal');
    return { success: true };
}

export async function eliminarRegistroHoras(
    registroId: string,
    motivo: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = getAdminClient();

    // Log before deleting
    const { data: current } = await admin
        .from('registro_horas')
        .select('personal_id, fecha, horas')
        .eq('id', registroId)
        .single();

    if (current) {
        await admin.from('registro_horas_correcciones').insert({
            registro_id: registroId,
            editado_por: user.id,
            motivo: `ELIMINADO: ${motivo}`,
            campo: 'estado',
            valor_anterior: `fecha:${current.fecha} horas:${current.horas}`,
            valor_nuevo: 'eliminado',
        });
    }

    const { error } = await admin
        .from('registro_horas')
        .delete()
        .eq('id', registroId);

    if (error) return { success: false, error: error.message };

    revalidatePath('/admin/liquidaciones');
    return { success: true };
}
