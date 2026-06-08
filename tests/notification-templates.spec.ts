import assert from 'node:assert/strict';
import { renderTemplate } from '../lib/am-scheduler/notification-templates';

const baseContext = {
  appointmentId: '00000000-0000-0000-0000-000000000123',
  channel: 'email' as const,
  patientName: 'Valentina Garcia',
  patientEmail: 'demo@am-clinica.ar',
  patientPhone: '+5491112345678',
  doctorName: 'Ariel Merino',
  startTime: '2026-06-07T10:00:00.000Z',
  endTime: '2026-06-07T11:00:00.000Z',
  clinicName: 'AM Clinica',
};

const cleaning = renderTemplate('recall_cleaning', { ...baseContext, templateKey: 'recall_cleaning' });
assert.match(cleaning.subject, /limpieza preventiva/i);
assert.match(cleaning.html, /limpieza preventiva/i);

const laser = renderTemplate('upgrade_cleaning_laser', { ...baseContext, templateKey: 'upgrade_cleaning_laser' });
assert.match(laser.subject, /laser/i);
assert.match(laser.html, /laser/i);

const veneers = renderTemplate('recall_veneer_control', { ...baseContext, templateKey: 'recall_veneer_control' });
assert.match(veneers.subject, /carillas/i);

const crossSell = renderTemplate('cross_sell_cleaning_after_veneers', { ...baseContext, templateKey: 'cross_sell_cleaning_after_veneers' });
assert.match(crossSell.subject, /limpieza/i);
assert.match(crossSell.html, /carillas/i);

const whitening = renderTemplate('recall_whitening', { ...baseContext, templateKey: 'recall_whitening' });
assert.match(whitening.subject, /blanqueamiento/i);

const ortho = renderTemplate('recall_orthodontic_control', { ...baseContext, templateKey: 'recall_orthodontic_control' });
assert.match(ortho.subject, /ortodoncia/i);

console.log('notification-templates.spec.ts: ok');
