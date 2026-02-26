export const DEFAULT_MONTHLY_INTEREST_PCT = 1;
export const DEFAULT_DAILY_PENALTY_INTEREST_PCT = 3;

const ONE_HUNDRED_PERCENT_BPS = 10000;

export interface FinancingInput {
    totalUsd: number;
    upfrontPct: number;
    installments: number;
    monthlyInterestPct?: number;
    bnaVentaArs?: number;
}

export interface FinancingBreakdown {
    totalUsd: number;
    upfrontPct: number;
    upfrontUsd: number;
    financedPrincipalUsd: number;
    monthlyInterestPct: number;
    totalInterestUsd: number;
    financedTotalUsd: number;
    installments: number;
    installmentUsd: number;
    installmentArs: number;
    totalArs: number;
    upfrontArs: number;
    financedTotalArs: number;
    bnaVentaArs: number;
    dailyPenaltyPct: number;
    dailyPenaltyPerInstallmentUsd: number;
    dailyPenaltyPerInstallmentArs: number;
}

function toSafeNonNegativeNumber(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.max(0, value);
}

function toCents(value: number): number {
    return Math.round(toSafeNonNegativeNumber(value) * 100);
}

function fromCents(value: number): number {
    return value / 100;
}

function percentToBps(percent: number): number {
    return Math.round(toSafeNonNegativeNumber(percent) * 100);
}

function applySimpleInterest(principalCents: number, monthlyInterestPct: number, months: number): number {
    const bps = percentToBps(monthlyInterestPct);
    return Math.round((principalCents * bps * months) / ONE_HUNDRED_PERCENT_BPS);
}

function applyRateToArs(usdAmount: number, bnaVentaArs: number): number {
    if (!Number.isFinite(bnaVentaArs) || bnaVentaArs <= 0) return 0;
    return Math.round(usdAmount * bnaVentaArs * 100) / 100;
}

export function calculateFinancingBreakdown(input: FinancingInput): FinancingBreakdown {
    const installments = Math.max(1, Math.floor(toSafeNonNegativeNumber(input.installments)));
    const upfrontPct = toSafeNonNegativeNumber(input.upfrontPct);
    const monthlyInterestPct = toSafeNonNegativeNumber(
        input.monthlyInterestPct ?? DEFAULT_MONTHLY_INTEREST_PCT
    );
    const bnaVentaArs = toSafeNonNegativeNumber(input.bnaVentaArs ?? 0);

    const totalCents = toCents(input.totalUsd);
    const upfrontCents = Math.round((totalCents * upfrontPct) / 100);
    const financedPrincipalCents = Math.max(0, totalCents - upfrontCents);
    const totalInterestCents = applySimpleInterest(financedPrincipalCents, monthlyInterestPct, installments);
    const financedTotalCents = financedPrincipalCents + totalInterestCents;
    const installmentCents = Math.round(financedTotalCents / installments);

    const totalUsd = fromCents(totalCents);
    const upfrontUsd = fromCents(upfrontCents);
    const financedPrincipalUsd = fromCents(financedPrincipalCents);
    const totalInterestUsd = fromCents(totalInterestCents);
    const financedTotalUsd = fromCents(financedTotalCents);
    const installmentUsd = fromCents(installmentCents);

    const dailyPenaltyPerInstallmentUsd =
        Math.round(installmentUsd * DEFAULT_DAILY_PENALTY_INTEREST_PCT) / 100;

    return {
        totalUsd,
        upfrontPct,
        upfrontUsd,
        financedPrincipalUsd,
        monthlyInterestPct,
        totalInterestUsd,
        financedTotalUsd,
        installments,
        installmentUsd,
        installmentArs: applyRateToArs(installmentUsd, bnaVentaArs),
        totalArs: applyRateToArs(totalUsd, bnaVentaArs),
        upfrontArs: applyRateToArs(upfrontUsd, bnaVentaArs),
        financedTotalArs: applyRateToArs(financedTotalUsd, bnaVentaArs),
        bnaVentaArs,
        dailyPenaltyPct: DEFAULT_DAILY_PENALTY_INTEREST_PCT,
        dailyPenaltyPerInstallmentUsd,
        dailyPenaltyPerInstallmentArs: applyRateToArs(dailyPenaltyPerInstallmentUsd, bnaVentaArs),
    };
}

export function formatUsd(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

export function formatArs(value: number): string {
    return new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}
