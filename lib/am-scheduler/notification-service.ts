/**
 * AM-Scheduler — Notification Service
 * Handles Email (Resend) and WhatsApp (Twilio) reminders.
 * Called by /api/agenda/remind (cron) or triggered on status change.
 */

import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service';
import type { EmailMessageType } from '@/lib/email-message-tracking';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://am-clinica.ar';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppointmentNotificationContext {
  appointmentId: string;
  ruleId?: string;
  templateKey: string;
  channel: 'email' | 'whatsapp' | 'both';
  patientName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  doctorName?: string | null;
  startTime: string;  // ISO
  endTime: string;    // ISO
  appointmentType?: string;
  clinicName?: string;
  surveyToken?: string;
  idempotencyKey?: string;
}

export interface NotificationResult {
  success: boolean;
  emailId?: string;
  whatsappId?: string;
  error?: string;
}

// ─── Template Renderer ────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

interface TemplateOutput { subject: string; html: string; whatsapp: string }

export function renderTemplate(
  key: string,
  ctx: AppointmentNotificationContext
): TemplateOutput {
  const clinic = ctx.clinicName ?? 'AM Clínica';
  const dateStr = formatDateTime(ctx.startTime);
  const timeStr = formatTime(ctx.startTime);
  const doctor = ctx.doctorName ? `Dr/a. ${ctx.doctorName}` : clinic;

  const baseStyle = `
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    max-width: 520px; margin: 0 auto; padding: 40px 32px;
    background: #fff; border-radius: 16px;
  `;

  const logoBlock = `
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#111;">
        AM<span style="color:#3b82f6;">·</span>Clínica
      </span>
    </div>
  `;

  const footer = `
    <p style="font-size:12px;color:#9ca3af;margin-top:40px;text-align:center;">
      ${clinic} · Turno #${ctx.appointmentId.slice(-6).toUpperCase()}
      <br>Este mensaje fue generado automáticamente por AM-Scheduler.
    </p>
  `;

  switch (key) {
    case 'reminder_24h':
      return {
        subject: `Recordatorio: Tu turno mañana a las ${timeStr} — ${clinic}`,
        whatsapp: `Hola ${ctx.patientName} 👋\n\nTe recordamos tu turno en *${clinic}* mañana a las *${timeStr}* con *${doctor}*.\n\nPor favor confirmá tu asistencia respondiendo *SI* o escribinos si necesitás reprogramar.\n\n_${clinic}_`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">
            Recordatorio de turno
          </h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Te recordamos que tenés un turno programado para mañana.
          </p>
          <div style="background:#f0f9ff;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Fecha y hora</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#111;">${dateStr}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#374151;">Con ${doctor}</p>
          </div>
          <p style="color:#6b7280;font-size:14px;">
            Por favor confirmá tu asistencia respondiendo a este correo o comunicándote con la clínica.
          </p>
          ${footer}
        </div>`,
      };

    case 'reminder_1h':
      return {
        subject: `Tu turno es en 1 hora · ${timeStr} — ${clinic}`,
        whatsapp: `⏰ *${ctx.patientName}*, tu turno en *${clinic}* es en 1 hora (${timeStr}).\n\nTe esperamos con ${doctor}. ¡Nos vemos pronto! 😊`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Tu turno es en 1 hora</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>, ¡ya casi es tu momento!
          </p>
          <div style="background:#fef3c7;border-radius:12px;padding:20px 24px;margin-bottom:24px;">
            <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#92400e;">Hoy a las ${timeStr}</p>
            <p style="margin:0;font-size:14px;color:#78350f;">Con ${doctor}</p>
          </div>
          <p style="color:#6b7280;font-size:14px;">
            Recordá llegar unos minutos antes para completar el ingreso.
          </p>
          ${footer}
        </div>`,
      };

    case 'appointment_confirmed':
      return {
        subject: `Turno confirmado · ${dateStr} — ${clinic}`,
        whatsapp: `✅ *Turno confirmado*\n\nHola ${ctx.patientName}, tu turno en *${clinic}* quedó agendado para el *${dateStr}* con *${doctor}*.\n\n¡Te esperamos! 🦷`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Turno confirmado ✓</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Tu turno ha sido agendado exitosamente.
          </p>
          <div style="background:#f0fdf4;border-radius:12px;padding:20px 24px;margin-bottom:24px;border:1px solid #bbf7d0;">
            <p style="margin:0 0 6px;font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Fecha y hora</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#111;">${dateStr}</p>
            <p style="margin:8px 0 0;font-size:14px;color:#374151;">Con ${doctor}</p>
          </div>
          ${footer}
        </div>`,
      };

    case 'appointment_cancelled':
      return {
        subject: `Turno cancelado — ${clinic}`,
        whatsapp: `❌ Tu turno en *${clinic}* del *${dateStr}* ha sido cancelado.\n\nSi querés reprogramar, comunicate con nosotros. ¡Hasta pronto! 🙏`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Turno cancelado</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Tu turno del <strong>${dateStr}</strong> ha sido cancelado.
          </p>
          <p style="color:#6b7280;font-size:14px;">
            Podés reprogramar cuando quieras comuniándote con nosotros.
          </p>
          ${footer}
        </div>`,
      };

    case 'survey_post_appointment':
      return {
        subject: `¿Cómo fue tu visita? — ${clinic}`,
        whatsapp: `😊 Hola ${ctx.patientName}!\n\n¿Cómo fue tu turno con *${doctor}*?\n\nNos tomaría solo 30 segundos si dejás tu opinión aquí:\n👉 ${APP_URL}/survey/${ctx.surveyToken}\n\n¡Gracias! ⭐ *${clinic}*`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">¿Cómo fue tu visita?</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Nos interesa saber cómo fue tu experiencia en ${clinic}.
          </p>
          <a href="${APP_URL}/survey/${ctx.surveyToken}"
            style="display:inline-block;background:#3b82f6;color:#fff;text-decoration:none;
                   padding:14px 28px;border-radius:10px;font-weight:600;font-size:15px;
                   margin-bottom:24px;">
            Dejar mi opinión →
          </a>
          ${footer}
        </div>`,
      };

    case 'birthday_greeting':
      return {
        subject: `¡Feliz Cumpleaños! 🎉 — ${clinic}`,
        whatsapp: `🎉 ¡Muy feliz cumpleaños *${ctx.patientName}*! 🎂\n\nDe parte de todo el equipo de *${clinic}* te deseamos un excelente día. Recordá que tu sonrisa es tu mejor regalo. 😁🥂`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">¡Feliz Cumpleaños! 🎉</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            ¡Te deseamos que pases un hermoso día rodeado de tus seres queridos! 🎂🥂
          </p>
          ${footer}
        </div>`,
      };

    case 'post_treatment_followup':
      return {
        subject: `¿Cómo te sentís hoy? — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* 👋, nos comunicamos de *${clinic}* para saber cómo venís evolucionando después de tu atención de ayer.\n\nSi tenés alguna molestia o duda, avisanos por este medio. ¡Que sigas muy bien! 🩺`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Seguimiento post-atención</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Nos comunicamos para saber cómo te sentís hoy después de tu visita. Si tenés alguna duda, estamos a tu disposición.
          </p>
          ${footer}
        </div>`,
      };

    case 'recall_6_months':
      return {
        subject: `Es momento de tu control preventivo 🦷 — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* 👋, ya pasaron 6 meses desde tu última visita a *${clinic}*.\n\nPara mantener tu sonrisa saludable, te recomendamos agendar un control preventivo. Escribinos para coordinar un horario. ✨`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Control Preventivo 🦷</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Ya han pasado 6 meses desde tu última visita. Te recomendamos agendar un turno para control preventivo y limpieza.
          </p>
          ${footer}
        </div>`,
      };

    case 'recall_cleaning':
      return {
        subject: `Te toca tu limpieza preventiva — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* 👋\n\nYa estas en ventana para tu limpieza preventiva en *${clinic}*.\n\nSi queres, te ayudamos a reservar un horario esta semana.`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Limpieza preventiva</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Este es un buen momento para agendar tu limpieza preventiva y mantener el resultado de tus tratamientos.
          </p>
          <p style="color:#6b7280;font-size:14px;">
            Si te viene bien, podemos proponerte un horario esta semana y dejarlo resuelto por este mismo medio.
          </p>
          ${footer}
        </div>`,
      };

    case 'upgrade_cleaning_laser':
      return {
        subject: `Tu proxima limpieza puede ser con laser — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* ✨\n\nEn tu proxima limpieza podemos ofrecerte la version con laser para una experiencia mas profunda y comoda.\n\nSi queres, te contamos opciones y valores.`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Upgrade a limpieza con laser</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            En tu proxima limpieza podemos ofrecerte la version con laser, ideal para potenciar confort, precision y mantenimiento.
          </p>
          <div style="background:#f8fafc;border-radius:12px;padding:18px 20px;margin-bottom:24px;border:1px solid #e2e8f0;">
            <p style="margin:0 0 6px;font-size:14px;font-weight:600;color:#111;">¿Cuando conviene?</p>
            <p style="margin:0;font-size:14px;color:#475569;">Especialmente cuando queres una higiene mas completa o sumar una experiencia premium a tu control habitual.</p>
          </div>
          <p style="color:#6b7280;font-size:14px;">
            Si te interesa, te respondemos por este medio con disponibilidad y diferencia de valor.
          </p>
          ${footer}
        </div>`,
      };

    case 'recall_veneer_control':
      return {
        subject: `Control recomendado de tus carillas — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* 👋\n\nYa estas en fecha para tu control de carillas en *${clinic}*.\n\nSi queres, coordinamos una revision para comprobar que todo siga impecable.`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Control de carillas</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Ya estas en la ventana recomendada para revisar tus carillas y asegurarnos de que todo siga estable, funcional y estetico.
          </p>
          <p style="color:#6b7280;font-size:14px;">
            Un control a tiempo ayuda a detectar pequenos ajustes antes de que se conviertan en un problema mayor.
          </p>
          ${footer}
        </div>`,
      };

    case 'cross_sell_cleaning_after_veneers':
      return {
        subject: `Sumemos una limpieza a tu control de carillas — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* ✨\n\nCuando vengas a tu control de carillas, tambien podemos sumar una limpieza para mantener brillo, higiene y salud gingival en la misma visita.`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Control + limpieza en una sola visita</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Cuando vengas a tu control de carillas, podemos aprovechar la misma visita para realizar una limpieza y mantener el entorno dental en optimas condiciones.
          </p>
          <div style="background:#fff7ed;border-radius:12px;padding:18px 20px;margin-bottom:24px;border:1px solid #fdba74;">
            <p style="margin:0;font-size:14px;color:#9a3412;">
              Es una buena combinacion cuando queres cuidar tanto la estetica de las carillas como la salud general de encia y esmalte.
            </p>
          </div>
          ${footer}
        </div>`,
      };

    case 'recall_whitening':
      return {
        subject: `Mantenimiento de blanqueamiento — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* ✨\n\nSi queres sostener o reforzar el resultado de tu blanqueamiento, este es un buen momento para evaluarlo juntos.`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Mantenimiento de blanqueamiento</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Si queres mantener o refrescar el resultado de tu blanqueamiento, podemos evaluar una nueva sesion o un plan de mantenimiento segun tu caso.
          </p>
          <p style="color:#6b7280;font-size:14px;">
            Te orientamos rapido para ver si conviene repetir ahora o esperar un poco mas.
          </p>
          ${footer}
        </div>`,
      };

    case 'recall_orthodontic_control':
      return {
        subject: `Control de ortodoncia recomendado — ${clinic}`,
        whatsapp: `Hola *${ctx.patientName}* 👋\n\nYa estas en momento de revisar tu evolucion de ortodoncia o recambio. Si queres, coordinamos un control en *${clinic}*.`,
        html: `<div style="${baseStyle}">${logoBlock}
          <h2 style="font-size:20px;font-weight:700;color:#111;margin:0 0 8px;">Control de ortodoncia</h2>
          <p style="color:#6b7280;font-size:15px;margin:0 0 24px;">
            Hola <strong>${ctx.patientName}</strong>,<br>
            Ya estas en una buena ventana para revisar tu evolucion de ortodoncia, hacer control clinico y definir si corresponde algun ajuste o recambio.
          </p>
          <p style="color:#6b7280;font-size:14px;">
            Si te sirve, te proponemos un horario para dejarlo resuelto cuanto antes.
          </p>
          ${footer}
        </div>`,
      };

    default:
      return {
        subject: `Notificación de ${clinic}`,
        whatsapp: `Hola ${ctx.patientName}, tienes un aviso de ${clinic}.`,
        html: `<div style="${baseStyle}">${logoBlock}<p>Tienes un aviso de ${clinic}.</p>${footer}</div>`,
      };
  }
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
  doctorName: string | null
) {
  const supabase = createAdminClient();

  // Resolve actual patient_id if not provided
  let actualPatientId = patientId;
  if (!actualPatientId) {
    const { data: appt } = await supabase
      .from('agenda_appointments')
      .select('patient_id')
      .eq('id', appointmentId)
      .single();
    if (appt) {
      actualPatientId = appt.patient_id;
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
