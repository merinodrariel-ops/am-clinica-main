import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateExchangeAmounts, isUuid } from './exchange';

test('calcula el cambio con la cotizacion pactada, no con BNA', () => {
    assert.deepEqual(calculateExchangeAmounts(400, 1515), {
        usdAmount: 400,
        exchangeRate: 1515,
        arsAmount: 606000,
    });
});

test('rechaza montos o cotizaciones no validas', () => {
    assert.throws(() => calculateExchangeAmounts(0, 1515), /mayor a cero/);
    assert.throws(() => calculateExchangeAmounts(400, 0), /casa de cambio/);
});

test('valida claves idempotentes UUID', () => {
    assert.equal(isUuid('f5e1487a-5c6a-4544-a87d-8e6cd790e79d'), true);
    assert.equal(isUuid('no-es-un-uuid'), false);
});
