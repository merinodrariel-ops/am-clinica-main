import type { PhotoBudgetAlternative } from './edit-state';

function parseAmount(value: string): number {
    const compact = value.replace(/\s/g, '');
    const normalized = compact.includes(',')
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/\./g, '');
    const amount = Number(normalized);
    return Number.isFinite(amount) ? amount : 0;
}

/**
 * Turns the notation a doctor writes over a photo into a draft budget option.
 * We deliberately only infer a number when it is marked as money or has a
 * thousands separator, so "x 10" stays part of the treatment title.
 */
export function budgetAlternativeFromPhotoText(text: string, sourceTextId: string): PhotoBudgetAlternative {
    const clean = text.trim().replace(/\s+/g, ' ');
    const explicitMoney = /(?:usd|u\$s|us\$|\$)\s*([\d.,]+)|([\d.,]+)\s*(?:usd|u\$s|us\$|d[oó]lares|pesos|\$)/i;
    const groupedNumber = /\b\d{1,3}(?:[.,]\d{3})+(?:,\d+)?\b/;
    const match = explicitMoney.exec(clean) ?? groupedNumber.exec(clean);
    const amountText = match?.[1] ?? match?.[2] ?? match?.[0] ?? '';
    // These annotations have historically been clinical quotes in USD; ARS is
    // only inferred when the person explicitly writes pesos or uses "$".
    const currency = /(?:\bpesos\b|\$)/i.test(clean) && !/\b(?:usd|u\$s|us\$)\b/i.test(clean) ? 'ARS' : 'USD';
    const title = amountText
        ? clean.replace(match![0], ' ').replace(/\s*\.{2,}\s*/g, ' ').replace(/\s{2,}/g, ' ').trim().replace(/[··.,;:-]+$/, '').trim()
        : clean;

    return {
        title: title || clean || 'Alternativa sin título',
        description: '',
        total: parseAmount(amountText),
        currency,
        sourceTextId,
    };
}
