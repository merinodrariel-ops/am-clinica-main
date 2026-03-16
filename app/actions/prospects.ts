'use server';

/**
 * app/actions/prospects.ts
 *
 * Server actions for the "Prospectos - 1ra Consulta" workflow.
 *
 * Workflow ID:  11111111-0000-0000-0000-000000000001
 * Stage IDs (deterministic):
 *   1 — Consulta Realizada       (initial)
 *   2 — 1er Contacto Enviado
 *   3 — Propuesta Formal
 *   4 — En Seguimiento Activo
 *   5 — Retomó Contacto
 *   6 — Señado ✓
 *   7 — Convertido → Tratamiento  (final)
 *   8 — No Interesado             (final)
 */

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { EmailService } from '@/lib/email-service';
import {
    PROSPECT_EMAIL_BY_STAGE,
    PROSPECT_WHATSAPP_SEQUENCE,
    generateTeamAlertNewProspect,
} from '@/lib/prospect-templates';

// ─── Constants ───────────────────────────────────────────────────────────────

const PROSPECT_WORKFLOW_ID = '11111111-0000-0000-0000-000000000001';

const STAGE = {
    CONSULTA_REALIZADA:   '11111111-0001-0000-0000-000000000001',
    PRIMER_CONTACTO:      '11111111-0001-0000-0000-000000000002',
    PROPUESTA_FORMAL:     '11111111-0001-0000-0000-000000000003',
    SEGUIMIENTO_ACTIVO:   '11111111-0001-0000-0000-000000000004',
    RETOMO_CONTACTO:      '11111111-0001-0000-0000-000000000005',
    SENADO:               '11111111-0001-0000-0000-000000000006',
    CONVERTIDO:           '11111111-0001-0000-0000-000000000007',
    NO_INTERESADO:        '11111111-0001-0000-0000-000000000008',
} as const;

// Stage order_index map (mirrors DB, used for email selection)
const STAGE_ORDER: Record<string, number> = {
    [STAGE.CONSULTA_REALIZADA]:  1,
    [STAGE.PRIMER_CONTACTO]:     2,
    [STAGE.PROPUESTA_FORMAL]:    3,
    [STAGE.SEGUIMIENTO_ACTIVO]:  4,
    [STAGE.RETOMO_CONTACTO]:     5,
    [STAGE.SENADO]:              6,
    [STAGE.CONVERTIDO]:          7,
    [STAGE.NO_INTERESADO]:       8,
};

const TEAM_ALERT_RECIPIENTS =
    process.env.PROSPECT_ALERT_RECIPIENTS ||
    'drarielmerino@gmail.com,lourdesfreire031@gmail.com';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica.vercel.app';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProspectMainInterest =
    | 'ortodoncia'
    | 'carillas'
    | 'implantes'
    | 'blanqueamiento'
    | 'otro';

export type ProspectBudgetRange = '$' | '$$' | '$$$' | 'premium';
export type ProspectUrgency = 'inmediata' | '3_meses' | '6_meses' | 'sin_urgencia';

export interface EnrollProspectInput {
    patient_id: string;
    consulta_date: string;           // ISO date string
    main_interest?: ProspectMainInterest;
    budget_range?: ProspectBudgetRange;
    urgency?: ProspectUrgency;
    notes?: string;
}

export interface ProspectListItem {
    id: string;
    patient_id: string;
    patient_name: string;
    patient_email: string | null;
    patient_whatsapp: string | null;
    patient_whatsapp_code: string | null;
    current_stage_id: string;
    current_stage_name: string;
    stage_order: number;
    consulta_date: string | null;
    days_since_consulta: number;
    days_in_stage: number;
    last_contact: string | null;
    contact_count: number;
    main_interest: string | null;
    budget_range: string | null;
    urgency: string | null;
    next_action_label: string;
    is_overdue: boolean;
}

