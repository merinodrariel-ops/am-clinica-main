export interface FinancingStatusInput {
    patientName: string;
    treatment?: string | null;
    totalInstallments: number;
    paidInstallments: number;
    installmentUsd: number;
    remainingUsd: number;
    creditBalanceUsd?: number | null;
    currentPayment?: {
        installmentNumber?: number | null;
        totalInstallments?: number | null;
        paidUsd?: number | null;
        paidDate?: string | null;
    } | null;
}

export interface FinancingStatusSummary {
    patientName: string;
    treatment: string;
    paidInstallments: number;
    totalInstallments: number;
    remainingInstallments: number;
    installmentUsd: number;
    remainingUsd: number;
    creditBalanceUsd: number;
    nextInstallmentNumber: number | null;
    currentInstallmentLabel: string | null;
    statusLabel: 'Plan en curso' | 'Plan finalizado';
}

function positiveCurrency(value: number | null | undefined) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round((parsed + Number.EPSILON) * 100) / 100 : 0;
}

function positiveInteger(value: number | null | undefined) {
    const parsed = Math.floor(Number(value || 0));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatUsd(value: number) {
    return `USD ${positiveCurrency(value).toFixed(2)}`;
}

export function getFinancingStatusSummary(input: FinancingStatusInput): FinancingStatusSummary {
    const totalInstallments = positiveInteger(input.totalInstallments);
    const paidInstallments = Math.min(positiveInteger(input.paidInstallments), totalInstallments || positiveInteger(input.paidInstallments));
    const remainingInstallments = Math.max(0, totalInstallments - paidInstallments);
    const currentNumber = positiveInteger(input.currentPayment?.installmentNumber);
    const currentTotal = positiveInteger(input.currentPayment?.totalInstallments) || totalInstallments;

    return {
        patientName: input.patientName.trim() || 'Paciente',
        treatment: input.treatment?.trim() || 'Tratamiento financiado',
        paidInstallments,
        totalInstallments,
        remainingInstallments,
        installmentUsd: positiveCurrency(input.installmentUsd),
        remainingUsd: positiveCurrency(input.remainingUsd),
        creditBalanceUsd: positiveCurrency(input.creditBalanceUsd),
        nextInstallmentNumber: remainingInstallments > 0 ? paidInstallments + 1 : null,
        currentInstallmentLabel: currentNumber > 0 ? `Cuota ${currentNumber}/${currentTotal || '?'}` : null,
        statusLabel: remainingInstallments > 0 ? 'Plan en curso' : 'Plan finalizado',
    };
}

export function buildFinancingStatusMessage(input: FinancingStatusInput) {
    const summary = getFinancingStatusSummary(input);
    const lines = [
        `Hola ${summary.patientName}! Te compartimos cómo viene tu plan de financiación en AM Estética Dental.`,
        '',
        `Tratamiento: ${summary.treatment}`,
        `Estado: ${summary.statusLabel}`,
    ];

    if (summary.currentInstallmentLabel) {
        lines.push(`Cuota abonada: ${summary.currentInstallmentLabel.replace('Cuota ', '')}`);
    }

    lines.push(
        `Cuotas pagadas: ${summary.paidInstallments} de ${summary.totalInstallments}`,
        `Cuotas restantes: ${summary.remainingInstallments}`,
        `Valor de cuota: ${formatUsd(summary.installmentUsd)}`,
        `Saldo restante: ${formatUsd(summary.remainingUsd)}`,
    );

    if (summary.nextInstallmentNumber) {
        lines.push(`Próxima cuota: ${summary.nextInstallmentNumber}/${summary.totalInstallments}`);
    }

    if (summary.creditBalanceUsd > 0) {
        lines.push(`Saldo a favor: ${formatUsd(summary.creditBalanceUsd)}`);
    }

    lines.push('', 'Cualquier duda nos escribís y lo revisamos.');

    return lines.join('\n');
}
