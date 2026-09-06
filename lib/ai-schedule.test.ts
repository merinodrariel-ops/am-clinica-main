import assert from 'node:assert/strict';
import test from 'node:test';
import { aiScheduleJsonSchema, parseAiSchedule } from './ai-schedule';

const personalId = '123e4567-e89b-42d3-a456-426614174000';
const record = { personal_id: personalId, fecha: '2026-09-05', hora_ingreso: '09:00', hora_egreso: '17:30', estado: 'pending' };
const response = (registros: unknown[]) => JSON.stringify({ registros, mensaje_al_usuario: 'Listo para revisar.' });

test('schedule import computes hours from clocks and ignores model supplied totals', () => {
    const result = parseAiSchedule(response([{ ...record, horas: 1000 }]), [personalId]);
    assert.equal(result.registros[0].horas, 8.5);
    assert.equal(result.registros[0].estado, 'pending');
    assert.equal(result.registros[0].salida_dia_siguiente, false);
    assert.equal(result.mensaje_al_usuario, 'Listo para revisar.');
});

test('overnight shifts use existing deterministic attendance rules', () => {
    const result = parseAiSchedule(response([{ ...record, hora_ingreso: '22:15', hora_egreso: '06:00' }]), [personalId]);
    assert.equal(result.registros[0].horas, 7.75);
    assert.equal(result.registros[0].salida_dia_siguiente, true);
});

test('missing or identical clock entries are flagged for review', () => {
    for (const hora_egreso of [null, '09:00']) {
        const result = parseAiSchedule(response([{ ...record, hora_egreso }]), [personalId]);
        assert.equal(result.registros[0].horas, 0);
        assert.equal(result.registros[0].estado, 'observado');
    }
});

test('schedule rejects invalid dates, clock times, IDs and unexpected states', () => {
    for (const override of [
        { fecha: '2026-02-29' }, { fecha: '2026-04-31' }, { fecha: '2026-13-01' },
        { hora_ingreso: '24:00' }, { hora_egreso: '12:60' },
        { personal_id: 'not-a-uuid' }, { estado: 'approved' },
    ]) assert.throws(() => parseAiSchedule(response([{ ...record, ...override }]), [personalId]));
    assert.equal(parseAiSchedule(response([{ ...record, fecha: '2028-02-29' }]), [personalId]).registros.length, 1);
});

test('entire batch rejects unlisted staff and duplicate shifts before insertion', () => {
    assert.throws(() => parseAiSchedule(response([record]), []), /personal activo/);
    assert.throws(() => parseAiSchedule(response([record, record]), [personalId]), /duplicados/);
    assert.throws(() => parseAiSchedule(response([record, { ...record, fecha: 'bad' }]), [personalId]));
});

test('malformed JSON and incomplete envelopes fail; empty legitimate response is allowed', () => {
    for (const value of ['```json\n{}\n```', '{}', '{', '{"registros":null}']) {
        assert.throws(() => parseAiSchedule(value, [personalId]));
    }
    assert.deepEqual(parseAiSchedule(response([]), [personalId]).registros, []);
    assert.equal(aiScheduleJsonSchema.type, 'object');
});

test('active Prosoft implicit AI fallback computes hours and preserves review state', async () => {
    const { parseAiImplicitHours } = await import('./ai-schedule');
    const cell = { entrada: '20:00', salida: '06:00', horas: 999, incompleto: false, observaciones: 'Turno noche' };
    assert.deepEqual(parseAiImplicitHours(JSON.stringify(cell)), { ...cell, horas: 10 });
    assert.equal(parseAiImplicitHours(JSON.stringify({ ...cell, salida: null })).incompleto, true);
    assert.equal(parseAiImplicitHours(JSON.stringify({ ...cell, salida: null })).horas, 0);
    assert.equal(parseAiImplicitHours(JSON.stringify({ ...cell, incompleto: true })).incompleto, true);
    assert.throws(() => parseAiImplicitHours(JSON.stringify({ ...cell, entrada: '28:00' })));
    assert.throws(() => parseAiImplicitHours('{}'));
});
