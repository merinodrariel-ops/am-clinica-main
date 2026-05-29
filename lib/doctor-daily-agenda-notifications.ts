import 'server-only';

import crypto from 'crypto';
import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service';
import { getLocalISODate } from '@/lib/local-date';
import { sendWhatsAppMessage } from '@/lib/am-scheduler/notification-service';

const DAILY_AGENDA_FROM = process.env.DAILY_AGENDA_FROM || 'AM Turnos <turnos@amesteticadental.com>';
const DAILY_AGENDA_REPLY_TO = process.env.DAILY_AGENDA_REPLY_TO || 'dr.arielmerinopersonal@gmail.com';
const ARIEL_DAILY_AGENDA_EMAIL = process.env.ARIEL_DAILY_AGENDA_EMAIL || 'dr.arielmerinopersonal@gmail.com';
const TURNOS_WHATSAPP_URL = 'https://wa.link/zolb52';

type DoctorStaffRow = {
  id: string;
  user_id: string | null;
  nombre: string | null;
  apellido: string | null;
  email: string | null;
  whatsapp: string | null;
};

type DoctorProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  categoria: string | null;
};

type DailyAgendaSetting = {
  doctor_id: string;
  email: string | null;
  whatsapp: string | null;
  send_email: boolean;
  send_whatsapp: boolean;
  is_active: boolean;
};

type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  type: string | null;
  notes: string | null;
  patient_data?: {
    nombre?: string | null;
    apellido?: string | null;
    whatsapp?: string | null;
  } | {
    nombre?: string | null;
    apellido?: string | null;
    whatsapp?: string | null;
  }[] | null;
};

type DeliveryResult = {
  doctorId: string;
  doctorName: string;
  email?: 'sent' | 'failed' | 'skipped';
  whatsapp?: 'sent' | 'failed' | 'skipped';
  appointments: number;
  errors: string[];
};

function dayBounds(date: string) {
  return {
    start: `${date}T00:00:00-03:00`,
    end: `${date}T23:59:59-03:00`,
  };
}

