import test from 'node:test';
import assert from 'node:assert/strict';

import { getInstallmentCashEquivalentUsd, getPaymentSurcharge } from './payment-policy';

test('calculates mixed installment cash equivalent after method surcharges', () => {
    const result = getInstallmentCashEquivalentUsd([
        { amountUsd: 50, metodoPago: 'Efectivo' },
        { amountUsd: 55, metodoPago: 'Transferencia' },
        { amountUsd: 57.5, metodoPago: 'Tarjeta_Credito' },
    ]);

    assert.equal(result, 150);
});

test('keeps policy surcharges aligned with installment contracts', () => {
    assert.equal(getPaymentSurcharge('Efectivo'), 0);
    assert.equal(getPaymentSurcharge('Transferencia'), 0.10);
    assert.equal(getPaymentSurcharge('MercadoPago'), 0.10);
    assert.equal(getPaymentSurcharge('Tarjeta_Credito'), 0.15);
    assert.equal(getPaymentSurcharge('Tarjeta_Debito'), 0.15);
    assert.equal(getPaymentSurcharge('Cripto'), 0);
});
