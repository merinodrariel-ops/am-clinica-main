import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

const PATIENT_RECORD_READ_ROLES = new Set([
    'owner',
    'admin',
    'reception',
    'developer',
    'partner_viewer',
    'odontologo',
    'asistente',
    'laboratorio',
    'recaptacion',
]);

const PATIENT_MANAGE_ROLES = new Set([
    'owner',
    'admin',
    'reception',
    'asistente',
    'developer',
]);

const PATIENT_FINANCIAL_READ_ROLES = new Set([
    'owner',
    'admin',
]);

const PATIENT_CONTACT_READ_ROLES = new Set([
    'owner',
    'admin',
    'reception',
    'developer',
    'recaptacion',
]);

function normalizeRole(role: string | null | undefined): string {
    return normalizeCategoriaAlias(role || '') || '';
}

export function canViewPatientRecords(role: string | null | undefined): boolean {
    return PATIENT_RECORD_READ_ROLES.has(normalizeRole(role));
}

export function canManagePatients(role: string | null | undefined): boolean {
    return PATIENT_MANAGE_ROLES.has(normalizeRole(role));
}

export function canViewPatientFinancialData(role: string | null | undefined): boolean {
    return PATIENT_FINANCIAL_READ_ROLES.has(normalizeRole(role));
}

export function canViewPatientContactData(role: string | null | undefined): boolean {
    return PATIENT_CONTACT_READ_ROLES.has(normalizeRole(role));
}