function formatDateLong(date: string) {
  const argentinaNoon = new Date(`${date}T12:00:00-03:00`);
  return argentinaNoon.toLocaleDateString('es-AR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}

function patientName(row: AppointmentRow) {
  const patient = Array.isArray(row.patient_data) ? row.patient_data[0] : row.patient_data;
  const name = `${patient?.nombre || ''} ${patient?.apellido || ''}`.trim();
  return name || row.title || 'Paciente';
}

function doctorName(staff: DoctorStaffRow, profile?: DoctorProfile) {
  const profileName = profile?.full_name?.trim();
  if (profileName) return profileName;
  const staffName = `${staff.nombre || ''} ${staff.apellido || ''}`.trim();
  return staffName || 'Profesional';
}

function isArielMerino(name: string, profile?: DoctorProfile) {
  const haystack = `${name} ${profile?.full_name || ''} ${profile?.email || ''}`.toLowerCase();
  return haystack.includes('ariel') && haystack.includes('merino')
    || haystack.includes('dr.arielmerinopersonal@gmail.com')
    || haystack.includes('doctor.arielmerinopersonal@gmail.com');
}

function normalizeEmail(value?: string | null) {
  const email = value?.trim().toLowerCase();
  if (!email) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function normalizePhone(value?: string | null) {
  const phone = value?.trim();
  return phone || null;
}

function resolveDailyAgendaEmail(input: {
  settingEmail?: string | null;
  staffEmail?: string | null;
  profileEmail?: string | null;
  doctorName: string;
  profile?: DoctorProfile;
}) {
  if (isArielMerino(input.doctorName, input.profile)) {
    return normalizeEmail(input.settingEmail || ARIEL_DAILY_AGENDA_EMAIL);
  }

  return normalizeEmail(input.settingEmail || input.staffEmail || input.profileEmail);
}

function isMissingRelationError(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === '42P01'
    || error.code === 'PGRST205'
    || /doctor_daily_agenda_settings|relation .* does not exist|could not find/i.test(error.message || '');
}

function renderAgendaHtml(input: {
  doctorName: string;
  date: string;
  appointments: AppointmentRow[];
}) {
  const rows = input.appointments.map((apt) => {
    const time = `${formatTime(apt.start_time)} - ${formatTime(apt.end_time)}`;
    return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827;white-space:nowrap;">${time}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#111827;">${patientName(apt)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#4b5563;">${apt.type || 'Turno'}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${apt.status || 'confirmed'}</td>
      </tr>`;
  }).join('');

  const emptyBlock = `
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:14px;padding:22px;text-align:center;color:#6b7280;">
      No hay turnos cargados para hoy.
    </div>`;

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:680px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#111827;">
      <div style="margin-bottom:26px;">
        <div style="font-size:24px;font-weight:800;letter-spacing:-0.4px;color:#111827;">AM<span style="color:#2563eb;">·</span>Clínica</div>
        <p style="margin:8px 0 0;color:#6b7280;font-size:14px;">Agenda diaria automática</p>
      </div>

      <h1 style="font-size:24px;line-height:1.2;margin:0 0 8px;color:#111827;">Agenda de hoy</h1>
      <p style="font-size:16px;color:#374151;margin:0 0 24px;">
        ${input.doctorName} · ${formatDateLong(input.date)}
      </p>

      ${input.appointments.length === 0 ? emptyBlock : `
        <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <thead>
            <tr style="background:#f3f4f6;text-align:left;">
              <th style="padding:10px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Hora</th>
              <th style="padding:10px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Paciente</th>
              <th style="padding:10px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Tipo</th>
              <th style="padding:10px;color:#374151;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Estado</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `}

      <div style="margin-top:28px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:18px 20px;">
        <p style="font-size:14px;line-height:1.5;color:#1f2937;margin:0 0 14px;">
          Este es un email automático enviado a primera hora con la agenda cargada hasta ese momento.
          Ante cualquier eventualidad, duda o cambio de último momento, corroborá siempre con Turnos.
        </p>
        <a href="${TURNOS_WHATSAPP_URL}"
          style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;
                 padding:11px 18px;border-radius:10px;font-weight:700;font-size:14px;">
          Corroborar por WhatsApp de turnos
        </a>
      </div>

      <p style="font-size:12px;color:#9ca3af;margin-top:18px;">
        WhatsApp de turnos: <a href="${TURNOS_WHATSAPP_URL}" style="color:#2563eb;text-decoration:none;">${TURNOS_WHATSAPP_URL}</a>
      </p>
    </div>`;
}

function renderAgendaWhatsApp(input: {
  doctorName: string;
  date: string;
  appointments: AppointmentRow[];
}) {
  const header = `*AM Clínica · Agenda de hoy*\n${input.doctorName}\n${formatDateLong(input.date)}`;
  const footer = `Este mensaje es automático y refleja la agenda cargada a primera hora. Ante cualquier eventualidad, duda o cambio de último momento, corroborá siempre con Turnos:\n${TURNOS_WHATSAPP_URL}`;
  if (input.appointments.length === 0) {
    return `${header}\n\nNo hay turnos cargados para hoy.\n\n${footer}`;
  }

  const lines = input.appointments.map((apt) => {
    const time = `${formatTime(apt.start_time)}-${formatTime(apt.end_time)}`;
    const type = apt.type ? ` · ${apt.type}` : '';
    return `• ${time} · ${patientName(apt)}${type}`;
  });

  return `${header}\n\n${lines.join('\n')}\n\n${footer}`;
}

function buildAgendaFingerprint(appointments: AppointmentRow[]) {
  const payload = appointments.map((apt) => ({
    id: apt.id,
    start: apt.start_time,
    end: apt.end_time,
    status: apt.status || '',
    type: apt.type || '',
    patient: patientName(apt),
  }));

  return crypto
    .createHash('sha1')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 12);
}

async function logDelivery(input: {
  doctorId: string;
  date: string;
  channel: 'email' | 'whatsapp';
  recipient: string;
  status: 'sent' | 'failed' | 'skipped';
  appointmentCount: number;
  providerId?: string | null;
  error?: string | null;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('doctor_daily_agenda_logs')
    .upsert({
      doctor_id: input.doctorId,
      agenda_date: input.date,
      channel: input.channel,
      recipient: input.recipient,
      status: input.status,
      appointment_count: input.appointmentCount,
      provider_id: input.providerId ?? null,
      error_message: input.error ?? null,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    }, {
      onConflict: 'doctor_id,agenda_date,channel,recipient',
    });

  if (error) {
    if (!isMissingRelationError(error)) {
      console.warn('[daily-agenda] delivery log skipped:', error.message);
      return;
    }

    const { error: fallbackError } = await supabase.from('notification_logs').insert({
      appointment_id: null,
      rule_id: null,
      channel: input.channel,
      recipient_email: input.channel === 'email' ? input.recipient : null,
      recipient_phone: input.channel === 'whatsapp' ? input.recipient : null,
      template_key: 'doctor_daily_agenda',
      payload: {
        doctorId: input.doctorId,
        agendaDate: input.date,
        appointmentCount: input.appointmentCount,
      },
      status: input.status,
      provider_id: input.providerId ?? null,
      error_message: input.error ?? null,
      sent_at: input.status === 'sent' ? new Date().toISOString() : null,
    });

    if (fallbackError) {
      console.warn('[daily-agenda] notification_logs fallback skipped:', fallbackError.message);
    }
  }
}

async function alreadySentToday(input: {
  date: string;
  channel: 'email' | 'whatsapp';
  recipient: string;
}) {
  const supabase = createAdminClient();
  const { start, end } = dayBounds(input.date);
  let query = supabase
    .from('notification_logs')
    .select('id')
    .eq('template_key', 'doctor_daily_agenda')
    .eq('channel', input.channel)
    .eq('status', 'sent')
    .gte('created_at', new Date(start).toISOString())
    .lte('created_at', new Date(end).toISOString())
    .limit(1);

  query = input.channel === 'email'
    ? query.eq('recipient_email', input.recipient)
    : query.eq('recipient_phone', input.recipient);

  const { data, error } = await query;
  if (error) {
    console.warn('[daily-agenda] duplicate check skipped:', error.message);
    return false;
  }

  return Boolean(data?.length);
}

export async function sendDailyDoctorAgendas(date = getLocalISODate(), options?: { forceEmail?: string }) {
  const supabase = createAdminClient();
  const { start, end } = dayBounds(date);

  const [{ data: staffRows, error: staffError }, { data: settingsRows, error: settingsError }] = await Promise.all([
    supabase
      .from('personal')
      .select('id, user_id, nombre, apellido, email, whatsapp')
      .eq('activo', true)
      .in('tipo', ['odontologo', 'profesional'])
      .not('user_id', 'is', null),
    supabase
      .from('doctor_daily_agenda_settings')
      .select('doctor_id, email, whatsapp, send_email, send_whatsapp, is_active'),
  ]);

  if (staffError) {
    throw new Error(`No se pudieron cargar doctores: ${staffError.message}`);
  }

  if (settingsError && !isMissingRelationError(settingsError)) {
    throw new Error(`No se pudo cargar configuración de agenda diaria: ${settingsError.message}`);
  }

  const forceEmail = options?.forceEmail?.trim().toLowerCase() || null;
  const staff = ((staffRows || []) as DoctorStaffRow[]).filter(row => row.user_id);
  const doctorIds = staff.map(row => row.user_id!).filter(Boolean);
  if (doctorIds.length === 0) return { date, sent: 0, failed: 0, skipped: 0, doctors: [] as DeliveryResult[] };

  const [{ data: profiles }, { data: appointments, error: appointmentsError }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, categoria')
      .in('id', doctorIds),
    supabase
      .from('agenda_appointments')
      .select('id, title, start_time, end_time, status, type, notes, doctor_id, patient_data:patient_id(nombre, apellido, whatsapp)')
      .in('doctor_id', doctorIds)
      .gte('start_time', start)
      .lte('start_time', end)
      .not('status', 'in', '("cancelled","no_show")')
      .order('start_time', { ascending: true }),
  ]);

  if (appointmentsError) {
    throw new Error(`No se pudo cargar la agenda del día: ${appointmentsError.message}`);
  }

  const profilesById = new Map(((profiles || []) as DoctorProfile[]).map(profile => [profile.id, profile]));
  const settingsByDoctor = new Map(((settingsRows || []) as DailyAgendaSetting[]).map(setting => [setting.doctor_id, setting]));
  const appointmentsByDoctor = new Map<string, AppointmentRow[]>();

  const rawApts = (appointments || []) as (AppointmentRow & { doctor_id: string | null })[];
  console.log(`[daily-agenda] date=${date} staff=${staff.length} raw_appointments=${rawApts.length} doctorIds=[${doctorIds.join(',')}]`);

  const appointmentDoctorIds = new Set(rawApts.map(a => a.doctor_id).filter(Boolean));
  const missingFromApts = doctorIds.filter(id => !appointmentDoctorIds.has(id));
  if (missingFromApts.length > 0) {
    console.warn(`[daily-agenda] doctors with no appointments in query result (possible UUID mismatch): [${missingFromApts.join(',')}]`);
  }

  for (const apt of rawApts) {
    if (!apt.doctor_id) continue;
    if (!appointmentsByDoctor.has(apt.doctor_id)) appointmentsByDoctor.set(apt.doctor_id, []);
    appointmentsByDoctor.get(apt.doctor_id)!.push(apt);
  }

  const results: DeliveryResult[] = [];

  for (const row of staff) {
    const doctorId = row.user_id!;
    const setting = settingsByDoctor.get(doctorId);
    if (setting && !setting.is_active) {
      results.push({
        doctorId,
        doctorName: doctorName(row, profilesById.get(doctorId)),
        email: 'skipped',
        whatsapp: 'skipped',
        appointments: appointmentsByDoctor.get(doctorId)?.length || 0,
        errors: ['Configuración inactiva'],
      });
      continue;
    }

    const name = doctorName(row, profilesById.get(doctorId));
    const profile = profilesById.get(doctorId);
    const doctorAppointments = appointmentsByDoctor.get(doctorId) || [];
    const agendaFingerprint = buildAgendaFingerprint(doctorAppointments);
    const email = resolveDailyAgendaEmail({
      settingEmail: setting?.email,
      staffEmail: row.email,
      profileEmail: profile?.email,
      doctorName: name,
      profile,
    });
    const whatsapp = normalizePhone(setting?.whatsapp || row.whatsapp);
    const shouldEmail = setting?.send_email ?? true;
    const shouldWhatsApp = setting?.send_whatsapp ?? true;
    const result: DeliveryResult = { doctorId, doctorName: name, appointments: doctorAppointments.length, errors: [] };
    console.log(`[daily-agenda] doctor="${name}" id=${doctorId} appointments=${doctorAppointments.length} email=${email || 'none'} shouldEmail=${shouldEmail}`);

    // When forceEmail is set, skip every doctor except the target
    if (forceEmail && email !== forceEmail) {
      result.email = 'skipped';
      result.whatsapp = 'skipped';
      results.push(result);
      continue;
    }

    if (shouldEmail && email) {
      const skipDupeCheck = forceEmail !== null;
      if (!skipDupeCheck && await alreadySentToday({ date, channel: 'email', recipient: email })) {
        result.email = 'skipped';
      } else {
        const response = await EmailService.send({
          from: DAILY_AGENDA_FROM,
          to: email,
          subject: `Agenda de hoy · ${formatDateLong(date)} — AM Clínica`,
          html: renderAgendaHtml({ doctorName: name, date, appointments: doctorAppointments }),
          replyTo: DAILY_AGENDA_REPLY_TO,
          idempotencyKey: `doctor-daily-agenda:${doctorId}:${date}:email:${email}:${agendaFingerprint}`,
        });
        result.email = response.success ? 'sent' : 'failed';
        const responseError = 'error' in response ? response.error : null;
        const responseId = 'id' in response ? response.id : null;
        if (!response.success) result.errors.push(String(responseError || 'Error enviando email'));
        await logDelivery({
          doctorId,
          date,
          channel: 'email',
          recipient: email,
          status: result.email,
          appointmentCount: doctorAppointments.length,
          providerId: responseId,
          error: response.success ? null : String(responseError || 'Error enviando email'),
        });
      }
    } else {
      result.email = 'skipped';
    }

    if (shouldWhatsApp && whatsapp) {
      if (await alreadySentToday({ date, channel: 'whatsapp', recipient: whatsapp })) {
        result.whatsapp = 'skipped';
        results.push(result);
        continue;
      }

      const response = await sendWhatsAppMessage(whatsapp, renderAgendaWhatsApp({ doctorName: name, date, appointments: doctorAppointments }));
      result.whatsapp = response.success ? 'sent' : 'failed';
      if (!response.success) result.errors.push(String(response.error || 'Error enviando WhatsApp'));
      await logDelivery({
        doctorId,
        date,
        channel: 'whatsapp',
        recipient: whatsapp,
        status: result.whatsapp,
        appointmentCount: doctorAppointments.length,
        providerId: response.id,
        error: response.success ? null : String(response.error || 'Error enviando WhatsApp'),
      });
    } else {
      result.whatsapp = 'skipped';
    }

    results.push(result);
  }

  return {
    date,
    sent: results.reduce((count, item) => count + (item.email === 'sent' ? 1 : 0) + (item.whatsapp === 'sent' ? 1 : 0), 0),
    failed: results.reduce((count, item) => count + (item.email === 'failed' ? 1 : 0) + (item.whatsapp === 'failed' ? 1 : 0), 0),
    skipped: results.reduce((count, item) => count + (item.email === 'skipped' ? 1 : 0) + (item.whatsapp === 'skipped' ? 1 : 0), 0),
    doctors: results,
  };
}
