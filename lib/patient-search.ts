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

export function getPatientNameTokenKey(patient: Pick<PatientSearchFields, 'nombre' | 'apellido'>): string {
    return getPatientSearchTokens(`${patient.nombre || ''} ${patient.apellido || ''}`)
        .sort((a, b) => a.localeCompare(b))
        .join('\u0000');
}

function patientSearchTokenMatches(haystack: string, token: string): boolean {
    if (haystack.includes(token)) return true;

    const relaxedToken = relaxPatientSearchToken(token);
    if (relaxedToken.length < 3) return false;

    return haystack
        .split(/\s+/)
        .some((haystackToken) => relaxPatientSearchToken(haystackToken) === relaxedToken);
}

function relaxPatientSearchToken(token: string): string {
    let relaxed = token.replace(/h/g, '');
    if (relaxed.endsWith('z')) {
        relaxed = `${relaxed.slice(0, -1)}s`;
    }
    if (relaxed.endsWith('s') && relaxed.length > 4) {
        relaxed = relaxed.slice(0, -1);
    }
    return relaxed;
}

export function patientNameTokensLookEquivalent(
    a: Pick<PatientSearchFields, 'nombre' | 'apellido'>,
    b: Pick<PatientSearchFields, 'nombre' | 'apellido'>
): boolean {
    const aTokens = getPatientSearchTokens(`${a.nombre || ''} ${a.apellido || ''}`)
        .sort((left, right) => left.localeCompare(right));
    const bTokens = getPatientSearchTokens(`${b.nombre || ''} ${b.apellido || ''}`)
        .sort((left, right) => left.localeCompare(right));

    if (aTokens.length < 2 || aTokens.length !== bTokens.length) return false;

    return aTokens.every((token, index) => {
        const other = bTokens[index];
        return token === other || relaxPatientSearchToken(token) === relaxPatientSearchToken(other);
    });
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

    return tokens.every((token) => patientSearchTokenMatches(haystack, token));
}

export function shouldUseOnlyWithPhotosFilter(onlyWithPhotos: boolean | undefined, search?: string): boolean {
    if (!onlyWithPhotos) return false;
    return getPatientSearchTokens(search).length === 0;
}
