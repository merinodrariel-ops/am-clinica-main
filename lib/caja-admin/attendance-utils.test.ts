import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateWorkedHours, inferSalidaDiaSiguiente } from './attendance-utils';

test('calculateWorkedHours handles same-day shifts', () => {
    assert.equal(calculateWorkedHours({ horaIngreso: '08:00', horaEgreso: '17:00' }), 9);
});

test('calculateWorkedHours handles overnight shifts automatically', () => {
    assert.equal(calculateWorkedHours({ horaIngreso: '20:00', horaEgreso: '01:00' }), 5);
});

test('calculateWorkedHours respects explicit next-day exit flag', () => {
    assert.equal(calculateWorkedHours({ horaIngreso: '23:30', horaEgreso: '00:30', salidaDiaSiguiente: true }), 1);
});

test('inferSalidaDiaSiguiente detects exits after midnight', () => {
    assert.equal(inferSalidaDiaSiguiente('22:15', '00:45'), true);
    assert.equal(inferSalidaDiaSiguiente('08:00', '16:00'), false);
});
