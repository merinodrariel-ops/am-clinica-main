import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFreeTextHistoriaEntry } from './clinical-history';

test('keeps the free clinical note as the primary saved content', () => {
    const entry = buildFreeTextHistoriaEntry({
        text: 'Control postoperatorio. Paciente evoluciona bien.\nSe indica higiene y control en 7 dias.',
    });

    assert.equal(
        entry.observaciones_clinicas,
        'Control postoperatorio. Paciente evoluciona bien.\nSe indica higiene y control en 7 dias.'
    );
    assert.equal(entry.tratamiento_realizado, 'Control postoperatorio. Paciente evoluciona bien.');
});

test('uses a generic compatibility title when the free note is empty after trimming', () => {
    const entry = buildFreeTextHistoriaEntry({ text: '   \n  ' });

    assert.equal(entry.observaciones_clinicas, '');
    assert.equal(entry.tratamiento_realizado, 'Entrada clinica');
});

test('limits the compatibility title without truncating the clinical note', () => {
    const longText = 'A'.repeat(180);
    const entry = buildFreeTextHistoriaEntry({ text: longText });

    assert.equal(entry.observaciones_clinicas, longText);
    assert.equal(entry.tratamiento_realizado, `${'A'.repeat(117)}...`);
});
