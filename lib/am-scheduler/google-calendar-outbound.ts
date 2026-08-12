import { google } from 'googleapis';
import { createAdminClient } from '@/utils/supabase/admin';
import { buildGoogleAuth } from './google-calendar-sync';

// Google Calendar ID from environment or fallback to 'primary'
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';

const GOOGLE_MEET_NOTE_REGEX = /(?:^|\n)Google Meet: https:\/\/meet\.google\.com\/[a-z-]+/i;

type GoogleOutboundAppointment = {
  id: string;
  title?: string | null;
  notes?: string | null;
  modality?: string | null;
  start_time: string;
  end_time: string;
  status?: string | null;
  type?: string | null;
  patient?: {
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    whatsapp?: string | null;
  } | null;
  doctor?: {
    full_name?: string | null;
  } | null;
};

function isVirtualAppointment(apt: { modality?: string | null; notes?: string | null }) {
  return apt.modality === 'virtual' || (apt.notes || '').includes('[APPOINTMENT_MODALITY:virtual]');
}

function getGoogleErrorCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error
    ? Number((error as { code?: unknown }).code)
    : null;
}

function buildGoogleEventBody(apt: GoogleOutboundAppointment) {
  const patientName = apt.patient ? `${apt.patient.nombre ?? ''} ${apt.patient.apellido ?? ''}`.trim() : null;
  const summary = apt.title || (patientName ? `Consulta - ${patientName}` : 'Reunión AM Clínica');

  let description = apt.notes || '';
  if (apt.patient) {
    description += `\n\n--- Información del Paciente ---`;
    description += `\nPaciente: ${patientName || 'N/A'}`;
    if (apt.patient.whatsapp) description += `\nTeléfono: ${apt.patient.whatsapp}`;
    if (apt.patient.email) description += `\nEmail: ${apt.patient.email}`;
  }
  if (apt.doctor) {
    description += `\nOdontólogo: ${apt.doctor.full_name}`;
  }
  if (apt.type) {
    description += `\nTipo de Turno: ${apt.type}`;
  }

  const startISO = new Date(apt.start_time).toISOString();
  const endISO = new Date(apt.end_time).toISOString();

  const eventBody: {
    summary: string;
    description: string;
    start: { dateTime: string };
    end: { dateTime: string };
    status?: string;
    attendees?: Array<{ email: string; displayName: string | null }>;
    conferenceData?: {
      createRequest: {
        requestId: string;
        conferenceSolutionKey: { type: 'hangoutsMeet' };
      };
    };
  } = {
    summary,
    description,
    start: { dateTime: startISO },
    end: { dateTime: endISO },
  };

  if (apt.status) {
    eventBody.status = apt.status === 'cancelled' ? 'cancelled' : 'confirmed';
  }

  if (apt.patient?.email) {
    eventBody.attendees = [{ email: apt.patient.email, displayName: patientName }];
  }

  if (isVirtualAppointment(apt)) {
    eventBody.conferenceData = {
      createRequest: {
        requestId: `am-clinica-${apt.id}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    };
  }

  return eventBody;
}

async function persistGoogleMeetLink(appointmentId: string, currentNotes: string | null | undefined, meetLink: string | null | undefined) {
  if (!meetLink || GOOGLE_MEET_NOTE_REGEX.test(currentNotes || '')) return;

  const supabase = createAdminClient();
  const notes = [currentNotes?.trim(), `Google Meet: ${meetLink}`].filter(Boolean).join('\n\n');
  const { error } = await supabase
    .from('agenda_appointments')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', appointmentId);

  if (error) {
    console.error(`[GoogleOutbound] Failed to persist Meet link for appointment ${appointmentId}:`, error);
  }
}

/**
 * Creates an event in Google Calendar for a given appointment ID.
 * Updates the appointment's external_id and sets source to 'google_calendar'.
 */
export async function createGoogleEvent(appointmentId: string): Promise<string | null> {
  const supabase = createAdminClient();
  
  // 1. Fetch appointment details including doctor and patient data
  const { data: apt, error: fetchErr } = await supabase
    .from('agenda_appointments')
    .select(`
      *,
      patient:patient_id (nombre, apellido, email, whatsapp),
      doctor:doctor_id (full_name)
    `)
    .eq('id', appointmentId)
    .single();

  if (fetchErr || !apt) {
    console.error(`[GoogleOutbound] Appointment ${appointmentId} not found:`, fetchErr);
    return null;
  }

  // If it already has an external_id, we shouldn't recreate it
  if (apt.external_id) {
    console.warn(`[GoogleOutbound] Appointment ${appointmentId} already has external_id: ${apt.external_id}`);
    return apt.external_id;
  }

  try {
    const auth = buildGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const eventBody = buildGoogleEventBody(apt);

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      conferenceDataVersion: 1,
      requestBody: eventBody,
    });

    const eventId = response.data.id;
    if (!eventId) {
      throw new Error('Google Calendar insertion returned empty event ID');
    }

    // 4. Update internal appointment with external_id and source = 'google_calendar'
    const { error: updateErr } = await supabase
      .from('agenda_appointments')
      .update({
        external_id: eventId,
        source: 'google_calendar',
      })
      .eq('id', appointmentId);

    if (updateErr) {
      console.error(`[GoogleOutbound] Failed to update appointment ${appointmentId} with external_id ${eventId}:`, updateErr);
    }

    await persistGoogleMeetLink(appointmentId, apt.notes, response.data.hangoutLink);

    console.log(`[GoogleOutbound] Successfully synchronized appointment ${appointmentId} to Google Calendar event ${eventId}`);
    return eventId;
  } catch (err) {
    console.error(`[GoogleOutbound] Error creating Google Event for appointment ${appointmentId}:`, err);
    return null;
  }
}

/**
 * Updates an existing event in Google Calendar.
 * If the appointment does not have an external_id yet, it will create the event.
 */
export async function updateGoogleEvent(appointmentId: string): Promise<string | null> {
  const supabase = createAdminClient();
  
  // 1. Fetch appointment details
  const { data: apt, error: fetchErr } = await supabase
    .from('agenda_appointments')
    .select(`
      *,
      patient:patient_id (nombre, apellido, email, whatsapp),
      doctor:doctor_id (full_name)
    `)
    .eq('id', appointmentId)
    .single();

  if (fetchErr || !apt) {
    console.error(`[GoogleOutbound] Appointment ${appointmentId} not found:`, fetchErr);
    return null;
  }

  // If it doesn't have an external_id, create it instead
  if (!apt.external_id) {
    console.log(`[GoogleOutbound] Appointment ${appointmentId} has no external_id. Creating event...`);
    return createGoogleEvent(appointmentId);
  }

  try {
    const auth = buildGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    const eventBody = buildGoogleEventBody(apt);

    // 3. Update the event on Google Calendar using external_id
    const response = await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: apt.external_id,
      conferenceDataVersion: 1,
      requestBody: eventBody,
    });

    await persistGoogleMeetLink(appointmentId, apt.notes, response.data.hangoutLink);

    console.log(`[GoogleOutbound] Successfully updated Google Calendar event ${apt.external_id} for appointment ${appointmentId}`);
    return apt.external_id;
  } catch (err: unknown) {
    // If the event was deleted on Google Calendar (404/410), clear the external_id and recreate
    const errorCode = getGoogleErrorCode(err);
    if (errorCode === 404 || errorCode === 410) {
      console.warn(`[GoogleOutbound] Event ${apt.external_id} not found on Google Calendar (deleted). Recreating...`);
      // Clear external_id first
      await supabase
        .from('agenda_appointments')
        .update({ external_id: null })
        .eq('id', appointmentId);
      
      return createGoogleEvent(appointmentId);
    }

    console.error(`[GoogleOutbound] Error updating Google Event ${apt.external_id} for appointment ${appointmentId}:`, err);
    return null;
  }
}

/**
 * Deletes an event in Google Calendar by its external ID.
 */
export async function deleteGoogleEvent(externalId: string): Promise<boolean> {
  if (!externalId) return false;

  try {
    const auth = buildGoogleAuth();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
      calendarId: CALENDAR_ID,
      eventId: externalId,
    });

    console.log(`[GoogleOutbound] Successfully deleted Google Calendar event ${externalId}`);
    return true;
  } catch (err: unknown) {
    // If it's already deleted or doesn't exist, we can ignore the error
    const errorCode = getGoogleErrorCode(err);
    if (errorCode === 404 || errorCode === 410) {
      console.warn(`[GoogleOutbound] Event ${externalId} was already deleted or not found on Google Calendar.`);
      return true;
    }
    console.error(`[GoogleOutbound] Error deleting Google Calendar event ${externalId}:`, err);
    return false;
  }
}
