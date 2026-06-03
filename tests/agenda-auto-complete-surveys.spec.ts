import assert from 'node:assert/strict';
import {
    AUTO_COMPLETE_SURVEY_LOOKBACK_HOURS,
    shouldAutoCompleteForSurvey,
    AUTO_COMPLETE_SURVEY_GRACE_MINUTES,
} from '../lib/am-scheduler/auto-complete-surveys';

const now = new Date('2026-06-03T20:00:00.000Z');

assert.equal(AUTO_COMPLETE_SURVEY_GRACE_MINUTES, 30);
assert.equal(AUTO_COMPLETE_SURVEY_LOOKBACK_HOURS, 12);

assert.equal(
    shouldAutoCompleteForSurvey({
        end_time: '2026-06-03T19:29:59.000Z',
        status: 'confirmed',
        type: 'consulta',
        patient_id: 'patient-1',
    }, now),
    true,
    'clinical appointments with patients should auto-complete after the grace period',
);

assert.equal(
    shouldAutoCompleteForSurvey({
        end_time: '2026-06-03T19:45:00.000Z',
        status: 'confirmed',
        type: 'consulta',
        patient_id: 'patient-1',
    }, now),
    false,
    'appointments should not auto-complete before the grace period',
);

assert.equal(
    shouldAutoCompleteForSurvey({
        end_time: '2026-06-03T18:00:00.000Z',
        status: 'confirmed',
        type: 'recordatorio_interno',
        patient_id: 'patient-1',
    }, now),
    false,
    'internal reminders are not clinical appointments',
);

assert.equal(
    shouldAutoCompleteForSurvey({
        end_time: '2026-06-03T18:00:00.000Z',
        status: 'cancelled',
        type: 'consulta',
        patient_id: 'patient-1',
    }, now),
    false,
    'cancelled appointments must not auto-complete',
);

assert.equal(
    shouldAutoCompleteForSurvey({
        end_time: '2026-06-03T18:00:00.000Z',
        status: 'confirmed',
        type: 'consulta',
        patient_id: null,
    }, now),
    false,
    'clinical appointments still require a patient',
);

assert.equal(
    shouldAutoCompleteForSurvey({
        end_time: '2026-06-03T07:59:59.000Z',
        status: 'confirmed',
        type: 'consulta',
        patient_id: 'patient-1',
    }, now),
    false,
    'old confirmed rows should not trigger a delayed review blast',
);

console.log('agenda-auto-complete-surveys.spec.ts: ok');
