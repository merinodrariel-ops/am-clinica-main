'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { normalizeAppointmentModality, parseAppointmentModality, parseOrthoReplacementDays } from '@/lib/agenda-appointment-meta';
import { sendEmail } from '@/lib/email-service';

// Service-role client bypasses RLS for agenda mutations.
// Auth is still verified via SSR client before calling these.
function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

const DETAILED_DAY_APPOINTMENT_TYPES = new Set(['turno_detallado', 'tallado']);
const DETAILED_DAY_WORKFLOW_NAME = 'Diseño de Sonrisa';
const DETAILED_DAY_LAB_RECIPIENTS =
    process.env.WORKFLOW_LAB_NOTIFICATION_RECIPIENTS ||
    'amesteticadentallab@gmail.com,juliian_97@outlook.com,drarielmerino@gmail.com,lourdesfreire031@gmail.com';

function createDetailedDayEventKey(parts: string[]) {
    return parts.join('::');
}

function getArgentinaDateString(value: string | Date) {
    return new Date(value).toLocaleDateString('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
    });
}

function addDaysToDateString(dateString: string, days: number) {
    const [year, month, day] = dateString.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0));
    return date.toISOString().slice(0, 10);
}

function formatPatientName(patient?: { nombre?: string | null; apellido?: string | null } | null) {
    return `${patient?.apellido || ''}, ${patient?.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim() || 'Paciente';
}

async function logDetailedDayWorkflowNotification(params: {
    workflowId?: string | null;
    stageId?: string | null;
    treatmentId?: string | null;
    eventType: string;
    recipientEmail?: string | null;
    subject?: string | null;
    status: 'sent' | 'failed' | 'skipped';
    errorMessage?: string | null;
    eventKey: string;
}) {
    try {
        const adminClient = getAdminClient();
        const { error } = await adminClient.from('workflow_notifications_log').insert({
            workflow_id: params.workflowId || null,
            stage_id: params.stageId || null,
            treatment_id: params.treatmentId || null,
            event_type: params.eventType,
            recipient_email: params.recipientEmail || null,
            subject: params.subject || null,
            status: params.status,
            error_message: params.errorMessage || null,
            event_key: params.eventKey,
        });

        if (error && error.code !== '23505') {
            console.error('[turno-detallado] notification log failed:', error.message);
        }
    } catch (error) {
        console.error('[turno-detallado] notification log crashed:', error);
    }
}

async function ensureDetailedDayWorkflowCase(appointmentId: string) {
    const adminClient = getAdminClient();

    const { data: appointment, error: appointmentError } = await adminClient
        .from('agenda_appointments')
        .select(`
            id,
            title,
            patient_id,
            doctor_id,
            start_time,
            end_time,
            type,
            notes,
            patient:pacientes(id_paciente, nombre, apellido, documento)
        `)
        .eq('id', appointmentId)
        .maybeSingle();

    if (appointmentError || !appointment) {
        console.error('[turno-detallado] appointment lookup failed:', appointmentError?.message);
        return;
    }

    if (!DETAILED_DAY_APPOINTMENT_TYPES.has(appointment.type || '')) return;
    if (!appointment.patient_id) return;

    const dedupeEventKey = createDetailedDayEventKey(['turno_detallado_case_created', appointment.id]);
    const { data: existingTreatment, error: existingTreatmentError } = await adminClient
        .from('patient_treatments')
        .select('id')
        .contains('metadata', { source_appointment_id: appointment.id })
        .limit(1)
        .maybeSingle();

    if (existingTreatmentError) {
        console.error('[turno-detallado] existing treatment lookup failed:', existingTreatmentError.message);
    }

    if (existingTreatment?.id) {
        await logDetailedDayWorkflowNotification({
            eventType: 'turno_detallado_case_created',
            treatmentId: existingTreatment.id,
            status: 'skipped',
            errorMessage: 'existing_case',
            eventKey: dedupeEventKey,
        });
        return;
    }

    const { data: workflow, error: workflowError } = await adminClient
        .from('clinical_workflows')
        .select('id, name')
        .eq('name', DETAILED_DAY_WORKFLOW_NAME)
        .eq('active', true)
        .maybeSingle();

    if (workflowError || !workflow) {
        console.error('[turno-detallado] workflow not found:', workflowError?.message || DETAILED_DAY_WORKFLOW_NAME);
        return;
    }

    const { data: stages, error: stagesError } = await adminClient
        .from('clinical_workflow_stages')
        .select('id, name, order_index, is_initial')
        .eq('workflow_id', workflow.id)
        .order('order_index', { ascending: true });

    if (stagesError || !stages?.length) {
        console.error('[turno-detallado] workflow stages not found:', stagesError?.message);
        return;
    }

    const normalize = (value?: string | null) => (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    const targetStage =
        stages.find(stage => normalize(stage.name).includes('escaneo final')) ||
        stages.find(stage => normalize(stage.name).includes('preparacion dental')) ||
        stages.find(stage => Boolean(stage.is_initial)) ||
        stages[0];

    const appointmentDate = getArgentinaDateString(appointment.start_time);
    const now = new Date().toISOString();
    const patientRows = appointment.patient as
        | { id_paciente?: string; nombre?: string | null; apellido?: string | null; documento?: string | null }
        | { id_paciente?: string; nombre?: string | null; apellido?: string | null; documento?: string | null }[]
        | null;
    const patient = Array.isArray(patientRows) ? patientRows[0] : patientRows;
    const patientName = formatPatientName(patient);
    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
    const patientFilesUrl = `${appBaseUrl}/patients/${appointment.patient_id}?tab=archivos`;
    const workflowsUrl = `${appBaseUrl}/workflows?section=laboratorio`;

    const { data: treatment, error: treatmentError } = await adminClient
        .from('patient_treatments')
        .insert({
            patient_id: appointment.patient_id,
            workflow_id: workflow.id,
            current_stage_id: targetStage.id,
            doctor_id: null,
            start_date: appointment.start_time,
            last_stage_change: now,
            next_milestone_date: null,
            status: 'active',
            metadata: {
                source: 'agenda_turno_detallado',
                source_appointment_id: appointment.id,
                appointment_date: appointment.start_time,
                type: 'Día detallado',
                expected_next_step: 'Subir escaneo 3D al caso clínico',
            },
        })
        .select('id')
        .single();

    if (treatmentError || !treatment) {
        console.error('[turno-detallado] treatment insert failed:', treatmentError?.message);
        await logDetailedDayWorkflowNotification({
            workflowId: workflow.id,
            stageId: targetStage.id,
            eventType: 'turno_detallado_case_created',
            status: 'failed',
            errorMessage: treatmentError?.message || 'treatment_insert_failed',
            eventKey: dedupeEventKey,
        });
        return;
    }

    await adminClient.from('treatment_history').insert({
        treatment_id: treatment.id,
        new_stage_id: targetStage.id,
        comments: 'Caso iniciado automáticamente desde Día detallado en agenda.',
    }).then(({ error }) => {
        if (error) console.error('[turno-detallado] history insert failed:', error.message);
    });

    await adminClient.from('laboratorio_trabajos').insert({
        paciente_id: appointment.patient_id,
        profesional_id: null,
        tipo_trabajo: 'Día detallado - escaneo 3D pendiente',
        laboratorio_nombre: 'Laboratorio Interno',
        fecha_envio: appointmentDate,
        fecha_entrega_estimada: addDaysToDateString(appointmentDate, 7),
        costo_usd: 0,
        observaciones: [
            'Caso creado automáticamente desde agenda.',
            `Turno detallado: ${appointmentDate}.`,
            `Paciente: ${patientName}.`,
            `Turno ID: ${appointment.id}.`,
            'Acción esperada: verificar/subir escaneo 3D y tomar el caso.',
        ].join(' '),
        estado: 'Enviado',
    }).then(({ error }) => {
        if (error) console.error('[turno-detallado] lab work insert failed:', error.message);
    });

    const recipients = DETAILED_DAY_LAB_RECIPIENTS
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);
    const subject = `Día detallado: revisar escaneo 3D - ${patientName}`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2 style="margin: 0 0 8px;">Día detallado agendado</h2>
            <p style="margin: 0 0 12px;">Se creó automáticamente un caso para laboratorio. La acción importante es controlar que el escaneo 3D esté subido y tomar el caso.</p>
            <ul style="margin: 0; padding-left: 18px;">
                <li><strong>Fecha del turno:</strong> ${appointmentDate}</li>
                <li><strong>Paciente:</strong> ${patientName}</li>
                <li><strong>Documento:</strong> ${patient?.documento || 'Sin documento'}</li>
                <li><strong>Etapa Workflow:</strong> ${targetStage.name}</li>
                <li><strong>Acción esperada:</strong> verificar/subir escaneo 3D</li>
            </ul>
            <p style="margin-top: 14px;">
                <a href="${patientFilesUrl}" style="background:#111827;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;">Abrir archivos del paciente</a>
            </p>
            <p style="margin-top: 8px;">
                <a href="${workflowsUrl}">Abrir laboratorio en Workflow</a>
            </p>
        </div>
    `;

    await Promise.all(recipients.map(async email => {
        const eventKey = createDetailedDayEventKey(['turno_detallado_lab_alert', appointment.id, email]);
        const response = await sendEmail({
            to: email,
            subject,
            html,
            messageType: 'workflow_notification',
            sourceModule: 'agenda',
            templateKey: 'turno_detallado_lab_alert',
            patientId: appointment.patient_id,
            appointmentId: appointment.id,
            workflowId: workflow.id,
            treatmentId: treatment.id,
            idempotencyKey: eventKey,
            payload: {
                appointmentId: appointment.id,
                appointmentDate,
                stageName: targetStage.name,
            },
        });

        await logDetailedDayWorkflowNotification({
            workflowId: workflow.id,
            stageId: targetStage.id,
            treatmentId: treatment.id,
            eventType: 'turno_detallado_lab_alert',
            recipientEmail: email,
            subject,
            status: response.success ? 'sent' : 'failed',
            errorMessage: response.success ? null : String(response.error || 'unknown_error'),
            eventKey,
        });
    }));

    await logDetailedDayWorkflowNotification({
        workflowId: workflow.id,
        stageId: targetStage.id,
        treatmentId: treatment.id,
        eventType: 'turno_detallado_case_created',
        subject,
        status: 'sent',
        eventKey: dedupeEventKey,
    });

    revalidatePath('/workflows');
    revalidatePath(`/patients/${appointment.patient_id}`);
}

