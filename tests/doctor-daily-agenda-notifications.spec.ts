import assert from 'node:assert/strict';
import { renderAgendaHtml } from '../lib/doctor-daily-agenda-email';

process.env.NEXT_PUBLIC_APP_URL = 'https://am-clinica-main.vercel.app';

const html = renderAgendaHtml({
  doctorName: 'Ariel Merino',
  date: '2026-06-17',
  appointments: [
    {
      id: 'apt-1',
      title: null,
      start_time: '2026-06-17T17:00:00.000-03:00',
      end_time: '2026-06-17T18:00:00.000-03:00',
      status: 'confirmed',
      type: 'control',
      notes: null,
      patient_data: {
        id_paciente: 'c5e01884-0542-47b7-97bb-23bdf80a8838',
        nombre: 'Romina',
        apellido: 'Dávila',
        whatsapp: null,
      },
    },
  ],
});

assert.match(
  html,
  /<a[^>]+href="https:\/\/am-clinica-main\.vercel\.app\/patients\/c5e01884-0542-47b7-97bb-23bdf80a8838\?section=archivos"[^>]*>Romina Dávila<\/a>/,
);
assert.match(html, /Agenda de hoy/);

const meetingHtml = renderAgendaHtml({
  doctorName: 'Ariel Merino',
  date: '2026-08-14',
  appointments: [
    {
      id: 'apt-meeting',
      title: 'Reunión equipo IA',
      start_time: '2026-08-14T14:00:00.000-03:00',
      end_time: '2026-08-14T14:30:00.000-03:00',
      status: 'confirmed',
      type: 'reunion',
      notes: null,
      patient_data: null,
    },
  ],
});

assert.match(meetingHtml, /Reunión equipo IA/);
assert.match(meetingHtml, /reunion/);

console.log('doctor-daily-agenda-notifications.spec.ts: ok');
