type AppointmentRow = {
  id: string;
  title: string | null;
  start_time: string;
  end_time: string;
  status: string | null;
  type: string | null;
  notes: string | null;
  patient_data?: {
    id_paciente?: string | null;
    nombre?: string | null;
    apellido?: string | null;
    whatsapp?: string | null;
  } | {
    id_paciente?: string | null;
    nombre?: string | null;
    apellido?: string | null;
    whatsapp?: string | null;
  }[] | null;
};

const TURNOS_WHATSAPP_URL = 'https://wa.link/zolb52';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function getPatientData(row: AppointmentRow) {
  return Array.isArray(row.patient_data) ? row.patient_data[0] : row.patient_data;
}

function patientName(row: AppointmentRow) {
  const patient = getPatientData(row);
  const name = `${patient?.nombre || ''} ${patient?.apellido || ''}`.trim();
  return name || row.title || 'Paciente';
}

function patientProfileUrl(row: AppointmentRow, appBaseUrl: string) {
  const patient = getPatientData(row);
  const patientId = patient?.id_paciente?.trim();
  if (!patientId) return null;
  return `${appBaseUrl.replace(/\/$/, '')}/patients/${encodeURIComponent(patientId)}?section=archivos`;
}

export function renderAgendaHtml(input: {
  doctorName: string;
  date: string;
  appointments: AppointmentRow[];
  appBaseUrl?: string;
}) {
  const appBaseUrl = (input.appBaseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');

  const rows = input.appointments.map((apt) => {
    const time = `${formatTime(apt.start_time)} - ${formatTime(apt.end_time)}`;
    const name = escapeHtml(patientName(apt));
    const profileUrl = patientProfileUrl(apt, appBaseUrl);
    const nameCell = profileUrl
      ? `<a href="${escapeHtml(profileUrl)}" style="color:#111827;text-decoration:underline;font-weight:700;">${name}</a>`
      : name;

    return `
      <tr>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;font-weight:700;color:#111827;white-space:nowrap;">${escapeHtml(time)}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#111827;">${nameCell}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#4b5563;">${escapeHtml(apt.type || 'Turno')}</td>
        <td style="padding:12px 10px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${escapeHtml(apt.status || 'confirmed')}</td>
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
        ${escapeHtml(input.doctorName)} · ${formatDateLong(input.date)}
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

