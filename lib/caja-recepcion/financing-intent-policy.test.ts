import test from 'node:test';
import assert from 'node:assert/strict';

import {
    calculateFinancingAdvanceSummary,
    requiresTreatmentTotalForAdvance,
} from './financing-intent-policy';

test('calculates the contractual total and saldo to finance from treatment total, extras and deposits', () => {
    const summary = calculateFinancingAdvanceSummary({
        treatmentTotalUsd: 18000,
        extraAdjustmentsUsd: 700,
        previousDepositUsd: 3000,
        currentPaymentUsd: 6000,
    });

    assert.equal(summary.treatmentTotalUsd, 18000);
    assert.equal(summary.extraAdjustmentsUsd, 700);
    assert.equal(summary.contractualTotalUsd, 18700);
    assert.equal(summary.totalAdvanceUsd, 9000);
    assert.equal(summary.saldoToFinanceUsd, 9700);
});

test('requires a treatment total only for advance financing flows', () => {
    assert.equal(requiresTreatmentTotalForAdvance(true, 0), true);
    assert.equal(requiresTreatmentTotalForAdvance(true, 12000), false);
    assert.equal(requiresTreatmentTotalForAdvance(false, 0), false);
});
