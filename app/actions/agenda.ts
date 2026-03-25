'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { parseOrthoReplacementDays } from '@/lib/agenda-appointment-meta';

// Service-role client bypasses RLS for agenda mutations.
// Auth is still verified via SSR client before calling these.
function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

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
    is_primera_vez: boolean;
}>;

export async function getAppointments(start: string, end: string) {
    const supabase = await createClient();

    // Fetch appointments within range
    const { data, error } = await supabase
        .from('agenda_appointments')
        .select(`
            *,
            patient_data:patient_id (nombre, apellido, whatsapp, primera_consulta_fecha),
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
                full_name: `${patient.nombre || ''} ${patient.apellido || ''}`.trim() || 'Paciente',
                primera_consulta_fecha: patient.primera_consulta_fecha ?? null,
                fecha_alta: patient.fecha_alta ?? null,
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
    // Verify auth via SSR client, then use admin client to bypass RLS
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    // Sanitize input to avoid updating protected fields
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.created_at;
    delete safeUpdates.created_by;
    delete safeUpdates.is_primera_vez;

    const adminClient = getAdminClient();

    const { error } = await adminClient
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

    // Post-update hooks: primera visita + auto-recalls al completar
    const statusFinal = updates.status ?? '';
    const noCancelado = statusFinal !== 'cancelled' && statusFinal !== 'no_show';
    if (statusFinal && noCancelado) {
        const { data: apt } = await adminClient
            .from('agenda_appointments')
            .select('patient_id, start_time, type, doctor_id, notes')
            .eq('id', id)
            .single();

        const pacienteAsistio = statusFinal === 'completed' || statusFinal === 'arrived';

        if (apt?.patient_id && pacienteAsistio) {
            // a) Auto-setear primera_consulta_fecha — solo cuando el paciente realmente asistió
            const { data: paciente } = await adminClient
                .from('pacientes')
                .select('primera_consulta_fecha')
                .eq('id_paciente', apt.patient_id)
                .single();

            if (paciente && !paciente.primera_consulta_fecha) {
                // Solo setear si este es el ÚNICO turno del paciente (o el más antiguo).
                // Pacientes con turnos previos no son "primera vez" aunque el campo esté vacío
                // (pueden ser importados o creados antes de que existiera este campo).
                const { count: prevCount } = await adminClient
                    .from('agenda_appointments')
                    .select('id', { count: 'exact', head: true })
                    .eq('patient_id', apt.patient_id)
                    .lt('start_time', apt.start_time);

                if (prevCount === 0) {
                    await adminClient
                        .from('pacientes')
                        .update({ primera_consulta_fecha: apt.start_time.split('T')[0] })
                        .eq('id_paciente', apt.patient_id);
                }
            }

            // b) Auto-crear recalls si el turno se marca como completado
            if (statusFinal === 'completed' && apt.type) {
                const { createRecallsFromAppointment } = await import('@/app/actions/recalls');
                await createRecallsFromAppointment(
                    id, apt.type, apt.patient_id, apt.start_time, apt.doctor_id ?? null
                ).catch(err => console.error('[recalls] auto-create failed:', err));

                if (apt.type === 'control_ortodoncia') {
                    const replacementDays = parseOrthoReplacementDays(apt.notes) ?? 15;
                    const { data: patientContact } = await adminClient
                        .from('pacientes')
                        .select('nombre, apellido, email')
                        .eq('id_paciente', apt.patient_id)
                        .single();

                    if (patientContact?.email) {
                        const scheduledFor = new Date(apt.start_time);
                        scheduledFor.setDate(scheduledFor.getDate() + replacementDays);
                        scheduledFor.setUTCHours(12, 0, 0, 0);

                        const patientName = `${patientContact.nombre ?? ''} ${patientContact.apellido ?? ''}`.trim() || 'Paciente';
                        const subject = 'Recordatorio de recambio de alineadores — AM Clinica';
                        const message = [
                            `Hola ${patientName},`,
                            '',
                            `Te recordamos que hoy corresponde revisar el recambio de tus alineadores segun la indicacion que dejamos en tu ultimo control.`,
                            '',
                            'Si tenes dudas o sentis que el alineador no adapto bien, escribinos antes de hacer el cambio.',
                            '',
                            'AM Clinica',
                        ].join('\n');

                        const { data: existingReminder } = await adminClient
                            .from('scheduled_messages')
                            .select('id')
                            .eq('patient_id', apt.patient_id)
                            .eq('channel', 'email')
                            .eq('email', patientContact.email)
                            .eq('subject', subject)
                            .gte('scheduled_for', new Date(scheduledFor.getTime() - 60000).toISOString())
                            .lte('scheduled_for', new Date(scheduledFor.getTime() + 60000).toISOString())
                            .limit(1);

                        if (!existingReminder || existingReminder.length === 0) {
                            await adminClient
                                .from('scheduled_messages')
                                .insert({
                                    patient_id: apt.patient_id,
                                    channel: 'email',
                                    email: patientContact.email,
                                    message,
                                    subject,
                                    scheduled_for: scheduledFor.toISOString(),
                                    created_by: user.id,
                                })
                                .then(({ error }) => {
                                    if (error) console.error('[ortho-reminder] schedule failed:', error);
                                });
                        }
                    }
                }
            }
        }
    }

    revalidatePath('/agenda');
    return { success: true };
}

export async function deleteAppointment(id: string) {
    // Verify auth via SSR client, then use admin client to bypass RLS
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const { error } = await getAdminClient()
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
        .select('id, full_name, categoria')
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
                role: profile.categoria,
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado', updatedCount: 0 };

    const admin = getAdminClient();
    let query = admin
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

// ─── Tomorrow's appointments (for bulk confirmation) ─────────────────────────

export interface TomorrowAppointment {
    id: string;
    title: string | null;
    start_time: string;
    patientName: string;
    patientPhone: string | null;
    doctorName: string | null;
    status: string;
}

export async function getTomorrowAppointments(): Promise<TomorrowAppointment[]> {
    const admin = getAdminClient();
    const now = new Date();
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const start = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 0, 0, 0);
    const end   = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 23, 59, 59);

    const { data, error } = await admin
        .from('agenda_appointments')
        .select(`id, title, start_time, status,
            patient_data:patient_id (nombre, apellido, whatsapp),
            doctor_data:doctor_id (full_name)`)
        .gte('start_time', start.toISOString())
        .lte('start_time', end.toISOString())
        .not('status', 'in', '("cancelled","no_show")')
        .order('start_time', { ascending: true });

    if (error) { console.error('getTomorrowAppointments:', error); return []; }

    return (data ?? []).map(apt => {
        const p = Array.isArray(apt.patient_data) ? apt.patient_data[0] : apt.patient_data;
        const d = Array.isArray(apt.doctor_data)  ? apt.doctor_data[0]  : apt.doctor_data;
        return {
            id: apt.id,
            title: apt.title,
            start_time: apt.start_time,
            status: apt.status,
            patientName: p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() : (apt.title ?? 'Paciente'),
            patientPhone: p?.whatsapp ?? null,
            doctorName: d?.full_name ?? null,
        };
    });
}

export async function sendBulkWhatsAppConfirmations(
    appointments: Pick<TomorrowAppointment, 'id' | 'start_time' | 'patientName' | 'patientPhone' | 'doctorName'>[]
): Promise<{ sent: number; failed: number; noPhone: number }> {
    const { sendNotification } = await import('@/lib/am-scheduler/notification-service');
    let sent = 0; let failed = 0; let noPhone = 0;

    for (const apt of appointments) {
        if (!apt.patientPhone) { noPhone++; continue; }
        const result = await sendNotification({
            appointmentId: apt.id,
            templateKey: 'reminder_24h',
            channel: 'whatsapp',
            patientName: apt.patientName,
            patientPhone: apt.patientPhone,
            patientEmail: null,
            doctorName: apt.doctorName,
            startTime: apt.start_time,
            endTime: apt.start_time,
        });
        result.success ? sent++ : failed++;
    }

    return { sent, failed, noPhone };
}
