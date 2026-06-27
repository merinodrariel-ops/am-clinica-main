export interface PrestacionCatalogoDraft {
    nombre: string;
    area_nombre?: string | null;
    precio_base: number;
    moneda?: 'ARS' | 'USD' | string | null;
    terminos?: string | null;
}

export function normalizePrestacionCatalogoPayload(input: PrestacionCatalogoDraft) {
    const nombre = input.nombre.trim();
    if (!nombre) {
        throw new Error('El nombre no puede estar vacio');
    }

    const precio = Number(input.precio_base);
    if (!Number.isFinite(precio) || precio < 0) {
        throw new Error('Precio invalido');
    }

    return {
        nombre,
        area_nombre: typeof input.area_nombre === 'string' ? input.area_nombre.trim() || null : null,
        precio_base: Math.round((precio + Number.EPSILON) * 100) / 100,
        moneda: input.moneda === 'USD' ? 'USD' : 'ARS',
        terminos: typeof input.terminos === 'string' ? input.terminos.trim() || null : null,
    };
}

