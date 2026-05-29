import { google } from 'googleapis';
import { createAdminClient } from '@/utils/supabase/admin';
import { buildGoogleAuth } from './google-calendar-sync';

// Google Calendar ID from environment or fallback to 'primary'
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID ?? 'primary';

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

    // 2. Prepare event metadata
    const patientName = apt.patient ? `${apt.patient.nombre ?? ''} ${apt.patient.apellido ?? ''}`.trim() : null;
    const summary = apt.title || (patientName ? `Consulta - ${patientName}` : 'Consulta Odontológica');
    
    // Build description with notes, patient info, etc.
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

    // 3. Create Google Calendar Event
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBody: any = {
      summary,
      description,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
    };

    // Add attendees if patient has an email
    if (apt.patient?.email) {
      eventBody.attendees = [{ email: apt.patient.email, displayName: patientName }];
    }

    const response = await calendar.events.insert({
      calendarId: CALENDAR_ID,
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

    // 2. Prepare event metadata
    const patientName = apt.patient ? `${apt.patient.nombre ?? ''} ${apt.patient.apellido ?? ''}`.trim() : null;
    const summary = apt.title || (patientName ? `Consulta - ${patientName}` : 'Consulta Odontológica');
    
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const eventBody: any = {
      summary,
      description,
      start: { dateTime: startISO },
      end: { dateTime: endISO },
      status: apt.status === 'cancelled' ? 'cancelled' : 'confirmed',
    };

    if (apt.patient?.email) {
      eventBody.attendees = [{ email: apt.patient.email, displayName: patientName }];
    }

    // 3. Update the event on Google Calendar using external_id
    await calendar.events.patch({
      calendarId: CALENDAR_ID,
      eventId: apt.external_id,
      requestBody: eventBody,
    });

    console.log(`[GoogleOutbound] Successfully updated Google Calendar event ${apt.external_id} for appointment ${appointmentId}`);
    return apt.external_id;
  } catch (err: any) {
    // If the event was deleted on Google Calendar (404/410), clear the external_id and recreate
    if (err.code === 404 || err.code === 410) {
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
  } catch (err: any) {
    // If it's already deleted or doesn't exist, we can ignore the error
    if (err.code === 404 || err.code === 410) {
      console.warn(`[GoogleOutbound] Event ${externalId} was already deleted or not found on Google Calendar.`);
      return true;
    }
    console.error(`[GoogleOutbound] Error deleting Google Calendar event ${externalId}:`, err);
    return false;
  }
}
