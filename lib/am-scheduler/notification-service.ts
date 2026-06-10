/**
 * AM-Scheduler — Notification Service
 * Handles Email (Resend) and WhatsApp (Twilio) reminders.
 * Called by /api/agenda/remind (cron) or triggered on status change.
 */

import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service';
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
    } catch (renderErr) {
      console.error('[AM-Scheduler] Error rendering SurveyFirstVisitEmail:', renderErr);
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

// ─── Log to Supabase ──────────────────────────────────────────────────────────

async function logNotification(
  ctx: AppointmentNotificationContext,
  channel: 'email' | 'whatsapp',
  result: { success: boolean; id?: string; error?: string }
) {
  try {
    const supabase = createAdminClient();
    await supabase.from('notification_logs').insert({
      appointment_id: ctx.appointmentId,
      rule_id: ctx.ruleId ?? null,
      channel,
      recipient_email: channel === 'email' ? ctx.patientEmail : null,
      recipient_phone: channel === 'whatsapp' ? ctx.patientPhone : null,
      template_key: ctx.templateKey,
      payload: { patientName: ctx.patientName, doctorName: ctx.doctorName, startTime: ctx.startTime },
      status: result.success ? 'sent' : 'failed',
      provider_id: result.id ?? null,
      error_message: result.error ?? null,
      sent_at: result.success ? new Date().toISOString() : null,
    });
  } catch (err) {
    console.error('[AM-Scheduler] Failed to log notification:', err);
  }
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export async function sendNotification(ctx: AppointmentNotificationContext): Promise<NotificationResult> {
  const results: NotificationResult = { success: false };

  if (ctx.channel === 'email' || ctx.channel === 'both') {
    const emailResult = await sendEmail(ctx);
    await logNotification(ctx, 'email', emailResult);
    if (emailResult.success) {
      results.success = true;
      results.emailId = emailResult.id;
    } else {
      results.error = emailResult.error;
    }
  }

  if (ctx.channel === 'whatsapp' || ctx.channel === 'both') {
    const waResult = await sendWhatsApp(ctx);
    await logNotification(ctx, 'whatsapp', waResult);
    if (waResult.success) {
      results.success = true;
      results.whatsappId = waResult.id;
    } else if (!results.success) {
      results.error = waResult.error;
    }
  }

  return results;
}

// ─── Survey Creator ───────────────────────────────────────────────────────────

export async function createAndSendSurvey(
  appointmentId: string,
  patientId: string | null,
  patientName: string,
  patientPhone: string | null,
  patientEmail: string | null,
  doctorName: string | null,
  appointmentType?: string
) {
  const supabase = createAdminClient();

  // Resolve actual patient_id and appointment type if not provided
  let actualPatientId = patientId;
  let actualAppointmentType = appointmentType;

  if (!actualPatientId || !actualAppointmentType) {
    const { data: appt } = await supabase
      .from('agenda_appointments')
      .select('patient_id, type')
      .eq('id', appointmentId)
      .single();
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

  // Create survey record
  const { data: survey, error } = await supabase
    .from('satisfaction_surveys')
    .insert({ 
      appointment_id: appointmentId, 
      patient_id: actualPatientId, 
      sent_at: new Date().toISOString() 
    })
    .select('token')
    .single();

  if (error || !survey) {
    console.error('[AM-Scheduler] Failed to create survey:', error);
    return;
  }

  // Determine channel and template based on patient contact info and first-visit status
  let channel: 'email' | 'whatsapp' | 'both' = 'whatsapp';
  let templateKey = 'survey_post_appointment';

  if (isFirstCompletedVisit && patientEmail) {
    channel = 'email';
    templateKey = 'survey_first_visit';
  } else if (!patientPhone && patientEmail) {
    channel = 'email';
    templateKey = 'survey_post_appointment';
  } else if (patientPhone) {
    channel = 'whatsapp';
    templateKey = 'survey_post_appointment';
  } else {
    console.warn('[AM-Scheduler] Patient has no phone nor email — cannot dispatch survey:', appointmentId);
    return;
  }

  await sendNotification({
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
  });

  // Mark appointment as survey sent
  await supabase
    .from('agenda_appointments')
    .update({ survey_sent_at: new Date().toISOString() })
    .eq('id', appointmentId);
}
