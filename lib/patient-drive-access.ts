import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

const PATIENT_DRIVE_UPLOAD_ROLES = new Set([
    'owner', 'admin', 'asistente', 'assistant', 'laboratorio', 'lab', 'technician',
]);
const PATIENT_DRIVE_MANAGE_ROLES = new Set([
    'owner', 'admin', 'asistente', 'assistant', 'laboratorio', 'lab', 'technician',
]);

function normalizeRole(role: string | null | undefined): string {
    return normalizeCategoriaAlias(role || '') || '';
}

export function canUploadPatientDrive(role: string | null | undefined): boolean {
    return PATIENT_DRIVE_UPLOAD_ROLES.has(normalizeRole(role));
}

export function canManagePatientDrive(role: string | null | undefined): boolean {
    return PATIENT_DRIVE_MANAGE_ROLES.has(normalizeRole(role));
}
