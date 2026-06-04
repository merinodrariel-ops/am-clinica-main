export interface InstallmentCreditInput {
    cashPaidUsd: number;
    installmentUsd: number;
    currentPatientCreditUsd: number;
    manualHistoricalCreditUsd?: number;
}

export interface InstallmentCreditResult {
    creditAppliedUsd: number;
    creditGeneratedUsd: number;
    nextPatientCreditUsd: number;
    creditedInstallmentUsd: number;
}

function roundUsd(value: number) {
    return Math.round(value * 100) / 100;
}

function positiveAmount(value: number | undefined) {
    return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function calculateInstallmentCreditBalance(input: InstallmentCreditInput): InstallmentCreditResult {
    const cashPaidUsd = roundUsd(positiveAmount(input.cashPaidUsd));
    const installmentUsd = roundUsd(positiveAmount(input.installmentUsd));
    const currentPatientCreditUsd = roundUsd(positiveAmount(input.currentPatientCreditUsd));
    const manualHistoricalCreditUsd = roundUsd(positiveAmount(input.manualHistoricalCreditUsd));

    const availableCreditUsd = roundUsd(currentPatientCreditUsd + manualHistoricalCreditUsd);
    const shortfallUsd = roundUsd(Math.max(0, installmentUsd - cashPaidUsd));
    const creditAppliedUsd = roundUsd(Math.min(shortfallUsd, availableCreditUsd));
    const creditGeneratedUsd = roundUsd(Math.max(0, cashPaidUsd - installmentUsd));
    const nextPatientCreditUsd = roundUsd(availableCreditUsd - creditAppliedUsd + creditGeneratedUsd);
    const creditedInstallmentUsd = roundUsd(cashPaidUsd + creditAppliedUsd);

    return {
        creditAppliedUsd,
        creditGeneratedUsd,
        nextPatientCreditUsd,
        creditedInstallmentUsd,
    };
}
