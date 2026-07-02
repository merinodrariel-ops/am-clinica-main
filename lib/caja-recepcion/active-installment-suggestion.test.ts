import test from 'node:test';
import assert from 'node:assert/strict';

import { buildActiveInstallmentSuggestion } from './active-installment-suggestion';

test('active financing plan suggests the next quota without forcing quota mode', () => {
    const suggestion = buildActiveInstallmentSuggestion({
        cuotas_pagadas: 2,
        cuotas_total: 6,
        monto_cuota_usd: 1300,
    });

    assert.deepEqual(suggestion, {
        cuota_nro: 3,
        cuotas_total: 6,
        monto_cuota_usd: 1300,
    });
    assert.equal('es_cuota' in (suggestion || {}), false);
});

test('active financing plan gives no suggestion when all quotas are paid', () => {
    assert.equal(buildActiveInstallmentSuggestion({
        cuotas_pagadas: 6,
        cuotas_total: 6,
        monto_cuota_usd: 1300,
    }), null);
});
