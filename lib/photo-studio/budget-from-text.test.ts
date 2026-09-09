import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetAlternativeFromPhotoText } from './budget-from-text';

test('imports a dotted clinic amount without treating x10 as the price', () => {
    const option = budgetAlternativeFromPhotoText('Cerámicas x 10..... 15.000 by AM', 'text-1');

    assert.equal(option.title, 'Cerámicas x 10 by AM');
    assert.equal(option.total, 15000);
    assert.equal(option.currency, 'USD');
    assert.equal(option.sourceTextId, 'text-1');
});

test('uses explicitly marked pesos as ARS', () => {
    const option = budgetAlternativeFromPhotoText('Blanqueamiento $ 250.000', 'text-2');

    assert.equal(option.title, 'Blanqueamiento');
    assert.equal(option.total, 250000);
    assert.equal(option.currency, 'ARS');
});
