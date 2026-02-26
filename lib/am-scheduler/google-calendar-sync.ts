/**
 * AM-Scheduler — Google Calendar Sync Service
 *
 * Performs a full historical import from Google Calendar into
 * agenda_appointments, with Identity Correlation:
 *   1. Extracts attendee emails from calendar events
 *   2. Looks up matching paciente record via email field
 *   3. Links the appointment to the patient record
 *
 * Usage (one-time migration):
 *   npx ts-node -e "require('./lib/am-scheduler/google-calendar-sync').runFullImport()"
 *
 * Usage (ongoing incremental sync via API):
 *   POST /api/agenda/sync-google  { calendarId, syncToken? }
 */

import { google, calendar_v3 } from 'googleapis';
import { createAdminClient } from '@/utils/supabase/admin';

// ─── Google Auth ──────────────────────────────────────────────────────────────

function buildGoogleAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  }

  const key = rawKey.replace(/\\n/g, '\n');

  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SyncResult {
  imported: number;
  updated:  number;
  skipped:  number;
  errors:   number;
  nextSyncToken?: string;
}

export interface SyncOptions {
  calendarId:    string;
  syncToken?:    string;       // for incremental sync; omit for full import
  timeMin?:      string;       // ISO; limit historical import
  maxResults?:   number;
  dryRun?:       boolean;
}

// ─── Identity Correlation ─────────────────────────────────────────────────────

/**
 * Given a list of attendee emails, finds a matching paciente record.
 * Strategy:
 *   1. Exact email match in pacientes.email
 *   2. Name extraction from organizer displayName vs paciente nombre+apellido
 */
async function correlatePatient(
  emails: string[],
  displayName?: string | null
): Promise<string | null> {
  if (!emails.length && !displayName) return null;

  const supabase = createAdminClient();

  // Strategy 1: Email match
  if (emails.length > 0) {
    const { data } = await supabase
      .from('pacientes')
      .select('id_paciente')
      .in('email', emails)
      .eq('is_deleted', false)
      .limit(1)
      .maybeSingle();

    if (data) return data.id_paciente;
  }

  // Strategy 2: Fuzzy name match from displayName
  if (displayName) {
    const parts = displayName.trim().split(' ');
    if (parts.length >= 2) {
      const firstName = parts[0];
      const lastName  = parts[parts.length - 1];

      const { data } = await supabase
        .from('pacientes')
        .select('id_paciente')
        .ilike('nombre',   `%${firstName}%`)
        .ilike('apellido', `%${lastName}%`)
        .eq('is_deleted', false)
        .limit(1)
        .maybeSingle();

      if (data) return data.id_paciente;
    }
  }

  return null;
}

// ─── Event Mapper ─────────────────────────────────────────────────────────────

function mapStatusToAppointmentStatus(gcalStatus: string | null | undefined): string {
  switch (gcalStatus) {
    case 'confirmed':  return 'confirmed';
    case 'tentative':  return 'pending';
    case 'cancelled':  return 'cancelled';
    default:           return 'confirmed';
  }
}

function extractEmails(event: calendar_v3.Schema$Event): string[] {
  const emails: string[] = [];
  if (event.organizer?.email) emails.push(event.organizer.email);
  if (event.attendees) {
    for (const a of event.attendees) {
      if (a.email && !a.self) emails.push(a.email);
    }
  }
  return [...new Set(emails)];
}

async function mapEventToAppointment(
  event: calendar_v3.Schema$Event,
  defaultDoctorId: string | null
): Promise<Record<string, unknown> | null> {
  // Skip events without times (all-day events are skipped)
  const startDT = event.start?.dateTime;
  const endDT   = event.end?.dateTime;
  if (!startDT || !endDT) return null;

  const emails     = extractEmails(event);
  const patientId  = await correlatePatient(emails, event.summary);

  return {
    title:       event.summary ?? 'Importado de Google Calendar',
    start_time:  startDT,
    end_time:    endDT,
    status:      mapStatusToAppointmentStatus(event.status),
    type:        'consulta',
    notes:       event.description ?? null,
    patient_id:  patientId,
    doctor_id:   defaultDoctorId,
    external_id: event.id,
    source:      'google_calendar',
    color_tag:   event.colorId ? `gcal_${event.colorId}` : null,
  };
}

// ─── Core Sync Function ───────────────────────────────────────────────────────

export async function syncGoogleCalendar(options: SyncOptions): Promise<SyncResult> {
  const {
    calendarId,
    syncToken,
    timeMin = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year back
    maxResults = 2500,
    dryRun = false,
  } = options;

  const supabase = createAdminClient();
  const auth     = buildGoogleAuth();
  const calendar = google.calendar({ version: 'v3', auth });

  const result: SyncResult = { imported: 0, updated: 0, skipped: 0, errors: 0 };

  // Resolve default doctor (owner profile as fallback)
  let defaultDoctorId: string | null = null;
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();
  if (ownerProfile) defaultDoctorId = ownerProfile.id;

  // Paginate through all events
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params: calendar_v3.Params$Resource$Events$List = {
      calendarId,
      maxResults: Math.min(maxResults, 250),
      singleEvents: true,
      orderBy: 'startTime',
      pageToken,
      syncToken,   // if provided, only changed events since last sync
      ...(!syncToken && timeMin ? { timeMin } : {}),
    };

    let eventsResponse;
    try {
      eventsResponse = await calendar.events.list(params);
    } catch (err: unknown) {
      // 410 GONE = sync token expired, do full sync
      const googleErr = err as { code?: number };
      if (googleErr.code === 410) {
        console.warn('[GoogleSync] Sync token expired. Running full sync...');
        return syncGoogleCalendar({ ...options, syncToken: undefined });
      }
      throw err;
    }

    const events   = eventsResponse.data.items ?? [];
    nextSyncToken  = eventsResponse.data.nextSyncToken ?? undefined;
    pageToken      = eventsResponse.data.nextPageToken ?? undefined;

    for (const event of events) {
      try {
        if (!event.id) { result.skipped++; continue; }

        // Handle deletions
        if (event.status === 'cancelled') {
          if (!dryRun) {
            await supabase
              .from('agenda_appointments')
              .update({ status: 'cancelled' })
              .eq('external_id', event.id)
              .eq('source', 'google_calendar');
          }
          result.updated++;
          continue;
        }

        const appointment = await mapEventToAppointment(event, defaultDoctorId);
        if (!appointment) { result.skipped++; continue; }

        if (dryRun) {
          console.log('[DryRun]', appointment);
          result.imported++;
          continue;
        }

        // Upsert by external_id
        const { error } = await supabase
          .from('agenda_appointments')
          .upsert(appointment, { onConflict: 'external_id', ignoreDuplicates: false });

        if (error) {
          console.error('[GoogleSync] Upsert error:', error.message, event.id);
          result.errors++;
        } else {
          result.imported++;
        }
      } catch (err) {
        console.error('[GoogleSync] Event processing error:', err);
        result.errors++;
      }
    }

  } while (pageToken);

  result.nextSyncToken = nextSyncToken;
  return result;
}

// ─── Full Historical Import (CLI entry point) ─────────────────────────────────

export async function runFullImport() {
  const calendarId = process.env.GOOGLE_CALENDAR_ID ?? 'primary';
  console.log(`[AM-Scheduler] Starting full Google Calendar import from: ${calendarId}`);

  const result = await syncGoogleCalendar({
    calendarId,
    timeMin: '2020-01-01T00:00:00Z', // Import from 2020 onwards
  });

  console.log('[AM-Scheduler] Import complete:', result);
  return result;
}
