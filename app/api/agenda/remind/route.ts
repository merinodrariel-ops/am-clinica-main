/**
 * POST /api/agenda/remind
 *
 * Cron-triggered endpoint (Vercel Cron / external cron).
 * Reads notification_rules, finds appointments in the fire window,
 * dispatches email + WhatsApp, and logs results.
 *
 * Also handles post-appointment satisfaction surveys (30 min after completion).
 *
 * Recommended schedule: every 15 minutes via GitHub Actions or another cron provider.
 *
 * Secured by CRON_SECRET header.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  sendNotification,
  createAndSendSurvey,
  type AppointmentNotificationContext,
} from '@/lib/am-scheduler/notification-service';
import {
  getAutoCompleteSurveyWindow,
  shouldAutoCompleteForSurvey,
} from '@/lib/am-scheduler/auto-complete-surveys';
import { createRecallsFromAppointment } from '@/app/actions/recalls';

// ─── Auth guard ───────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  const header = req.headers.get('Authorization') ?? req.headers.get('x-cron-secret');
  return header === `Bearer ${secret}` || header === secret;
}

// ─── Pending reminder row type ────────────────────────────────────────────────

interface PendingReminder {
  appointment_id:      string;
  rule_id:             string;
  template_key:        string;
  channel:             string;
  patient_name:        string;
  patient_email:       string | null;
  patient_phone:       string | null;
  doctor_name:         string | null;
  start_time:          string;
  end_time:            string;
  appointment_type:    string;
  appointment_status:  string;
}

interface CompletedForSurvey {
  appointment_id: string;
  patient_name:   string;
  patient_phone:  string | null;
  patient_email:  string | null;
  doctor_name:    string | null;
}

interface AutoCompleteForSurvey {
  id: string;
  patient_id: string | null;
  doctor_id: string | null;
  type: string | null;
  status: string | null;
  start_time: string;
  end_time: string;
  patient: {
    nombre: string | null;
    apellido: string | null;
    whatsapp: string | null;
    email: string | null;
  } | Array<{
    nombre: string | null;
    apellido: string | null;
    whatsapp: string | null;
    email: string | null;
  }> | null;
  doctor: {
    full_name: string | null;
  } | Array<{
    full_name: string | null;
  }> | null;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const nowDate  = new Date();
  const now      = nowDate.toISOString();

  const dispatched: string[] = [];
  const failed:     string[] = [];
  const autoCompleted: string[] = [];

  // ── 1. Pending appointment reminders ──────────────────────────────────────

  const { data: reminders, error: rErr } = await supabase
    .rpc('get_pending_reminders', { p_now: now });

  if (rErr) {
    console.error('[Remind] RPC error:', rErr);
    return NextResponse.json({ error: rErr.message }, { status: 500 });
  }

  for (const row of (reminders as PendingReminder[] ?? [])) {
    const ctx: AppointmentNotificationContext = {
      appointmentId:   row.appointment_id,
      ruleId:          row.rule_id,
      templateKey:     row.template_key,
      channel:         row.channel as 'email' | 'whatsapp' | 'both',
      patientName:     row.patient_name,
      patientEmail:    row.patient_email,
      patientPhone:    row.patient_phone,
      doctorName:      row.doctor_name,
      startTime:       row.start_time,
      endTime:         row.end_time,
      appointmentType: row.appointment_type,
    };

    const result = await sendNotification(ctx);

    if (result.success) {
      dispatched.push(row.appointment_id);
    } else {
      failed.push(row.appointment_id);
      console.error('[Remind] Failed for appointment:', row.appointment_id, result.error);
    }
  }

  // ── 2. Auto-complete recent clinical appointments for survey dispatch ───────

  const autoWindow = getAutoCompleteSurveyWindow(nowDate);
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
    console.error('[Remind] Auto-complete query error:', autoErr);
    failed.push('auto-complete-query');
  }

  for (const apt of (autoCandidates as AutoCompleteForSurvey[] ?? [])) {
    if (!shouldAutoCompleteForSurvey(apt, nowDate)) continue;

    const patient = Array.isArray(apt.patient) ? apt.patient[0] : apt.patient;
    const doctor = Array.isArray(apt.doctor) ? apt.doctor[0] : apt.doctor;
    const patientName = `${patient?.nombre ?? ''} ${patient?.apellido ?? ''}`.trim() || 'Paciente';

    const { error: updateErr } = await supabase
      .from('agenda_appointments')
      .update({ status: 'completed', updated_at: now })
      .eq('id', apt.id)
      .is('survey_sent_at', null)
      .not('status', 'in', '("cancelled","no_show","completed")');

    if (updateErr) {
      failed.push(`auto-complete:${apt.id}`);
      console.error('[Remind] Auto-complete update failed:', apt.id, updateErr);
      continue;
    }

    autoCompleted.push(apt.id);

    if (apt.patient_id && apt.type) {
      await createRecallsFromAppointment(
        apt.id,
        apt.type,
        apt.patient_id,
        apt.start_time,
        apt.doctor_id ?? null,
      ).catch((err) => {
        console.error('[Remind] Recall creation failed after auto-complete:', apt.id, err);
      });
    }

    await createAndSendSurvey(
      apt.id,
      apt.patient_id,
      patientName,
      patient?.whatsapp ?? null,
      patient?.email ?? null,
      doctor?.full_name ?? null,
    );
    dispatched.push(`survey:auto:${apt.id}`);
  }

  // ── 3. Post-appointment satisfaction surveys ────────────────────────────────

  const { data: forSurvey, error: sErr } = await supabase
    .rpc('get_completed_for_survey', { p_now: now });

  if (sErr) {
    console.error('[Remind] Survey RPC error:', sErr);
  }

  for (const row of (forSurvey as CompletedForSurvey[] ?? [])) {
    await createAndSendSurvey(
      row.appointment_id,
      null,
      row.patient_name,
      row.patient_phone,
      row.patient_email,
      row.doctor_name
    );
    dispatched.push(`survey:${row.appointment_id}`);
  }

  return NextResponse.json({
    ok:         true,
    at:         now,
    dispatched: dispatched.length,
    failed:     failed.length,
    autoCompleted: autoCompleted.length,
    surveys:    forSurvey?.length ?? 0,
    ids:        { dispatched, failed, autoCompleted },
  });
}

// Vercel Cron invokes configured paths with GET.
export async function GET(req: NextRequest) {
  return POST(req);
}
