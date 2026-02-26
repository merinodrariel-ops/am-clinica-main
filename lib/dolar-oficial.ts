export interface DolarOficialRate {
    compra: number;
    venta: number;
    fetchedAt: string;
    source: 'api-route' | 'dolarapi';
}

interface BnaRouteResponse {
    compra?: number;
    venta?: number;
    fecha?: string;
}

interface DolarApiOfficialResponse {
    compra: number;
    venta: number;
    fechaActualizacion?: string;
}

function parseNumeric(value: unknown): number {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return numeric;
}

export async function fetchDolarOficialRate(): Promise<DolarOficialRate> {
    const routeResponse = await fetch('/api/bna-cotizacion', {
        cache: 'no-store',
    });

    if (routeResponse.ok) {
        const data = (await routeResponse.json()) as BnaRouteResponse;
        const venta = parseNumeric(data.venta);
        const compra = parseNumeric(data.compra);

        if (venta > 0) {
            return {
                compra,
                venta,
                fetchedAt: data.fecha || new Date().toISOString(),
                source: 'api-route',
            };
        }
    }

    const directResponse = await fetch('https://dolarapi.com/v1/dolares/oficial', {
        cache: 'no-store',
    });

    if (!directResponse.ok) {
        throw new Error('No se pudo obtener la cotizacion oficial (BNA Venta).');
    }

    const directData = (await directResponse.json()) as DolarApiOfficialResponse;
    const venta = parseNumeric(directData.venta);
    const compra = parseNumeric(directData.compra);

    if (venta <= 0) {
        throw new Error('La API devolvio una cotizacion invalida.');
    }

    return {
        compra,
        venta,
        fetchedAt: directData.fechaActualizacion || new Date().toISOString(),
        source: 'dolarapi',
    };
}
