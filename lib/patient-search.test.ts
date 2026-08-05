import test from 'node:test';
import assert from 'node:assert/strict';

import {
    filterAndRankPatientSearchResults,
    getPatientNameTokenKey,
    getPatientSearchCandidateTokens,
    getPatientSearchTokens,
    patientNameTokensLookEquivalent,
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

test('patient name token key detects likely inverted duplicate names', () => {
    const stored = { nombre: 'Anaí', apellido: 'Yañez' };
    const incoming = { nombre: 'Yanez', apellido: 'Anahi' };

    assert.equal(getPatientNameTokenKey({ nombre: 'Anahí', apellido: 'Yañez' }), getPatientNameTokenKey(incoming));
    assert.equal(patientNameTokensLookEquivalent(stored, incoming), true);
    assert.equal(patientNameTokensLookEquivalent(stored, { nombre: 'Yañes', apellido: 'Anahi' }), true);
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

test('patient search tolerates short first-name spelling variants when the surname matches', () => {
    const patient = {
        nombre: 'Anahí',
        apellido: 'Yañez',
        email: null,
        documento: null,
        whatsapp: null,
    };

    assert.equal(patientMatchesSearch(patient, getPatientSearchTokens('Anaí Yanez')), true);
    assert.equal(patientMatchesSearch(patient, getPatientSearchTokens('Yanez Anais')), true);
});

test('only-with-photos filter is disabled while searching so unlinked patients remain findable', () => {
    assert.equal(shouldUseOnlyWithPhotosFilter(true, ''), true);
    assert.equal(shouldUseOnlyWithPhotosFilter(true, 'Tamara Zapata'), false);
    assert.equal(shouldUseOnlyWithPhotosFilter(false, 'Tamara Zapata'), false);
});

test('single-token candidate search does not expand to noisy three-letter prefixes', () => {
    assert.deepEqual(getPatientSearchCandidateTokens(getPatientSearchTokens('Perren')), ['perren']);
    assert.deepEqual(getPatientSearchCandidateTokens(getPatientSearchTokens('Gustavo')), ['gustavo']);
    assert.deepEqual(getPatientSearchCandidateTokens(getPatientSearchTokens('Gustavo Vargas')), [
        'gustavo',
        'gus',
        'vargas',
        'var',
    ]);
});

test('agenda-style search removes prefix noise before limiting results', () => {
    const noisyCandidates = [
        { nombre: 'Agustín', apellido: 'Aguilar' },
        { nombre: 'Agustina', apellido: 'Bolla' },
        { nombre: 'Gustavo', apellido: 'Oro' },
        { nombre: 'Gustavo', apellido: 'Vargas' },
    ];

    assert.deepEqual(
        filterAndRankPatientSearchResults(noisyCandidates, 'Gustavo').map((patient) => `${patient.nombre} ${patient.apellido}`),
        ['Gustavo Oro', 'Gustavo Vargas']
    );
});

test('agenda-style search keeps an exact patient even after ten broader prefix candidates', () => {
    const prefixNoise = [
        'Peralta', 'Pereira', 'Perelman', 'Perez', 'Perretta',
        'Peralta Dos', 'Pereira Dos', 'Perelman Dos', 'Perez Dos', 'Perretta Dos',
    ].map((apellido, index) => ({ nombre: `Paciente ${index}`, apellido }));
    const candidates = [...prefixNoise, { nombre: 'Fernando', apellido: 'Perren' }];

    assert.deepEqual(filterAndRankPatientSearchResults(candidates, 'Perren'), [
        { nombre: 'Fernando', apellido: 'Perren' },
    ]);
    assert.deepEqual(filterAndRankPatientSearchResults(candidates, 'Fernando Perren'), [
        { nombre: 'Fernando', apellido: 'Perren' },
    ]);
});
