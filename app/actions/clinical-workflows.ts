'use server'

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { sendEmail } from '@/lib/nodemailer';
import { generateTreatmentTimelineEmail } from '@/lib/email-templates';
import type {
    ClinicalWorkflow,
    PatientSearchResult,
    PatientSummary,
    PatientTreatment,
    PatientTimelineData,
    PatientTimelineTreatmentEntry,
    TreatmentStatus,
    TreatmentHistoryEntry,
    WorkflowNotificationLogEntry,
    WorkflowStage,
    WorkflowSummary,
    WorkflowType,
} from '@/components/workflows/types';

type WorkflowWithStageRows = Omit<ClinicalWorkflow, 'stages'> & {
    stages: WorkflowStage[] | null;
};

type TreatmentWorkflowField = WorkflowSummary | WorkflowSummary[] | null;

type TreatmentRow = Omit<PatientTreatment, 'workflow'> & {
    workflow: TreatmentWorkflowField;
};

interface ReminderTreatmentRow {
    id: string;
    workflow_id: string;
    current_stage_id: string;
    last_stage_change: string;
    next_milestone_date?: string | null;
    metadata?: unknown;
    patient: unknown;
    workflow: unknown;
    stage: unknown;
}

const LAB_CASE_FOLDER_ID = '14nVFnjkJBN3ijfndzjDsHMniiBecbC02';
const LAB_CASE_NOTIFICATION_RECIPIENTS =
    process.env.WORKFLOW_LAB_NOTIFICATION_RECIPIENTS ||
    'amesteticadentallab@gmail.com,juliian_97@outlook.com,drarielmerino@gmail.com,lourdesfreire031@gmail.com';
const LAB_CASE_EMAIL_SUBJECT = 'Nuevo Caso Clinico Registrado';

type SenaWorkflowType = 'diseno_sonrisa' | 'ortodoncia_invisible' | 'cirugia_implantes';

const SENA_WORKFLOW_MAP: Record<SenaWorkflowType, { workflowNames: string[] }> = {
    diseno_sonrisa: { workflowNames: ['Diseño de Sonrisa'] },
    ortodoncia_invisible: { workflowNames: ['Diseño de Alineadores Invisibles', 'Ortodoncia Invisible'] },
    cirugia_implantes: { workflowNames: ['Cirugía e Implantes'] },
};

function normalizeComparableText(value?: string | null) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function stageTriggersLabAutomation(stageName?: string | null) {
    const normalized = normalizeComparableText(stageName);
    if (!normalized) return false;

    return (
        normalized.includes('sena') ||
        normalized.includes('senado') ||
        normalized.includes('anticipo') ||
        normalized.includes('reserva abonada')
    );
}

function createNotificationKey(parts: string[]) {
    return parts.join('::');
}

async function logWorkflowNotification(params: {
    workflowId?: string | null;
    stageId?: string | null;
    treatmentId?: string | null;
    eventType: string;
    recipientEmail?: string | null;
    subject?: string | null;
    status: 'sent' | 'failed' | 'skipped';
    errorMessage?: string | null;
    eventKey?: string;
}) {
    const supabase = await createClient();

    const { error } = await supabase.from('workflow_notifications_log').insert({
        workflow_id: params.workflowId || null,
        stage_id: params.stageId || null,
        treatment_id: params.treatmentId || null,
        event_type: params.eventType,
        recipient_email: params.recipientEmail || null,
        subject: params.subject || null,
        status: params.status,
        error_message: params.errorMessage || null,
        event_key: params.eventKey || null,
    });

    if (error && error.code !== '23505') {
        console.error('Error logging workflow notification:', error);
    }
}

function addMonths(baseDate: Date, months: number) {
    const next = new Date(baseDate);
    next.setMonth(next.getMonth() + months);
    return next;
}

function addDays(baseDate: Date, days: number) {
    const next = new Date(baseDate);
    next.setDate(next.getDate() + days);
    return next;
}

function getMetadataString(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== 'object') return null;
    const value = (metadata as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
}

function normalizeWorkflowData(workflow: WorkflowSummary | WorkflowSummary[] | null) {
    return Array.isArray(workflow) ? (workflow[0] || null) : workflow;
}

function getRecurrenceIntervalFromMetadata(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object') return null;

    const interval = (metadata as Record<string, unknown>).recurrence_interval_months;
    if (typeof interval === 'number' && interval > 0) return interval;

    if (typeof interval === 'string') {
        const parsed = Number(interval);
        if (!Number.isNaN(parsed) && parsed > 0) return parsed;
    }

    return null;
}

function getReminderDaysFromMetadata(metadata: unknown, key: string, fallback: number[]) {
    if (!metadata || typeof metadata !== 'object') {
        return fallback.slice(0, 3);
    }

    const value = (metadata as Record<string, unknown>)[key];
    let parsed: number[] = [];

    if (Array.isArray(value)) {
        parsed = value
            .map(item => Number(item))
            .filter(item => Number.isFinite(item) && item > 0);
    } else if (typeof value === 'string') {
        parsed = value
            .split(',')
            .map(item => Number(item.trim()))
            .filter(item => Number.isFinite(item) && item > 0);
    }

    const uniqueSorted = Array.from(new Set(parsed)).sort((a, b) => b - a).slice(0, 3);
    if (!uniqueSorted.length) {
        return fallback.slice(0, 3);
    }

    return uniqueSorted;
}

function normalizeStageName(value?: string | null) {
    return (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getIsoStringFromMetadata(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== 'object') return null;
    const value = (metadata as Record<string, unknown>)[key];
    if (typeof value !== 'string' || !value.trim()) return null;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString();
}

function buildWhatsappLink(countryCode?: string | null, number?: string | null) {
    const raw = `${countryCode || ''}${number || ''}`.replace(/\D/g, '');
    if (!raw) return null;
    return `https://wa.me/${raw}`;
}

export async function getClinicalWorkflows(): Promise<ClinicalWorkflow[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('clinical_workflows')
        .select(`
            *,
            stages:clinical_workflow_stages(*)
        `)
        .eq('active', true)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('Error fetching workflows:', error);
        return [];
    }

    // Sort stages by order_index
    const workflows = ((data || []) as WorkflowWithStageRows[]).map(wf => ({
        ...wf,
        stages: [...(wf.stages || [])].sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
    }));

    return workflows;
}

export async function getActiveTreatments(workflowId: string): Promise<PatientTreatment[]> {
    const supabase = await createClient();

    // Fetch treatments with expanded patient and stage info
    const { data, error } = await supabase
        .from('patient_treatments')
        .select(`
            *,
            patient:pacientes(id_paciente, nombre, apellido, documento),
            stage:clinical_workflow_stages(*),
            workflow:clinical_workflows(name)
        `)
        // but traditionally we might join with a public profile table if it exists. 
        // For now, we'll fetch basic info.
        .eq('workflow_id', workflowId)
        .neq('status', 'archived')
        .order('last_stage_change', { ascending: false });

    if (error) {
        console.error('Error fetching treatments:', error);
        return [];
    }

    // Unify structure if workflow comes as array
    return ((data || []) as TreatmentRow[]).map(t => ({
        ...t,
        workflow: Array.isArray(t.workflow) ? (t.workflow[0] || null) : t.workflow
    }));
}

