import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentNotificationContext } from './notification-templates';
import type { NotificationResult } from './notification-service';
import { getAutoCompleteSurveyWindow, shouldAutoCompleteForSurvey } from './auto-complete-surveys';

interface ReminderRow {
  appointment_id: string; rule_id: string; template_key: string;
  channel: 'email' | 'whatsapp' | 'both'; patient_name: string;
  patient_email: string | null; patient_phone?: string | null; patient_whatsapp?: string | null;
  doctor_name: string | null; start_time: string; end_time: string; appointment_type: string;
}
interface SurveyRow {
  appointment_id: string; patient_name: string; patient_phone: string | null;
  patient_email: string | null; doctor_name: string | null;
}
interface Patient { nombre: string | null; apellido: string | null; whatsapp: string | null; email: string | null }
interface Candidate {
  id: string; patient_id: string | null; doctor_id: string | null; type: string | null;
  status: string | null; start_time: string; end_time: string;
  patient: Patient | Patient[] | null;
  doctor: { full_name: string | null } | { full_name: string | null }[] | null;
}
interface FailedReminderRow {
  appointment_id: string;
  rule_id: string;
  channel: 'email' | 'whatsapp';
  recipient_email: string | null;
  recipient_phone: string | null;
  template_key: string;
  payload: {
    patientName?: string;
    doctorName?: string | null;
    startTime?: string;
    endTime?: string;
    appointmentType?: string;
    idempotencyKey?: string;
  } | null;
}
export interface ReminderCycleDependencies {
  supabase: SupabaseClient;
  sendNotification: (context: AppointmentNotificationContext) => Promise<NotificationResult>;
  createAndSendSurvey: (
    appointmentId: string, patientId: string | null, patientName: string,
    patientPhone: string | null, patientEmail: string | null, doctorName: string | null,
    appointmentType?: string,
  ) => Promise<NotificationResult>;
  createRecalls: (id: string, type: string, patientId: string, date: string, doctorId: string | null) => Promise<void>;
}
export interface ReminderCycleOptions { dryRun?: boolean; now?: Date }

