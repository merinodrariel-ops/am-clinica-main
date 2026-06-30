import { createHash, randomUUID } from 'node:crypto';

export const JOB_APPLICATION_AREAS = [
    'Odontólogo General',
    'Asistente Dental',
    'Recepción - Secretaría',
    'Administración & Logística',
    'Laboratorio Dental - Fresado - Diseño - Maquillaje',
    'Inversor & Capital',
    'Cirugía Implantes',
    'Ortodoncia',
    'Especialista en Prótesis Fija - Rehabilitación',
    'Otros',
] as const;

export const JOB_APPLICATION_STATUSES = ['nuevo', 'preseleccionado', 'entrevista', 'descartado', 'contratado'] as const;

export type JobApplicationStatus = typeof JOB_APPLICATION_STATUSES[number];

export const JOB_APPLICATION_STATUS_LABELS: Record<JobApplicationStatus, string> = {
    nuevo: 'Nuevo',
    preseleccionado: 'Preseleccionado',
    entrevista: 'Entrevista',
    descartado: 'Descartado',
    contratado: 'Contratado',
};

export const MAX_JOB_APPLICATION_FILE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_JOB_APPLICATION_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

const ALLOWED_EXTENSIONS = ['pdf', 'doc', 'docx'];

export type JobApplicationFileLike = {
    name: string;
    type: string;
    size: number;
};

export type JobApplicationDuplicateComparable = {
    id: string;
    created_at: string;
    email: string;
    full_name: string;
    area: string;
    other_area?: string | null;
};

export type GroupedJobApplication<T extends JobApplicationDuplicateComparable> = T & {
    applications: Array<{
        id: string;
        created_at: string;
        area: string;
        other_area: string | null;
        isDuplicate: boolean;
    }>;
};

export function sanitizeText(value: FormDataEntryValue | string | null | undefined, maxLength = 240) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

export function sanitizeLongText(value: FormDataEntryValue | string | null | undefined, maxLength = 3000) {
    return String(value || '').trim().replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').slice(0, maxLength);
}

export function normalizeEmail(value: FormDataEntryValue | string | null | undefined) {
    return sanitizeText(value, 180).toLowerCase();
}

function normalizeComparableName(value: string) {
    return sanitizeText(value, 180).toLowerCase();
}

export function isJobApplicationStatus(value: string): value is JobApplicationStatus {
    return JOB_APPLICATION_STATUSES.includes(value as JobApplicationStatus);
}

export function sanitizeJobApplicationFileName(fileName: string) {
    const normalized = fileName.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    const withoutPath = normalized.split(/[\\/]/).pop() || 'cv.pdf';
    const cleaned = withoutPath
        .replace(/[^a-zA-Z0-9._ -]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 120);

    return cleaned || 'cv.pdf';
}

function getExtension(fileName: string) {
    const parts = fileName.toLowerCase().split('.');
    return parts.length > 1 ? parts.pop() || '' : '';
}

export function validateJobApplicationFile(file: JobApplicationFileLike): { ok: true } | { ok: false; error: string } {
    if (!file || !file.name || file.size <= 0) {
        return { ok: false, error: 'Adjuntá tu CV.' };
    }

    if (file.size > MAX_JOB_APPLICATION_FILE_BYTES) {
        return { ok: false, error: 'El CV no puede pesar más de 10 MB.' };
    }

    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { ok: false, error: 'El CV debe ser PDF, DOC o DOCX.' };
    }

    if (!ALLOWED_JOB_APPLICATION_MIME_TYPES.includes(file.type as typeof ALLOWED_JOB_APPLICATION_MIME_TYPES[number])) {
        return { ok: false, error: 'El tipo de archivo no está permitido.' };
    }

    return { ok: true };
}

export function hashPrivacyValue(value: string, salt = process.env.JOB_APPLICATION_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || 'am-job-applications') {
    return createHash('sha256').update(`${salt}:${value}`).digest('hex');
}

export function buildJobApplicationStoragePath(applicationId: string, originalFileName: string, now = new Date()) {
    const safeName = sanitizeJobApplicationFileName(originalFileName);
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `${year}/${month}/${applicationId}/${randomUUID()}-${safeName}`;
}

