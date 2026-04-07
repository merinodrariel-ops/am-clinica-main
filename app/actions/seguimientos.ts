'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export type SeguimientoState = 'pendiente' | 'realizado' | 'pospuesto' | 'no_aplica';
export type SeguimientoFilter = 'today' | 'next7' | 'next30' | 'past_due' | 'all';

export interface Seguimiento {
    id: string;
    patient_id: string | null;
    contacto_libre: string | null;
    motivo: string;
    due_date: string;
    state: SeguimientoState;
    notes: string | null;
    assigned_to: string | null;
    linked_agenda_id: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    patient?: {
        id_paciente: string;
        nombre: string;
        apellido: string;
        whatsapp: string | null;
        whatsapp_pais_code: string | null;
        whatsapp_numero: string | null;
    } | null;
}

async function getUserEmail(): Promise<string | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email ?? null;
}

export async function createSeguimiento(data: {
    patient_id?: string | null;
    contacto_libre?: string | null;
    motivo: string;
    due_date: string;
    notes?: string | null;
    assigned_to?: string | null;
    linked_agenda_id?: string | null;
}): Promise<{ success: boolean; data?: Seguimiento; error?: string }> {
    const supabase = await createClient();
    const email = await getUserEmail();

    const { data: row, error } = await supabase
        .from('seguimientos_manuales')
        .insert({
            patient_id: data.patient_id || null,
            contacto_libre: data.contacto_libre || null,
            motivo: data.motivo,
            due_date: data.due_date,
            notes: data.notes || null,
            assigned_to: data.assigned_to || null,
            linked_agenda_id: data.linked_agenda_id || null,
            created_by: email,
        })
        .select(`*, patient:patient_id (id_paciente, nombre, apellido, whatsapp, whatsapp_pais_code, whatsapp_numero)`)
        .single();

    if (error) return { success: false, error: error.message };
    revalidatePath('/recalls');
    return { success: true, data: row as Seguimiento };
}

export async function getSeguimientos(
    filter: SeguimientoFilter = 'all',
    search?: string
): Promise<Seguimiento[]> {
    const supabase = await createClient();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30);

    let query = supabase
        .from('seguimientos_manuales')
        .select(`*, patient:patient_id (id_paciente, nombre, apellido, whatsapp, whatsapp_pais_code, whatsapp_numero)`)
        .neq('state', 'no_aplica')
        .order('due_date', { ascending: true });

    if (filter === 'today')    query = query.eq('due_date', todayStr);
    else if (filter === 'next7')  query = query.gte('due_date', todayStr).lte('due_date', in7.toISOString().split('T')[0]);
    else if (filter === 'next30') query = query.gte('due_date', todayStr).lte('due_date', in30.toISOString().split('T')[0]);
    else if (filter === 'past_due') query = query.lt('due_date', todayStr).eq('state', 'pendiente');

    const { data, error } = await query;
    if (error) { console.error('[seguimientos]', error); return []; }

    let rows = (data || []) as Seguimiento[];

    if (search?.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter(s =>
            s.motivo.toLowerCase().includes(q) ||
            s.contacto_libre?.toLowerCase().includes(q) ||
            (s.patient && `${s.patient.nombre} ${s.patient.apellido}`.toLowerCase().includes(q))
        );
    }

    return rows;
}

export async function updateSeguimientoState(
    id: string,
    state: SeguimientoState,
    notes?: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { error } = await supabase
        .from('seguimientos_manuales')
        .update({ state, ...(notes !== undefined ? { notes } : {}) })
        .eq('id', id);
    if (error) return { success: false, error: error.message };
    revalidatePath('/recalls');
    return { success: true };
}

export async function snoozeSeguimiento(
    id: string,
    newDate: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { error } = await supabase
        .from('seguimientos_manuales')
        .update({ due_date: newDate, state: 'pospuesto' })
        .eq('id', id);
    if (error) return { success: false, error: error.message };
    revalidatePath('/recalls');
    return { success: true };
}

export async function deleteSeguimiento(
    id: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { error } = await supabase
        .from('seguimientos_manuales')
        .delete()
        .eq('id', id);
    if (error) return { success: false, error: error.message };
    revalidatePath('/recalls');
    return { success: true };
}