export async function createTreatment(data: {
    patient_id: string;
    workflow_id: string;
    doctor_id?: string;
    initial_stage_id: string;
    start_date?: string;
    next_milestone_date?: string;
    metadata?: Record<string, unknown>;
    status?: TreatmentStatus;
}) {
    const supabase = await createClient();

    // Get current user for doctor_id if not provided
    if (!data.doctor_id) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            data.doctor_id = user.id;
        }
    }

    const { data: newTreatment, error } = await supabase
        .from('patient_treatments')
        .insert({
            patient_id: data.patient_id,
            workflow_id: data.workflow_id,
            current_stage_id: data.initial_stage_id,
            doctor_id: data.doctor_id,
            start_date: data.start_date || new Date().toISOString(),
            last_stage_change: new Date().toISOString(),
            next_milestone_date: data.next_milestone_date || null,
            metadata: data.metadata || {},
            status: data.status || 'active'
        })
        .select()
        .single();

    if (error) {
        console.error('Error creating treatment:', error);
        throw new Error(error.message || 'Failed to create treatment');
    }

    // Log history
    const { error: historyError } = await supabase.from('treatment_history').insert({
        treatment_id: newTreatment.id,
        new_stage_id: data.initial_stage_id,
        comments: 'Tratamiento iniciado',
    });

    if (historyError) {
        console.error('Error creating history:', historyError);
        // Don't fail the whole request if history fails, but log it
    }

    revalidatePath('/workflows');

    // Trigger Google Drive automation for Orthodontics
    try {
        await ensurePatientDriveFolder(newTreatment.id);
    } catch (e) {
        console.error('Error in ensurePatientDriveFolder:', e);
    }

    return newTreatment;
}

export async function triggerWorkflowFromSenaPayment(input: {
    patientId: string;
    senaTipo: SenaWorkflowType;
    movementId?: string | null;
    conceptoNombre?: string | null;
    monto?: number | null;
    moneda?: string | null;
}) {
    const supabase = await createClient();

    const mapping = SENA_WORKFLOW_MAP[input.senaTipo];
    if (!mapping) {
        return { success: false, error: 'sena_tipo_invalido' };
    }

    const { data: workflow, error: workflowError } = await supabase
        .from('clinical_workflows')
        .select('id, name')
        .in('name', mapping.workflowNames)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (workflowError || !workflow) {
        console.error('Workflow not found for sena payment:', workflowError);
        return { success: false, error: 'workflow_no_encontrado' };
    }

    const { data: existingTreatment, error: existingTreatmentError } = await supabase
        .from('patient_treatments')
        .select('id, current_stage_id, status')
        .eq('patient_id', input.patientId)
        .eq('workflow_id', workflow.id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existingTreatmentError) {
        console.error('Error checking existing treatment for sena:', existingTreatmentError);
        return { success: false, error: 'error_consulta_tratamiento' };
    }

    if (existingTreatment?.id) {
        return {
            success: true,
            skipped: true,
            treatmentId: existingTreatment.id,
            reason: 'existing_treatment',
        };
    }

    const { data: stages, error: stagesError } = await supabase
        .from('clinical_workflow_stages')
        .select('id, name, is_initial, order_index')
        .eq('workflow_id', workflow.id)
        .order('order_index', { ascending: true });

    if (stagesError || !stages?.length) {
        console.error('Error loading workflow stages for sena:', stagesError);
        return { success: false, error: 'etapas_no_disponibles' };
    }

    const senaStage = stages.find(stage => stageTriggersLabAutomation(stage.name));
    const initialStage = stages.find(stage => Boolean(stage.is_initial));
    const targetStage = senaStage || initialStage || stages[0];

    const treatment = await createTreatment({
        patient_id: input.patientId,
        workflow_id: workflow.id,
        initial_stage_id: targetStage.id,
        metadata: {
            source: 'caja_sena',
            sena_tipo: input.senaTipo,
            movement_id: input.movementId || null,
            concepto_nombre: input.conceptoNombre || null,
            monto: input.monto ?? null,
            moneda: input.moneda || null,
        },
    });

    const treatmentId = (treatment as { id: string }).id;

    try {
        await checkAndTriggerLaboratorioCase(treatmentId, targetStage.id);
    } catch (error) {
        console.error('Error triggering laboratorio from sena payment:', error);
    }

    revalidatePath('/workflows');
    revalidatePath('/caja-recepcion');
    revalidatePath(`/patients/${input.patientId}`);

    return { success: true, treatmentId };
}

