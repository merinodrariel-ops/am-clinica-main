'use server';

import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import {
    listFolderFiles,
    extractFolderIdFromUrl,
    ensureStandardPatientFolders,
    getFolderWebViewLink,
    uploadFileToFolder,
    deleteFromDrive,
    updateFileContentInDrive,
} from '@/lib/google-drive';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface DriveFile {
    id: string;
    name: string;
    mimeType: string;
    webViewLink: string;
    createdTime: string;
    thumbnailLink?: string;
    size?: string;
}

export interface FolderWithFiles {
    id: string;
    name: string;
    displayName: string;
    files: DriveFile[];
    /** Whether files have been loaded yet (for lazy loading) */
    loaded: boolean;
}

export interface PatientDriveFoldersResult {
    folders: FolderWithFiles[];
    rootFiles: DriveFile[];
    motherFolderUrl?: string;
    error?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function getFolderDisplayName(folderName: string): string {
    // New convention: "[PRESENTACION] APELLIDO, Nombre" → "PRESENTACION"
    const bracketMatch = folderName.match(/^\[(.+?)\]/);
    if (bracketMatch) {
        return bracketMatch[1];
    }
    // Old convention: "APELLIDO, Nombre - FOTO & VIDEO" → "FOTO & VIDEO"
    const dashIndex = folderName.lastIndexOf(' - ');
    if (dashIndex >= 0) {
        return folderName.substring(dashIndex + 3);
    }
    return folderName;
}

/**
 * Recursively collect all non-folder files from a folder and its subfolders.
 */
async function listFilesRecursive(
    folderId: string,
    depth: number = 0,
    maxDepth: number = 3
): Promise<DriveFile[]> {
    if (depth > maxDepth) return [];

    const result = await listFolderFiles(folderId);
    if (result.error || !result.files) return [];

    const files: DriveFile[] = [];
    const subfolders: { id: string }[] = [];

    for (const item of result.files) {
        if (item.mimeType === FOLDER_MIME) {
            subfolders.push({ id: item.id });
        } else {
            files.push(item as DriveFile);
        }
    }

    // Recurse into subfolders
    if (subfolders.length > 0 && depth < maxDepth) {
        const nestedResults = await Promise.all(
            subfolders.map(sf => listFilesRecursive(sf.id, depth + 1, maxDepth))
        );
        for (const nested of nestedResults) {
            files.push(...nested);
        }
    }

    return files;
}

/**
 * Fast initial load: only list top-level subfolders (no recursive file listing).
 * Files for each folder are loaded lazily via loadFolderFiles().
 */
export async function getPatientDriveFolders(
    motherFolderIdOrUrl: string
): Promise<PatientDriveFoldersResult> {
    try {
        const motherFolderId = extractFolderIdFromUrl(motherFolderIdOrUrl) || motherFolderIdOrUrl;

        const result = await listFolderFiles(motherFolderId);
        if (result.error) {
            return { folders: [], rootFiles: [], error: result.error };
        }

        const allItems = result.files || [];
        const subfolders = allItems.filter(f => f.mimeType === FOLDER_MIME);
        const rootFiles: DriveFile[] = allItems.filter(f => f.mimeType !== FOLDER_MIME);

        // Only create folder stubs — DO NOT fetch files yet (lazy loaded on expand)
        const folderResults: FolderWithFiles[] = subfolders.map(folder => ({
            id: folder.id,
            name: folder.name,
            displayName: getFolderDisplayName(folder.name),
            files: [],
            loaded: false,
        }));

        // Sort: FOTO/VIDEO folder first, then alphabetically
        folderResults.sort((a, b) => {
            const aIsFoto = /foto|video/i.test(a.displayName);
            const bIsFoto = /foto|video/i.test(b.displayName);
            if (aIsFoto && !bIsFoto) return -1;
            if (!aIsFoto && bIsFoto) return 1;
            return a.displayName.localeCompare(b.displayName);
        });

        return {
            folders: folderResults,
            rootFiles,
        };
    } catch (error) {
        return {
            folders: [],
            rootFiles: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Load files for a single folder (called lazily when user expands a folder).
 * Recursively finds files in sub-subfolders.
 */
export async function loadFolderFiles(
    folderId: string
): Promise<{ files: DriveFile[]; error?: string }> {
    try {
        const files = await listFilesRecursive(folderId, 0, 3);
        return { files };
    } catch (error) {
        return {
            files: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function createPatientDriveFolderAction(
    patientId: string,
    apellido: string,
    nombre: string
): Promise<{ motherFolderUrl?: string; error?: string }> {
    try {
        const { data: patientRow } = await supabase
            .from('pacientes')
            .select('link_historia_clinica')
            .eq('id_paciente', patientId)
            .single();

        const existingMotherFolderId = extractFolderIdFromUrl(patientRow?.link_historia_clinica || null) || undefined;

        const result = await ensureStandardPatientFolders(apellido, nombre, existingMotherFolderId);
        if (result.error) {
            return { error: result.error };
        }

        const motherFolderUrl = result.motherFolderUrl ||
            (result.motherFolderId ? await getFolderWebViewLink(result.motherFolderId) : null);

        if (motherFolderUrl) {
            await supabase
                .from('pacientes')
                .update({ link_historia_clinica: motherFolderUrl })
                .eq('id_paciente', patientId);
        }

        return { motherFolderUrl: motherFolderUrl || undefined };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

// ─── Fotos order persistence ────────────────────────────────────────────────

/** Returns the saved photo order for a patient: { [folderId]: [fileId, ...] } */
export async function getPatientFotosOrder(patientId: string): Promise<Record<string, string[]>> {
    const { data } = await supabase
        .from('pacientes')
        .select('fotos_order')
        .eq('id_paciente', patientId)
        .single();
    return (data?.fotos_order as Record<string, string[]>) ?? {};
}

/** Persists the display order of files in a folder for a patient. */
export async function saveFotosOrderAction(
    patientId: string,
    folderId: string,
    orderedIds: string[]
): Promise<{ error?: string }> {
    try {
        const supabaseServer = await createServerClient();
        const { data: { user } } = await supabaseServer.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        // Read current value then merge — avoids overwriting other folders' orders
        const { data: current } = await supabase
            .from('pacientes')
            .select('fotos_order')
            .eq('id_paciente', patientId)
            .single();

        const merged = { ...(current?.fotos_order as Record<string, string[]> ?? {}), [folderId]: orderedIds };

        const { error } = await supabase
            .from('pacientes')
            .update({ fotos_order: merged })
            .eq('id_paciente', patientId);

        if (error) return { error: error.message };
        return {};
    } catch (err) {
        return { error: err instanceof Error ? err.message : String(err) };
    }
}

// ─── Photo Studio: save edited photo to Drive ───────────────────────────────

/**
 * Upload an edited photo blob (via FormData) to a specific Drive folder.
 * The client sends a FormData with key "file" containing the Blob.
 */
const DRIVE_WRITE_ROLES = new Set(['owner', 'admin', 'asistente', 'laboratorio']);
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

export async function uploadEditedPhotoAction(
    folderId: string,
    fileName: string,
    formData: FormData
): Promise<{ fileId?: string; webViewLink?: string; error?: string }> {
    try {
        const supabaseServer = await createServerClient();
        const { data: { user } } = await supabaseServer.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const { data: profile } = await supabaseServer
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .single();
        if (!profile?.categoria || !DRIVE_WRITE_ROLES.has(profile.categoria)) {
            return { error: 'Sin permisos para guardar archivos en Drive' };
        }

        if (!folderId || !DRIVE_ID_RE.test(folderId)) return { error: 'Carpeta inválida' };

        const safeName = fileName.replace(/[/\\]/g, '_');

        const file = formData.get('file') as File | null;
        if (!file) return { error: 'No file in FormData' };

        const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
        if (!ALLOWED_MIME.includes(file.type)) {
            return { error: 'Tipo de archivo no permitido' };
        }

        if (file.size > 20 * 1024 * 1024) {
            return { error: 'El archivo supera el límite de 20 MB' };
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadFileToFolder(folderId, safeName, buffer, file.type || 'image/jpeg');

        if (!result.success) return { error: result.error };
        return { fileId: result.fileId, webViewLink: result.webViewLink };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Replaces an existing Drive file's content in-place (preserves file ID, no duplicate created).
 * Uses files.update with media body — requires writer access, NOT ownership.
 */
export async function replaceEditedPhotoAction(
    fileId: string,
    formData: FormData
): Promise<{ error?: string }> {
    try {
        const supabaseServer = await createServerClient();
        const { data: { user } } = await supabaseServer.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const { data: profile } = await supabaseServer
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .single();
        if (!profile?.categoria || !DRIVE_WRITE_ROLES.has(profile.categoria)) {
            return { error: 'Sin permisos para guardar archivos en Drive' };
        }

        if (!fileId || !DRIVE_ID_RE.test(fileId)) return { error: 'ID de archivo inválido' };

        const file = formData.get('file') as File | null;
        if (!file) return { error: 'No file in FormData' };

        const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
        if (!ALLOWED_MIME.includes(file.type)) return { error: 'Tipo de archivo no permitido' };
        if (file.size > 20 * 1024 * 1024) return { error: 'El archivo supera el límite de 20 MB' };

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await updateFileContentInDrive(fileId, buffer, file.type || 'image/jpeg');
        if (!result.success) return { error: result.error };
        return {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Delete a file from Drive by ID (used for "replace original" in Photo Studio).
 */
export async function deleteDriveFileAction(
    fileId: string
): Promise<{ error?: string }> {
    try {
        const supabaseServer = await createServerClient();
        const { data: { user } } = await supabaseServer.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const { data: profile } = await supabaseServer
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .single();
        if (!profile?.categoria || !DRIVE_WRITE_ROLES.has(profile.categoria)) {
            return { error: 'Sin permisos para eliminar archivos de Drive' };
        }

        if (!fileId || !DRIVE_ID_RE.test(fileId)) {
            return { error: 'ID de archivo inválido' };
        }

        const result = await deleteFromDrive(fileId);
        if (!result.success) return { error: result.error };
        return {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
