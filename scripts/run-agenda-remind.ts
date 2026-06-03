import { createRecallsFromAppointment } from '../app/actions/recalls';
import { render } from '@react-email/render';
import { SurveyFirstVisitEmail } from '../emails/SurveyFirstVisit';
import {
  getAutoCompleteSurveyWindow,
  shouldAutoCompleteForSurvey,
} from '../lib/am-scheduler/auto-complete-surveys';
import { sendResendEmail } from '../lib/resend-email';
import { createAdminClient } from '../utils/supabase/admin';

type PatientRow = {
  nombre: string | null;
  apellido: string | null;
  whatsapp: string | null;
  email: string | null;
} | PatientRow[] | null;

type DoctorRow = {
  full_name: string | null;
} | DoctorRow[] | null;

type AutoCompleteRow = {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  type: string | null;
  status: string | null;
  start_time: string;
  end_time: string;
  patient: PatientRow;
  doctor: DoctorRow;
};

function firstRelation<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');

async function sendWhatsAppMessage(recipientPhone: string, body: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromWa = process.env.TWILIO_WHATSAPP_FROM ?? 'whatsapp:+14155238886';

  if (!accountSid || !authToken) {
    return { success: false, error: 'Twilio not configured' };
  }

  const phone = recipientPhone.replace(/\D/g, '');
  const e164 = phone.startsWith('54') ? `+${phone}` : `+54${phone}`;

  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        From: fromWa,
        To: `whatsapp:${e164}`,
        Body: body,
      }),
    },
  );

  const json = await response.json() as { sid?: string; message?: string };
  if (!response.ok) return { success: false, error: json.message ?? 'Twilio error' };
  return { success: true, id: json.sid };
}

async function logNotification(params: {
  supabase: ReturnType<typeof createAdminClient>;
  appointmentId: string;
  channel: 'email' | 'whatsapp';
  templateKey: string;
  patientName: string;
  doctorName: string | null;
  startTime: string;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  result: { success: boolean; id?: string; error?: string };
}) {
  await params.supabase.from('notification_logs').insert({
    appointment_id: params.appointmentId,
    rule_id: null,
    channel: params.channel,
    recipient_email: params.channel === 'email' ? params.recipientEmail : null,
    recipient_phone: params.channel === 'whatsapp' ? params.recipientPhone : null,
    template_key: params.templateKey,
    payload: {
      patientName: params.patientName,
      doctorName: params.doctorName,
      startTime: params.startTime,
    },
    status: params.result.success ? 'sent' : 'failed',
    provider_id: params.result.id ?? null,
    error_message: params.result.error ?? null,
    sent_at: params.result.success ? new Date().toISOString() : null,
  });
}

async function createAndSendSurveyFromScript(params: {
  supabase: ReturnType<typeof createAdminClient>;
  appointmentId: string;
  patientId: string | null;
  patientName: string;
  patientPhone: string | null;
  patientEmail: string | null;
  doctorName: string | null;
  startTime: string;
}) {
  const { supabase } = params;

  const { count } = params.patientId
    ? await supabase
      .from('agenda_appointments')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', params.patientId)
      .eq('status', 'completed')
    : { count: null };

  const isFirstCompletedVisit = count !== null && count <= 1;

  const { data: survey, error: surveyError } = await supabase
    .from('satisfaction_surveys')
    .insert({
      appointment_id: params.appointmentId,
      patient_id: params.patientId,
      sent_at: new Date().toISOString(),
    })
    .select('token')
    .single();

  if (surveyError || !survey?.token) {
    return { success: false, error: surveyError?.message ?? 'Failed to create survey' };
  }

  let channel: 'email' | 'whatsapp' = 'whatsapp';
  let templateKey = 'survey_post_appointment';
  let sendResult: { success: boolean; id?: string; error?: string };

  if (isFirstCompletedVisit && params.patientEmail) {
    channel = 'email';
    templateKey = 'survey_first_visit';
    const html = await render(SurveyFirstVisitEmail({
      patientName: params.patientName,
      surveyToken: survey.token,
    }));
    sendResult = await sendResendEmail({
      to: params.patientEmail,
      subject: '¿Cómo fue tu primera visita? — AM Clínica',
      html,
      idempotencyKey: `survey-first-visit-${params.appointmentId}`,
    });
  } else if (
    params.patientPhone &&
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN
  ) {
    const doctor = params.doctorName ? `Dr/a. ${params.doctorName}` : 'AM Clínica';
    sendResult = await sendWhatsAppMessage(
      params.patientPhone,
      `😊 Hola ${params.patientName}!\n\n¿Cómo fue tu turno con *${doctor}*?\n\nNos tomaría solo 30 segundos si dejás tu opinión aquí:\n👉 ${APP_URL}/survey/${survey.token}\n\n¡Gracias! ⭐ *AM Clínica*`,
    );
  } else if (params.patientEmail) {
    channel = 'email';
    const surveyUrl = `${APP_URL}/survey/${survey.token}`;
    sendResult = await sendResendEmail({
      to: params.patientEmail,
      subject: '¿Cómo fue tu visita? — AM Clínica',
      html: `<p>Hola ${params.patientName},</p><p>Nos interesa saber cómo fue tu experiencia en AM Clínica.</p><p><a href="${surveyUrl}">Dejar mi opinión</a></p>`,
      idempotencyKey: `survey-post-appointment-${params.appointmentId}`,
    });
  } else {
    return { success: false, error: 'Patient has no phone nor email' };
  }

  await logNotification({
    supabase,
    appointmentId: params.appointmentId,
    channel,
    templateKey,
    patientName: params.patientName,
    doctorName: params.doctorName,
    startTime: params.startTime,
    recipientEmail: params.patientEmail,
    recipientPhone: params.patientPhone,
    result: sendResult,
  });

  if (!sendResult.success) return sendResult;

  await supabase
    .from('agenda_appointments')
    .update({ survey_sent_at: new Date().toISOString() })
    .eq('id', params.appointmentId);

  return sendResult;
}

