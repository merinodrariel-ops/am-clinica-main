import { NextResponse } from 'next/server';

/**
 * API Route: /api/bna-cotizacion
 * Fetches the current USD sell rate from Banco Nación Argentina.
 * 
 * This uses a CORS proxy approach since BNA doesn't have a public API.
 * In production, consider caching this value for 5-10 minutes.
 */

// Hardcoded fallback rate (update periodically or use external API)
const FALLBACK_RATE = 1050; // Approximate rate as of Jan 2026

export async function GET() {
    try {
        // Try to fetch from a reliable Argentine exchange rate API
        // Using dolarapi.com as a reliable source for Argentine rates
        const response = await fetch('https://dolarapi.com/v1/dolares/oficial', {
            next: { revalidate: 300 }, // Cache for 5 minutes
        });

        if (response.ok) {
            const data = await response.json();
            return NextResponse.json({
                compra: data.compra,
                venta: data.venta,
                fecha: data.fechaActualizacion,
                fuente: 'dolarapi.com (Oficial)',
                nota: 'Cotización Dollar Banco Nación - Venta',
            });
        }

        // Fallback: return a manual rate with warning
        return NextResponse.json({
            compra: FALLBACK_RATE - 10,
            venta: FALLBACK_RATE,
            fecha: new Date().toISOString(),
            fuente: 'FALLBACK',
            nota: 'Cotización de respaldo. Verifique en https://www.bna.com.ar/Personas',
            warning: true,
        });
    } catch (error) {
        console.error('Error fetching BNA rate:', error);

        // Return fallback with error indication
        return NextResponse.json({
            compra: FALLBACK_RATE - 10,
            venta: FALLBACK_RATE,
            fecha: new Date().toISOString(),
            fuente: 'FALLBACK',
            nota: 'Error al obtener cotización. Ingrese manualmente.',
            error: true,
        }, { status: 200 }); // Still 200 so frontend can handle gracefully
    }
}
