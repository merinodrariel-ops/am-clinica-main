import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getPatientSearchTokens,
    patientMatchesSearch,
    shouldUseOnlyWithPhotosFilter,
} from './patient-search';

test('patient search matches first-name last-name even when the stored fields are inverted', () => {
    const invertedPatient = {
        nombre: 'Zapata',
        apellido: 'Tamara',
        email: null,
        documento: null,
        whatsapp: null,
    };

    assert.equal(patientMatchesSearch(invertedPatient, getPatientSearchTokens('Tamara Zapata')), true);
    assert.equal(patientMatchesSearch(invertedPatient, getPatientSearchTokens('Zapata Tamara')), true);
});

test('patient search ignores accents and punctuation across name tokens', () => {
    const patient = {
        nombre: 'José Luis',
        apellido: 'García-Pérez',
        email: null,
        documento: null,
        whatsapp: null,
    };

    assert.equal(patientMatchesSearch(patient, getPatientSearchTokens('garcia jose')), true);
    assert.equal(patientMatchesSearch(patient, getPatientSearchTokens('Jose Perez')), true);
});

test('only-with-photos filter is disabled while searching so unlinked patients remain findable', () => {
    assert.equal(shouldUseOnlyWithPhotosFilter(true, ''), true);
    assert.equal(shouldUseOnlyWithPhotosFilter(true, 'Tamara Zapata'), false);
    assert.equal(shouldUseOnlyWithPhotosFilter(false, 'Tamara Zapata'), false);
});
