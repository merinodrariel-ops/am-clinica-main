/**
 * BNA Exchange Rate Fetcher
 * Source: Banco Nación Argentina - Dólar VENTA
 * https://www.bna.com.ar/Personas
 */

export interface BNAExchangeRate {
    rate: number;
    source: 'BNA_AUTO' | 'MANUAL';
    fetchedAt: string;
    error?: string;
}

/**
 * Fetches the current USD sell rate from Banco Nación Argentina.
 * Uses a server-side proxy to avoid CORS issues.
 */
export async function fetchBNADolarVenta(): Promise<BNAExchangeRate> {
    try {
        // Try to fetch from our API route (which will scrape BNA or use a cache)
        const response = await fetch('/api/bna-cotizacion', {
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new Error('Failed to fetch BNA rate');
        }

        const data = await response.json();
        return {
            rate: data.venta,
            source: 'BNA_AUTO',
            fetchedAt: new Date().toISOString(),
        };
    } catch (error) {
        console.error('Error fetching BNA rate:', error);
        return {
            rate: 0,
            source: 'MANUAL',
            fetchedAt: new Date().toISOString(),
            error: 'No se pudo obtener la cotización automáticamente. Ingrese manualmente.',
        };
    }
}

/**
 * Converts ARS to USD using the provided exchange rate.
 */
export function convertARStoUSD(arsAmount: number, tcBnaVenta: number): number {
    if (tcBnaVenta <= 0) return 0;
    return Math.round((arsAmount / tcBnaVenta) * 100) / 100;
}

/**
 * Formats a number as currency.
 */
export function formatCurrency(amount: number, currency: 'USD' | 'ARS' | 'USDT' = 'USD'): string {
    const formatter = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: currency === 'USDT' ? 'USD' : currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

    if (currency === 'USDT') {
        return formatter.format(amount).replace('US$', 'USDT ');
    }

    return formatter.format(amount);
}
