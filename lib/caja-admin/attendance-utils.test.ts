import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateWorkedHours, inferSalidaDiaSiguiente } from './attendance-utils';

test('calculateWorkedHours handles same-day shifts', () => {
    assert.equal(calculateWorkedHours({ horaIngreso: '08:00', horaEgreso: '17:00' }), 9);
});

test('calculateWorkedHours handles overnight shifts automatically', () => {
    assert.equal(calculateWorkedHours({ horaIngreso: '20:00', horaEgreso: '01:00' }), 5);
});

test('calculateWorkedHours ignores explicit next-day flag when exit is later same day', () => {
    assert.equal(calculateWorkedHours({ horaIngreso: '05:06', horaEgreso: '08:06', salidaDiaSiguiente: true }), 3);
    assert.equal(calculateWorkedHours({ horaIngreso: '09:32', horaEgreso: '11:32', salidaDiaSiguiente: true }), 2);
});

test('inferSalidaDiaSiguiente detects exits after midnight', () => {
    assert.equal(inferSalidaDiaSiguiente('22:15', '00:45'), true);
    assert.equal(inferSalidaDiaSiguiente('08:00', '16:00'), false);
});
