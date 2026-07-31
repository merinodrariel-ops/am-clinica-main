import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

const PATIENT_DRIVE_UPLOAD_ROLES = new Set([
    'owner', 'admin', 'asistente', 'assistant', 'laboratorio', 'lab', 'technician', 'marketing',
]);
const PATIENT_DRIVE_MANAGE_ROLES = new Set([
    'owner', 'admin', 'asistente', 'assistant', 'laboratorio', 'lab', 'technician',
]);

function normalizeRole(role: string | null | undefined): string {
    return normalizeCategoriaAlias(role || '') || '';
}

export function isMarketingMediaMimeType(mimeType: string | null | undefined): boolean {
    return Boolean(mimeType?.startsWith('image/') || mimeType?.startsWith('video/'));
}

export function canUploadPatientDrive(role: string | null | undefined): boolean {
    return PATIENT_DRIVE_UPLOAD_ROLES.has(normalizeRole(role));
}

export function canUploadPatientDriveMimeType(
    role: string | null | undefined,
    mimeType: string | null | undefined,
): boolean {
    const normalizedRole = normalizeRole(role);
    if (!PATIENT_DRIVE_UPLOAD_ROLES.has(normalizedRole)) return false;
    return normalizedRole !== 'marketing' || Boolean(mimeType?.startsWith('video/'));
}

export function canManagePatientDrive(role: string | null | undefined): boolean {
    return PATIENT_DRIVE_MANAGE_ROLES.has(normalizeRole(role));
}
