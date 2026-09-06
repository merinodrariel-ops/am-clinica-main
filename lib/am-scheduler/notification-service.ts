/**
 * AM-Scheduler — Notification Service
 * Handles Email (Resend) and WhatsApp (Twilio) reminders.
 * Called by /api/agenda/remind (cron) or triggered on status change.
 */

import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service.server';
import type { EmailMessageType } from '@/lib/email-message-tracking';
import {
  renderTemplate,
  type AppointmentNotificationContext,
} from '@/lib/am-scheduler/notification-templates';
export type { AppointmentNotificationContext } from '@/lib/am-scheduler/notification-templates';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NotificationResult {
  success: boolean;
  emailId?: string;
  whatsappId?: string;
  error?: string;
}

// ─── Email Sender (Resend) ────────────────────────────────────────────────────

async function sendEmail(ctx: AppointmentNotificationContext): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!ctx.patientEmail) return { success: false, error: 'No email address' };

  let html: string;
  let subject: string;

  if (ctx.templateKey === 'survey_first_visit') {
    try {
      const { render } = await import('@react-email/render');
      const { SurveyFirstVisitEmail } = await import('@/emails/SurveyFirstVisit');
      html = await render(SurveyFirstVisitEmail({
        patientName: ctx.patientName,
        surveyToken: ctx.surveyToken ?? '',
      }));
      subject = `¿Cómo fue tu primera visita? — ${ctx.clinicName ?? 'AM Clínica'}`;
    } catch {
      console.error('[AM-Scheduler] Error rendering SurveyFirstVisitEmail');
      return { success: false, error: 'Failed to render email template' };
    }
  } else {
    const template = renderTemplate(ctx.templateKey, ctx);
    html = template.html;
    subject = template.subject;
  }

  try {
    const messageTypeByTemplate: Record<string, EmailMessageType> = {
      reminder_24h: 'appointment_reminder',
      reminder_1h: 'appointment_reminder',
      appointment_confirmed: 'appointment_confirmation',
      appointment_cancelled: 'appointment_cancellation',
      survey_first_visit: 'survey_first_visit',
      survey_post_appointment: 'survey_post_appointment',
      post_treatment_followup: 'treatment_followup',
    };

    const response = await EmailService.send({
      to: ctx.patientEmail,
      subject,
      html,
      idempotencyKey: ctx.idempotencyKey,
      messageType: messageTypeByTemplate[ctx.templateKey] ?? 'other',
      sourceModule: 'agenda',
      templateKey: ctx.templateKey,
      appointmentId: ctx.appointmentId,
      toName: ctx.patientName,
      payload: {
        patientName: ctx.patientName,
        doctorName: ctx.doctorName,
        startTime: ctx.startTime,
        appointmentType: ctx.appointmentType,
      },
    });

    if (!response.success) return { success: false, error: String(response.error || 'Error sending email') };
    return { success: true, id: response.id };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ─── WhatsApp Sender (Twilio) ─────────────────────────────────────────────────

async function sendWhatsApp(ctx: AppointmentNotificationContext): Promise<{ success: boolean; id?: string; error?: string }> {
  if (!ctx.patientPhone) return { success: false, error: 'No phone number' };

  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM_WA = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.warn('[AM-Scheduler] Twilio credentials not configured — skipping WhatsApp');
    return { success: false, error: 'Twilio not configured' };
  }

  const { whatsapp: body } = renderTemplate(ctx.templateKey, ctx);

  // Normalize phone: ensure E.164 format for Argentina (+549...)
  const phone = ctx.patientPhone.replace(/\D/g, '');
  const e164 = phone.startsWith('54') ? `+${phone}` : `+54${phone}`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: FROM_WA,
          To: `whatsapp:${e164}`,
          Body: body,
        }),
      }
    );

    const json = await response.json() as { sid?: string; message?: string };
    if (!response.ok) return { success: false, error: json.message ?? 'Twilio error' };
    return { success: true, id: json.sid };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export async function sendWhatsAppMessage(
  recipientPhone: string,
  body: string
): Promise<{ success: boolean; id?: string; error?: string }> {
  const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
  const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
  const FROM_WA = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

  if (!ACCOUNT_SID || !AUTH_TOKEN) {
    console.warn('[AM-Scheduler] Twilio credentials not configured — skipping WhatsApp');
    return { success: false, error: 'Twilio not configured' };
  }

  const phone = recipientPhone.replace(/\D/g, '');
  const e164 = phone.startsWith('54') ? `+${phone}` : `+54${phone}`;

  try {
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')}`,
        },
        body: new URLSearchParams({
          From: FROM_WA,
          To: `whatsapp:${e164}`,
          Body: body,
        }),
      }
    );

    const json = await response.json() as { sid?: string; message?: string };
    if (!response.ok) return { success: false, error: json.message ?? 'Twilio error' };
    return { success: true, id: json.sid };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Persist intent before calling providers: a failed write must never lead to an untracked send.
