export type ProsoftImportSource = 'Prosoft' | 'Local';

export type ExistingRegistroHorasForImport = {
    id: string;
    fecha: string;
    horas: number | string | null;
    estado?: string | null;
    motivo_observado?: string | null;
    observaciones?: string | null;
    resuelto_por?: string | null;
    resuelto_fecha_hora?: string | null;
    metodo_verificacion?: string | null;
    evidencia_url?: string | null;
    nota_resolucion?: string | null;
};

function normalizedEstado(row: ExistingRegistroHorasForImport): string {
    return String(row.estado || '').toLowerCase();
}

function numericHours(row: ExistingRegistroHorasForImport): number {
    return Number(row.horas || 0);
}

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function hasHumanCorrection(row: ExistingRegistroHorasForImport): boolean {
    const observaciones = row.observaciones || '';
    return (
        observaciones.startsWith('[CORREGIDO]') ||
        Boolean(row.resuelto_por) ||
        Boolean(row.resuelto_fecha_hora) ||
        Boolean(row.metodo_verificacion) ||
        Boolean(row.evidencia_url) ||
        Boolean(row.nota_resolucion)
    );
}

export function shouldOverwriteExistingRegistro(
    row: ExistingRegistroHorasForImport,
    _incomingRequiresReview: boolean
): boolean {
    if (hasHumanCorrection(row)) return false;

    const estado = normalizedEstado(row);
    if (['resuelto', 'anulado', 'approved', 'paid', 'rejected'].includes(estado)) {
        return false;
    }

    if (estado === 'observado') return true;
    if (numericHours(row) <= 0) return true;

    return false;
}

export function isImportGeneratedObservation(
    row: ExistingRegistroHorasForImport,
    source: ProsoftImportSource,
    mes: string
): boolean {
    const observaciones = normalizeText(row.observaciones || '');
    return (
        normalizedEstado(row) === 'observado' &&
        numericHours(row) === 0 &&
        observaciones.includes('registro observado por control automatico') &&
        observaciones.includes(`${source.toLowerCase()} ${mes}`)
    );
}

export function shouldDeleteOrphanObservedImportRegistro(input: {
    row: ExistingRegistroHorasForImport;
    previewDates: Set<string>;
    source: ProsoftImportSource;
    mes: string;
}): boolean {
    if (input.previewDates.has(input.row.fecha)) return false;
    if (hasHumanCorrection(input.row)) return false;
    if (!['FaltaIngreso', 'FaltaEgreso'].includes(input.row.motivo_observado || '')) return false;
    return isImportGeneratedObservation(input.row, input.source, input.mes);
}