async function verifyAgendaWriteAccess() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .single();

    const isPortalUser = ['odontologo', 'asistente', 'laboratorio', 'dentist'].includes(profile?.categoria || '');
    if (isPortalUser) {
        throw new Error('No tenés permisos para modificar la agenda');
    }
    return user;
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
    modality: string;
    notes: string | null;
    created_at: string;
    created_by: string;
    is_primera_vez: boolean;
}>;

export async function getAppointments(start: string, end: string) {
    const supabase = await createClient();

    // Fetch only the fields needed by the agenda views.
    const { data, error } = await supabase
        .from('agenda_appointments')
        .select(`
            id,
            title,
            start_time,
            end_time,
            status,
            type,
            modality,
            notes,
            patient_id,
            doctor_id,
            color_tag,
            created_at,
            created_by,
            is_primera_vez,
            patient_data:patient_id (nombre, apellido, whatsapp, primera_consulta_fecha, fecha_alta, intervalo_limpieza_meses),
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
    const now = new Date();
    
    return data.map(apt => {
        const patient = Array.isArray(apt.patient_data) ? apt.patient_data[0] : apt.patient_data;
        const doctor = Array.isArray(apt.doctor_data) ? apt.doctor_data[0] : apt.doctor_data;

        // Regla de Oro AM Clínica: Turno que pasó el horario y no está cancelado/no-show -> COMPLETADO
        const isPast = new Date(apt.end_time) < now;
        const virtualStatus = (isPast && !['cancelled', 'no_show'].includes(apt.status)) 
            ? 'completed' 
            : apt.status;

        return {
            ...apt,
            status: virtualStatus,
            modality: normalizeAppointmentModality(apt.modality ?? parseAppointmentModality(apt.notes)),
            patient: patient ? {
                ...patient,
                full_name: `${patient.nombre || ''} ${patient.apellido || ''}`.trim() || 'Paciente',
                primera_consulta_fecha: patient.primera_consulta_fecha ?? null,
                fecha_alta: patient.fecha_alta ?? null,
                intervalo_limpieza_meses: patient.intervalo_limpieza_meses ?? null,
            } : null,
            doctor: doctor || null
        };
    });
}

export async function createAppointment(formData: FormData) {
    let user;
    try {
        user = await verifyAgendaWriteAccess();
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'No autorizado' };
    }
    const supabase = await createClient();

    const title = formData.get('title') as string;
    const patientId = formData.get('patientId') as string || null;
    const doctorId = formData.get('doctorId') as string || null;
    const startTime = formData.get('startTime') as string;
    const endTime = formData.get('endTime') as string;
    const status = formData.get('status') as string || 'confirmed';
    const type = formData.get('type') as string || 'consulta';
    const modality = normalizeAppointmentModality(formData.get('modality') as string | null);
    const notes = formData.get('notes') as string;

    if (type !== 'recordatorio_interno' && !patientId) {
        return { success: false, error: 'Todo turno clínico necesita un paciente registrado o precargado.' };
    }

    const { data: newApt, error } = await supabase
        .from('agenda_appointments')
        .insert({
            title,
            patient_id: patientId ? patientId : null,
            doctor_id: doctorId ? doctorId : null,
            start_time: startTime,
            end_time: endTime,
            status,
            type,
            modality,
            notes,
            created_by: user.id
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating appointment:', error);
        return { success: false, error: error.message };
    }

    // Outbound Google Calendar Sync
    if (newApt?.id) {
        try {
            const { createGoogleEvent } = await import('@/lib/am-scheduler/google-calendar-outbound');
            await createGoogleEvent(newApt.id);
        } catch (syncErr) {
            console.error('[GoogleSync] Outbound sync failed during creation:', syncErr);
        }

        try {
            await ensureDetailedDayWorkflowCase(newApt.id);
        } catch (workflowErr) {
            console.error('[turno-detallado] automation failed during creation:', workflowErr);
        }
    }

    revalidatePath('/agenda');
    return { success: true };
}

export async function updateAppointment(id: string, updates: AppointmentUpdatePayload) {
    let user;
    try {
        user = await verifyAgendaWriteAccess();
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'No autorizado' };
    }

    // Sanitize input to avoid updating protected fields
    const safeUpdates = { ...updates };
    delete safeUpdates.id;
    delete safeUpdates.created_at;
    delete safeUpdates.created_by;
    delete safeUpdates.is_primera_vez;
    if (safeUpdates.modality) {
        safeUpdates.modality = normalizeAppointmentModality(safeUpdates.modality);
    }

    if (safeUpdates.type !== 'recordatorio_interno' && safeUpdates.patient_id === null) {
        return { success: false, error: 'Todo turno clínico necesita un paciente registrado o precargado.' };
    }

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

    // Outbound Google Calendar Sync
    try {
        const { updateGoogleEvent } = await import('@/lib/am-scheduler/google-calendar-outbound');
        await updateGoogleEvent(id);
    } catch (syncErr) {
        console.error('[GoogleSync] Outbound sync failed during update:', syncErr);
    }

    try {
        await ensureDetailedDayWorkflowCase(id);
    } catch (workflowErr) {
        console.error('[turno-detallado] automation failed during update:', workflowErr);
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

        const turnoPaso = apt && new Date(apt.start_time) < new Date();

        if (apt?.patient_id && turnoPaso) {
            // a) Auto-setear primera_consulta_fecha
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
    try {
        await verifyAgendaWriteAccess();
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'No autorizado' };
    }

    const adminClient = getAdminClient();

    // Fetch external_id before deleting
    let externalId: string | null = null;
    try {
        const { data: apt } = await adminClient
            .from('agenda_appointments')
            .select('external_id')
            .eq('id', id)
            .single();
        if (apt) {
            externalId = apt.external_id;
        }
    } catch (err) {
        console.error('[GoogleSync] Failed to fetch external_id before deletion:', err);
    }

    const { error } = await adminClient
        .from('agenda_appointments')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting appointment:', error);
        return { success: false, error: error.message };
    }

    // Outbound Google Calendar Sync
    if (externalId) {
        try {
            const { deleteGoogleEvent } = await import('@/lib/am-scheduler/google-calendar-outbound');
            await deleteGoogleEvent(externalId);
        } catch (syncErr) {
            console.error('[GoogleSync] Outbound sync failed during deletion:', syncErr);
        }
    }

    revalidatePath('/agenda');
    return { success: true };
}

export async function searchPatients(query: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, whatsapp, estado_paciente, origen_registro')
        .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
        .eq('is_deleted', false)
        .limit(10);

    if (error) {
        console.error('Error searching patients:', error);
        return [];
    }

    return (data || []).map((p: {
        id_paciente: string;
        nombre: string;
        apellido: string;
        whatsapp: string | null;
        estado_paciente: string | null;
        origen_registro: string | null;
    }) => ({
        id: p.id_paciente,
        full_name: `${p.nombre} ${p.apellido}`,
        phone: p.whatsapp || '',
        status: p.estado_paciente || null,
        origin: p.origen_registro || null,
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
    try {
        await verifyAgendaWriteAccess();
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'No autorizado', updatedCount: 0 };
    }

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

    // Outbound Google Calendar Sync for bulk reassignment
    if (data && data.length > 0) {
        try {
            const { updateGoogleEvent } = await import('@/lib/am-scheduler/google-calendar-outbound');
            // Sync asynchronously in parallel without blocking response
            Promise.allSettled(data.map(apt => updateGoogleEvent(apt.id)))
                .then(results => {
                    console.log(`[GoogleSync] Bulk reassignment sync complete. Results:`, results);
                });
        } catch (syncErr) {
            console.error('[GoogleSync] Outbound sync setup failed during bulk reassignment:', syncErr);
        }
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
    await verifyAgendaWriteAccess();
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
        if (result.success) {
            sent++;
        } else {
            failed++;
        }
    }

    return { sent, failed, noPhone };
}

// ─── Agenda Blocks ────────────────────────────────────────────────────────────

export interface AgendaBlock {
    id: string;
    doctor_id: string | null;
    start_time: string;
    end_time: string;
    reason: string | null;
    block_type: string;
    created_by: string | null;
    created_at: string;
    doctor?: { full_name: string } | null;
}

export interface CreateAgendaBlockPayload {
    doctor_id: string | null;
    start_time: string;
    end_time: string;
    block_type: string;
    reason?: string;
}

export async function getAgendaBlocks(start: string, end: string): Promise<AgendaBlock[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('agenda_blocks')
        .select('*, doctor:doctor_id(full_name)')
        .lt('start_time', end)
        .gt('end_time', start)
        .order('start_time', { ascending: true });

    if (error) {
        console.error('Error fetching agenda blocks:', error);
        return [];
    }
    return (data ?? []) as AgendaBlock[];
}

export async function createAgendaBlock(payload: CreateAgendaBlockPayload) {
    let user;
    try {
        user = await verifyAgendaWriteAccess();
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'No autorizado' };
    }

    const admin = getAdminClient();
    const { error } = await admin
        .from('agenda_blocks')
        .insert({ ...payload, created_by: user.id });

    if (error) return { error: error.message };
    revalidatePath('/agenda');
    return { success: true };
}

export async function deleteAgendaBlock(blockId: string) {
    try {
        await verifyAgendaWriteAccess();
    } catch (err) {
        return { error: err instanceof Error ? err.message : 'No autorizado' };
    }

    const admin = getAdminClient();
    const { error } = await admin
        .from('agenda_blocks')
        .delete()
        .eq('id', blockId);

    if (error) return { error: error.message };
    revalidatePath('/agenda');
    return { success: true };
}

export async function getBlockedAppointments(blockId: string) {
    const supabase = await createClient();

    const { data: block } = await supabase
        .from('agenda_blocks')
        .select('*')
        .eq('id', blockId)
        .single();

    if (!block) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (supabase as any)
        .from('agenda_appointments')
        .select('id, title, start_time, end_time, status, doctor_id, patient_id, doctor:doctor_id(full_name), patient:patient_id(nombre, apellido)')
        .lt('start_time', block.end_time)
        .gt('end_time', block.start_time)
        .not('status', 'in', '("cancelled","no_show")');

    if (block.doctor_id) {
        query = query.eq('doctor_id', block.doctor_id);
    }

    const { data, error } = await query;
    if (error) return [];
    return data ?? [];
}
