import { createAdminClient } from '@/utils/supabase/admin';

if (typeof window !== 'undefined') throw new Error('Recall creation is server-only');

// Duración por tipo de turno en minutos (para crear el turno tentativo)
const TENTATIVE_DURATION_MIN: Record<string, number> = {
    control: 60, control_carilla_inmediato: 60, control_carilla_anual: 60, control_ortodoncia: 60,
    resinas_diseno_sonrisa: 240, cirugia_implantes: 180,
    limpieza: 60, limpieza_convencional: 60, limpieza_laser: 60,
    botox: 30, consulta: 60,
    cementado: 240, tallado: 240, urgencia: 30,
};

// Tipos complejos → turno tarde (17:00 AR); simples → temprano (14:00 AR)
const COMPLEX_APT_TYPES = new Set(['cementado', 'tallado']);

// Argentina = UTC-3. Las horas se guardan en UTC en la DB.
// 14:00 AR = 17:00 UTC | 17:00 AR = 20:00 UTC
function tentativeStartUTC(baseDate: Date, appointmentType: string): Date {
    const d = new Date(baseDate);
    // Sábado (6) → viernes anterior; Domingo (0) → lunes siguiente
    if (d.getDay() === 6) d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    const hourAR = COMPLEX_APT_TYPES.has(appointmentType) ? 17 : 14;
    d.setUTCHours(hourAR + 3, 0, 0, 0); // UTC-3
    return d;
}

/**
 * Cuando se completa un turno:
 * 1. Crea un recall de seguimiento en recall_rules
 * 2. Si la regla lo indica (creates_appointment=true), crea un turno tentativo
 *    en agenda_appointments con status='pending' y avisa al paciente por WhatsApp
 */
export async function createRecallsForCompletedAppointment(
    appointmentId: string,
    appointmentType: string,
    patientId: string,
    appointmentDate: string,   // ISO string
    doctorId?: string | null,
    actor = 'system',
): Promise<void> {
    // Usamos adminClient para que funcione tanto desde UI (con sesión) como desde el cron (sin sesión)
    const admin = createAdminClient();

    // 1. Buscar datos del paciente (para WhatsApp)
    const { data: paciente } = await admin
        .from('pacientes')
        .select('nombre, apellido, whatsapp')
        .eq('id_paciente', patientId)
        .single();

    // 2. Buscar reglas automáticas para este tipo de turno
    const { data: autoRules } = await admin
        .from('recall_auto_rules')
        .select('*')
        .eq('appointment_type', appointmentType)
        .eq('is_active', true);

    if (!autoRules || autoRules.length === 0) return;

    const userEmail = actor;
    const aptDate = new Date(appointmentDate);

    for (const rule of autoRules) {
        // 3. Verificar si ya existe un recall activo de este tipo para el paciente
        const { data: existing } = await admin
            .from('recall_rules')
            .select('id')
            .eq('patient_id', patientId)
            .eq('recall_type', rule.recall_type)
            .not('state', 'in', '("completed","not_applicable")')
            .limit(1);

        if (existing && existing.length > 0) continue;

        // 4. Calcular fecha del próximo turno
        const dueDate = new Date(aptDate);
        dueDate.setDate(dueDate.getDate() + rule.interval_days);
        const nextDueDateStr = dueDate.toISOString().split('T')[0];
        const intervalMonths = Math.round(rule.interval_days / 30);
        const windowDays = Math.min(30, Math.max(7, Math.round(rule.interval_days * 0.1)));
        const visibleFrom = new Date(dueDate);
        visibleFrom.setDate(visibleFrom.getDate() - 14);

        // 5. Crear turno tentativo en la agenda si la regla lo indica
        let tentativeAppointmentId: string | null = null;
        if (rule.creates_appointment && rule.next_appointment_type) {
            const tentativeStart = tentativeStartUTC(dueDate, rule.next_appointment_type);
            const durationMin = TENTATIVE_DURATION_MIN[rule.next_appointment_type] ?? 60;
            const tentativeEnd = new Date(tentativeStart);
            tentativeEnd.setMinutes(tentativeEnd.getMinutes() + durationMin);

            const patientName = paciente
                ? `${paciente.nombre ?? ''} ${paciente.apellido ?? ''}`.trim()
                : 'Paciente';

            const { data: newApt } = await admin
                .from('agenda_appointments')
                .insert({
                    patient_id: patientId,
                    doctor_id: doctorId ?? null,
                    title: patientName,
                    start_time: tentativeStart.toISOString(),
                    end_time: tentativeEnd.toISOString(),
                    status: 'pending',
                    type: rule.next_appointment_type,
                    notes: `Turno tentativo auto-generado. Confirmar 2 semanas antes. Origen: ${rule.label}.`,
                })
                .select('id')
                .single();

            if (newApt) {
                tentativeAppointmentId = newApt.id;

                if (paciente?.whatsapp) {
                    const { sendNotification } = await import('@/lib/am-scheduler/notification-service');
                    await sendNotification({
                        appointmentId: newApt.id,
                        templateKey: 'appointment_confirmed',
                        channel: 'whatsapp',
                        patientName,
                        patientPhone: paciente.whatsapp,
                        patientEmail: null,
                        doctorName: null,
                        startTime: tentativeStart.toISOString(),
                        endTime: tentativeEnd.toISOString(),
                        clinicName: 'AM Clínica',
                    }).catch(e => console.error('[recalls] WhatsApp tentativo:', e));
                }
            }
        }

        // 6. Crear el recall de seguimiento
        const { data: newRule } = await admin
            .from('recall_rules')
            .insert({
                patient_id: patientId,
                recall_type: rule.recall_type,
                custom_label: rule.label,
                interval_months: intervalMonths,
                window_days: windowDays,
                state: tentativeAppointmentId ? 'scheduled' : 'pending_contact',
                priority: 0,
                last_completed_at: aptDate.toISOString().split('T')[0],
                next_due_date: nextDueDateStr,
                visible_from: visibleFrom.toISOString().split('T')[0],
                linked_appointment_id: tentativeAppointmentId ?? appointmentId,
                contact_channels: ['whatsapp', 'phone'],
                notes: tentativeAppointmentId ? 'Turno tentativo auto-creado en la agenda.' : null,
                created_by: userEmail,
                updated_by: userEmail,
            })
            .select('id')
            .single();

        if (newRule) {
            await admin.from('recall_activity_log').insert({
                recall_rule_id: newRule.id,
                action: tentativeAppointmentId ? 'auto_created_with_appointment' : 'auto_created',
                old_state: null,
                new_state: tentativeAppointmentId ? 'scheduled' : 'pending_contact',
                details: {
                    source: 'appointment_completed',
                    appointment_type: appointmentType,
                    interval_days: rule.interval_days,
                    next_due_date: nextDueDateStr,
                    tentative_appointment_id: tentativeAppointmentId,
                },
                performed_by: userEmail,
            });
        }
    }
}
