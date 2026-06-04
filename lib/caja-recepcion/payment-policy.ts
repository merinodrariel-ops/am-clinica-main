export type MetodoPagoCuota =
    | 'Efectivo'
    | 'Transferencia'
    | 'Tarjeta_Credito'
    | 'Tarjeta_Debito'
    | 'MercadoPago'
    | 'Cripto';

export const PAYMENT_SURCHARGES: Record<MetodoPagoCuota, number> = {
    Efectivo: 0,
    Transferencia: 0.10,
    Tarjeta_Debito: 0.15,
    Tarjeta_Credito: 0.15,
    MercadoPago: 0.10,
    Cripto: 0,
};

export interface PaymentPolicySplit {
    amountUsd: number;
    metodoPago: MetodoPagoCuota;
}

function roundUsd(value: number) {
    return Math.round(value * 100) / 100;
}

function positiveAmount(value: number) {
    return Math.max(0, Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function getPaymentSurcharge(metodoPago: MetodoPagoCuota) {
    return PAYMENT_SURCHARGES[metodoPago] || 0;
}

export function getInstallmentCashEquivalentUsd(splits: PaymentPolicySplit[]) {
    const total = splits.reduce((sum, split) => {
        const surcharge = getPaymentSurcharge(split.metodoPago);
        return sum + positiveAmount(split.amountUsd) / (1 + surcharge);
    }, 0);

    return roundUsd(total);
}
