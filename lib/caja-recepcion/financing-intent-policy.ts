export interface FinancingAdvanceSummaryInput {
    treatmentTotalUsd: number;
    extraAdjustmentsUsd?: number;
    previousDepositUsd?: number;
    currentPaymentUsd?: number;
}

export interface FinancingAdvanceSummary {
    treatmentTotalUsd: number;
    extraAdjustmentsUsd: number;
    contractualTotalUsd: number;
    previousDepositUsd: number;
    currentPaymentUsd: number;
    totalAdvanceUsd: number;
    saldoToFinanceUsd: number;
}

function roundUsd(value: number) {
    return Math.round(value * 100) / 100;
}

function positiveAmount(value: number | undefined) {
    return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function calculateFinancingAdvanceSummary(input: FinancingAdvanceSummaryInput): FinancingAdvanceSummary {
    const treatmentTotalUsd = roundUsd(positiveAmount(input.treatmentTotalUsd));
    const extraAdjustmentsUsd = roundUsd(positiveAmount(input.extraAdjustmentsUsd));
    const previousDepositUsd = roundUsd(positiveAmount(input.previousDepositUsd));
    const currentPaymentUsd = roundUsd(positiveAmount(input.currentPaymentUsd));

    const contractualTotalUsd = roundUsd(treatmentTotalUsd + extraAdjustmentsUsd);
    const totalAdvanceUsd = roundUsd(previousDepositUsd + currentPaymentUsd);
    const saldoToFinanceUsd = roundUsd(Math.max(0, contractualTotalUsd - totalAdvanceUsd));

    return {
        treatmentTotalUsd,
        extraAdjustmentsUsd,
        contractualTotalUsd,
        previousDepositUsd,
        currentPaymentUsd,
        totalAdvanceUsd,
        saldoToFinanceUsd,
    };
}

export function requiresTreatmentTotalForAdvance(isAdvanceFlow: boolean, treatmentTotalUsd: number) {
    return isAdvanceFlow && positiveAmount(treatmentTotalUsd) <= 0;
}
