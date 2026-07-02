export interface PatientSearchFields {
    nombre?: string | null;
    apellido?: string | null;
    email?: string | null;
    documento?: string | null;
    whatsapp?: string | null;
}

export function normalizePatientSearchText(value: string | null | undefined): string {
    return (value || '')
        .toString()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9@.\s]/g, ' ')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

export function getPatientSearchTokens(search?: string): string[] {
    return normalizePatientSearchText(search)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

export function patientMatchesSearch(patient: PatientSearchFields, tokens: string[]): boolean {
    if (!tokens.length) return true;

    const haystack = normalizePatientSearchText([
        patient.apellido,
        patient.nombre,
        `${patient.apellido || ''} ${patient.nombre || ''}`,
        `${patient.nombre || ''} ${patient.apellido || ''}`,
        patient.email,
        patient.documento,
        patient.whatsapp,
    ].filter(Boolean).join(' '));

    return tokens.every((token) => haystack.includes(token));
}

export function shouldUseOnlyWithPhotosFilter(onlyWithPhotos: boolean | undefined, search?: string): boolean {
    if (!onlyWithPhotos) return false;
    return getPatientSearchTokens(search).length === 0;
}
