'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

type AppointmentUpdatePayload = Partial<{
    id: string;
    title: string;
    patient_id: string | null;
    doctor_id: string | null;
    start_time: string;
    end_time: string;
    status: string;
    type: string;
    notes: string | null;
    created_at: string;
    created_by: string;
}>;

export async function getAppointments(start: string, end: string) {
    const supabase = await createClient();

    // Fetch appointments within range
    const { data, error } = await supabase
        .from('agenda_appointments')
        .select(`
            *,
            patient:patient_id (full_name, phone),
            doctor:doctor_id (full_name)
        `)
        .gte('start_time', start)
        .lte('end_time', end);

    if (error) {
        console.error('Error fetching appointments:', error);
        throw new Error('Failed to fetch appointments');
    }

    return data;
}

export async function createAppointment(formData: FormData) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        throw new Error('Not authenticated');
    }

    const title = formData.get('title') as string;
    const patientId = formData.get('patientId') as string || null;
    const doctorId = formData.get('doctorId') as string || null;
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;
    const status = formData.get('status') as string || 'confirmed';
    const type = formData.get('type') as string || 'consulta';
    const notes = formData.get('notes') as string;

    const { error } = await supabase.from('agenda_appointments').insert({
        title,
        patient_id: patientId ? patientId : null,
        doctor_id: doctorId ? doctorId : null,
        start_time: startTime,
        end_time: endTime,
        status,
        type,
        notes,
        created_by: user.id
    });

    if (error) {
        console.error('Error creating appointment:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/agenda');
    return { success: true };
}

export async function updateAppointment(id: string, updates: AppointmentUpdatePayload) {
    const supabase = await createClient();

    // Sanitize input to avoid updating protected fields
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.created_at;
    delete safeUpdates.created_by;

    const { error } = await supabase
        .from('agenda_appointments')
        .update({
            ...safeUpdates,
            updated_at: new Date().toISOString()
        })
        .eq('id', id);

    if (error) {
        console.error('Error updating appointment:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/agenda');
    return { success: true };
}

export async function deleteAppointment(id: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('agenda_appointments')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting appointment:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/agenda');
    return { success: true };
}

export async function searchPatients(query: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, telefono')
        .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
        .eq('is_deleted', false)
        .limit(10);

    if (error) {
        console.error('Error searching patients:', error);
        return [];
    }

    return (data || []).map((p: { id_paciente: string; nombre: string; apellido: string; telefono: string | null }) => ({
        id: p.id_paciente,
        full_name: `${p.nombre} ${p.apellido}`,
        phone: p.telefono || ''
    }));
}

export async function getDoctors() {
    const supabase = await createClient();
    const { data } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('role', ['owner', 'admin', 'developer', 'odontologo'])
        .order('full_name');
    return data || [];
}
