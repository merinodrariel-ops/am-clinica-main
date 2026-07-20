export interface ExchangeAmounts {
    usdAmount: number;
    exchangeRate: number;
    arsAmount: number;
}

function roundCurrency(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateExchangeAmounts(
    usdAmountInput: number,
    exchangeRateInput: number,
): ExchangeAmounts {
    const usdAmount = Number(usdAmountInput);
    const exchangeRate = Number(exchangeRateInput);

    if (!Number.isFinite(usdAmount) || usdAmount <= 0) {
        throw new Error('El monto en USD debe ser mayor a cero.');
    }

    if (!Number.isFinite(exchangeRate) || exchangeRate <= 0) {
        throw new Error('Ingresa la cotizacion pactada con la casa de cambio.');
    }

    return {
        usdAmount: roundCurrency(usdAmount),
        exchangeRate: roundCurrency(exchangeRate),
        arsAmount: roundCurrency(usdAmount * exchangeRate),
    };
}

export function isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