export interface ProspectStats {
    total_active: number;
    by_stage: Record<string, number>;
    conversion_rate: number;          // % that became "Convertido"
    avg_days_to_convert: number;
    lost_count: number;
    converted_count: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysDiff(dateStr: string | null): number {
    if (!dateStr) return 0;
    const then = new Date(dateStr).getTime();
    return Math.ceil((Date.now() - then) / (1000 * 60 * 60 * 24));
}

function buildWhatsappLink(code?: string | null, number?: string | null): string | null {
    const raw = `${code || ''}${number || ''}`.replace(/\D/g, '');
    return raw ? `https://wa.me/${raw}` : null;
}

function nextActionLabel(stageId: string, daysInStage: number): { label: string; overdue: boolean } {
    switch (stageId) {
        case STAGE.CONSULTA_REALIZADA:
            return { label: 'Enviar WhatsApp + email de seguimiento (48h)', overdue: daysInStage > 2 };
        case STAGE.PRIMER_CONTACTO:
            return { label: 'Enviar propuesta formal con presupuesto', overdue: daysInStage > 7 };
        case STAGE.PROPUESTA_FORMAL:
            return { label: 'Seguimiento activo — llamar o WhatsApp', overdue: daysInStage > 14 };
        case STAGE.SEGUIMIENTO_ACTIVO:
            return { label: 'Re-engagement a los 30 días', overdue: daysInStage > 30 };
        case STAGE.RETOMO_CONTACTO:
            return { label: 'Propuesta de financiamiento + cierre', overdue: daysInStage > 14 };
        case STAGE.SENADO:
            return { label: 'Confirmar inicio de tratamiento', overdue: daysInStage > 7 };
        default:
            return { label: 'Etapa terminal', overdue: false };
    }
}

async function logProspectEvent(params: {
    treatmentId: string;
    stageId: string;
    eventType: string;
    recipientEmail?: string | null;
    subject?: string | null;
    status: 'sent' | 'failed' | 'skipped';
    errorMessage?: string | null;
    eventKey?: string;
}) {
    const supabase = await createClient();
    await supabase.from('workflow_notifications_log').insert({
        workflow_id: PROSPECT_WORKFLOW_ID,
        stage_id: params.stageId,
        treatment_id: params.treatmentId,
        event_type: params.eventType,
        recipient_email: params.recipientEmail || null,
        subject: params.subject || null,
        status: params.status,
        error_message: params.errorMessage || null,
        event_key: params.eventKey || null,
    });
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Enroll a patient in the Prospectos workflow.
 * Creates a patient_treatment at stage 1, fires team alert + T+2h WhatsApp nudge to staff.
 */
export async function enrollProspect(input: EnrollProspectInput) {
    const supabase = await createClient();

    // Guard: check if already enrolled in this workflow (avoid duplicates)
    const { data: existing } = await supabase
        .from('patient_treatments')
        .select('id, current_stage_id')
        .eq('patient_id', input.patient_id)
        .eq('workflow_id', PROSPECT_WORKFLOW_ID)
        .neq('status', 'archived')
        .maybeSingle();

    if (existing?.id) {
        return { success: false, error: 'already_enrolled', treatmentId: existing.id };
    }

    // Load patient info for notifications
    const { data: patient } = await supabase
        .from('pacientes')
        .select('nombre, apellido, email, whatsapp_pais_code, whatsapp_numero')
        .eq('id_paciente', input.patient_id)
        .single();

    if (!patient) {
        return { success: false, error: 'patient_not_found' };
    }

    // Create the treatment record
    const { data: treatment, error: treatmentError } = await supabase
        .from('patient_treatments')
        .insert({
            patient_id: input.patient_id,
            workflow_id: PROSPECT_WORKFLOW_ID,
            current_stage_id: STAGE.CONSULTA_REALIZADA,
            start_date: new Date().toISOString(),
            last_stage_change: new Date().toISOString(),
            status: 'active',
            metadata: {
                source: 'manual_enrollment',
                prospect_main_interest: input.main_interest || null,
            },
            // Prospect-specific columns
            prospect_main_interest: input.main_interest || null,
            prospect_budget_range: input.budget_range || null,
            prospect_urgency: input.urgency || null,
            prospect_consulta_date: input.consulta_date,
            prospect_last_contact: null,
            prospect_contact_count: 0,
        })
        .select()
        .single();

    if (treatmentError || !treatment) {
        console.error('Error enrolling prospect:', treatmentError);
        return { success: false, error: treatmentError?.message || 'insert_failed' };
    }

    // Log history
    await supabase.from('treatment_history').insert({
        treatment_id: treatment.id,
        new_stage_id: STAGE.CONSULTA_REALIZADA,
        comments: `Prospecto inscrito. Interés: ${input.main_interest || 'no especificado'}. ${input.notes || ''}`.trim(),
    });

    // Fire team alert email
    const consultaDateStr = new Date(input.consulta_date).toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    const alertHtml = generateTeamAlertNewProspect({
        patientName: `${patient.nombre} ${patient.apellido}`,
        consultaDate: consultaDateStr,
        interest: input.main_interest,
        patientId: input.patient_id,
        appUrl: APP_URL,
    });

    const teamEmails = TEAM_ALERT_RECIPIENTS.split(',').map(e => e.trim()).filter(Boolean);
    await Promise.all(teamEmails.map(async email => {
        const resp = await EmailService.send({
            to: email,
            subject: `🔔 Nuevo prospecto: ${patient.nombre} ${patient.apellido} (${input.main_interest || 'interés no definido'})`,
            html: alertHtml,
        });
        await logProspectEvent({
            treatmentId: treatment.id,
            stageId: STAGE.CONSULTA_REALIZADA,
            eventType: 'team_alert_new_prospect',
            recipientEmail: email,
            subject: `Nuevo prospecto: ${patient.nombre} ${patient.apellido}`,
            status: resp.success ? 'sent' : 'failed',
            errorMessage: resp.success ? null : String(resp.error),
            eventKey: `team_alert::${treatment.id}::${email}`,
        });
    }));

    // Also send immediate WhatsApp script to staff (T+2h message text)
    const waScript = PROSPECT_WHATSAPP_SEQUENCE[0]?.template(patient.nombre, input.main_interest);
    const waLink = buildWhatsappLink(patient.whatsapp_pais_code, patient.whatsapp_numero);

    if (waScript && waLink) {
        const staffWaHtml = `
<div style="font-family:sans-serif;max-width:520px;background:#1a1a1a;border-radius:10px;overflow:hidden;">
  <div style="background:#25D366;padding:14px 20px;">
    <strong style="color:#fff;">💬 WhatsApp a enviar en ~2 horas</strong>
  </div>
  <div style="padding:20px;color:#ddd;">
    <p style="margin:0 0 12px;font-size:13px;color:#aaa;">Copiar y pegar en WhatsApp del paciente:</p>
    <div style="background:#111;border-radius:8px;padding:14px;font-size:14px;color:#eee;white-space:pre-line;line-height:1.6;">${waScript}</div>
    <p style="margin:16px 0 0;">
      <a href="${waLink}" style="background:#25D366;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;">Abrir chat de ${patient.nombre} →</a>
    </p>
  </div>
</div>`;

        await Promise.all(teamEmails.map(async email => {
            const resp = await EmailService.send({
                to: email,
                subject: `💬 WA para enviar hoy: ${patient.nombre} ${patient.apellido}`,
                html: staffWaHtml,
            });
            await logProspectEvent({
                treatmentId: treatment.id,
                stageId: STAGE.CONSULTA_REALIZADA,
                eventType: 'whatsapp_script_sent_to_staff',
                recipientEmail: email,
                subject: `WA script: ${patient.nombre}`,
                status: resp.success ? 'sent' : 'failed',
                eventKey: `wa_script_2h::${treatment.id}::${email}`,
            });
        }));
    }

    revalidatePath('/workflows');
    revalidatePath('/prospectos');
    return { success: true, treatmentId: treatment.id };
}

/**
 * Get all active prospects with computed fields for the dashboard.
 */
export async function getProspectsList(): Promise<ProspectListItem[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            patient_id,
            current_stage_id,
            last_stage_change,
            prospect_consulta_date,
            prospect_last_contact,
            prospect_contact_count,
            prospect_main_interest,
            prospect_budget_range,
            prospect_urgency,
            patient:pacientes(nombre, apellido, email, whatsapp_pais_code, whatsapp_numero),
            stage:clinical_workflow_stages(name, order_index)
        `)
        .eq('workflow_id', PROSPECT_WORKFLOW_ID)
        .eq('status', 'active')
        .order('prospect_consulta_date', { ascending: false });

    if (error) {
        console.error('Error fetching prospects:', error);
        return [];
    }

    return (data || []).map(row => {
        const patient = row.patient as {
            nombre?: string | null;
            apellido?: string | null;
            email?: string | null;
            whatsapp_pais_code?: string | null;
            whatsapp_numero?: string | null;
        } | null;

        const stage = Array.isArray(row.stage)
            ? (row.stage[0] || null)
            : row.stage as { name?: string; order_index?: number } | null;

        const daysInStage = daysDiff(row.last_stage_change);
        const daysSinceConsulta = daysDiff(row.prospect_consulta_date);
        const { label, overdue } = nextActionLabel(row.current_stage_id, daysInStage);

        return {
            id: row.id,
            patient_id: row.patient_id,
            patient_name: `${patient?.nombre || ''} ${patient?.apellido || ''}`.trim(),
            patient_email: patient?.email || null,
            patient_whatsapp: patient?.whatsapp_numero || null,
            patient_whatsapp_code: patient?.whatsapp_pais_code || null,
            current_stage_id: row.current_stage_id,
            current_stage_name: stage?.name || 'Desconocida',
            stage_order: stage?.order_index ?? 0,
            consulta_date: row.prospect_consulta_date,
            days_since_consulta: daysSinceConsulta,
            days_in_stage: daysInStage,
            last_contact: row.prospect_last_contact,
            contact_count: row.prospect_contact_count || 0,
            main_interest: row.prospect_main_interest,
            budget_range: row.prospect_budget_range,
            urgency: row.prospect_urgency,
            next_action_label: label,
            is_overdue: overdue,
        };
    });
}

/**
 * Advance a prospect to a new stage and send the appropriate re-engagement email.
 */
export async function advanceProspectStage(
    treatmentId: string,
    newStageId: string,
    notes?: string
) {
    const supabase = await createClient();

    // Load treatment + patient data
    const { data: treatment, error: tErr } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            current_stage_id,
            prospect_main_interest,
            prospect_contact_count,
            patient_id,
            patient:pacientes(nombre, apellido, email, whatsapp_pais_code, whatsapp_numero)
        `)
        .eq('id', treatmentId)
        .single();

    if (tErr || !treatment) {
        return { success: false, error: 'treatment_not_found' };
    }

    const prevStageId = treatment.current_stage_id;

    // Update stage
    const { error: updateError } = await supabase
        .from('patient_treatments')
        .update({
            current_stage_id: newStageId,
            last_stage_change: new Date().toISOString(),
            prospect_last_contact: new Date().toISOString().slice(0, 10),
            prospect_contact_count: (treatment.prospect_contact_count || 0) + 1,
            updated_at: new Date().toISOString(),
        })
        .eq('id', treatmentId);

    if (updateError) {
        return { success: false, error: updateError.message };
    }

    // Log history
    await supabase.from('treatment_history').insert({
        treatment_id: treatmentId,
        previous_stage_id: prevStageId,
        new_stage_id: newStageId,
        comments: notes || 'Avance de etapa manual',
    });

    // Fire email to patient if applicable
    const patient = treatment.patient as {
        nombre?: string | null;
        apellido?: string | null;
        email?: string | null;
        whatsapp_pais_code?: string | null;
        whatsapp_numero?: string | null;
    } | null;

    const stageOrder = STAGE_ORDER[newStageId] ?? 0;
    const emailGenerator = PROSPECT_EMAIL_BY_STAGE[stageOrder];

    if (emailGenerator && patient?.email) {
        const html = emailGenerator({
            nombre: patient.nombre || 'Paciente',
            mainInterest: treatment.prospect_main_interest || undefined,
        });

        const subjectMap: Record<number, string> = {
            2: `Tu consulta con AM Estética Dental — seguimos pensando en tu caso`,
            3: `Resultado: lo que lograríamos juntos en tu caso | AM Estética Dental`,
            4: `¿Qué pasó con tu sonrisa? Un mes después de tu consulta`,
            5: `Financiamiento disponible: tu tratamiento puede comenzar hoy`,
            7: `Un mensaje personal del Dr. Merino para vos`,
        };

        const subject = subjectMap[stageOrder] || `Novedad de AM Estética Dental para ${patient.nombre}`;

        const resp = await EmailService.send({ to: patient.email, subject, html });
        await logProspectEvent({
            treatmentId,
            stageId: newStageId,
            eventType: `prospect_email_stage_${stageOrder}`,
            recipientEmail: patient.email,
            subject,
            status: resp.success ? 'sent' : 'failed',
            errorMessage: resp.success ? null : String(resp.error),
            eventKey: `prospect_email::${treatmentId}::stage_${stageOrder}::${new Date().toISOString().slice(0, 10)}`,
        });
    }

    // Send WhatsApp script to staff for stages 2, 4, 5, 6
    const waScriptIndex: Record<string, number> = {
        [STAGE.PRIMER_CONTACTO]:    1, // 48h
        [STAGE.SEGUIMIENTO_ACTIVO]: 2, // 30d
        [STAGE.RETOMO_CONTACTO]:    3, // 60d
        [STAGE.SENADO]:             4, // final
    };

    const waIdx = waScriptIndex[newStageId];
    const waScript = waIdx !== undefined
        ? PROSPECT_WHATSAPP_SEQUENCE[waIdx]?.template(patient?.nombre || 'Paciente', treatment.prospect_main_interest || undefined)
        : null;

    const waLink = buildWhatsappLink(patient?.whatsapp_pais_code, patient?.whatsapp_numero);

    if (waScript && waLink) {
        const teamEmails = TEAM_ALERT_RECIPIENTS.split(',').map(e => e.trim()).filter(Boolean);
        const stageNames: Record<string, string> = {
            [STAGE.PRIMER_CONTACTO]:    '48h',
            [STAGE.SEGUIMIENTO_ACTIVO]: '30 días',
            [STAGE.RETOMO_CONTACTO]:    '60 días',
            [STAGE.SENADO]:             'Señado',
        };

        const staffWaHtml = `
<div style="font-family:sans-serif;max-width:520px;background:#1a1a1a;border-radius:10px;overflow:hidden;">
  <div style="background:#25D366;padding:14px 20px;">
    <strong style="color:#fff;">💬 WhatsApp T+${stageNames[newStageId] || '?'} para ${patient?.nombre || 'Paciente'}</strong>
  </div>
  <div style="padding:20px;color:#ddd;">
    <p style="margin:0 0 12px;font-size:13px;color:#aaa;">Copiar y pegar en WhatsApp:</p>
    <div style="background:#111;border-radius:8px;padding:14px;font-size:14px;color:#eee;white-space:pre-line;line-height:1.6;">${waScript}</div>
    <p style="margin:16px 0 0;">
      <a href="${waLink}" style="background:#25D366;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:700;font-size:13px;">Abrir chat →</a>
    </p>
  </div>
</div>`;

        await Promise.all(teamEmails.map(email =>
            EmailService.send({
                to: email,
                subject: `💬 WA para ${patient?.nombre}: T+${stageNames[newStageId]}`,
                html: staffWaHtml,
            })
        ));
    }

    revalidatePath('/workflows');
    revalidatePath('/prospectos');
    return { success: true };
}

/**
 * Mark a prospect as converted — move to stage 7 and archive.
 * Optionally link to the new treatment ID.
 */
export async function markProspectConverted(
    treatmentId: string,
    newTreatmentId?: string
) {
    const supabase = await createClient();

    const updates: Record<string, unknown> = {
        current_stage_id: STAGE.CONVERTIDO,
        last_stage_change: new Date().toISOString(),
        status: 'completed',
        updated_at: new Date().toISOString(),
    };

    if (newTreatmentId) {
        updates.prospect_converted_to = newTreatmentId;
    }

    const { error } = await supabase
        .from('patient_treatments')
        .update(updates)
        .eq('id', treatmentId);

    if (error) {
        return { success: false, error: error.message };
    }

    await supabase.from('treatment_history').insert({
        treatment_id: treatmentId,
        new_stage_id: STAGE.CONVERTIDO,
        comments: newTreatmentId
            ? `Convertido — nuevo tratamiento: ${newTreatmentId}`
            : 'Convertido a tratamiento',
    });

    revalidatePath('/workflows');
    revalidatePath('/prospectos');
    return { success: true };
}

/**
 * Mark a prospect as lost — move to stage 8 and archive.
 */
export async function markProspectLost(treatmentId: string, reason?: string) {
    const supabase = await createClient();

    const { error } = await supabase
        .from('patient_treatments')
        .update({
            current_stage_id: STAGE.NO_INTERESADO,
            last_stage_change: new Date().toISOString(),
            status: 'completed',
            updated_at: new Date().toISOString(),
        })
        .eq('id', treatmentId);

    if (error) {
        return { success: false, error: error.message };
    }

    await supabase.from('treatment_history').insert({
        treatment_id: treatmentId,
        new_stage_id: STAGE.NO_INTERESADO,
        comments: reason ? `No interesado: ${reason}` : 'Marcado como no interesado',
    });

    revalidatePath('/workflows');
    revalidatePath('/prospectos');
    return { success: true };
}

/**
 * Get conversion stats for the dashboard.
 */
export async function getProspectStats(): Promise<ProspectStats> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('patient_treatments')
        .select('id, current_stage_id, status, prospect_consulta_date, last_stage_change')
        .eq('workflow_id', PROSPECT_WORKFLOW_ID);

