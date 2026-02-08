'use server';

import { google } from 'googleapis';
import { Readable } from 'stream';

// Folder IDs for different areas
const FOLDER_IDS = {
    'caja-admin': process.env.GOOGLE_DRIVE_FOLDER_ADMIN || '',
    'caja-recepcion': process.env.GOOGLE_DRIVE_FOLDER_RECEPCION || '',
    'pacientes': process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '',
} as const;

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
            const subfolderResult = await getOrCreateSubfolder(drive, parentFolderId, subfolder);
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

async function getOrCreateSubfolder(
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
 * List files in a folder
 */
export async function listDriveFiles(
    area: AreaType,
    subfolder?: string
): Promise<{ files?: { id: string; name: string; webViewLink: string }[]; error?: string }> {
    try {
        const drive = getDrive();
        let folderId = FOLDER_IDS[area];

        if (!folderId) {
            return { error: `Folder not configured for area: ${area}` };
        }

        if (subfolder) {
            const subfolderResult = await getOrCreateSubfolder(drive, folderId, subfolder);
            if (subfolderResult.error) return { error: subfolderResult.error };
            folderId = subfolderResult.folderId!;
        }

        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, webViewLink)',
            orderBy: 'createdTime desc',
        });

        return {
            files: response.data.files?.map(f => ({
                id: f.id!,
                name: f.name!,
                webViewLink: f.webViewLink!,
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
