import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildPreloadedPatientPayload,
    splitPatientDisplayName,
} from './preloaded-patient';

test('splits a typed patient name into first name and last name', () => {
    assert.deepEqual(splitPatientDisplayName('Maria Eugenia Molina'), {
        nombre: 'Maria Eugenia',
        apellido: 'Molina',
    });
});

test('builds a preloaded professional-owned patient payload', () => {
    const payload = buildPreloadedPatientPayload({
        displayName: 'Luz Rossini',
        whatsapp: '11 2233-4455',
        email: 'LUZ@example.com',
        doctorName: 'Candela Cruz',
    });

    assert.equal(payload.nombre, 'Luz');
    assert.equal(payload.apellido, 'Rossini');
    assert.equal(payload.whatsapp_pais_code, '+54');
    assert.equal(payload.whatsapp_numero, '1122334455');
    assert.equal(payload.whatsapp, '+541122334455');
    assert.equal(payload.email, 'luz@example.com');
    assert.equal(payload.estado_paciente, 'Pendiente formulario');
    assert.equal(payload.origen_registro, 'Paciente propio profesional');
    assert.equal(payload.referencia_origen, 'Paciente propio profesional');
    assert.match(payload.observaciones_generales || '', /Candela Cruz/);
    assert.equal(payload.consentimiento_comunicacion, false);
});