    if (error || !data) {
        return {
            total_active: 0,
            by_stage: {},
            conversion_rate: 0,
            avg_days_to_convert: 0,
            lost_count: 0,
            converted_count: 0,
        };
    }

    const active = data.filter(r => r.status === 'active');
    const converted = data.filter(r => r.current_stage_id === STAGE.CONVERTIDO);
    const lost = data.filter(r => r.current_stage_id === STAGE.NO_INTERESADO);

    const byStage: Record<string, number> = {};
    for (const row of active) {
        byStage[row.current_stage_id] = (byStage[row.current_stage_id] || 0) + 1;
    }

    const total = data.length;
    const conversionRate = total > 0 ? Math.round((converted.length / total) * 100) : 0;

    const avgDays = converted.length > 0
        ? Math.round(
            converted.reduce((sum, r) => {
                const days = daysDiff(r.prospect_consulta_date);
                return sum + days;
            }, 0) / converted.length
        )
        : 0;

    return {
        total_active: active.length,
        by_stage: byStage,
        conversion_rate: conversionRate,
        avg_days_to_convert: avgDays,
        lost_count: lost.length,
        converted_count: converted.length,
    };
}

/**
 * Daily cron: scan all active prospects and fire re-engagement emails/scripts
 * when a stage's SLA is exceeded and no contact has been logged.
 *
 * Designed to be called from /api/cron/prospect-reminders route.
 */
