import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/nodemailer';

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

        const { data: treatments, error } = await supabase
            .from('patient_treatments')
            .select(`
                id,
                workflow_id,
                current_stage_id,
                last_stage_change,
                next_milestone_date,
                patient:pacientes(nombre, apellido, documento),
                workflow:clinical_workflows(name),
                stage:clinical_workflow_stages(name, time_limit_days, notify_before_days, notify_emails, sla_staff_template, sla_staff_subject)
            `)
            .eq('status', 'active');

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        let sent = 0;
        let skipped = 0;
        const today = new Date().toISOString().slice(0, 10);

        for (const treatment of treatments || []) {
            // ... (rest of the loop setup)
            const stage = treatment.stage as {
                name?: string | null;
                time_limit_days?: number | null;
                notify_before_days?: number | null;
                notify_emails?: string[] | null;
                sla_staff_template?: string | null;
                sla_staff_subject?: string | null;
            } | null;

            const workflowData = treatment.workflow as { name?: string | null }[] | { name?: string | null } | null;
            const workflowName = Array.isArray(workflowData) ? workflowData[0]?.name : workflowData?.name;

            const patient = treatment.patient as {
                nombre?: string | null;
                apellido?: string | null;
                documento?: string | null;
            } | null;

            if (!stage?.time_limit_days || !stage.notify_before_days || !stage.notify_emails?.length) {
                skipped++;
                continue;
            }

            const daysInStage = Math.ceil((Date.now() - new Date(treatment.last_stage_change).getTime()) / (1000 * 60 * 60 * 24));
            const threshold = stage.time_limit_days - stage.notify_before_days;

            if (daysInStage < threshold || daysInStage >= stage.time_limit_days) {
                skipped++;
                continue;
            }

            const patientFullName = patient
                ? `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim()
                : 'Paciente';

            const milestoneText = treatment.next_milestone_date
                ? new Date(treatment.next_milestone_date).toLocaleDateString('es-AR')
                : 'No definido';

            // Helper for variable replacement
            const replaceVars = (text: string) => {
                return text
                    .replace(/{{paciente}}/g, patientFullName)
                    .replace(/{{etapa}}/g, stage.name || 'Etapa')
                    .replace(/{{workflow}}/g, workflowName || 'Workflow')
                    .replace(/{{hito}}/g, milestoneText);
            };

            let htmlValue = '';
            if (stage.sla_staff_template && stage.sla_staff_template.trim()) {
                htmlValue = replaceVars(stage.sla_staff_template).replace(/\n/g, '<br/>');
            } else {
                htmlValue = `
                <div style="font-family: Arial, sans-serif; color: #111827;">
                    <h2 style="margin: 0 0 8px;">Recordatorio SLA</h2>
                    <p style="margin: 0 0 8px;">Un tratamiento esta proximo al limite de tiempo de su etapa.</p>
                    <ul style="margin: 0; padding-left: 18px;">
                        <li><strong>Workflow:</strong> ${workflowName || 'Sin nombre'}</li>
                        <li><strong>Etapa:</strong> ${stage.name || 'Sin etapa'}</li>
                        <li><strong>Paciente:</strong> ${patientFullName || 'Sin nombre'}</li>
                        <li><strong>Documento:</strong> ${patient?.documento || 'Sin documento'}</li>
                        <li><strong>Dias en etapa:</strong> ${daysInStage}</li>
                        <li><strong>Limite SLA:</strong> ${stage.time_limit_days} dias</li>
                    </ul>
                </div>
            `;
            }

            for (const email of stage.notify_emails) {
                const eventKey = createNotificationKey(['sla_due_soon', treatment.id, treatment.current_stage_id, email, today]);
                const { data: existing } = await supabase
                    .from('workflow_notifications_log')
                    .select('id')
                    .eq('event_key', eventKey)
                    .maybeSingle();

                if (existing) {
                    skipped++;
                    continue;
                }

                const subjectValue = stage.sla_staff_subject
                    ? replaceVars(stage.sla_staff_subject)
                    : `SLA por vencer: ${workflowName || 'Workflow'} / ${stage.name || 'Etapa'}`;

                const response = await sendEmail({ to: email, subject: subjectValue, html: htmlValue });

                await supabase.from('workflow_notifications_log').insert({
                    workflow_id: treatment.workflow_id,
                    stage_id: treatment.current_stage_id,
                    treatment_id: treatment.id,
                    event_type: 'sla_due_soon',
                    recipient_email: email,
                    subject: subjectValue,
                    status: response.success ? 'sent' : 'failed',
                    error_message: response.success ? null : String(response.error || 'unknown_error'),
                    event_key: eventKey,
                });

                if (response.success) sent++;
            }
        }

        return NextResponse.json({ success: true, sent, skipped });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error interno' },
            { status: 500 }
        );
    }
}
