import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePrestacionCatalogoPayload } from './prestaciones-catalog';

test('normalizePrestacionCatalogoPayload trims and rounds editable catalog fields', () => {
    const payload = normalizePrestacionCatalogoPayload({
        nombre: '  Carillas  ',
        area_nombre: '  Estetica  ',
        precio_base: 1234.567,
        moneda: 'USD',
        terminos: '  Nota interna  ',
    });

    assert.deepEqual(payload, {
        nombre: 'Carillas',
        area_nombre: 'Estetica',
        precio_base: 1234.57,
        moneda: 'USD',
        terminos: 'Nota interna',
    });
});

test('normalizePrestacionCatalogoPayload rejects blank names', () => {
    assert.throws(
        () => normalizePrestacionCatalogoPayload({
            nombre: '   ',
            area_nombre: 'Odontología',
            precio_base: 10,
            moneda: 'ARS',
        }),
        /nombre/i
    );
});