export async function runProspectReengagementReminders(): Promise<{
    checked: number;
    fired: number;
    skipped: number;
}> {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data: prospects, error } = await supabase
        .from('patient_treatments')
        .select(`
            id,
            current_stage_id,
            last_stage_change,
            prospect_consulta_date,
            prospect_main_interest,
            prospect_contact_count,
            patient:pacientes(nombre, apellido, email, whatsapp_pais_code, whatsapp_numero)
        `)
        .eq('workflow_id', PROSPECT_WORKFLOW_ID)
        .eq('status', 'active')
        .not('current_stage_id', 'in', `(${STAGE.CONVERTIDO},${STAGE.NO_INTERESADO})`);

    if (error || !prospects) {
        console.error('Error in prospect reminders:', error);
        return { checked: 0, fired: 0, skipped: 0 };
    }

    // SLA thresholds: days after last_stage_change when we should fire the next message
    const SLA_TRIGGER: Record<string, number> = {
        [STAGE.CONSULTA_REALIZADA]: 2,   // fire 48h email + WA if not yet contacted
        [STAGE.PRIMER_CONTACTO]:    7,   // fire 7d email
        [STAGE.PROPUESTA_FORMAL]:   14,  // fire staff reminder
        [STAGE.SEGUIMIENTO_ACTIVO]: 30,  // fire 30d re-engagement
        [STAGE.RETOMO_CONTACTO]:    14,  // fire 60d (relative to consulta)
    };

    let fired = 0;
    let skipped = 0;

    for (const prospect of prospects) {
        const patient = prospect.patient as {
            nombre?: string | null;
            email?: string | null;
            whatsapp_pais_code?: string | null;
            whatsapp_numero?: string | null;
        } | null;

        const daysInStage = daysDiff(prospect.last_stage_change);
        const slaThreshold = SLA_TRIGGER[prospect.current_stage_id];

        if (!slaThreshold || daysInStage < slaThreshold) {
            skipped++;
            continue;
        }

        const stageOrder = STAGE_ORDER[prospect.current_stage_id] ?? 0;
        const emailGenerator = PROSPECT_EMAIL_BY_STAGE[stageOrder];
        const eventKey = `prospect_reminder::${prospect.id}::stage_${stageOrder}::${today}`;

        // Deduplicate — skip if already fired today
        const { data: existing } = await supabase
            .from('workflow_notifications_log')
            .select('id')
            .eq('event_key', eventKey)
            .maybeSingle();

        if (existing?.id) {
            skipped++;
            continue;
        }

        if (emailGenerator && patient?.email) {
            const html = emailGenerator({
                nombre: patient.nombre || 'Paciente',
                mainInterest: prospect.prospect_main_interest || undefined,
            });

            const subjectMap: Record<number, string> = {
                1: `Tu consulta con AM Estética Dental — seguimos pensando en tu caso`,
                2: `Tu consulta con AM Estética Dental — seguimos pensando en tu caso`,
                3: `Resultado: lo que lograríamos juntos en tu caso | AM Estética Dental`,
                4: `¿Qué pasó con tu sonrisa? Un mes después de tu consulta`,
                5: `Financiamiento disponible: tu tratamiento puede comenzar hoy`,
            };

            const subject = subjectMap[stageOrder] || `AM Estética Dental — pensando en tu caso`;

            const resp = await EmailService.send({ to: patient.email, subject, html });

            await logProspectEvent({
                treatmentId: prospect.id,
                stageId: prospect.current_stage_id,
                eventType: `prospect_auto_reminder_stage_${stageOrder}`,
                recipientEmail: patient.email,
                subject,
                status: resp.success ? 'sent' : 'failed',
                eventKey,
            });

            if (resp.success) fired++;
        } else {
            // No email address — fire staff alert to contact manually
            const teamEmails = TEAM_ALERT_RECIPIENTS.split(',').map(e => e.trim()).filter(Boolean);
            const waLink = buildWhatsappLink(patient?.whatsapp_pais_code, null);

            const staffHtml = `
<div style="font-family:sans-serif;max-width:480px;">
  <h3>⚠️ Prospecto sin contacto — acción requerida</h3>
  <p><strong>Paciente:</strong> ${patient?.nombre || 'Sin nombre'} (sin email)</p>
  <p><strong>Días en etapa:</strong> ${daysInStage}</p>
  <p><strong>SLA excedido:</strong> ${slaThreshold} días</p>
  ${waLink ? `<p><a href="${waLink}">Contactar por WhatsApp</a></p>` : ''}
  <p><a href="${APP_URL}/workflows">Ver en sistema →</a></p>
</div>`;

            await Promise.all(teamEmails.map(async email => {
                const resp = await EmailService.send({
                    to: email,
                    subject: `⚠️ Prospecto SLA: ${patient?.nombre || 'Paciente'} — contacto manual requerido`,
                    html: staffHtml,
                });
                await logProspectEvent({
                    treatmentId: prospect.id,
                    stageId: prospect.current_stage_id,
                    eventType: 'prospect_staff_reminder_no_email',
                    recipientEmail: email,
                    status: resp.success ? 'sent' : 'failed',
                    eventKey: `${eventKey}::staff::${email}`,
                });
            }));

            fired++;
        }
    }

    return { checked: prospects.length, fired, skipped };
}

/**
 * Update prospect metadata (interest, budget, urgency) without changing stage.
 */
export async function updateProspectDetails(
    treatmentId: string,
    details: {
        main_interest?: ProspectMainInterest;
        budget_range?: ProspectBudgetRange;
        urgency?: ProspectUrgency;
        notes?: string;
    }
) {
    const supabase = await createClient();

    const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
    };
    if (details.main_interest !== undefined) updates.prospect_main_interest = details.main_interest;
    if (details.budget_range !== undefined) updates.prospect_budget_range = details.budget_range;
    if (details.urgency !== undefined) updates.prospect_urgency = details.urgency;

    const { error } = await supabase
        .from('patient_treatments')
        .update(updates)
        .eq('id', treatmentId);

    if (error) return { success: false, error: error.message };

    if (details.notes) {
        await supabase.from('treatment_history').insert({
            treatment_id: treatmentId,
            comments: `Nota: ${details.notes}`,
        });
    }

    revalidatePath('/prospectos');
    return { success: true };
}