export async function runAgendaReminderCycle({ dryRun = false } = {}) {
  const supabase = createAdminClient();
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const autoWindow = getAutoCompleteSurveyWindow(nowDate);

  const result = {
    at: now,
    dryRun,
    autoCompleted: [] as string[],
    dispatched: [] as string[],
    warnings: [] as string[],
    failed: [] as string[],
  };

  const { data: autoCandidates, error: autoErr } = await supabase
    .from('agenda_appointments')
    .select(`
      id,
      patient_id,
      doctor_id,
      type,
      status,
      start_time,
      end_time,
      patient:pacientes(nombre, apellido, whatsapp, email),
      doctor:profiles!agenda_appointments_doctor_id_fkey(full_name)
    `)
    .gte('end_time', autoWindow.earliestEndTime)
    .lte('end_time', autoWindow.latestEndTime)
    .is('survey_sent_at', null)
    .not('patient_id', 'is', null)
    .not('status', 'in', '("cancelled","no_show","completed")');

  if (autoErr) {
    result.failed.push(`auto-complete-query:${autoErr.message}`);
    return result;
  }

  for (const apt of (autoCandidates as AutoCompleteRow[] ?? [])) {
    if (!shouldAutoCompleteForSurvey(apt, nowDate)) continue;

    const patient = firstRelation(apt.patient);
    const doctor = firstRelation(apt.doctor);
    const patientName = `${patient?.nombre ?? ''} ${patient?.apellido ?? ''}`.trim() || 'Paciente';

    if (dryRun) {
      result.autoCompleted.push(`dry:${apt.id}`);
      continue;
    }

    const { error: updateErr } = await supabase
      .from('agenda_appointments')
      .update({ status: 'completed', updated_at: now })
      .eq('id', apt.id)
      .is('survey_sent_at', null)
      .not('status', 'in', '("cancelled","no_show","completed")');

    if (updateErr) {
      result.failed.push(`auto-complete:${apt.id}:${updateErr.message}`);
      continue;
    }

    result.autoCompleted.push(apt.id);

    if (apt.patient_id && apt.type) {
      await createRecallsFromAppointment(
        apt.id,
        apt.type,
        apt.patient_id,
        apt.start_time,
        apt.doctor_id ?? null,
      ).catch((err) => {
        result.warnings.push(`recall:${apt.id}:${err instanceof Error ? err.message : String(err)}`);
      });
    }

    const surveyResult = await createAndSendSurveyFromScript({
      supabase,
      appointmentId: apt.id,
      patientId: apt.patient_id,
      patientName,
      patientPhone: patient?.whatsapp ?? null,
      patientEmail: patient?.email ?? null,
      doctorName: doctor?.full_name ?? null,
      startTime: apt.start_time,
    });

    if (surveyResult.success) {
      result.dispatched.push(`survey:auto:${apt.id}`);
    } else {
      result.failed.push(`survey:${apt.id}:${surveyResult.error ?? 'unknown error'}`);
    }
  }

  return result;
}

if (process.argv[1]?.endsWith('run-agenda-remind.ts')) {
  runAgendaReminderCycle({ dryRun: process.env.AGENDA_REMIND_DRY_RUN === '1' })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.failed.length > 0) process.exitCode = 1;
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