/** No provider calls, writes or recall creation are made in dry-run mode. */
export async function runReminderCycle(
  deps: ReminderCycleDependencies, { dryRun = false, now = new Date() }: ReminderCycleOptions = {},
) {
  const at = now.toISOString();
  const result = { at, dryRun, dispatched: [] as string[], failed: [] as string[],
    autoCompleted: [] as string[], warnings: [] as string[], surveys: 0 };
  const { supabase } = deps;
  const attemptedSurveys = new Set<string>();
  const processedReminderRules = new Set<string>();
  const attemptedReminderChannels = new Set<string>();

  function rememberReminderChannels(row: Pick<ReminderRow, 'appointment_id' | 'rule_id' | 'channel'>) {
    if (row.channel === 'email' || row.channel === 'both') {
      attemptedReminderChannels.add(`${row.appointment_id}:${row.rule_id}:email`);
    }
    if (row.channel === 'whatsapp' || row.channel === 'both') {
      attemptedReminderChannels.add(`${row.appointment_id}:${row.rule_id}:whatsapp`);
    }
  }

  // Each SQL RPC uses a ten-minute window while the scheduler runs every
  // fifteen minutes. Two overlapping checkpoints cover the full interval.
  async function readWindow(name: 'get_pending_reminders' | 'get_completed_for_survey') {
    const responses = await Promise.all([at, new Date(now.getTime() - 5 * 60_000).toISOString()]
      .map(p_now => supabase.rpc(name, { p_now })));
    return { data: responses.flatMap(response => response.data ?? []),
      error: responses.some(response => response.error) };
  }

  // The deployed RPC exposes patient_whatsapp; older installations expose patient_phone.
  const { data: reminders, error: reminderError } = await readWindow('get_pending_reminders');
  if (reminderError) result.failed.push('reminder-query');
  for (const row of (reminders ?? []) as ReminderRow[]) {
    const key = `${row.appointment_id}:${row.rule_id}`;
    if (processedReminderRules.has(key)) continue;
    processedReminderRules.add(key);
    rememberReminderChannels(row);
    if (dryRun) { result.dispatched.push(`dry:reminder:${key}`); continue; }
    try {
      const sent = await deps.sendNotification({
        appointmentId: row.appointment_id, ruleId: row.rule_id, templateKey: row.template_key,
        channel: row.channel, patientName: row.patient_name, patientEmail: row.patient_email,
        patientPhone: row.patient_whatsapp ?? row.patient_phone, doctorName: row.doctor_name,
        startTime: row.start_time, endTime: row.end_time, appointmentType: row.appointment_type,
        idempotencyKey: `reminder-${row.appointment_id}-${row.rule_id}-${new Date(row.start_time).getTime()}`,
      });
      (sent.success ? result.dispatched : result.failed).push(`reminder:${key}`);
    } catch { result.failed.push(`reminder:${key}`); }
  }

  // Recover only explicitly failed reminder channels from the last day. This
  // handles a partial "both" delivery without replaying the channel that sent.
  const retrySince = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  const { data: failedReminders, error: failedReminderError } = await supabase
    .from('notification_logs')
    .select('appointment_id, rule_id, channel, recipient_email, recipient_phone, template_key, payload')
    .eq('status', 'failed')
    .not('rule_id', 'is', null)
    .gte('created_at', retrySince);
  if (failedReminderError) result.failed.push('reminder-retry-query');
  for (const row of (failedReminders ?? []) as FailedReminderRow[]) {
    const payload = row.payload;
    const key = `${row.appointment_id}:${row.rule_id}:${row.channel}`;
    if (!payload?.idempotencyKey || !payload.startTime || !payload.endTime || attemptedReminderChannels.has(key)) continue;
    attemptedReminderChannels.add(key);
    if (dryRun) { result.dispatched.push(`dry:reminder-retry:${key}`); continue; }
    try {
      const sent = await deps.sendNotification({
        appointmentId: row.appointment_id,
        ruleId: row.rule_id,
        templateKey: row.template_key,
        channel: row.channel,
        patientName: payload.patientName || 'Paciente',
        patientEmail: row.recipient_email,
        patientPhone: row.recipient_phone,
        doctorName: payload.doctorName ?? null,
        startTime: payload.startTime,
        endTime: payload.endTime,
        appointmentType: payload.appointmentType,
        idempotencyKey: payload.idempotencyKey,
      });
      (sent.success ? result.dispatched : result.failed).push(`reminder-retry:${key}`);
    } catch { result.failed.push(`reminder-retry:${key}`); }
  }

  async function survey(row: SurveyRow, patientId: string | null = null, type?: string) {
    if (attemptedSurveys.has(row.appointment_id)) return;
    attemptedSurveys.add(row.appointment_id);
    result.surveys++;
    if (dryRun) { result.dispatched.push(`dry:survey:${row.appointment_id}`); return; }
    try {
      const sent = await deps.createAndSendSurvey(row.appointment_id, patientId, row.patient_name,
        row.patient_phone, row.patient_email, row.doctor_name, type);
      (sent.success ? result.dispatched : result.failed).push(`survey:${row.appointment_id}`);
    } catch { result.failed.push(`survey:${row.appointment_id}`); }
  }

  const window = getAutoCompleteSurveyWindow(now);
  const { data: candidates, error: candidateError } = await supabase.from('agenda_appointments')
    .select('id, patient_id, doctor_id, type, status, start_time, end_time, patient:pacientes(nombre, apellido, whatsapp, email), doctor:profiles!agenda_appointments_doctor_id_fkey(full_name)')
    .gte('end_time', window.earliestEndTime).lte('end_time', window.latestEndTime)
    .is('survey_sent_at', null).not('patient_id', 'is', null)
    .not('status', 'in', '("cancelled","no_show","completed")');
  if (candidateError) result.failed.push('auto-complete-query');
  for (const apt of (candidates ?? []) as Candidate[]) {
    if (!shouldAutoCompleteForSurvey(apt, now)) continue;
    if (dryRun) { result.autoCompleted.push(`dry:${apt.id}`); continue; }
    // Returning the updated row distinguishes ownership from a concurrent cancellation/completion.
    const { data: updated, error } = await supabase.from('agenda_appointments')
      .update({ status: 'completed', updated_at: at }).eq('id', apt.id)
      .is('survey_sent_at', null).not('status', 'in', '("cancelled","no_show","completed")').select('id');
    if (error) { result.failed.push(`auto-complete:${apt.id}`); continue; }
    if (!updated?.length) continue;
    result.autoCompleted.push(apt.id);
    if (apt.patient_id && apt.type) {
      try { await deps.createRecalls(apt.id, apt.type, apt.patient_id, apt.start_time, apt.doctor_id); }
      catch { result.warnings.push(`recall:${apt.id}`); }
    }
    const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient;
    const doctor = Array.isArray(apt.doctor) ? apt.doctor[0] : apt.doctor;
    await survey({ appointment_id: apt.id,
      patient_name: `${patient?.nombre ?? ''} ${patient?.apellido ?? ''}`.trim() || 'Paciente',
      patient_phone: patient?.whatsapp ?? null, patient_email: patient?.email ?? null,
      doctor_name: doctor?.full_name ?? null }, apt.patient_id, apt.type ?? undefined);
  }

  const { data: surveys, error: surveyError } = await readWindow('get_completed_for_survey');
  if (surveyError) result.failed.push('survey-query');
  for (const row of (surveys ?? []) as SurveyRow[]) await survey(row);

  // A survey row is created before delivery. Pending rows therefore identify
  // genuine attempts that failed, without sweeping untouched historical visits.
  const surveyCutoff = new Date(now.getTime() - 25 * 60_000).toISOString();
  const { data: surveyRetries, error: surveyRetryError } = await supabase
    .from('agenda_appointments')
    .select('id, patient_id, doctor_id, type, status, start_time, end_time, patient:pacientes(nombre, apellido, whatsapp, email), doctor:profiles!agenda_appointments_doctor_id_fkey(full_name), satisfaction_surveys!inner(id, sent_at, created_at)')
    .eq('status', 'completed')
    .is('survey_sent_at', null)
    .is('satisfaction_surveys.sent_at', null)
    .gte('satisfaction_surveys.created_at', retrySince)
    .lte('end_time', surveyCutoff);
  if (surveyRetryError) result.failed.push('survey-retry-query');
  for (const apt of (surveyRetries ?? []) as Candidate[]) {
    const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient;
    const doctor = Array.isArray(apt.doctor) ? apt.doctor[0] : apt.doctor;
    await survey({
      appointment_id: apt.id,
      patient_name: `${patient?.nombre ?? ''} ${patient?.apellido ?? ''}`.trim() || 'Paciente',
      patient_phone: patient?.whatsapp ?? null,
      patient_email: patient?.email ?? null,
      doctor_name: doctor?.full_name ?? null,
    }, apt.patient_id, apt.type ?? undefined);
  }
  return result;
}

export async function runAgendaReminderCycle(options: ReminderCycleOptions = {}) {
  const [{ createAdminClient }, notifications, { createRecallsForCompletedAppointment }] = await Promise.all([
    import('../../utils/supabase/admin'), import('./notification-service'), import('./recall-creation'),
  ]);
  return runReminderCycle({ supabase: createAdminClient(), ...notifications,
    createRecalls: createRecallsForCompletedAppointment }, options);
}
