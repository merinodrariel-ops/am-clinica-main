import test from 'node:test';
import assert from 'node:assert/strict';

import {
    canScheduleCleaningFollowupFromAppointment,
    getCleaningFollowupDate,
    isCleaningAppointmentType,
} from './cleaning-followup-policy';

test('allows scheduling one follow-up only from completed cleaning appointments', () => {
    assert.equal(canScheduleCleaningFollowupFromAppointment({ type: 'limpieza_laser', status: 'completed' }), true);
    assert.equal(canScheduleCleaningFollowupFromAppointment({ type: 'limpieza_laser', status: 'pending' }), false);
    assert.equal(canScheduleCleaningFollowupFromAppointment({ type: 'control_carilla_anual', status: 'completed' }), false);
});

test('recognizes supported cleaning appointment types', () => {
    assert.equal(isCleaningAppointmentType('limpieza'), true);
    assert.equal(isCleaningAppointmentType('limpieza_convencional'), true);
    assert.equal(isCleaningAppointmentType('limpieza_laser'), true);
    assert.equal(isCleaningAppointmentType('consulta'), false);
});

test('calculates the follow-up from the actual completed appointment date', () => {
    const next = getCleaningFollowupDate('2026-06-08T17:00:00+00:00', 4);

    assert.equal(next.toISOString(), '2026-10-08T17:00:00.000Z');
});

