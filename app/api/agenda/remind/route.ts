/**
 * POST /api/agenda/remind
 *
 * Cron-triggered endpoint (Vercel Cron / external cron).
 * Reads notification_rules, finds appointments in the fire window,
 * dispatches email + WhatsApp, and logs results.
 *
 * Also handles post-appointment satisfaction surveys (30 min after completion).
 *
 * Recommended schedule: every 5 minutes
 * vercel.json: { "crons": [{ "path": "/api/agenda/remind", "schedule": "every-5-minutes" }] }
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

// ─── Auth guard ───────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev mode: open
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

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now      = new Date().toISOString();

  const dispatched: string[] = [];
  const failed:     string[] = [];

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

  // ── 2. Post-appointment satisfaction surveys ────────────────────────────────

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
    surveys:    forSurvey?.length ?? 0,
    ids:        { dispatched, failed },
  });
}

// Allow GET for manual testing in dev
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'GET not allowed in production' }, { status: 405 });
  }
  return POST(req);
}
