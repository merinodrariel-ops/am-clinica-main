import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildFinancingStatusMessage,
    getFinancingStatusSummary,
    type FinancingStatusInput,
} from './financing-status-message';

const basePlan: FinancingStatusInput = {
    patientName: 'Gustavo Vargas',
    treatment: 'Implante',
    totalInstallments: 6,
    paidInstallments: 3,
    installmentUsd: 780,
    remainingUsd: 2340,
    creditBalanceUsd: 0,
    currentPayment: {
        installmentNumber: 3,
        totalInstallments: 6,
        paidUsd: 780,
        paidDate: '2026-07-04',
    },
};

test('summarizes a financing plan in progress after a quota payment', () => {
    const summary = getFinancingStatusSummary(basePlan);

    assert.deepEqual(summary, {
        patientName: 'Gustavo Vargas',
        treatment: 'Implante',
        paidInstallments: 3,
        totalInstallments: 6,
        remainingInstallments: 3,
        installmentUsd: 780,
        remainingUsd: 2340,
        creditBalanceUsd: 0,
        nextInstallmentNumber: 4,
        currentInstallmentLabel: 'Cuota 3/6',
        statusLabel: 'Plan en curso',
    });
});

test('builds a WhatsApp-ready financing status message', () => {
    const message = buildFinancingStatusMessage(basePlan);

    assert.match(message, /Hola Gustavo Vargas/);
    assert.match(message, /Tratamiento: Implante/);
    assert.match(message, /Cuota abonada: 3\/6/);
    assert.match(message, /Cuotas pagadas: 3 de 6/);
    assert.match(message, /Cuotas restantes: 3/);
    assert.match(message, /Valor de cuota: USD 780\.00/);
    assert.match(message, /Saldo restante: USD 2340\.00/);
    assert.match(message, /Próxima cuota: 4\/6/);
});

test('handles the first financing payment without treating the advance as a paid installment', () => {
    const message = buildFinancingStatusMessage({
        patientName: 'Ana Zapata',
        treatment: 'Diseño 3D',
        totalInstallments: 12,
        paidInstallments: 0,
        installmentUsd: 500,
        remainingUsd: 6000,
        creditBalanceUsd: 120,
    });

    assert.match(message, /Cuotas pagadas: 0 de 12/);
    assert.match(message, /Cuotas restantes: 12/);
    assert.match(message, /Próxima cuota: 1\/12/);
    assert.match(message, /Saldo a favor: USD 120\.00/);
    assert.doesNotMatch(message, /Cuota abonada:/);
});
