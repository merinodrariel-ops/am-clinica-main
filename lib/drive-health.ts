import { getDriveClient, extractFolderIdFromUrl, PACIENTES_ROOT_FOLDER_ID } from '@/lib/google-drive';

export interface DriveHealthCheckParams {
    sampleLimit?: number;
}

export interface DriveHealthCheckSummary {
    scannedPatients: number;
    patientsWithDriveLink: number;
    rootFolders: number;
    duplicateGroups: number;
    safeCandidateGroups: number;
    safeCandidateExtraFolders: number;
    skippedGroups: number;
    skippedWithoutLinkedFolder: number;
    skippedWithDuplicatedNameInDb: number;
    linkedFoldersOutsideRoot: number;
}

export interface DriveHealthDuplicateSample {
    normalizedName: string;
    duplicateCount: number;
    keepFolderId?: string;
    keepFolderName?: string;
    keepReason: 'linked_folder' | 'oldest_no_link';
    extraFolderIds: string[];
}

export interface DriveHealthCheckResult {
    generatedAt: string;
    summary: DriveHealthCheckSummary;
    samples: DriveHealthDuplicateSample[];
}

type PatientRow = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    link_historia_clinica: string | null;
};

type RootFolder = {
    id: string;
    name: string;
    createdTime?: string;
};

function normalizeText(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function normalizePatientName(apellido: string | null, nombre: string | null): string {
    const normalizedApellido = normalizeText(apellido || '');
    const normalizedNombre = normalizeText(nombre || '');
    if (normalizedApellido && normalizedNombre) return `${normalizedApellido}, ${normalizedNombre}`;
    return normalizedApellido || normalizedNombre || 'PACIENTE';
}

function pickOldestFolder(folders: RootFolder[]): RootFolder {
    return [...folders].sort((a, b) => {
        const aTime = a.createdTime ? new Date(a.createdTime).getTime() : Number.MAX_SAFE_INTEGER;
        const bTime = b.createdTime ? new Date(b.createdTime).getTime() : Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return a.id.localeCompare(b.id);
    })[0];
}

async function listAllRootFolders(): Promise<RootFolder[]> {
    const drive = getDriveClient();
    const folders: RootFolder[] = [];
    let pageToken: string | undefined;

    do {
        const response = await drive.files.list({
            q: `'${PACIENTES_ROOT_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
            fields: 'nextPageToken, files(id,name,createdTime)',
            pageSize: 1000,
            pageToken,
        });

        for (const file of response.data.files || []) {
            if (!file.id || !file.name) continue;
            folders.push({
                id: file.id,
                name: file.name,
                createdTime: file.createdTime || undefined,
            });
        }

        pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return folders;
}

export async function runDriveHealthCheck(
    patients: PatientRow[],
    params: DriveHealthCheckParams = {}
): Promise<DriveHealthCheckResult> {
    const sampleLimit = Math.min(50, Math.max(5, Math.floor(params.sampleLimit || 20)));

    const rootFolders = await listAllRootFolders();
    const rootFolderById = new Map(rootFolders.map((folder) => [folder.id, folder]));

    const linkedFolderIds = patients
        .map((patient) => extractFolderIdFromUrl(patient.link_historia_clinica))
        .filter((folderId): folderId is string => Boolean(folderId));

    const linkedFoldersOutsideRoot = linkedFolderIds.filter((folderId) => !rootFolderById.has(folderId)).length;

    const dbNameCount = new Map<string, number>();
    for (const patient of patients) {
        const key = normalizePatientName(patient.apellido, patient.nombre);
        dbNameCount.set(key, (dbNameCount.get(key) || 0) + 1);
    }

    const linkedFolderSet = new Set(linkedFolderIds);
    const groupedByName = new Map<string, RootFolder[]>();
    for (const folder of rootFolders) {
        const key = normalizeText(folder.name);
        const current = groupedByName.get(key) || [];
        current.push(folder);
        groupedByName.set(key, current);
    }

    const duplicateGroups = [...groupedByName.entries()].filter(([, folders]) => folders.length > 1);

    let safeCandidateGroups = 0;
    let safeCandidateExtraFolders = 0;
    let skippedWithoutLinkedFolder = 0;
    let skippedWithDuplicatedNameInDb = 0;
    const samples: DriveHealthDuplicateSample[] = [];

    for (const [normalizedName, folders] of duplicateGroups) {
        const linkedFolders = folders.filter((folder) => linkedFolderSet.has(folder.id));
        const dbDuplicates = (dbNameCount.get(normalizedName) || 0) > 1;

        if (dbDuplicates) {
            skippedWithDuplicatedNameInDb += 1;
            continue;
        }

        const keepFolder = linkedFolders[0] || pickOldestFolder(folders);
        const extraFolders = folders.filter((folder) => folder.id !== keepFolder.id);

        if (linkedFolders.length === 1) {
            safeCandidateGroups += 1;
            safeCandidateExtraFolders += extraFolders.length;
        } else {
            skippedWithoutLinkedFolder += 1;
        }

        if (samples.length < sampleLimit) {
            samples.push({
                normalizedName,
                duplicateCount: folders.length,
                keepFolderId: keepFolder.id,
                keepFolderName: keepFolder.name,
                keepReason: linkedFolders.length === 1 ? 'linked_folder' : 'oldest_no_link',
                extraFolderIds: extraFolders.map((folder) => folder.id),
            });
        }
    }

    const summary: DriveHealthCheckSummary = {
        scannedPatients: patients.length,
        patientsWithDriveLink: linkedFolderIds.length,
        rootFolders: rootFolders.length,
        duplicateGroups: duplicateGroups.length,
        safeCandidateGroups,
        safeCandidateExtraFolders,
        skippedGroups: duplicateGroups.length - safeCandidateGroups,
        skippedWithoutLinkedFolder,
        skippedWithDuplicatedNameInDb,
        linkedFoldersOutsideRoot,
    };

    return {
        generatedAt: new Date().toISOString(),
        summary,
        samples,
    };
}
