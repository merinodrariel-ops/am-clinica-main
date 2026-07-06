import assert from 'node:assert/strict';
import test from 'node:test';
import {
    calculateFinancingBreakdown,
    DEFAULT_MONTHLY_INTEREST_PCT,
    DEFAULT_DAILY_PENALTY_INTEREST_PCT,
} from './financial-engine';

test('30% upfront over USD 1000 splits principal correctly', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 30, installments: 3, monthlyInterestPct: 0 });
    assert.equal(b.totalUsd, 1000);
    assert.equal(b.upfrontUsd, 300);
    assert.equal(b.financedPrincipalUsd, 700);
});

test('zero interest splits the financed principal in equal installments', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1200, upfrontPct: 50, installments: 6, monthlyInterestPct: 0 });
    assert.equal(b.upfrontUsd, 600);
    assert.equal(b.installmentUsd, 100);
    assert.equal(b.financedTotalUsd, 600);
    assert.equal(b.totalInterestUsd, 0);
});

test('french amortization with interest: installments cover principal plus interest', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 0, installments: 12, monthlyInterestPct: 1.5 });
    // Cuota francesa de 1000 al 1.5% mensual x12 ≈ 91.68
    assert.ok(Math.abs(b.installmentUsd - 91.68) < 0.02, `installment ${b.installmentUsd}`);
    assert.ok(b.totalInterestUsd > 0);
    // La suma de cuotas es exactamente financedTotal (sin perder centavos)
    assert.ok(Math.abs(b.installmentUsd * b.installments - b.financedTotalUsd) < 0.005);
    assert.ok(Math.abs(b.financedTotalUsd - (b.financedPrincipalUsd + b.totalInterestUsd)) < 0.005);
});

test('single installment charges no interest (pago unico)', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 500, upfrontPct: 0, installments: 1, monthlyInterestPct: 2 });
    assert.equal(b.installmentUsd, 500);
    assert.equal(b.totalInterestUsd, 0);
});

test('defaults to the standard monthly interest when not provided', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 0, installments: 6 });
    assert.equal(b.monthlyInterestPct, DEFAULT_MONTHLY_INTEREST_PCT);
});

test('ARS conversion applies the BNA venta rate to every amount', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 30, installments: 3, monthlyInterestPct: 0, bnaVentaArs: 1500 });
    assert.equal(b.totalArs, 1_500_000);
    assert.equal(b.upfrontArs, 450_000);
    assert.ok(Math.abs(b.installmentArs - b.installmentUsd * 1500) < 0.01);
});

test('missing or invalid BNA rate yields ARS 0 instead of NaN', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 0, installments: 3 });
    assert.equal(b.totalArs, 0);
    assert.equal(b.installmentArs, 0);
    const b2 = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 0, installments: 3, bnaVentaArs: NaN });
    assert.equal(b2.totalArs, 0);
});

test('hostile inputs are sanitized (negatives, NaN, fractional installments)', () => {
    const b = calculateFinancingBreakdown({ totalUsd: -500, upfrontPct: -10, installments: 2.9, monthlyInterestPct: NaN });
    assert.equal(b.totalUsd, 0);
    assert.equal(b.upfrontUsd, 0);
    assert.equal(b.installments, 2); // floor
    assert.equal(b.installmentUsd, 0);
    const b2 = calculateFinancingBreakdown({ totalUsd: 100, upfrontPct: 0, installments: 0 });
    assert.equal(b2.installments, 1); // minimo 1 cuota
});

test('upfront over 100% never produces negative principal', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 100, upfrontPct: 150, installments: 3, monthlyInterestPct: 0 });
    assert.equal(b.financedPrincipalUsd, 0);
    assert.equal(b.installmentUsd, 0);
});

test('daily penalty is a fixed percentage of the installment', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 1000, upfrontPct: 0, installments: 4, monthlyInterestPct: 0 });
    assert.equal(b.dailyPenaltyPct, DEFAULT_DAILY_PENALTY_INTEREST_PCT);
    assert.ok(Math.abs(b.dailyPenaltyPerInstallmentUsd - (b.installmentUsd * DEFAULT_DAILY_PENALTY_INTEREST_PCT) / 100) < 0.01);
});

test('cent-precision: no floating point drift on awkward totals', () => {
    const b = calculateFinancingBreakdown({ totalUsd: 999.99, upfrontPct: 33, installments: 3, monthlyInterestPct: 0 });
    // Todos los montos deben ser redondos al centavo
    for (const v of [b.totalUsd, b.upfrontUsd, b.financedPrincipalUsd, b.installmentUsd, b.financedTotalUsd]) {
        assert.ok(Math.abs(v * 100 - Math.round(v * 100)) < 1e-9, `no está al centavo: ${v}`);
    }
});
