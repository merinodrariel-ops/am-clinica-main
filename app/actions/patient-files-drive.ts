'use server';

import { createClient } from '@supabase/supabase-js';
import {
    listFolderFiles,
    extractFolderIdFromUrl,
    ensureStandardPatientFolders,
    getFolderWebViewLink,
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

        // Sort alphabetically
        folderResults.sort((a, b) => a.displayName.localeCompare(b.displayName));

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
