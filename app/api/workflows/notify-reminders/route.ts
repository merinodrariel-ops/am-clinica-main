import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { EmailService } from '@/lib/email-service';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function createNotificationKey(parts: string[]) {
    return parts.join('::');
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token || token !== process.env.WORKFLOWS_CRON_SECRET) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Fetch active treatments and their stage config for reminders
        const { data: treatments, error } = await supabase
            .from('patient_treatments')
            .select(`
                id,
                workflow_id,
                current_stage_id,
                last_stage_change,
                next_milestone_date,
                patient:pacientes(nombre, apellido, documento, email),
                workflow:clinical_workflows(name),
                stage:clinical_workflow_stages(
                    name, 
                    notify_emails, 
                    reminder_windows_days, 
                    reminder_staff_template, 
                    reminder_staff_subject,
                    reminder_patient_template,
                    reminder_patient_subject
                )
            `)
            .eq('status', 'active');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let sentStaff = 0;
        let sentPatient = 0;
        let skipped = 0;
        const today = new Date().toISOString().slice(0, 10);

        for (const treatment of treatments || []) {
            const stage = treatment.stage as {
                name?: string | null;
                notify_emails?: string[] | null;
                reminder_windows_days?: number[] | null;
                reminder_staff_template?: string | null;
                reminder_staff_subject?: string | null;
                reminder_patient_template?: string | null;
                reminder_patient_subject?: string | null;
            } | null;

            if (!stage?.reminder_windows_days?.length) {
                skipped++;
                continue;
            }

            const workflowData = treatment.workflow as { name?: string | null }[] | { name?: string | null } | null;
            const workflowName = Array.isArray(workflowData) ? workflowData[0]?.name : workflowData?.name;

            const patient = treatment.patient as {
                nombre?: string | null;
                apellido?: string | null;
                documento?: string | null;
                email?: string | null;
            } | null;

            const daysInStage = Math.ceil((Date.now() - new Date(treatment.last_stage_change).getTime()) / (1000 * 60 * 60 * 24));

            // Check if today matches any of the reminder windows
            if (!stage.reminder_windows_days.includes(daysInStage)) {
                skipped++;
                continue;
            }

            const patientFullName = patient
                ? `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim()
                : 'Paciente';

            const milestoneText = treatment.next_milestone_date
                ? new Date(treatment.next_milestone_date).toLocaleDateString('es-AR')
                : 'No definido';

            const replaceVars = (text: string) => {
                return text
                    .replace(/{{paciente}}/g, patientFullName)
                    .replace(/{{etapa}}/g, stage.name || 'Etapa')
                    .replace(/{{workflow}}/g, workflowName || 'Workflow')
                    .replace(/{{hito}}/g, milestoneText);
            };

            // 1. Send to Staff
            if (stage.notify_emails?.length) {
                const staffTemplate = stage.reminder_staff_template || '';
                const staffSubjectRaw = stage.reminder_staff_subject || `Recordatorio [Equipo]: ${patientFullName} en ${stage.name}`;

                const staffHtml = staffTemplate
                    ? replaceVars(staffTemplate).replace(/\n/g, '<br/>')
                    : `<p>Recordatorio: el paciente <strong>${patientFullName}</strong> lleva ${daysInStage} días en la etapa <strong>${stage.name}</strong> (${workflowName}).</p>`;

                const staffSubject = replaceVars(staffSubjectRaw);

                for (const email of stage.notify_emails) {
                    const eventKey = createNotificationKey(['reminder_staff', treatment.id, treatment.current_stage_id, email, String(daysInStage), today]);

                    const { data: existing } = await supabase
                        .from('workflow_notifications_log')
                        .select('id')
                        .eq('event_key', eventKey)
                        .maybeSingle();

                    if (existing) continue;

                    const response = await EmailService.send({ to: email, subject: staffSubject, html: staffHtml });

                    await supabase.from('workflow_notifications_log').insert({
                        workflow_id: treatment.workflow_id,
                        stage_id: treatment.current_stage_id,
                        treatment_id: treatment.id,
                        event_type: 'reminder_staff',
                        recipient_email: email,
                        subject: staffSubject,
                        status: response.success ? 'sent' : 'failed',
                        error_message: response.success ? null : String(response.error || 'unknown_error'),
                        event_key: eventKey,
                    });

                    if (response.success) sentStaff++;
                }
            }

            // 2. Send to Patient
            if (patient?.email) {
                const patientTemplate = stage.reminder_patient_template || '';
                const patientSubjectRaw = stage.reminder_patient_subject || `Hola ${patient.nombre || 'Paciente'}, seguimos con novedades`;

                const patientHtml = patientTemplate
                    ? replaceVars(patientTemplate).replace(/\n/g, '<br/>')
                    : `<p>Hola ${patient.nombre || 'Paciente'}, recordatorio sobre tu tratamiento <strong>${workflowName}</strong> en la etapa <strong>${stage.name}</strong>.</p>`;

                const patientSubject = replaceVars(patientSubjectRaw);

                const eventKey = createNotificationKey(['reminder_patient', treatment.id, treatment.current_stage_id, patient.email, String(daysInStage), today]);

                const { data: existing } = await supabase
                    .from('workflow_notifications_log')
                    .select('id')
                    .eq('event_key', eventKey)
                    .maybeSingle();

                if (!existing) {
                    const response = await EmailService.send({ to: patient.email, subject: patientSubject, html: patientHtml });

                    await supabase.from('workflow_notifications_log').insert({
                        workflow_id: treatment.workflow_id,
                        stage_id: treatment.current_stage_id,
                        treatment_id: treatment.id,
                        event_type: 'reminder_patient',
                        recipient_email: patient.email,
                        subject: patientSubject,
                        status: response.success ? 'sent' : 'failed',
                        error_message: response.success ? null : String(response.error || 'unknown_error'),
                        event_key: eventKey,
                    });

                    if (response.success) sentPatient++;
                }
            }
        }

        return NextResponse.json({ success: true, sentStaff, sentPatient, skipped });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error interno' },
            { status: 500 }
        );
    }
}
