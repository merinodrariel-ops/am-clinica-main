/**
 * POST /api/webhooks/calendly
 *
 * Receives Calendly webhook events and mirrors them into agenda_appointments.
 * Implements Identity Correlation via email matching with pacientes table.
 *
 * Calendly setup:
 *   Dashboard → Integrations → Webhooks → Add:
 *   URL: https://your-domain/api/webhooks/calendly
 *   Events: invitee.created, invitee.canceled
 *   Signing key → set CALENDLY_WEBHOOK_SECRET in .env.local
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { sendNotification } from '@/lib/am-scheduler/notification-service';

// ─── Calendly Payload Types ───────────────────────────────────────────────────

interface CalendlyEvent {
  event: 'invitee.created' | 'invitee.canceled';
  payload: {
    event_type: { name: string; duration: number };
    event: {
      uuid:       string;
      start_time: string;
      end_time:   string;
      location?:  { type: string; location?: string };
    };
    invitee: {
      uuid:         string;
      name:         string;
      email:        string;
      timezone?:    string;
      text_reminder_number?: string;
    };
    questions_and_answers?: Array<{ question: string; answer: string }>;
    scheduled_event?: {
      event_memberships?: Array<{ user_email: string; user_name: string }>;
    };
  };
}

// ─── Signature Verification ───────────────────────────────────────────────────

function verifyCalendlySignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  // Calendly uses Webhook-Signature: t=<timestamp>,v1=<hmac>
  const parts     = Object.fromEntries(signature.split(',').map(p => p.split('=')));
  const timestamp = parts['t'];
  const v1        = parts['v1'];

  if (!timestamp || !v1) return false;

  const expectedHmac = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  return crypto.timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(v1));
}

// ─── Patient Correlation ──────────────────────────────────────────────────────

async function findPatientByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('pacientes')
    .select('id_paciente')
    .ilike('email', email)
    .eq('is_deleted', false)
    .limit(1)
    .maybeSingle();
  return data?.id_paciente ?? null;
}

async function findDefaultDoctorByEmail(email: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const secret   = process.env.CALENDLY_WEBHOOK_SECRET ?? '';
  const rawBody  = await req.text();
  const sig      = req.headers.get('Calendly-Webhook-Signature');

  // Verify signature (skip in development)
  if (process.env.NODE_ENV === 'production' && secret) {
    const valid = verifyCalendlySignature(rawBody, sig, secret);
    if (!valid) {
      console.warn('[Calendly] Invalid webhook signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  let body: CalendlyEvent;
  try {
    body = JSON.parse(rawBody) as CalendlyEvent;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event: eventType, payload } = body;

  if (!['invitee.created', 'invitee.canceled'].includes(eventType)) {
    return NextResponse.json({ ok: true, message: 'Event ignored' });
  }

  const supabase     = createAdminClient();
  const invitee      = payload.invitee;
  const calEvent     = payload.event;
  const eventTypeName = payload.event_type.name;

  // Correlate identities
  const patientId  = await findPatientByEmail(invitee.email);
  const hostEmail  = payload.scheduled_event?.event_memberships?.[0]?.user_email ?? '';
  const doctorName = payload.scheduled_event?.event_memberships?.[0]?.user_name;
  const doctorId   = hostEmail ? await findDefaultDoctorByEmail(hostEmail) : null;

  const externalId = `calendly_${calEvent.uuid}`;

  if (eventType === 'invitee.created') {
    const { error } = await supabase
      .from('agenda_appointments')
      .upsert({
        title:       `${eventTypeName} — ${invitee.name}`,
        start_time:  calEvent.start_time,
        end_time:    calEvent.end_time,
        status:      'confirmed',
        type:        'consulta',
        notes:       `Agendado via Calendly por ${invitee.name} (${invitee.email})`,
        patient_id:  patientId,
        doctor_id:   doctorId,
        external_id: externalId,
        source:      'calendly',
      }, { onConflict: 'external_id', ignoreDuplicates: false });

    if (error) {
      console.error('[Calendly] Insert error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fetch full appointment for notification
    const { data: apt } = await supabase
      .from('agenda_appointments')
      .select('id')
      .eq('external_id', externalId)
      .maybeSingle();

    if (apt && invitee.email) {
      // Send confirmation email
      await sendNotification({
        appointmentId: apt.id,
        templateKey:   'appointment_confirmed',
        channel:       'email',
        patientName:   invitee.name,
        patientEmail:  invitee.email,
        patientPhone:  invitee.text_reminder_number ?? null,
        doctorName:    doctorName ?? null,
        startTime:     calEvent.start_time,
        endTime:       calEvent.end_time,
      });
    }

    console.log(`[Calendly] Created: ${externalId} | Patient: ${patientId ?? 'unlinked'}`);
    return NextResponse.json({ ok: true, action: 'created', patientLinked: !!patientId });
  }

  if (eventType === 'invitee.canceled') {
    const { error } = await supabase
      .from('agenda_appointments')
      .update({ status: 'cancelled' })
      .eq('external_id', externalId)
      .eq('source', 'calendly');

    if (error) {
      console.error('[Calendly] Cancel error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Notify patient of cancellation
    if (invitee.email) {
      await sendNotification({
        appointmentId: calEvent.uuid,
        templateKey:   'appointment_cancelled',
        channel:       'email',
        patientName:   invitee.name,
        patientEmail:  invitee.email,
        patientPhone:  null,
        doctorName:    doctorName ?? null,
        startTime:     calEvent.start_time,
        endTime:       calEvent.end_time,
      });
    }

    console.log(`[Calendly] Cancelled: ${externalId}`);
    return NextResponse.json({ ok: true, action: 'cancelled' });
  }

  return NextResponse.json({ ok: true });
}
