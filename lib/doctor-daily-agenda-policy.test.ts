import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldSendDailyDoctorAgenda } from './doctor-daily-agenda-policy';

test('skips daily agenda notifications when the doctor has no appointments that day', () => {
    assert.equal(shouldSendDailyDoctorAgenda({ appointmentCount: 0 }), false);
});

test('keeps daily agenda notifications enabled when the doctor has at least one appointment', () => {
    assert.equal(shouldSendDailyDoctorAgenda({ appointmentCount: 1 }), true);
});
