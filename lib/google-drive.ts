// Google Drive utilities - not used directly as Server Actions from the client

import { google } from 'googleapis';
import { Readable } from 'stream';

// Folder IDs for different areas
const FOLDER_IDS = {
    'caja-admin': process.env.GOOGLE_DRIVE_FOLDER_ADMIN || '',
    'caja-recepcion': process.env.GOOGLE_DRIVE_FOLDER_RECEPCION || '',
    'pacientes': process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '',
} as const;

export const ORTODONCIA_ROOT_FOLDER_ID = '13LCOTm1tyH8QWw_0N5qTADiDkCKUZFpF';
export const PACIENTES_ROOT_FOLDER_ID = '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

/**
 * Standardizes patient folder names: APELLIDO, Nombre
 */
export function getPatientFolderName(apellido: string, nombre: string): string {
    const cleanApellido = (apellido || '').toUpperCase().trim();
    const cleanNombre = (nombre || '').trim();
    // Capitalize first letter of name, rest lowercase
    const formattedNombre = cleanNombre ? cleanNombre.charAt(0).toUpperCase() + cleanNombre.slice(1).toLowerCase() : '';

    return `${cleanApellido}, ${formattedNombre}`.trim();
}


/**
 * Extracts a Google Drive folder ID from various URL formats
 */
export function extractFolderIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;

    // Handle standard folder URLs: drive.google.com/drive/folders/ID
    // Also handle possible variations
    const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];

    // Handle open?id=ID format
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (idMatch && idMatch[1]) return idMatch[1];

    // If the input itself looks like an ID, return it
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;

    return null;
}


type AreaType = keyof typeof FOLDER_IDS;

function getAuth() {
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        throw new Error('Google Service Account credentials not configured');
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey,
        },
        scopes: ['https://www.googleapis.com/auth/drive'],
    });

    return auth;
}

function getDrive() {
    const auth = getAuth();
    return google.drive({ version: 'v3', auth });
}

export interface UploadResult {
    success: boolean;
    fileId?: string;
    webViewLink?: string;
    error?: string;
}

/**
 * Upload a file to Google Drive
 * @param area - The area folder to upload to (caja-admin, caja-recepcion, pacientes)
 * @param fileName - Name of the file
 * @param fileContent - Content as base64 string or Buffer
 * @param mimeType - MIME type of the file (e.g., 'application/pdf', 'image/png')
 * @param subfolder - Optional subfolder within the area (e.g., '2026-02')
 */
export async function uploadToDrive(
    area: AreaType,
    fileName: string,
    fileContent: string | Buffer,
    mimeType: string,
    subfolder?: string
): Promise<UploadResult> {
    try {
        const drive = getDrive();
        let parentFolderId = FOLDER_IDS[area];

        if (!parentFolderId) {
            return { success: false, error: `Folder not configured for area: ${area}` };
        }

        // Create subfolder if specified
        if (subfolder) {
            const subfolderResult = await createDriveFolder(drive, parentFolderId, subfolder);
            if (subfolderResult.error) {
                return { success: false, error: subfolderResult.error };
            }
            parentFolderId = subfolderResult.folderId!;
        }

        // Convert base64 to buffer if needed
        const buffer = typeof fileContent === 'string'
            ? Buffer.from(fileContent, 'base64')
            : fileContent;

        // Create readable stream from buffer
        const stream = Readable.from(buffer);

        // Upload file
        const response = await drive.files.create({
            requestBody: {
                name: fileName,
                parents: [parentFolderId],
            },
            media: {
                mimeType,
                body: stream,
            },
            fields: 'id, webViewLink',
        });

        return {
            success: true,
            fileId: response.data.id || undefined,
            webViewLink: response.data.webViewLink || undefined,
        };
    } catch (error) {
        console.error('Error uploading to Drive:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

export async function createDriveFolder(
    drive: ReturnType<typeof google.drive>,
    parentFolderId: string,
    folderName: string
): Promise<{ folderId?: string; error?: string }> {
    try {
        // Check if folder exists
        const existingFolders = await drive.files.list({
            q: `name='${folderName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        if (existingFolders.data.files && existingFolders.data.files.length > 0) {
            return { folderId: existingFolders.data.files[0].id! };
        }

        // Create folder
        const newFolder = await drive.files.create({
            requestBody: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [parentFolderId],
            },
            fields: 'id',
        });

        return { folderId: newFolder.data.id! };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Retrieves the webViewLink for a folder ID
 */
export async function getFolderWebViewLink(folderId: string): Promise<string | null> {
    try {
        const drive = getDrive();
        const file = await drive.files.get({
            fileId: folderId,
            fields: 'webViewLink',
        });
        return file.data.webViewLink || null;
    } catch (error) {
        console.error('Error fetching folder webViewLink:', error);
        return null;
    }
}


/**
 * Creates a folder for a workflow (e.g. Orthodontics)
 */
export async function createWorkflowFolder(folderName: string, parentId?: string): Promise<{ folderId?: string; webViewLink?: string; error?: string }> {
    try {
        const drive = getDrive();
        const parentFolderId = parentId || ORTODONCIA_ROOT_FOLDER_ID;
        const result = await createDriveFolder(drive, parentFolderId, folderName);

        if (result.error) return { error: result.error };

        // Get the webViewLink
        const file = await drive.files.get({

            fileId: result.folderId!,
            fields: 'webViewLink',
        });

        return {
            folderId: result.folderId,
            webViewLink: file.data.webViewLink || undefined
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Ensures the standard patient hierarchy exists:
 * Mother Folder (APELLIDO, Nombre)
 *   ├── APELLIDO, Nombre - FOTO & VIDEO
 *   ├── APELLIDO, Nombre - PRESENTACION
 *   └── APELLIDO, Nombre - PRESUPUESTO
 */
export async function ensureStandardPatientFolders(apellido: string, nombre: string): Promise<{ motherFolderId?: string; motherFolderUrl?: string; error?: string }> {
    try {
        const drive = getDrive();
        const motherFolderName = getPatientFolderName(apellido, nombre);

        // 1. Ensure Mother Folder exists
        const motherResult = await createDriveFolder(drive, PACIENTES_ROOT_FOLDER_ID, motherFolderName);
        if (motherResult.error || !motherResult.folderId) return { error: motherResult.error };

        const motherFolderId = motherResult.folderId;

        // 2. Create the 3 standard subfolders
        const subfolders = [
            `${motherFolderName} - FOTO & VIDEO`,
            `${motherFolderName} - PRESENTACION`,
            `${motherFolderName} - PRESUPUESTO`
        ];

        for (const subName of subfolders) {
            await createDriveFolder(drive, motherFolderId, subName);
        }

        // 3. Get Mother Folder URL
        const motherUrl = await getFolderWebViewLink(motherFolderId);

        return {
            motherFolderId,
            motherFolderUrl: motherUrl || undefined
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * List files in any folder by its ID
 */
export async function listFolderFiles(folderId: string): Promise<{ files?: { id: string; name: string; webViewLink: string; mimeType: string; createdTime: string }[]; error?: string }> {
    try {
        const drive = getDrive();
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, webViewLink, mimeType, createdTime)',
            orderBy: 'createdTime desc',
        });

        return {
            files: response.data.files?.map(f => ({
                id: f.id!,
                name: f.name!,
                webViewLink: f.webViewLink!,
                mimeType: f.mimeType!,
                createdTime: f.createdTime!,
            })) || [],
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Delete a file from Drive
 */
export async function deleteFromDrive(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const drive = getDrive();
        await drive.files.delete({ fileId });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