export async function moveTreatmentStage(
    treatmentId: string,
    newStageId: string,
    previousStageId: string,
    comments?: string
) {
    const supabase = await createClient();

    // 1. Update treatment
    const { error } = await supabase
        .from('patient_treatments')
        .update({
            current_stage_id: newStageId,
            last_stage_change: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', treatmentId);

    if (error) throw new Error('Failed to update stage');

    // 2. Log history
    await supabase.from('treatment_history').insert({
        treatment_id: treatmentId,
        previous_stage_id: previousStageId,
        new_stage_id: newStageId,
        comments: comments || 'Cambio de etapa manual'
    });

    // 2.1 Optional notifications on stage entry
    try {
        await sendStageEntryNotifications(treatmentId, newStageId);
    } catch (notificationError) {
        console.error('Stage notification error:', notificationError);
        // Do not block business flow if notifications fail
    }

    // 2.2 Auto-trigger laboratorio pipeline when "sena" stage is reached
    try {
        await checkAndTriggerLaboratorioCase(treatmentId, newStageId);
    } catch (error) {
        console.error('Error in laboratorio automation trigger:', error);
        // Do not block business flow if automation fails
    }

    // 3. Check for automation (Trigger Maintenance)
    try {
        await checkAndTriggerMaintenance(treatmentId, newStageId);
    } catch (error) {
        console.error('Error in automation trigger:', error);
        // Do not fail the request, just log
    }

    // 4. Auto-create next cycle for recurrent workflows (e.g. Botox)
    try {
        await scheduleNextRecurrentCycle(treatmentId, newStageId);
    } catch (error) {
        console.error('Error in recurrent cycle trigger:', error);
        // Do not fail the request, just log
    }

    // 5. Ensure Drive folder exists (handles move from non-ortho or historical cases)
    try {
        await ensurePatientDriveFolder(treatmentId);
    } catch (e) {
        console.error('Error in ensurePatientDriveFolder (move):', e);
    }

    revalidatePath('/workflows');
    return { success: true };
}

export async function updateTreatmentFollowUpConfig(input: {
    treatmentId: string;
    treatmentDate?: string | null;
    recurrenceMonths?: number | null;
    appointmentDate?: string | null;
    waitingReminderDays?: number[];
    appointmentReminderDays?: number[];
}) {
    const supabase = await createClient();

    const { data: treatment, error: treatmentError } = await supabase
        .from('patient_treatments')
        .select('id, workflow_id, start_date, next_milestone_date, metadata, workflow:clinical_workflows(frequency_months)')
        .eq('id', input.treatmentId)
        .single();

    if (treatmentError || !treatment) {
        throw new Error('No se pudo cargar el seguimiento para actualizar');
    }

    const workflowField = Array.isArray(treatment.workflow)
        ? (treatment.workflow[0] || null)
        : treatment.workflow;

    const workflowFrequency = workflowField && typeof workflowField === 'object'
        ? Number((workflowField as Record<string, unknown>).frequency_months || 0)
        : 0;

    const baseMetadata = treatment.metadata && typeof treatment.metadata === 'object'
        ? (treatment.metadata as Record<string, unknown>)
        : {};

    const recurrenceMonths = Math.max(
        1,
        Number(input.recurrenceMonths || getRecurrenceIntervalFromMetadata(baseMetadata) || workflowFrequency || 6)
    );

    const treatmentDateSource = input.treatmentDate && input.treatmentDate.trim()
        ? `${input.treatmentDate}T12:00:00`
        : (getIsoStringFromMetadata(baseMetadata, 'treatment_completed_at') || treatment.start_date || new Date().toISOString());

    const treatmentDate = new Date(treatmentDateSource);
    if (Number.isNaN(treatmentDate.getTime())) {
        throw new Error('La fecha de tratamiento no es valida');
    }

    const nextMilestoneDate = addMonths(treatmentDate, recurrenceMonths).toISOString();

    const waitingDays = (input.waitingReminderDays || getReminderDaysFromMetadata(baseMetadata, 'waiting_reminder_days', [30, 14, 3]))
        .map(day => Number(day))
        .filter(day => Number.isFinite(day) && day > 0)
        .slice(0, 3);

    const appointmentDays = (input.appointmentReminderDays || getReminderDaysFromMetadata(baseMetadata, 'appointment_reminder_days', [7, 2, 1]))
        .map(day => Number(day))
        .filter(day => Number.isFinite(day) && day > 0)
        .slice(0, 3);

    const appointmentDateIso = input.appointmentDate && input.appointmentDate.trim()
        ? new Date(`${input.appointmentDate}T12:00:00`).toISOString()
        : getIsoStringFromMetadata(baseMetadata, 'appointment_date');

    const mergedMetadata: Record<string, unknown> = {
        ...baseMetadata,
        recurrence_interval_months: recurrenceMonths,
        treatment_completed_at: treatmentDate.toISOString(),
        waiting_reminder_days: waitingDays,
        appointment_reminder_days: appointmentDays,
        appointment_date: appointmentDateIso || null,
    };

    const { error: updateError } = await supabase
        .from('patient_treatments')
        .update({
            start_date: treatmentDate.toISOString(),
            next_milestone_date: nextMilestoneDate,
            metadata: mergedMetadata,
            updated_at: new Date().toISOString(),
        })
        .eq('id', input.treatmentId);

    if (updateError) {
        throw new Error(updateError.message || 'No se pudo guardar configuracion de seguimiento');
    }

    revalidatePath('/workflows');
    return { success: true };
}

async function sendStageEntryNotifications(treatmentId: string, stageId: string) {
    const supabase = await createClient();

    const { data: stageConfig, error: stageError } = await supabase
        .from('clinical_workflow_stages')
        .select(`
            name,
            order_index,
            workflow_id,
            notify_on_entry,
            notify_emails,
            staff_email_template,
            staff_email_subject,
            patient_email_template,
            patient_email_subject,
            notify_patient_on_entry
        `)
        .eq('id', stageId)
        .single();

    if (stageError || !stageConfig) return;

    const notifyOnEntry = Boolean(stageConfig.notify_on_entry);
    const notifyEmails = Array.isArray(stageConfig.notify_emails)
        ? stageConfig.notify_emails.filter((email: unknown): email is string => typeof email === 'string' && email.length > 0)
        : [];

    // If no notifications are enabled, return early
    if (!notifyOnEntry && !stageConfig.notify_patient_on_entry) return;

    const { data: treatmentData, error: treatmentError } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            next_milestone_date,
            patient:pacientes(nombre, apellido, documento, email),
            workflow:clinical_workflows(name)
        `)
        .eq('id', treatmentId)
        .single();

    if (treatmentError || !treatmentData) return;

    const workflowData = treatmentData.workflow as WorkflowSummary | WorkflowSummary[] | null;
    const workflowName = Array.isArray(workflowData) ? workflowData[0]?.name : workflowData?.name;

    const patientData = treatmentData.patient as {
        nombre?: string | null;
        apellido?: string | null;
        documento?: string | null;
        email?: string | null;
    } | null;

    const patientFullName = patientData
        ? `${patientData.apellido || ''}, ${patientData.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim()
        : 'Paciente';

    const milestoneText = treatmentData.next_milestone_date
        ? new Date(treatmentData.next_milestone_date).toLocaleDateString('es-AR')
        : 'No definido';

    // Helper for variable replacement
    const replaceVars = (text: string) => {
        return text
            .replace(/{{paciente}}/g, patientFullName)
            .replace(/{{etapa}}/g, stageConfig.name)
            .replace(/{{workflow}}/g, workflowName || 'Workflow')
            .replace(/{{hito}}/g, milestoneText);
    };

    // 1. Send to Staff (notify_emails)
    if (notifyOnEntry && notifyEmails.length > 0) {
        let staffHtml = '';
        if (stageConfig.staff_email_template && stageConfig.staff_email_template.trim()) {
            staffHtml = replaceVars(stageConfig.staff_email_template).replace(/\n/g, '<br/>');
        } else {
            staffHtml = `
                <div style="font-family: Arial, sans-serif; color: #111827;">
                    <h2 style="margin: 0 0 8px;">Notificacion para Equipo</h2>
                    <p style="margin: 0 0 8px;">Se movio un tratamiento a una nueva etapa.</p>
                    <ul style="margin: 0; padding-left: 18px;">
                        <li><strong>Workflow:</strong> ${workflowName || 'Sin nombre'}</li>
                        <li><strong>Etapa:</strong> ${stageConfig.name}</li>
                        <li><strong>Paciente:</strong> ${patientFullName}</li>
                        <li><strong>Documento:</strong> ${patientData?.documento || 'Sin documento'}</li>
                        <li><strong>Proximo hito:</strong> ${milestoneText}</li>
                    </ul>
                </div>
            `;
        }

        const staffSubject = stageConfig.staff_email_subject
            ? replaceVars(stageConfig.staff_email_subject)
            : `Workflow [Equipo]: ingreso a etapa ${stageConfig.name}`;

        await Promise.all(
            notifyEmails.map(async email => {
                const eventKey = createNotificationKey(['stage_entry_staff', treatmentId, stageId, email, new Date().toISOString().slice(0, 10)]);
                const response = await sendEmail({ to: email, subject: staffSubject, html: staffHtml });

                await logWorkflowNotification({
                    workflowId: stageConfig.workflow_id,
                    stageId,
                    treatmentId,
                    eventType: 'stage_entry_staff',
                    recipientEmail: email,
                    subject: staffSubject,
                    status: response.success ? 'sent' : 'failed',
                    errorMessage: response.success ? null : String(response.error || 'unknown_error'),
                    eventKey,
                });
            })
        );
    }

    // 2. Send to Patient
    if (stageConfig.notify_patient_on_entry && patientData?.email) {
        let patientHtml = '';
        if (stageConfig.patient_email_template && stageConfig.patient_email_template.trim()) {
            patientHtml = replaceVars(stageConfig.patient_email_template).replace(/\n/g, '<br/>');
        } else {
            // Fetch all stages to build the timeline email
            const { data: allStagesData } = await supabase
                .from('clinical_workflow_stages')
                .select('name, order_index')
                .eq('workflow_id', stageConfig.workflow_id)
                .order('order_index', { ascending: true });

            const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const portalUrl = `${appBaseUrl}/mi-clinica`;

            const nextApptFormatted = treatmentData.next_milestone_date
                ? new Date(treatmentData.next_milestone_date).toLocaleDateString('es-AR', {
                    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
                })
                : null;

            patientHtml = generateTreatmentTimelineEmail({
                nombre: patientData.nombre || 'Paciente',
                workflowName: workflowName || 'Tu tratamiento',
                currentStageName: stageConfig.name,
                currentStageOrder: typeof stageConfig.order_index === 'number' ? stageConfig.order_index : 1,
                allStages: (allStagesData || []).map(s => ({ name: s.name, order_index: s.order_index ?? 0 })),
                portalUrl,
                nextAppointmentDate: nextApptFormatted,
            });
        }

        const patientSubject = stageConfig.patient_email_subject
            ? replaceVars(stageConfig.patient_email_subject)
            : `Tu tratamiento avanz&#243; &#8212; ${stageConfig.name} | AM Cl&#237;nica`;

        const patientEventKey = createNotificationKey(['stage_entry_patient', treatmentId, stageId, patientData.email, new Date().toISOString().slice(0, 10)]);
        const response = await sendEmail({ to: patientData.email, subject: patientSubject, html: patientHtml });

        await logWorkflowNotification({
            workflowId: stageConfig.workflow_id,
            stageId,
            treatmentId,
            eventType: 'stage_entry_patient',
            recipientEmail: patientData.email,
            subject: patientSubject,
            status: response.success ? 'sent' : 'failed',
            errorMessage: response.success ? null : String(response.error || 'unknown_error'),
            eventKey: patientEventKey,
        });
    }
}

/**
 * Ensures a patient has a Google Drive folder hierarchy for their clinical workflows.
 * Supports Orthodontics, Smile Design (Exocad), Surgery, etc.
 */
async function ensurePatientDriveFolder(treatmentId: string) {
    const supabase = await createClient();

    // 1. Fetch treatment, patient and workflow info
    const { data: treatment, error: treatmentError } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            metadata,
            patient:pacientes(id_paciente, nombre, apellido, link_historia_clinica),
            workflow:clinical_workflows(name, type)
        `)
        .eq('id', treatmentId)
        .single();

    if (treatmentError || !treatment) return;

    // 2. Check if folder already exists in metadata
    const metadata = (treatment.metadata as Record<string, any>) || {};
    if (metadata.drive_folder_id) return;

    // 3. Determine workflow type and folder suffix
    const workflowData = treatment.workflow as any;
    const workflowName = Array.isArray(workflowData) ? workflowData[0]?.name : workflowData?.name;
    const workflowType = Array.isArray(workflowData) ? workflowData[0]?.type : workflowData?.type;

    // Skip folder creation for recurrent/maintenance workflows (Control Carillas, Limpieza, etc.)
    if (workflowType === 'recurrent') return;

    const lowerName = (workflowName || '').toLowerCase();

    let suffix = (workflowName || 'TRATAMIENTO').toUpperCase();
    if (lowerName.includes('ortodoncia') || lowerName.includes('alineador')) {
        suffix = 'AM ALINEADORES';
    } else if (lowerName.includes('sonrisa') || lowerName.includes('exocad')) {
        suffix = 'EXOCAD';
    } else if (lowerName.includes('cirugia') || lowerName.includes('implante')) {
        suffix = 'CIRUGIA';
    }

    const patientData = treatment.patient as any;
    const patientRootName = `${(patientData.apellido || '').toUpperCase()}, ${(patientData.nombre || '').charAt(0).toUpperCase() + (patientData.nombre || '').slice(1).toLowerCase()}`.trim();
    const folderName = `[${suffix}] ${patientRootName}`;

    // 4. Ensure Hierarchy on Google Drive
    const {
        ensureStandardPatientFolders,
        createWorkflowFolder
    } = await import('@/lib/google-drive');

    // Step A: Ensure Mother Folder and Admin subfolders exist
    const hierarchy = await ensureStandardPatientFolders(
        patientData.apellido,
        patientData.nombre,
        patientData.link_historia_clinica || undefined
    );

    if (hierarchy.error || !hierarchy.motherFolderId) {
        console.error('Error ensuring patient hierarchy:', hierarchy.error);
        return;
    }

    // Update patient record if needed
    if (hierarchy.motherFolderUrl && hierarchy.motherFolderUrl !== patientData.link_historia_clinica) {
        await supabase
            .from('pacientes')
            .update({ link_historia_clinica: hierarchy.motherFolderUrl })
            .eq('id_paciente', patientData.id_paciente);
    }

    // Step B: Create the specific treatment subfolder inside the parent
    const result = await createWorkflowFolder(folderName, hierarchy.motherFolderId);

    if (result.error || !result.folderId) {
        console.error('Error creating workflow subfolder:', result.error);
        return;
    }

    // 5. Update treatment metadata
    const updatedMetadata = {
        ...metadata,
        drive_folder_id: result.folderId,
        drive_folder_url: result.webViewLink
    };

    await supabase
        .from('patient_treatments')
        .update({ metadata: updatedMetadata })
        .eq('id', treatmentId);


    // 5. Send notification email to lab
    const { sendEmail } = await import('@/lib/nodemailer');
    const labEmail = 'amesteticadentallab@gmail.com';
    const subject = `Nueva Carpeta de Paciente: ${folderName}`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2 style="margin: 0 0 8px;">Nueva Carpeta en Google Drive</h2>
            <p style="margin: 0 0 8px;">Se ha creado automáticamente la carpeta para el paciente en el flujo de Ortodoncia.</p>
            <ul style="margin: 0; padding-left: 18px;">
                <li><strong>Paciente:</strong> ${folderName}</li>
                <li><strong>Workflow:</strong> ${workflowName}</li>
                <li><strong>Enlace:</strong> <a href="${result.webViewLink}">Ver Carpeta en Drive</a></li>
            </ul>
        </div>
    `;

    await sendEmail({ to: labEmail, subject, html });
}

async function checkAndTriggerLaboratorioCase(treatmentId: string, stageId: string) {
    const supabase = await createClient();

    const { data: stageData, error: stageError } = await supabase
        .from('clinical_workflow_stages')
        .select('id, name, workflow_id')
        .eq('id', stageId)
        .single();

    if (stageError || !stageData) return;
    if (!stageTriggersLabAutomation(stageData.name)) return;

    const caseEventKey = createNotificationKey(['lab_case_created', treatmentId]);

    const { data: existingCaseEvent, error: existingCaseError } = await supabase
        .from('workflow_notifications_log')
        .select('id')
        .eq('event_key', caseEventKey)
        .maybeSingle();

    if (existingCaseError && existingCaseError.code !== '42P01') {
        console.error('Error checking laboratorio dedupe event:', existingCaseError);
    }

    if (existingCaseEvent?.id) return;

    const { data: treatmentData, error: treatmentError } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            patient_id,
            metadata,
            patient:pacientes(id_paciente, nombre, apellido, documento),
            workflow:clinical_workflows(name)
        `)
        .eq('id', treatmentId)
        .single();

    if (treatmentError || !treatmentData) {
        await logWorkflowNotification({
            workflowId: stageData.workflow_id,
            stageId,
            treatmentId,
            eventType: 'lab_case_created',
            status: 'failed',
            errorMessage: treatmentError?.message || 'treatment_not_found',
            eventKey: caseEventKey,
        });
        return;
    }

    const workflowData = normalizeWorkflowData(treatmentData.workflow as WorkflowSummary | WorkflowSummary[] | null);
    const workflowName = workflowData?.name || 'Workflow';

    const patientData = treatmentData.patient as {
        id_paciente?: string;
        nombre?: string | null;
        apellido?: string | null;
        documento?: string | null;
    } | null;

    if (!patientData?.id_paciente) {
        await logWorkflowNotification({
            workflowId: stageData.workflow_id,
            stageId,
            treatmentId,
            eventType: 'lab_case_created',
            status: 'failed',
            errorMessage: 'patient_not_found',
            eventKey: caseEventKey,
        });
        return;
    }

    const patientName = `${patientData.apellido || ''}, ${patientData.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim() || 'Paciente';
    const metadataType = getMetadataString(treatmentData.metadata, 'type');
    const metadataNotes = getMetadataString(treatmentData.metadata, 'notes');
    const workType = metadataType || workflowName;

    const today = new Date();
    const fechaEnvio = today.toISOString().slice(0, 10);
    const fechaEntregaEstimada = addDays(today, 10).toISOString().slice(0, 10);
    const folderUrl = `https://drive.google.com/drive/folders/${LAB_CASE_FOLDER_ID}`;
    const notesParts = [
        'Caso generado automaticamente desde workflow.',
        `Workflow: ${workflowName}.`,
        `Etapa disparadora: ${stageData.name}.`,
        `Tratamiento ID: ${treatmentId}.`,
    ];

    if (metadataNotes) {
        notesParts.push(`Notas clinicas: ${metadataNotes}`);
    }

    const { error: insertLabError } = await supabase
        .from('laboratorio_trabajos')
        .insert({
            paciente_id: patientData.id_paciente,
            profesional_id: null,
            tipo_trabajo: workType,
            laboratorio_nombre: 'Laboratorio Interno',
            fecha_envio: fechaEnvio,
            fecha_entrega_estimada: fechaEntregaEstimada,
            costo_usd: 0,
            observaciones: notesParts.join(' '),
            estado: 'Enviado',
        });

    if (insertLabError) {
        await logWorkflowNotification({
            workflowId: stageData.workflow_id,
            stageId,
            treatmentId,
            eventType: 'lab_case_created',
            status: 'failed',
            errorMessage: insertLabError.message,
            eventKey: caseEventKey,
        });
        return;
    }

    const recipients = LAB_CASE_NOTIFICATION_RECIPIENTS
        .split(',')
        .map(email => email.trim())
        .filter(Boolean);

    const subject = `${LAB_CASE_EMAIL_SUBJECT}: ${patientName} (${workType})`;
    const html = `
        <div style="font-family: Arial, sans-serif; color: #111827;">
            <h2 style="margin: 0 0 8px;">Nuevo Caso Clinico Registrado</h2>
            <p style="margin: 0 0 8px;">Se activo automaticamente un nuevo caso para laboratorio y diseno.</p>
            <ul style="margin: 0; padding-left: 18px;">
                <li><strong>Fecha del caso:</strong> ${fechaEnvio}</li>
                <li><strong>Paciente:</strong> ${patientName}</li>
                <li><strong>Documento:</strong> ${patientData.documento || 'Sin documento'}</li>
                <li><strong>Orden de trabajo:</strong> ${workType}</li>
                <li><strong>Workflow:</strong> ${workflowName}</li>
                <li><strong>Etapa activadora:</strong> ${stageData.name}</li>
                <li><strong>Entrega estimada:</strong> ${fechaEntregaEstimada}</li>
            </ul>
            <p style="margin-top: 10px;">Subir el caso clinico y los archivos al espacio de laboratorio.</p>
            <p style="margin-top: 10px;"><a href="${folderUrl}"><strong>ACCEDER A CARPETA DE CASOS</strong></a></p>
            <p style="margin-top: 6px;"><a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/workflows?section=laboratorio"><strong>ABRIR TAB DE LABORATORIO EN WORKFLOWS</strong></a></p>
        </div>
    `;

    await Promise.all(
        recipients.map(async email => {
            const recipientEventKey = createNotificationKey(['lab_case_alert', treatmentId, stageId, email, fechaEnvio]);
            const response = await sendEmail({ to: email, subject, html });

            await logWorkflowNotification({
                workflowId: stageData.workflow_id,
                stageId,
                treatmentId,
                eventType: 'lab_case_alert',
                recipientEmail: email,
                subject,
                status: response.success ? 'sent' : 'failed',
                errorMessage: response.success ? null : String(response.error || 'unknown_error'),
                eventKey: recipientEventKey,
            });
        })
    );

    await logWorkflowNotification({
        workflowId: stageData.workflow_id,
        stageId,
        treatmentId,
        eventType: 'lab_case_created',
        status: 'sent',
        eventKey: caseEventKey,
    });
}

async function scheduleNextRecurrentCycle(treatmentId: string, newStageId: string) {
    const supabase = await createClient();

    const { data: stageData, error: stageError } = await supabase
        .from('clinical_workflow_stages')
        .select('is_final')
        .eq('id', newStageId)
        .single();

    if (stageError || !stageData?.is_final) return;

    const { data: treatmentData, error: treatmentError } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            patient_id,
            workflow_id,
            doctor_id,
            metadata,
            workflow:clinical_workflows(name, type, frequency_months)
        `)
        .eq('id', treatmentId)
        .single();

    if (treatmentError || !treatmentData) return;

    const workflowData = normalizeWorkflowData(treatmentData.workflow as WorkflowSummary | WorkflowSummary[] | null) as {
        name?: string | null;
        type?: WorkflowType | null;
        frequency_months?: number | null;
    } | null;

    if (!workflowData || workflowData.type !== 'recurrent') return;

    const metadataInterval = getRecurrenceIntervalFromMetadata(treatmentData.metadata);
    const fallbackInterval = workflowData.frequency_months || (workflowData.name?.toLowerCase().includes('botox') ? 4 : 6);
    const recurrenceInterval = metadataInterval || fallbackInterval;

    if (!recurrenceInterval || recurrenceInterval <= 0) return;

    let initialStageId: string | null = null;

    const { data: initialStage, error: initialError } = await supabase
        .from('clinical_workflow_stages')
        .select('id')
        .eq('workflow_id', treatmentData.workflow_id)
        .eq('is_initial', true)
        .maybeSingle();

    if (initialError) {
        console.error('Error fetching initial recurrent stage:', initialError);
        return;
    }

    initialStageId = initialStage?.id || null;

    if (!initialStageId) {
        const { data: firstStage } = await supabase
            .from('clinical_workflow_stages')
            .select('id')
            .eq('workflow_id', treatmentData.workflow_id)
            .order('order_index', { ascending: true })
            .limit(1)
            .maybeSingle();

        initialStageId = firstStage?.id || null;
    }

    if (!initialStageId) return;

    const nowIso = new Date().toISOString();

    const { data: upcomingCycle, error: upcomingCycleError } = await supabase
        .from('patient_treatments')
        .select('id')
        .eq('workflow_id', treatmentData.workflow_id)
        .eq('patient_id', treatmentData.patient_id)
        .neq('id', treatmentId)
        .neq('status', 'archived')
        .gte('next_milestone_date', nowIso)
        .limit(1)
        .maybeSingle();

    if (upcomingCycleError) {
        console.error('Error checking upcoming recurrent cycle:', upcomingCycleError);
        return;
    }

    if (upcomingCycle?.id) return;

    const nextMilestoneDate = addMonths(new Date(), recurrenceInterval).toISOString();
    const existingMetadata = treatmentData.metadata && typeof treatmentData.metadata === 'object'
        ? treatmentData.metadata as Record<string, unknown>
        : {};

    await createTreatment({
        patient_id: treatmentData.patient_id,
        workflow_id: treatmentData.workflow_id,
        doctor_id: treatmentData.doctor_id,
        initial_stage_id: initialStageId,
        start_date: nowIso,
        next_milestone_date: nextMilestoneDate,
        metadata: {
            ...existingMetadata,
            recurrence_interval_months: recurrenceInterval,
            recurrence_origin: 'auto_cycle',
            previous_treatment_id: treatmentId,
            type: workflowData.name?.toLowerCase().includes('botox')
                ? `Botox ${recurrenceInterval}m`
                : (typeof existingMetadata.type === 'string' ? existingMetadata.type : 'Control recurrente'),
        },
    });
}

export async function runWorkflowSlaReminders() {
    const supabase = await createClient();

    let stageNotificationColumnsAvailable = true;

    let treatments: ReminderTreatmentRow[] = [];
    let error: { code?: string; message?: string } | null = null;

    const primary = await supabase
        .from('patient_treatments')
        .select(`
            id,
            workflow_id,
            current_stage_id,
            last_stage_change,
            next_milestone_date,
            metadata,
            patient:pacientes(nombre, apellido, documento, email, whatsapp_pais_code, whatsapp_numero),
            workflow:clinical_workflows(name, type, frequency_months),
            stage:clinical_workflow_stages(name, time_limit_days, notify_before_days, notify_emails, reminder_windows_days)
        `)
        .eq('status', 'active');

    treatments = (primary.data as ReminderTreatmentRow[] | null) || [];
    error = primary.error;

    if (isMissingNotificationColumnsError(error)) {
        stageNotificationColumnsAvailable = false;
        const fallback = await supabase
            .from('patient_treatments')
            .select(`
                id,
                workflow_id,
                current_stage_id,
                last_stage_change,
                next_milestone_date,
                metadata,
                patient:pacientes(nombre, apellido, documento, email, whatsapp_pais_code, whatsapp_numero),
                workflow:clinical_workflows(name, type, frequency_months),
                stage:clinical_workflow_stages(name, time_limit_days, reminder_windows_days)
            `)
            .eq('status', 'active');

        treatments = (fallback.data as ReminderTreatmentRow[] | null) || [];
        error = fallback.error;
    }

    if (error) {
        console.error('Error loading treatments for reminders:', error);
        throw new Error('No se pudieron cargar tratamientos para recordatorios');
    }

    let sent = 0;
    let skipped = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const treatment of treatments || []) {
        const stage = treatment.stage as {
            name?: string | null;
            time_limit_days?: number | null;
            notify_before_days?: number | null;
            notify_emails?: string[] | null;
            reminder_windows_days?: number[] | null;
        } | null;

        const workflow = normalizeWorkflowData(treatment.workflow as WorkflowSummary | WorkflowSummary[] | null) as {
            name?: string | null;
            type?: WorkflowType | null;
            frequency_months?: number | null;
        } | null;
        const workflowName = workflow?.name;

        const patient = treatment.patient as {
            nombre?: string | null;
            apellido?: string | null;
            documento?: string | null;
            email?: string | null;
            whatsapp_pais_code?: string | null;
            whatsapp_numero?: string | null;
        } | null;

        const metadata = treatment.metadata && typeof treatment.metadata === 'object'
            ? (treatment.metadata as Record<string, unknown>)
            : {};

        const stageNameNormalized = normalizeStageName(stage?.name);
        const isBookedStage = stageNameNormalized.includes('turno') && (stageNameNormalized.includes('agend') || stageNameNormalized.includes('dado'));
        const patientName = `${patient?.apellido || ''}, ${patient?.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim() || 'Paciente';
        const staffEmails = Array.isArray(stage?.notify_emails)
            ? stage.notify_emails.filter((email): email is string => typeof email === 'string' && email.trim().length > 0)
            : [];
        const staffWhatsappLink = buildWhatsappLink(patient?.whatsapp_pais_code, patient?.whatsapp_numero);
        const appBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

        if (treatment.next_milestone_date && patient?.email) {
            const milestoneDate = new Date(treatment.next_milestone_date);
            const appointmentIso = getIsoStringFromMetadata(metadata, 'appointment_date');
            const appointmentDate = appointmentIso ? new Date(appointmentIso) : null;

            const referenceDate = isBookedStage && appointmentDate
                ? appointmentDate
                : milestoneDate;

            const daysToReference = Math.ceil((referenceDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

            const reminderWindows = isBookedStage
                ? getReminderDaysFromMetadata(
                    metadata,
                    'appointment_reminder_days',
                    (stage?.reminder_windows_days && stage.reminder_windows_days.length > 0)
                        ? stage.reminder_windows_days
                        : [7, 2, 1]
                )
                : getReminderDaysFromMetadata(
                    metadata,
                    'waiting_reminder_days',
                    (stage?.reminder_windows_days && stage.reminder_windows_days.length > 0)
                        ? stage.reminder_windows_days
                        : (workflowName?.toLowerCase().includes('botox') ? [30, 14, 3] : [30, 14, 3])
                );

            if (reminderWindows.includes(daysToReference)) {
                const eventType = isBookedStage
                    ? `appointment_due_${daysToReference}d`
                    : `milestone_due_${daysToReference}d`;
                const eventKey = createNotificationKey([eventType, treatment.id, patient.email, today]);

                let alreadySent = false;
                const { data: existingReminder, error: existingReminderError } = await supabase
                    .from('workflow_notifications_log')
                    .select('id')
                    .eq('event_key', eventKey)
                    .maybeSingle();

                if (existingReminderError && existingReminderError.code !== '42P01') {
                    console.error('Error checking milestone reminder dedupe:', existingReminderError);
                }

                alreadySent = Boolean(existingReminder?.id);
                if (!alreadySent) {
                    const subject = isBookedStage
                        ? `Recordatorio de turno ${workflowName || 'control'}: faltan ${daysToReference} dias`
                        : `Recordatorio ${workflowName || 'tratamiento'}: faltan ${daysToReference} dias`;

                    const html = isBookedStage
                        ? `
                            <div style="font-family: Arial, sans-serif; color: #111827;">
                                <h2 style="margin: 0 0 8px;">Recordatorio de turno</h2>
                                <p style="margin: 0 0 8px;">Hola ${patientName}, te recordamos tu proximo turno.</p>
                                <ul style="margin: 0; padding-left: 18px;">
                                    <li><strong>Servicio:</strong> ${workflowName || 'Control recurrente'}</li>
                                    <li><strong>Fecha del turno:</strong> ${referenceDate.toLocaleDateString('es-AR')}</li>
                                    <li><strong>Dias restantes:</strong> ${daysToReference}</li>
                                </ul>
                                <p style="margin-top: 10px;">Si necesitas reprogramar, respondenos este email.</p>
                            </div>
                        `
                        : `
                            <div style="font-family: Arial, sans-serif; color: #111827;">
                                <h2 style="margin: 0 0 8px;">Recordatorio de control recomendado</h2>
                                <p style="margin: 0 0 8px;">Hola ${patientName}, ya estas entrando en la ventana recomendada para tu control.</p>
                                <ul style="margin: 0; padding-left: 18px;">
                                    <li><strong>Servicio:</strong> ${workflowName || 'Control recurrente'}</li>
                                    <li><strong>Fecha recomendada:</strong> ${referenceDate.toLocaleDateString('es-AR')}</li>
                                    <li><strong>Dias restantes:</strong> ${daysToReference}</li>
                                </ul>
                                <p style="margin-top: 10px;">Para agendar, entra aqui: <a href="${appBaseUrl}/login">${appBaseUrl}/login</a></p>
                            </div>
                        `;

                    const response = await sendEmail({
                        to: patient.email,
                        subject,
                        html,
                    });

                    await logWorkflowNotification({
                        workflowId: treatment.workflow_id,
                        stageId: treatment.current_stage_id,
                        treatmentId: treatment.id,
                        eventType,
                        recipientEmail: patient.email,
                        subject,
                        status: response.success ? 'sent' : 'failed',
                        errorMessage: response.success ? null : String(response.error || 'unknown_error'),
                        eventKey,
                    });

                    if (response.success) {
                        sent++;
                    }

                    for (const staffEmail of staffEmails) {
                        const staffEventKey = createNotificationKey([`${eventType}_staff`, treatment.id, staffEmail, today]);
                        const { data: existingStaff } = await supabase
                            .from('workflow_notifications_log')
                            .select('id')
                            .eq('event_key', staffEventKey)
                            .maybeSingle();

                        if (existingStaff?.id) {
                            skipped++;
                            continue;
                        }

                        const staffSubject = isBookedStage
                            ? `Staff: recordar turno de ${patientName}`
                            : `Staff: contactar a ${patientName} para agendar control`;

                        const staffHtml = `
                            <div style="font-family: Arial, sans-serif; color: #111827;">
                                <h2 style="margin: 0 0 8px;">Recordatorio para staff</h2>
                                <ul style="margin: 0; padding-left: 18px;">
                                    <li><strong>Paciente:</strong> ${patientName}</li>
                                    <li><strong>Documento:</strong> ${patient?.documento || 'Sin documento'}</li>
                                    <li><strong>Workflow:</strong> ${workflowName || 'Control recurrente'}</li>
                                    <li><strong>Columna:</strong> ${stage?.name || 'Sin columna'}</li>
                                    <li><strong>Fecha de referencia:</strong> ${referenceDate.toLocaleDateString('es-AR')}</li>
                                    <li><strong>Dias restantes:</strong> ${daysToReference}</li>
                                </ul>
                                <p style="margin-top: 10px;">Link de agenda: <a href="${appBaseUrl}/login">${appBaseUrl}/login</a></p>
                                ${staffWhatsappLink ? `<p>Whatsapp paciente: <a href="${staffWhatsappLink}">${staffWhatsappLink}</a></p>` : '<p>Whatsapp paciente: no disponible</p>'}
                            </div>
                        `;

                        const staffResponse = await sendEmail({
                            to: staffEmail,
                            subject: staffSubject,
                            html: staffHtml,
                        });

                        await logWorkflowNotification({
                            workflowId: treatment.workflow_id,
                            stageId: treatment.current_stage_id,
                            treatmentId: treatment.id,
                            eventType: `${eventType}_staff`,
                            recipientEmail: staffEmail,
                            subject: staffSubject,
                            status: staffResponse.success ? 'sent' : 'failed',
                            errorMessage: staffResponse.success ? null : String(staffResponse.error || 'unknown_error'),
                            eventKey: staffEventKey,
                        });

                        if (staffResponse.success) sent++;
                    }
                } else {
                    skipped++;
                }
            }
        }

        if (!stageNotificationColumnsAvailable) {
            continue;
        }

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

        const patientNameForSla = patient
            ? `${patient.apellido || ''}, ${patient.nombre || ''}`.replace(/^,\s*|\s*,\s*$/g, '').trim()
            : 'Paciente';

        const subject = `SLA por vencer: ${workflowName || 'Workflow'} / ${stage.name || 'Etapa'}`;
        const html = `
            <div style="font-family: Arial, sans-serif; color: #111827;">
                <h2 style="margin: 0 0 8px;">Recordatorio SLA</h2>
                <p style="margin: 0 0 8px;">Un tratamiento esta proximo al limite de tiempo de su etapa.</p>
                <ul style="margin: 0; padding-left: 18px;">
                    <li><strong>Workflow:</strong> ${workflowName || 'Sin nombre'}</li>
                    <li><strong>Etapa:</strong> ${stage.name || 'Sin etapa'}</li>
                    <li><strong>Paciente:</strong> ${patientNameForSla || 'Sin nombre'}</li>
                    <li><strong>Documento:</strong> ${patient?.documento || 'Sin documento'}</li>
                    <li><strong>Dias en etapa:</strong> ${daysInStage}</li>
                    <li><strong>Limite SLA:</strong> ${stage.time_limit_days} dias</li>
                </ul>
            </div>
        `;

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

            const response = await sendEmail({ to: email, subject, html });
            await logWorkflowNotification({
                workflowId: treatment.workflow_id,
                stageId: treatment.current_stage_id,
                treatmentId: treatment.id,
                eventType: 'sla_due_soon',
                recipientEmail: email,
                subject,
                status: response.success ? 'sent' : 'failed',
                errorMessage: response.success ? null : String(response.error || 'unknown_error'),
                eventKey,
            });

            if (response.success) sent++;
        }
    }

    revalidatePath('/workflows');
    return { success: true, sent, skipped };
}

export async function getWorkflowNotificationLog(workflowId: string): Promise<WorkflowNotificationLogEntry[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('workflow_notifications_log')
        .select('id, created_at, event_type, recipient_email, subject, status, error_message, stage:clinical_workflow_stages(name)')
        .eq('workflow_id', workflowId)
        .order('created_at', { ascending: false })
        .limit(100);

    if (error) {
        console.error('Error fetching workflow notification log:', error);
        return [];
    }

    return (data || []) as WorkflowNotificationLogEntry[];
}

async function checkAndTriggerMaintenance(treatmentId: string, stageId: string) {
    const supabase = await createClient();

    // Get stage info to check if final
    const { data: stage } = await supabase
        .from('clinical_workflow_stages')
        .select('is_final, workflow_id')
        .eq('id', stageId)
        .single();

    if (!stage?.is_final) return;

    // Get current workflow and patient info
    const { data: treatment } = await supabase
        .from('patient_treatments')
        .select(`
            patient_id, 
            doctor_id,
            workflow:clinical_workflows(name)
        `)
        .eq('id', treatmentId)
        .single();

    if (!treatment) return;

    // Fix: workflow is returned as an array by Supabase join
    const workflowData = treatment.workflow as WorkflowSummary | WorkflowSummary[] | null;
    const workflowName = Array.isArray(workflowData) ? workflowData[0]?.name : workflowData?.name;
    let targetWorkflowName = '';

    // Map finished workflow to recurrent workflow
    if (workflowName === 'Ortodoncia Invisible' || workflowName === 'Diseño de Alineadores Invisibles') targetWorkflowName = 'Control Ortodoncia';
    else if (workflowName === 'Cirugía e Implantes') targetWorkflowName = 'Mantenimiento Implantes';
    else if (workflowName === 'Diseño de Sonrisa') targetWorkflowName = 'Control Carillas';

    if (!targetWorkflowName) return;

    // Find target workflow and its initial stage
    const { data: targetWorkflow } = await supabase
        .from('clinical_workflows')
        .select(`
            id, 
            frequency_months,
            stages:clinical_workflow_stages(id)
        `)
        .eq('name', targetWorkflowName)
        .eq('type', 'recurrent')
        .single();

    if (!targetWorkflow) return;

    // Find initial stage (lowest order_index or is_initial) - simplified here assuming is_initial
    const { data: initialStage } = await supabase
        .from('clinical_workflow_stages')
        .select('id')
        .eq('workflow_id', targetWorkflow.id)
        .eq('is_initial', true)
        .single();

    if (!initialStage) return;

    // Calculate start date (future)
    const frequencyMonths = targetWorkflow.frequency_months || 6;
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() + frequencyMonths);

    // Create Maintenance Treatment
    await createTreatment({
        patient_id: treatment.patient_id,
        workflow_id: targetWorkflow.id,
        doctor_id: treatment.doctor_id,
        initial_stage_id: initialStage.id,
        start_date: startDate.toISOString(),
        next_milestone_date: startDate.toISOString(),
        metadata: {
            recurrence_interval_months: frequencyMonths,
            recurrence_origin: 'from_treatment_completion',
            type: 'Control recurrente',
        },
    });
}

export async function getPatients(search?: string): Promise<PatientSearchResult[]> {
    const supabase = await createClient();

    let query = supabase
        .from('pacientes')
        .select('id_paciente, nombre, apellido, documento, email')
        .order('apellido', { ascending: true })
        .limit(20);

    if (search) {
        const sanitizedSearch = search
            .replace(/[,()]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (sanitizedSearch.length > 0) {
            query = query.or(`nombre.ilike.%${sanitizedSearch}%,apellido.ilike.%${sanitizedSearch}%,documento.ilike.%${sanitizedSearch}%`);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching patients:', error);
        return [];
    }
    return (data || []) as PatientSearchResult[];
}

export async function getTreatmentHistory(treatmentId: string): Promise<TreatmentHistoryEntry[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('treatment_history')
        .select(`
            id,
            created_at,
            comments,
            previous_stage:clinical_workflow_stages!treatment_history_previous_stage_id_fkey(name),
            new_stage:clinical_workflow_stages!treatment_history_new_stage_id_fkey(name)
        `)
        .eq('treatment_id', treatmentId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching treatment history:', error);
        return [];
    }

    return (data || []) as TreatmentHistoryEntry[];
}

interface StageConfigInput {
    id?: string;
    name: string;
    color?: string | null;
    order_index: number;
    time_limit_days?: number | null;
    notify_on_entry?: boolean;
    notify_before_days?: number | null;
    notify_emails?: string[];
    reminder_windows_days?: number[];
    staff_email_template?: string | null;
    patient_email_template?: string | null;
    notify_patient_on_entry?: boolean;
    sla_staff_template?: string | null;
    reminder_patient_template?: string | null;
    reminder_staff_template?: string | null;
    staff_email_subject?: string | null;
    patient_email_subject?: string | null;
    sla_staff_subject?: string | null;
    reminder_patient_subject?: string | null;
    reminder_staff_subject?: string | null;
}

function isMissingNotificationColumnsError(error: { code?: string; message?: string } | null) {
    if (!error) return false;
    if (error.code !== 'PGRST204') return false;
    return Boolean(
        error.message?.includes('notify_before_days') ||
        error.message?.includes('notify_on_entry') ||
        error.message?.includes('notify_emails') ||
        error.message?.includes('reminder_windows_days') ||
        error.message?.includes('staff_email_template') ||
        error.message?.includes('patient_email_template') ||
        error.message?.includes('notify_patient_on_entry') ||
        error.message?.includes('sla_staff_template') ||
        error.message?.includes('reminder_patient_template') ||
        error.message?.includes('reminder_staff_template') ||
        error.message?.includes('staff_email_subject') ||
        error.message?.includes('patient_email_subject') ||
        error.message?.includes('sla_staff_subject') ||
        error.message?.includes('reminder_patient_subject') ||
        error.message?.includes('reminder_staff_subject')
    );
}

function normalizeEmails(emails: string[] = []) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const normalized = Array.from(
        new Set(
            emails
                .map(email => email.trim().toLowerCase())
                .filter(Boolean)
        )
    );

    for (const email of normalized) {
        if (!emailRegex.test(email)) {
            throw new Error(`Email invalido en configuracion: ${email}`);
        }
    }

    return normalized;
}

export async function updateWorkflowStagesConfig(payload: {
    workflowId: string;
    stages: StageConfigInput[];
    deletedStageIds?: string[];
}) {
    const supabase = await createClient();

    const { workflowId, stages, deletedStageIds = [] } = payload;

    if (!stages.length) {
        throw new Error('El workflow debe tener al menos una columna');
    }

    const trimmedNames = stages.map(stage => stage.name.trim()).filter(Boolean);
    if (trimmedNames.length !== stages.length) {
        throw new Error('Todas las columnas deben tener nombre');
    }

    const uniqueNames = new Set(trimmedNames.map(name => name.toLowerCase()));
    if (uniqueNames.size !== trimmedNames.length) {
        throw new Error('No puede haber columnas duplicadas');
    }

    for (const stageId of deletedStageIds) {
        const { count, error: countError } = await supabase
            .from('patient_treatments')
            .select('id', { count: 'exact', head: true })
            .eq('current_stage_id', stageId)
            .neq('status', 'archived');

        if (countError) {
            console.error('Error validating stage deletion:', countError);
            throw new Error('No se pudo validar el borrado de columna');
        }

        if ((count || 0) > 0) {
            throw new Error('No puedes eliminar una columna que tiene tratamientos activos');
        }

        const { error: deleteError } = await supabase
            .from('clinical_workflow_stages')
            .delete()
            .eq('id', stageId)
            .eq('workflow_id', workflowId);

        if (deleteError) {
            console.error('Error deleting stage:', deleteError);
            throw new Error('No se pudo eliminar la columna');
        }
    }

    for (const stage of stages) {
        const sanitizedEmails = normalizeEmails(stage.notify_emails || []);
        const baseStagePayload = {
            name: stage.name.trim(),
            color: stage.color || null,
            order_index: stage.order_index,
            time_limit_days: stage.time_limit_days ?? null,
        };

        const notificationsPayload = {
            notify_on_entry: stage.notify_on_entry ?? false,
            notify_before_days: stage.notify_before_days ?? null,
            notify_emails: sanitizedEmails,
            reminder_windows_days: Array.from(
                new Set(
                    (stage.reminder_windows_days || [])
                        .map(value => Number(value))
                        .filter(value => Number.isFinite(value) && value > 0)
                )
            )
                .sort((a, b) => b - a)
                .slice(0, 3),
            staff_email_template: stage.staff_email_template || null,
            patient_email_template: stage.patient_email_template || null,
            notify_patient_on_entry: stage.notify_patient_on_entry ?? false,
            sla_staff_template: stage.sla_staff_template || null,
            reminder_patient_template: stage.reminder_patient_template || null,
            reminder_staff_template: stage.reminder_staff_template || null,
            staff_email_subject: stage.staff_email_subject || null,
            patient_email_subject: stage.patient_email_subject || null,
            sla_staff_subject: stage.sla_staff_subject || null,
            reminder_patient_subject: stage.reminder_patient_subject || null,
            reminder_staff_subject: stage.reminder_staff_subject || null,
        };

        if (stage.id) {
            const { error } = await supabase
                .from('clinical_workflow_stages')
                .update({
                    ...baseStagePayload,
                    ...notificationsPayload,
                })
                .eq('id', stage.id)
                .eq('workflow_id', workflowId);

            if (isMissingNotificationColumnsError(error)) {
                const { error: fallbackError } = await supabase
                    .from('clinical_workflow_stages')
                    .update(baseStagePayload)
                    .eq('id', stage.id)
                    .eq('workflow_id', workflowId);

                if (fallbackError) {
                    console.error('Error updating stage config fallback:', fallbackError);
                    throw new Error('No se pudo actualizar la configuracion del workflow');
                }
                continue;
            }

            if (error) {
                console.error('Error updating stage config:', error);
                throw new Error('No se pudo actualizar la configuracion del workflow');
            }
        } else {
            const { error } = await supabase
                .from('clinical_workflow_stages')
                .insert({
                    workflow_id: workflowId,
                    ...baseStagePayload,
                    ...notificationsPayload,
                    is_initial: stage.order_index === 1,
                    is_final: false,
                });

            if (isMissingNotificationColumnsError(error)) {
                const { error: fallbackError } = await supabase
                    .from('clinical_workflow_stages')
                    .insert({
                        workflow_id: workflowId,
                        ...baseStagePayload,
                        is_initial: stage.order_index === 1,
                        is_final: false,
                    });

                if (fallbackError) {
                    console.error('Error creating stage config fallback:', fallbackError);
                    throw new Error('No se pudo crear la nueva columna');
                }
                continue;
            }

            if (error) {
                console.error('Error creating stage config:', error);
                throw new Error('No se pudo crear la nueva columna');
            }
        }
    }

    const { error: clearInitialError } = await supabase
        .from('clinical_workflow_stages')
        .update({ is_initial: false })
        .eq('workflow_id', workflowId);

    if (clearInitialError) {
        console.error('Error clearing initial stage:', clearInitialError);
        throw new Error('No se pudo normalizar la etapa inicial');
    }

    const { data: firstStageRow, error: firstStageError } = await supabase
        .from('clinical_workflow_stages')
        .select('id')
        .eq('workflow_id', workflowId)
        .order('order_index', { ascending: true })
        .limit(1)
        .maybeSingle();

    if (firstStageError) {
        console.error('Error loading first stage:', firstStageError);
        throw new Error('No se pudo guardar la etapa inicial');
    }

    if (firstStageRow?.id) {
        const { error: setInitialError } = await supabase
            .from('clinical_workflow_stages')
            .update({ is_initial: true })
            .eq('id', firstStageRow.id)
            .eq('workflow_id', workflowId);

        if (setInitialError) {
            console.error('Error setting initial stage:', setInitialError);
            throw new Error('No se pudo guardar la etapa inicial');
        }
    }

    revalidatePath('/workflows');
    return { success: true };
}

export async function deleteTreatment(treatmentId: string) {
    const supabase = await createClient();

    // 1. Delete history first
    const { error: historyError } = await supabase
        .from('treatment_history')
        .delete()
        .eq('treatment_id', treatmentId);

    if (historyError) {
        console.error('Error deleting history:', historyError);
    }

    // 2. Delete treatment
    const { error } = await supabase
        .from('patient_treatments')
        .delete()
        .eq('id', treatmentId);

    if (error) {
        console.error('Error deleting treatment:', error);
        throw new Error('No se pudo eliminar el tratamiento');
    }

    revalidatePath('/workflows');
    return { success: true };
}

export async function getPatientTimeline(
    patientId: string
): Promise<PatientTimelineData | null> {
    const supabase = await createClient();

    const { data: treatmentRows, error } = await supabase
        .from('patient_treatments')
        .select(`
            *,
            patient:pacientes(id_paciente, nombre, apellido, documento),
            stage:clinical_workflow_stages(*),
            workflow:clinical_workflows(name, type, frequency_months)
        `)
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false });

    if (error || !treatmentRows?.length) return null;

    const normalizedTreatments = treatmentRows.map(t => ({
        ...t,
        workflow: normalizeWorkflowData(t.workflow as WorkflowSummary | WorkflowSummary[] | null),
    })) as PatientTreatment[];

    const historyResults = await Promise.all(
        normalizedTreatments.map(async (treatment) => {
            const { data } = await supabase
                .from('treatment_history')
                .select(`
                    id, created_at, comments,
                    previous_stage:clinical_workflow_stages!treatment_history_previous_stage_id_fkey(name),
                    new_stage:clinical_workflow_stages!treatment_history_new_stage_id_fkey(name)
                `)
                .eq('treatment_id', treatment.id)
                .order('created_at', { ascending: true });
            return (data || []) as TreatmentHistoryEntry[];
        })
    );

    const patient = normalizedTreatments[0].patient as PatientSummary;
    const treatments: PatientTimelineTreatmentEntry[] = normalizedTreatments.map((treatment, i) => ({
        treatment,
        history: historyResults[i],
    }));

    return { patient, treatments };
}