async function reserveNotification(
  supabase: ReturnType<typeof createAdminClient>,
  ctx: AppointmentNotificationContext,
  channel: 'email' | 'whatsapp',
) {
  const { data, error } = await supabase.from('notification_logs').insert({
    appointment_id: ctx.appointmentId,
    rule_id: ctx.ruleId ?? null,
    channel,
    recipient_email: channel === 'email' ? ctx.patientEmail : null,
    recipient_phone: channel === 'whatsapp' ? ctx.patientPhone : null,
    template_key: ctx.templateKey,
    payload: {
      patientName: ctx.patientName,
      doctorName: ctx.doctorName,
      startTime: ctx.startTime,
      endTime: ctx.endTime,
      appointmentType: ctx.appointmentType,
      idempotencyKey: ctx.idempotencyKey ?? null,
    },
    status: 'pending',
  }).select('id').single();
  return error || !data?.id ? null : data.id as string;
}

export async function sendNotification(
  ctx: AppointmentNotificationContext,
  dependencies = { createAdminClient, sendEmail, sendWhatsApp },
): Promise<NotificationResult> {
  const supabase = dependencies.createAdminClient();
  const delivered = new Map<string, string | undefined>();
  const pending = new Set<string>();
  if (ctx.idempotencyKey) {
    let query = supabase.from('notification_logs').select('channel, status, payload, provider_id')
      .eq('appointment_id', ctx.appointmentId).eq('template_key', ctx.templateKey).in('status', ['sent', 'pending']);
    query = ctx.ruleId ? query.eq('rule_id', ctx.ruleId) : query.is('rule_id', null);
    const { data, error } = await query;
    if (error) return { success: false, error: 'Notification history unavailable' };
    for (const row of data ?? []) {
      // New records identify the exact event; legacy reminder logs include its start time.
      const payload = row.payload as { idempotencyKey?: string; startTime?: string } | null;
      if (payload?.idempotencyKey && payload.idempotencyKey !== ctx.idempotencyKey) continue;
      if (!payload?.idempotencyKey && ctx.ruleId && payload?.startTime
        && new Date(payload.startTime).getTime() !== new Date(ctx.startTime).getTime()) continue;
      if (row.status === 'sent') delivered.set(row.channel, row.provider_id ?? undefined);
      else pending.add(row.channel);
    }
  }
  const channels: Array<'email' | 'whatsapp'> = ctx.channel === 'both' ? ['email', 'whatsapp'] : [ctx.channel];
  const result: NotificationResult = { success: true };
  const failures: string[] = [];
  for (const channel of channels) {
    if (delivered.has(channel)) {
      if (channel === 'email') result.emailId = delivered.get(channel);
      else result.whatsappId = delivered.get(channel);
      continue;
    }
    if (pending.has(channel)) {
      failures.push(`${channel}: delivery pending reconciliation`);
      continue;
    }
    let logId: string | null;
    try { logId = await reserveNotification(supabase, ctx, channel); }
    catch { logId = null; }
    if (!logId) {
      failures.push(`${channel}: notification log reservation failed`);
      continue;
    }
    let sent: { success: boolean; id?: string; error?: string };
    try {
      sent = await (channel === 'email' ? dependencies.sendEmail(ctx) : dependencies.sendWhatsApp(ctx));
    } catch {
      // An exception leaves delivery uncertain; retain pending instead of replaying a possible send.
      failures.push(`${channel}: delivery outcome unavailable`);
      continue;
    }
    if (sent.success) {
      if (channel === 'email') result.emailId = sent.id;
      else result.whatsappId = sent.id;
    }
    try {
      const { error } = await supabase.from('notification_logs').update({
        status: sent.success ? 'sent' : 'failed', provider_id: sent.id ?? null,
        error_message: sent.error ?? null, sent_at: sent.success ? new Date().toISOString() : null,
      }).eq('id', logId);
      if (error) failures.push(`${channel}: notification log update failed; reconciliation required`);
    } catch {
      failures.push(`${channel}: notification log update failed; reconciliation required`);
    }
    if (!sent.success) failures.push(`${channel}: delivery failed`);
  }
  if (failures.length) { result.success = false; result.error = failures.join('; '); }
  return result;
}

