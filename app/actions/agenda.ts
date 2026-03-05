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
            patient_data:patient_id (nombre, apellido, whatsapp),
            doctor_data:doctor_id (full_name)
        `)
        .gte('start_time', start)
        .lte('end_time', end);

    if (error) {
        console.error('Error fetching appointments:', error);
        return [];
    }

    if (!data) return [];

    // Map data to include computed full_name and ensure patient/doctor objects are properly structured
    return data.map(apt => {
        const patient = Array.isArray(apt.patient_data) ? apt.patient_data[0] : apt.patient_data;
        const doctor = Array.isArray(apt.doctor_data) ? apt.doctor_data[0] : apt.doctor_data;

        return {
            ...apt,
            patient: patient ? {
                ...patient,
                full_name: `${patient.nombre || ''} ${patient.apellido || ''}`.trim() || 'Paciente'
            } : null,
            doctor: doctor || null
        };
    });
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
        .select('id_paciente, nombre, apellido, whatsapp')
        .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
        .eq('is_deleted', false)
        .limit(10);

    if (error) {
        console.error('Error searching patients:', error);
        return [];
    }

    return (data || []).map((p: { id_paciente: string; nombre: string; apellido: string; whatsapp: string | null }) => ({
        id: p.id_paciente,
        full_name: `${p.nombre} ${p.apellido}`,
        phone: p.whatsapp || ''
    }));
}

export async function getDoctors() {
    const supabase = await createClient();

    // Source doctors from `personal` to avoid listing non-clinical app users.
    const { data: staff, error: staffError } = await supabase
        .from('personal')
        .select('user_id, nombre, apellido')
        .eq('activo', true)
        .in('tipo', ['odontologo', 'profesional'])
        .not('user_id', 'is', null)
        .order('nombre');

    if (staffError) {
        console.error('Error fetching odontologos:', staffError);
        return [];
    }

    const userIds = (staff || [])
        .map((row: { user_id: string | null }) => row.user_id)
        .filter((id): id is string => Boolean(id));

    if (userIds.length === 0) {
        return [];
    }

    const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .in('id', userIds);

    if (profilesError) {
        console.error('Error fetching doctor profiles:', profilesError);
        return [];
    }

    const profileById = new Map((profiles || []).map(profile => [profile.id, profile]));

    return (staff || [])
        .map((row: { user_id: string | null; nombre: string | null; apellido: string | null }) => {
            const profile = row.user_id ? profileById.get(row.user_id) : null;
            if (!profile || !row.user_id) return null;

            const fallbackName = `${row.nombre || ''} ${row.apellido || ''}`.trim();
            return {
                id: profile.id,
                full_name: profile.full_name || fallbackName || 'Odontólogo',
                role: profile.role,
            };
        })
        .filter((doctor): doctor is { id: string; full_name: string; role: string } => Boolean(doctor))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' }));
}

export async function getImportedEventTypes() {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('agenda_appointments')
        .select('title, source, doctor_id')
        .in('source', ['calendly', 'google_calendar']);

    if (error) {
        console.error('Error fetching imported event types:', error);
        return [];
    }

    if (!data || data.length === 0) return [];

    // Group by title + source + doctor_id and count
    const groups = new Map<string, { title: string; source: string; doctorId: string; count: number }>();
    for (const row of data) {
        const key = `${row.title}||${row.source}||${row.doctor_id}`;
        const existing = groups.get(key);
        if (existing) {
            existing.count++;
        } else {
            groups.set(key, {
                title: row.title || 'Sin título',
                source: row.source || 'calendly',
                doctorId: row.doctor_id || '',
                count: 1,
            });
        }
    }

    // Fetch doctor names for all unique doctor IDs
    const doctorIds = [...new Set([...groups.values()].map(g => g.doctorId).filter(Boolean))];
    const doctorNames: Record<string, string> = {};
    if (doctorIds.length > 0) {
        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', doctorIds);
        if (profiles) {
            for (const p of profiles) {
                doctorNames[p.id] = p.full_name || 'Sin nombre';
            }
        }
    }

    return [...groups.values()].map(g => ({
        title: g.title,
        source: g.source,
        doctorId: g.doctorId,
        doctorName: doctorNames[g.doctorId] || 'Sin asignar',
        count: g.count,
    }));
}

export async function reassignDoctorBulk(
    filters: { title: string; source: string; currentDoctorId: string },
    newDoctorId: string
) {
    const supabase = await createClient();

    let query = supabase
        .from('agenda_appointments')
        .update({ doctor_id: newDoctorId, updated_at: new Date().toISOString() })
        .eq('title', filters.title)
        .eq('source', filters.source);

    if (filters.currentDoctorId) {
        query = query.eq('doctor_id', filters.currentDoctorId);
    }

    const { data, error } = await query.select('id');

    if (error) {
        console.error('Error reassigning doctors:', error);
        return { success: false, error: error.message, updatedCount: 0 };
    }

    revalidatePath('/agenda');
    return { success: true, updatedCount: data?.length || 0 };
}
