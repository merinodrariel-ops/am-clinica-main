import test from 'node:test';
import assert from 'node:assert/strict';

import {
    normalizeAppointmentModality,
    parseAppointmentModality,
    serializeAppointmentNotes,
    stripAppointmentMeta,
} from './agenda-appointment-meta';

test('normalizes appointment modality values', () => {
    assert.equal(normalizeAppointmentModality('virtual'), 'virtual');
    assert.equal(normalizeAppointmentModality('presencial'), 'presencial');
    assert.equal(normalizeAppointmentModality(''), 'presencial');
    assert.equal(normalizeAppointmentModality(null), 'presencial');
});

test('keeps appointment modality metadata out of visible notes', () => {
    const serialized = serializeAppointmentNotes({
        visibleNotes: 'Enviar link por WhatsApp',
        type: 'consulta',
        modality: 'virtual',
    });

    assert.equal(parseAppointmentModality(serialized), 'virtual');
    assert.equal(stripAppointmentMeta(serialized), 'Enviar link por WhatsApp');
});
