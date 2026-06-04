import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateInstallmentCreditBalance } from './credit-balance';

test('applies manual historical credit to cover a small shortfall without creating cash income', () => {
    const result = calculateInstallmentCreditBalance({
        cashPaidUsd: 99.35,
        installmentUsd: 100,
        currentPatientCreditUsd: 0,
        manualHistoricalCreditUsd: 0.65,
    });

    assert.deepEqual(result, {
        creditAppliedUsd: 0.65,
        creditGeneratedUsd: 0,
        nextPatientCreditUsd: 0,
        creditedInstallmentUsd: 100,
    });
});

test('keeps unused manual historical credit on the patient when credit exceeds the shortfall', () => {
    const result = calculateInstallmentCreditBalance({
        cashPaidUsd: 99.35,
        installmentUsd: 100,
        currentPatientCreditUsd: 0,
        manualHistoricalCreditUsd: 1,
    });

    assert.deepEqual(result, {
        creditAppliedUsd: 0.65,
        creditGeneratedUsd: 0,
        nextPatientCreditUsd: 0.35,
        creditedInstallmentUsd: 100,
    });
});

test('preserves existing automatic overpayment credit behavior', () => {
    const result = calculateInstallmentCreditBalance({
        cashPaidUsd: 102,
        installmentUsd: 100,
        currentPatientCreditUsd: 3,
        manualHistoricalCreditUsd: 0,
    });

    assert.deepEqual(result, {
        creditAppliedUsd: 0,
        creditGeneratedUsd: 2,
        nextPatientCreditUsd: 5,
        creditedInstallmentUsd: 102,
    });
});
