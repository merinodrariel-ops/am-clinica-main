import assert from 'node:assert/strict';
import test from 'node:test';
import { agendaUpdateNeedsCurrentState, validateAgendaAppointment, validateAgendaAppointmentUpdate, APPOINTMENT_TYPE_OPTIONS, TYPE_DURATIONS_MIN, type AgendaPolicyFields } from './agenda-form-policy';

const clinical: AgendaPolicyFields = { type: 'consulta', patient_id: 'patient', doctor_id: 'doctor', start_time: '2026-09-05T10:00:00-03:00', end_time: '2026-09-05T11:00:00-03:00' };
const meeting = { ...clinical, type: 'reunion', patient_id: null };

test('create requires a clinical patient and meeting responsible but permits internal reminders', () => {
    assert.equal(validateAgendaAppointment(clinical), null);
    assert.match(validateAgendaAppointment({ ...clinical, patient_id: null })!, /paciente/);
    assert.equal(validateAgendaAppointment(meeting), null);
    assert.match(validateAgendaAppointment({ ...meeting, doctor_id: null })!, /responsable/);
    assert.equal(validateAgendaAppointment({ ...meeting, type: 'recordatorio_interno', doctor_id: null }), null);
    assert.match(validateAgendaAppointment({ ...clinical, type: 'tipo_importado', patient_id: '' })!, /paciente/);
});

test('create rejects empty, impossible, invalid or nonpositive date intervals', () => {
    for (const start_time of ['', 'bad', '2026-02-30T10:00', '2026-09-05T24:00', new Date(NaN)]) {
        assert.match(validateAgendaAppointment({ ...clinical, start_time })!, /válidas/);
    }
    assert.match(validateAgendaAppointment({ ...clinical, end_time: clinical.start_time })!, /posterior/);
    assert.match(validateAgendaAppointment({ ...clinical, end_time: '2026-09-05T09:00-03:00' })!, /posterior/);
    assert.equal(validateAgendaAppointment({ ...clinical, start_time: '2026-09-05T23:00-03:00', end_time: '2026-09-06T01:00-03:00' }), null);
    assert.equal(validateAgendaAppointment({ ...clinical, start_time: '2028-02-29T10:00', end_time: '2028-02-29T11:00' }), null);
});

test('partial updates validate changed rules against stored counterparts', () => {
    assert.equal(validateAgendaAppointmentUpdate({ type: 'reunion' }, meeting), null);
    assert.match(validateAgendaAppointmentUpdate({ type: 'consulta' }, meeting)!, /paciente/);
    assert.match(validateAgendaAppointmentUpdate({ patient_id: null }, clinical)!, /paciente/);
    assert.match(validateAgendaAppointmentUpdate({ doctor_id: null }, meeting)!, /responsable/);
    assert.equal(validateAgendaAppointmentUpdate({ type: 'recordatorio_interno', patient_id: null, doctor_id: null }, clinical), null);
    assert.match(validateAgendaAppointmentUpdate({ start_time: '2026-09-05T12:00-03:00' }, clinical)!, /posterior/);
    assert.equal(validateAgendaAppointmentUpdate({ end_time: '2026-09-05T12:00-03:00' }, clinical), null);
    assert.equal(validateAgendaAppointmentUpdate({ type: 'reunion', doctor_id: undefined }, meeting), null);
});

test('cancelling or changing status does not reject legacy incomplete appointments', () => {
    const legacy = { type: 'consulta', patient_id: null, doctor_id: null, start_time: null, end_time: null };
    for (const status of ['cancelled', 'no_show', 'completed', 'confirmed']) {
        assert.equal(validateAgendaAppointmentUpdate({ status }, legacy), null);
        assert.equal(agendaUpdateNeedsCurrentState({ status }), false);
    }
});

test('stored state is fetched only for omitted dependencies of changed fields', () => {
    for (const update of [{ start_time: clinical.start_time }, { patient_id: null }, { doctor_id: null }, { type: 'consulta' }, { type: 'reunion' }]) {
        assert.equal(agendaUpdateNeedsCurrentState(update), true);
    }
    for (const update of [{}, { start_time: clinical.start_time, end_time: clinical.end_time }, { type: 'recordatorio_interno' }, { type: 'reunion', doctor_id: 'doctor' }, { type: 'consulta', patient_id: 'patient' }]) {
        assert.equal(agendaUpdateNeedsCurrentState(update), false);
    }
});

test('existing appointment options and preset durations remain available', () => {
    assert.equal(APPOINTMENT_TYPE_OPTIONS.length, 14);
    assert.equal(TYPE_DURATIONS_MIN.consulta, 60);
    assert.equal(TYPE_DURATIONS_MIN.reunion, 30);
    assert.equal(TYPE_DURATIONS_MIN.cementado, 240);
});