// ─── Survey Creator ───────────────────────────────────────────────────────────

export async function createAndSendSurvey(
  appointmentId: string,
  patientId: string | null,
  patientName: string,
  patientPhone: string | null,
  patientEmail: string | null,
  doctorName: string | null,
  appointmentType?: string,
  dependencies = { createAdminClient, sendNotification },
): Promise<NotificationResult> {
  const supabase = dependencies.createAdminClient();

  // Resolve actual patient_id and appointment type if not provided
  let actualPatientId = patientId;
  let actualAppointmentType = appointmentType;

  {
    const { data: appt, error: appointmentError } = await supabase
      .from('agenda_appointments')
      .select('patient_id, type, survey_sent_at')
      .eq('id', appointmentId)
      .single();
    if (appointmentError || !appt) return { success: false, error: 'Appointment lookup failed' };
    if (appt.survey_sent_at) return { success: true };
    if (appt) {
      actualPatientId = appt.patient_id;
      actualAppointmentType = actualAppointmentType || appt.type;
    }
  }

  // Detect if it is the first completed visit for this patient
  let isFirstCompletedVisit = false;
  if (actualPatientId) {
    const { count, error: countErr } = await supabase
      .from('agenda_appointments')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', actualPatientId)
      .eq('status', 'completed');
    
    if (!countErr && count !== null) {
      isFirstCompletedVisit = count <= 1;
    }
  }

  // Determine channel and template based on patient contact info and first-visit status
  let channel: 'email' | 'whatsapp' | 'both' = 'whatsapp';
  let templateKey = 'survey_post_appointment';

  if (isFirstCompletedVisit && patientEmail) {
    channel = 'email';
    templateKey = 'survey_first_visit';
  } else if (patientEmail && (!patientPhone || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN)) {
    channel = 'email';
    templateKey = 'survey_post_appointment';
  } else if (patientPhone) {
    channel = 'whatsapp';
    templateKey = 'survey_post_appointment';
  } else {
    console.warn('[AM-Scheduler] Patient has no phone nor email — cannot dispatch survey:', appointmentId);
    return { success: false, error: 'No contact channel' };
  }

  // Reuse the token after failed deliveries so retries keep the same survey link.
  const { data: existing, error: lookupError } = await supabase
    .from('satisfaction_surveys').select('token')
    .eq('appointment_id', appointmentId).order('created_at', { ascending: true }).limit(1).maybeSingle();
  if (lookupError) return { success: false, error: 'Survey lookup failed' };
  const { data: survey, error } = existing
    ? { data: existing, error: null }
    : await supabase.from('satisfaction_surveys')
      .insert({ appointment_id: appointmentId, patient_id: actualPatientId })
      .select('token').single();
  if (error || !survey) return { success: false, error: 'Survey creation failed' };

  const result = await dependencies.sendNotification({
    appointmentId,
    templateKey,
    channel,
    patientName,
    patientEmail,
    patientPhone,
    doctorName,
    appointmentType: actualAppointmentType,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    surveyToken: survey.token,
    idempotencyKey: `survey-${appointmentId}`,
  });

  if (!result.success) return result;

  // Mark only successful deliveries; failed sends remain eligible for retry.
  const { error: markError } = await supabase
    .from('agenda_appointments')
    .update({ survey_sent_at: new Date().toISOString() })
    .eq('id', appointmentId);
  if (markError) return { success: false, error: 'Survey delivery marker failed' };
  await supabase.from('satisfaction_surveys').update({ sent_at: new Date().toISOString() }).eq('token', survey.token);
  return result;
}
