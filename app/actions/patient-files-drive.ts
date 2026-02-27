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
}

export interface PatientDriveFoldersResult {
    folders: FolderWithFiles[];
    rootFiles: DriveFile[];
    motherFolderUrl?: string;
    error?: string;
}

const FOLDER_MIME = 'application/vnd.google-apps.folder';

function getFolderDisplayName(folderName: string): string {
    // "APELLIDO, Nombre - FOTO & VIDEO" → "FOTO & VIDEO"
    const dashIndex = folderName.lastIndexOf(' - ');
    if (dashIndex >= 0) {
        return folderName.substring(dashIndex + 3);
    }
    return folderName;
}

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

        // List contents of each subfolder in parallel (max 8)
        const foldersToList = subfolders.slice(0, 8);
        const folderResults = await Promise.all(
            foldersToList.map(async (folder): Promise<FolderWithFiles> => {
                const contents = await listFolderFiles(folder.id);
                return {
                    id: folder.id,
                    name: folder.name,
                    displayName: getFolderDisplayName(folder.name),
                    files: (contents.files || []).filter(f => f.mimeType !== FOLDER_MIME) as DriveFile[],
                };
            })
        );

        // Sort: folders with files first, then alphabetical
        folderResults.sort((a, b) => {
            if (a.files.length && !b.files.length) return -1;
            if (!a.files.length && b.files.length) return 1;
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

export async function createPatientDriveFolderAction(
    patientId: string,
    apellido: string,
    nombre: string
): Promise<{ motherFolderUrl?: string; error?: string }> {
    try {
        const result = await ensureStandardPatientFolders(apellido, nombre);
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