export function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isLikelyUrl(value: string) {
    if (!value) return false;
    return /^https?:\/\/[^\s]+$/i.test(value) || /^@?[a-zA-Z0-9._]{2,40}$/.test(value);
}

export function findRecentDuplicateJobApplication(
    recentRows: JobApplicationDuplicateComparable[],
    incoming: {
        email: string;
        fullName: string;
        area: string;
    },
    now = new Date(),
    windowMs = 10 * 60 * 1000,
) {
    const normalizedEmail = normalizeEmail(incoming.email);
    const normalizedName = normalizeComparableName(incoming.fullName);
    const normalizedArea = sanitizeText(incoming.area, 180);
    const nowTime = now.getTime();

    return recentRows.find((row) => {
        if (normalizeEmail(row.email) !== normalizedEmail) return false;
        if (normalizeComparableName(row.full_name) !== normalizedName) return false;
        if (sanitizeText(row.area, 180) !== normalizedArea) return false;

        const createdAtTime = new Date(row.created_at).getTime();
        return Number.isFinite(createdAtTime) && nowTime - createdAtTime >= 0 && nowTime - createdAtTime <= windowMs;
    }) ?? null;
}

export function collapseDuplicateJobApplications<T extends JobApplicationDuplicateComparable>(
    rows: T[],
    windowMs = 10 * 60 * 1000,
) {
    const keptRows: T[] = [];

    for (const row of rows) {
        const rowEmail = normalizeEmail(row.email);
        const rowName = normalizeComparableName(row.full_name);
        const rowArea = sanitizeText(row.area, 180);
        const rowTime = new Date(row.created_at).getTime();

        const duplicate = keptRows.find((keptRow) => {
            if (normalizeEmail(keptRow.email) !== rowEmail) return false;
            if (normalizeComparableName(keptRow.full_name) !== rowName) return false;
            if (sanitizeText(keptRow.area, 180) !== rowArea) return false;

            const keptTime = new Date(keptRow.created_at).getTime();
            return Number.isFinite(keptTime) && Number.isFinite(rowTime) && keptTime >= rowTime && keptTime - rowTime <= windowMs;
        });

        if (!duplicate) {
            keptRows.push(row);
        }
    }

    return keptRows;
}

function getCandidateGroupingKey(row: JobApplicationDuplicateComparable) {
    return `${normalizeEmail(row.email)}::${normalizeComparableName(row.full_name)}`;
}

function getApplicationAreaKey(row: JobApplicationDuplicateComparable) {
    return `${sanitizeText(row.area, 180)}::${sanitizeText(row.other_area || '', 180)}`;
}

function getRowTime(row: JobApplicationDuplicateComparable) {
    const time = new Date(row.created_at).getTime();
    return Number.isFinite(time) ? time : 0;
}

export function groupJobApplicationsByCandidate<T extends JobApplicationDuplicateComparable>(
    rows: T[],
): Array<GroupedJobApplication<T>> {
    const sortedRows = [...rows].sort((a, b) => getRowTime(b) - getRowTime(a));
    const byCandidate = new Map<string, T[]>();

    for (const row of sortedRows) {
        const key = getCandidateGroupingKey(row);
        byCandidate.set(key, [...(byCandidate.get(key) || []), row]);
    }

    return Array.from(byCandidate.values()).map((candidateRows) => {
        const [primary] = candidateRows;
        const seenAreas = new Set<string>();

        const applications = candidateRows.map((row) => {
            const areaKey = getApplicationAreaKey(row);
            const isDuplicate = seenAreas.has(areaKey);
            seenAreas.add(areaKey);

            return {
                id: row.id,
                created_at: row.created_at,
                area: row.area,
                other_area: row.other_area || null,
                isDuplicate,
            };
        });

        return {
            ...primary,
            applications: applications.sort((a, b) => {
                if (a.isDuplicate !== b.isDuplicate) return a.isDuplicate ? 1 : -1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }),
        };
    });
}
