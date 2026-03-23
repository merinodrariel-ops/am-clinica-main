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
export const PACIENTES_ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_PACIENTES || '1DImiMlrJVgqFLdzx0Q0GTrotkbVduhti';

/**
 * Standardizes patient folder names: APELLIDO, Nombre
 */
export function getPatientFolderName(apellido: string, nombre: string): string {
    const cleanApellido = (apellido || '').toUpperCase().trim();
    const cleanNombre = (nombre || '').trim();
    // Capitalize first letter of name, rest lowercase
    const formattedNombre = cleanNombre ? cleanNombre.charAt(0).toUpperCase() + cleanNombre.slice(1).toLowerCase() : '';

    if (cleanApellido && formattedNombre) {
        return `${cleanApellido}, ${formattedNombre}`;
    }
    if (cleanApellido) {
        return cleanApellido;
    }
    if (formattedNombre) {
        return formattedNombre;
    }
    return 'PACIENTE';
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

const DRIVE_DEFAULT_SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/presentations',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.readonly',
];

function getAuth(scopes: string[] = DRIVE_DEFAULT_SCOPES) {
    const authMode = (process.env.GOOGLE_DRIVE_AUTH_MODE || 'auto').toLowerCase();
    const oauthClientId = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_ID;
    const oauthClientSecret = process.env.GOOGLE_DRIVE_OAUTH_CLIENT_SECRET;
    const oauthRefreshToken = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;
    const oauthRedirectUri = process.env.GOOGLE_DRIVE_OAUTH_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (authMode === 'service_account') {
        if (!serviceAccountEmail || !serviceAccountKey) {
            throw new Error('GOOGLE_DRIVE_AUTH_MODE=service_account pero faltan GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY');
        }

        return new google.auth.GoogleAuth({
            credentials: {
                client_email: serviceAccountEmail,
                private_key: serviceAccountKey,
            },
            scopes,
        });
    }

    if (authMode === 'oauth' && (!oauthClientId || !oauthClientSecret || !oauthRefreshToken)) {
        throw new Error('GOOGLE_DRIVE_AUTH_MODE=oauth pero faltan GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN');
    }

    // Preferred mode for personal Google accounts (Google One): user OAuth refresh token.
    if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
        const oauth2Client = new google.auth.OAuth2(oauthClientId, oauthClientSecret, oauthRedirectUri);
        oauth2Client.setCredentials({
            refresh_token: oauthRefreshToken,
        });
        return oauth2Client;
    }

    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!clientEmail || !privateKey) {
        throw new Error(
            'Google Drive auth not configured. Set GOOGLE_DRIVE_OAUTH_CLIENT_ID/SECRET/REFRESH_TOKEN (recommended) or GOOGLE_SERVICE_ACCOUNT_EMAIL/PRIVATE_KEY.'
        );
    }

    const auth = new google.auth.GoogleAuth({
        credentials: {
            client_email: clientEmail,
            private_key: privateKey,
        },
        scopes,
    });

    return auth;
}

function getDrive() {
    const auth = getAuth();
    return google.drive({ version: 'v3', auth });
}

export function getDriveClient() {
    return getDrive();
}

export interface UploadResult {
    success: boolean;
    fileId?: string;
    webViewLink?: string;
    error?: string;
}

/**
 * Creates a plain text/markdown file inside a specific Drive folder.
 */
export async function createTextFileInFolder(
    folderId: string,
    fileName: string,
    content: string,
    mimeType: string = 'text/markdown'
): Promise<{ fileId?: string; webViewLink?: string; error?: string }> {
    try {
        const drive = getDrive();
        const buffer = Buffer.from(content, 'utf-8');
        const stream = Readable.from(buffer);

        const response = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [folderId],
                mimeType,
            },
            media: {
                mimeType,
                body: stream,
            },
            fields: 'id, webViewLink',
        });

        return {
            fileId: response.data.id || undefined,
            webViewLink: response.data.webViewLink || undefined,
        };
    } catch (error) {
        console.error('Error creating text file in folder:', error);
        return { error: error instanceof Error ? error.message : String(error) };
    }
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
            supportsAllDrives: true,
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
    const inflightKey = `${parentFolderId}::${folderName.normalize('NFC')}`;
    const inflightExisting = folderCreationInflight.get(inflightKey);
    if (inflightExisting) return inflightExisting;

    const inflight = (async (): Promise<{ folderId?: string; error?: string }> => {
        try {
            const existingFolders = await findFuzzyFoldersByName(drive, parentFolderId, folderName);
            const existingCanonical = pickCanonicalFolder(existingFolders);
            if (existingCanonical?.id) {
                return { folderId: existingCanonical.id };
            }

            const newFolder = await drive.files.create({
                supportsAllDrives: true,
                requestBody: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [parentFolderId],
                },
                fields: 'id',
            });

            const createdFolderId = newFolder.data.id;
            if (!createdFolderId) {
                return { error: 'No se pudo crear carpeta en Google Drive' };
            }

            const retryDelaysMs = [0, 120, 320, 700];
            for (const delayMs of retryDelaysMs) {
                if (delayMs > 0) {
                    await wait(delayMs);
                }

                const foldersNow = await listExactFoldersByName(drive, parentFolderId, folderName);
                const canonicalNow = pickCanonicalFolder(foldersNow);
                if (!canonicalNow?.id) continue;

                if (canonicalNow.id !== createdFolderId) {
                    console.warn('[drive-folder-idempotency] duplicate folder detected, keeping canonical', {
                        parentFolderId,
                        folderName,
                        canonicalFolderId: canonicalNow.id,
                        createdFolderId,
                    });
                    await trashFolderIfEmpty(drive, createdFolderId);
                }

                return { folderId: canonicalNow.id };
            }

            return { folderId: createdFolderId };
        } catch (error) {
            return { error: error instanceof Error ? error.message : String(error) };
        }
    })();

    folderCreationInflight.set(inflightKey, inflight);

    try {
        return await inflight;
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    } finally {
        folderCreationInflight.delete(inflightKey);
    }
}

const folderCreationInflight = new Map<string, Promise<{ folderId?: string; error?: string }>>();

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeDriveQueryValue(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function listExactFoldersByName(
    drive: ReturnType<typeof google.drive>,
    parentFolderId: string,
    folderName: string
) {
    const safeName = escapeDriveQueryValue(folderName);
    const response = await drive.files.list({
        q: `name='${safeName}' and '${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name, createdTime)',
        orderBy: 'createdTime asc',
        pageSize: 50,
    });

    return response.data.files || [];
}

/**
 * Searches for a folder with some flexibility (swapped name/surname or missing brackets)
 */
async function findFuzzyFoldersByName(
    drive: ReturnType<typeof google.drive>,
    parentFolderId: string,
    folderName: string
) {
    // 1. Try exact match
    const exact = await listExactFoldersByName(drive, parentFolderId, folderName);
    if (exact.length > 0) return exact;

    // 2. Try swapped format if it contains a comma
    if (folderName.includes(',')) {
        const parts = folderName.split(',').map((p) => p.trim());
        if (parts.length === 2) {
            const swapped = `${parts[1].toUpperCase()}, ${parts[0]}`;
            const swappedResults = await listExactFoldersByName(drive, parentFolderId, swapped);
            if (swappedResults.length > 0) return swappedResults;
        }
    }

    // 3. Try searching for matches containing both parts of the name
    const terms = folderName.replace(/[\[\]]/g, '').split(/[\s,]+/).filter(t => t.length > 2);
    if (terms.length >= 2) {
        let query = `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
        for (const term of terms) {
            query += ` and name contains '${escapeDriveQueryValue(term)}'`;
        }
        const res = await drive.files.list({
            q: query,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, createdTime)',
        });
        if (res.data.files && res.data.files.length > 0) return res.data.files;
    }

    return [];
}

function pickCanonicalFolder(
    folders: Array<{ id?: string | null; createdTime?: string | null }>
): { id?: string | null; createdTime?: string | null } | null {
    if (!folders.length) return null;

    return [...folders]
        .filter((folder) => Boolean(folder.id))
        .sort((a, b) => {
            const aTime = a.createdTime ? new Date(a.createdTime).getTime() : Number.MAX_SAFE_INTEGER;
            const bTime = b.createdTime ? new Date(b.createdTime).getTime() : Number.MAX_SAFE_INTEGER;
            if (aTime !== bTime) return aTime - bTime;
            return String(a.id).localeCompare(String(b.id));
        })[0] || null;
}

async function trashFolderIfEmpty(drive: ReturnType<typeof google.drive>, folderId: string): Promise<void> {
    try {
        const children = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id)',
            pageSize: 1,
        });

        const hasChildren = (children.data.files || []).length > 0;
        if (hasChildren) return;

        await drive.files.update({
            fileId: folderId,
            supportsAllDrives: true,
            requestBody: { trashed: true },
            fields: 'id',
        });
    } catch {
        // best-effort cleanup, ignore failures
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
            supportsAllDrives: true,
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
            supportsAllDrives: true,
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
export async function ensureStandardPatientFolders(
    apellido: string,
    nombre: string,
    motherFolderId?: string
): Promise<{ motherFolderId?: string; motherFolderUrl?: string; error?: string }> {
    try {
        const drive = getDrive();
        const motherFolderName = getPatientFolderName(apellido, nombre);

        let resolvedMotherFolderId = extractFolderIdFromUrl(motherFolderId);

        if (resolvedMotherFolderId) {
            try {
                await drive.files.get({
                    fileId: resolvedMotherFolderId,
                    supportsAllDrives: true,
                    fields: 'id',
                });
            } catch {
                resolvedMotherFolderId = null;
            }
        }

        if (!resolvedMotherFolderId) {
            // 1. Ensure Mother Folder exists
            const motherResult = await createDriveFolder(drive, PACIENTES_ROOT_FOLDER_ID, motherFolderName);
            if (motherResult.error || !motherResult.folderId) return { error: motherResult.error };
            resolvedMotherFolderId = motherResult.folderId;
        }

        const finalMotherFolderId = resolvedMotherFolderId;

        // 2. Create the 3 standard subfolders
        const subfolders = [
            `[FOTO & VIDEO] ${motherFolderName}`,
            `[PRESENTACION] ${motherFolderName}`,
            `[PRESUPUESTO] ${motherFolderName}`
        ];

        for (const subName of subfolders) {
            await createDriveFolder(drive, finalMotherFolderId, subName);
        }

        // 3. Get Mother Folder URL
        const motherUrl = await getFolderWebViewLink(finalMotherFolderId);

        return {
            motherFolderId: finalMotherFolderId,
            motherFolderUrl: motherUrl || undefined
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Ensures a patient's mother folder and contract subfolder exist.
 * - Mother: "APELLIDO, Nombre"
 * - Subfolder: "APELLIDO, Nombre - Contrato"
 * If an existing motherFolderId is provided but inaccessible, a new mother folder is created.
 */
export async function ensurePatientContractFolder(
    apellido: string,
    nombre: string,
    motherFolderId?: string
): Promise<{
    motherFolderId?: string;
    motherFolderUrl?: string;
    contractFolderId?: string;
    contractFolderUrl?: string;
    error?: string;
}> {
    try {
        const drive = getDrive();
        const motherFolderName = getPatientFolderName(apellido, nombre);
        const contractFolderName = `[CONTRATO] ${motherFolderName}`;

        let resolvedMotherFolderId = extractFolderIdFromUrl(motherFolderId);

        if (resolvedMotherFolderId) {
            try {
                await drive.files.get({ fileId: resolvedMotherFolderId, fields: 'id', supportsAllDrives: true });
            } catch {
                resolvedMotherFolderId = null;
            }
        }

        if (!resolvedMotherFolderId) {
            const motherResult = await createDriveFolder(drive, PACIENTES_ROOT_FOLDER_ID, motherFolderName);
            if (motherResult.error || !motherResult.folderId) {
                return { error: motherResult.error || 'No se pudo crear carpeta madre del paciente' };
            }
            resolvedMotherFolderId = motherResult.folderId;
        }

        const contractResult = await createDriveFolder(drive, resolvedMotherFolderId, contractFolderName);
        if (contractResult.error || !contractResult.folderId) {
            return { error: contractResult.error || 'No se pudo crear carpeta de contrato del paciente' };
        }

        const motherFolderUrl = await getFolderWebViewLink(resolvedMotherFolderId);
        const contractFolderUrl = await getFolderWebViewLink(contractResult.folderId);

        return {
            motherFolderId: resolvedMotherFolderId,
            motherFolderUrl: motherFolderUrl || undefined,
            contractFolderId: contractResult.folderId,
            contractFolderUrl: contractFolderUrl || undefined,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Ensures a patient's mother folder and presentation subfolder exist.
 * - Mother: "APELLIDO, Nombre"
 * - Subfolder: "APELLIDO, Nombre - PRESENTACION"
 */
export async function ensurePatientPresentationFolder(
    apellido: string,
    nombre: string,
    motherFolderId?: string
): Promise<{
    motherFolderId?: string;
    motherFolderUrl?: string;
    presentationFolderId?: string;
    presentationFolderUrl?: string;
    error?: string;
}> {
    try {
        const drive = getDrive();
        const motherFolderName = getPatientFolderName(apellido, nombre);
        const presentationFolderName = `[PRESENTACION] ${motherFolderName}`;

        let resolvedMotherFolderId = extractFolderIdFromUrl(motherFolderId);

        if (resolvedMotherFolderId) {
            try {
                await drive.files.get({
                    fileId: resolvedMotherFolderId,
                    supportsAllDrives: true,
                    fields: 'id',
                });
            } catch {
                resolvedMotherFolderId = null;
            }
        }

        if (!resolvedMotherFolderId) {
            const motherResult = await createDriveFolder(drive, PACIENTES_ROOT_FOLDER_ID, motherFolderName);
            if (motherResult.error || !motherResult.folderId) {
                return { error: motherResult.error || 'No se pudo crear carpeta madre del paciente' };
            }
            resolvedMotherFolderId = motherResult.folderId;
        }

        const presentationResult = await createDriveFolder(drive, resolvedMotherFolderId, presentationFolderName);
        if (presentationResult.error || !presentationResult.folderId) {
            return { error: presentationResult.error || 'No se pudo crear carpeta de presentacion del paciente' };
        }

        const motherFolderUrl = await getFolderWebViewLink(resolvedMotherFolderId);
        const presentationFolderUrl = await getFolderWebViewLink(presentationResult.folderId);

        return {
            motherFolderId: resolvedMotherFolderId,
            motherFolderUrl: motherFolderUrl || undefined,
            presentationFolderId: presentationResult.folderId,
            presentationFolderUrl: presentationFolderUrl || undefined,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * List files in any folder by its ID
 */
export async function listFolderFiles(folderId: string): Promise<{ files?: { id: string; name: string; webViewLink: string; mimeType: string; createdTime: string; thumbnailLink?: string; size?: string }[]; error?: string }> {
    try {
        const drive = getDrive();
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, webViewLink, mimeType, createdTime, thumbnailLink, size)',
            orderBy: 'createdTime asc',
        });

        return {
            files: response.data.files?.map(f => ({
                id: f.id!,
                name: f.name!,
                webViewLink: f.webViewLink!,
                mimeType: f.mimeType!,
                createdTime: f.createdTime!,
                thumbnailLink: f.thumbnailLink || undefined,
                size: f.size || undefined,
            })) || [],
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

const PRESENTATION_MIME_TYPES = new Set([
    'application/vnd.google-apps.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
]);

export async function movePresentationFilesToFolder(
    sourceFolderId: string,
    targetFolderId: string
): Promise<{
    movedCount: number;
    movedFiles: Array<{ id: string; name: string }>;
    skipped: Array<{ id: string; name: string; reason: string }>;
    error?: string;
}> {
    if (!sourceFolderId || !targetFolderId) {
        return {
            movedCount: 0,
            movedFiles: [],
            skipped: [],
            error: 'sourceFolderId y targetFolderId son requeridos',
        };
    }

    if (sourceFolderId === targetFolderId) {
        return { movedCount: 0, movedFiles: [], skipped: [] };
    }

    try {
        const drive = getDrive();

        const children = await drive.files.list({
            q: `'${sourceFolderId}' in parents and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, mimeType, parents)',
            pageSize: 200,
        });

        const files = children.data.files || [];
        const misplacedPresentations = files.filter((file) =>
            Boolean(file.id) && PRESENTATION_MIME_TYPES.has(file.mimeType || '')
        );

        const movedFiles: Array<{ id: string; name: string }> = [];
        const skipped: Array<{ id: string; name: string; reason: string }> = [];

        for (const file of misplacedPresentations) {
            const fileId = file.id as string;
            const fileName = file.name || 'Sin nombre';
            const currentParents = (file.parents || []).join(',');

            if (!currentParents) {
                skipped.push({
                    id: fileId,
                    name: fileName,
                    reason: 'No se pudieron resolver los padres actuales del archivo',
                });
                continue;
            }

            try {
                await drive.files.update({
                    fileId,
                    supportsAllDrives: true,
                    enforceSingleParent: true,
                    addParents: targetFolderId,
                    removeParents: currentParents,
                    fields: 'id',
                });

                movedFiles.push({ id: fileId, name: fileName });
            } catch (error) {
                skipped.push({
                    id: fileId,
                    name: fileName,
                    reason: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return {
            movedCount: movedFiles.length,
            movedFiles,
            skipped,
        };
    } catch (error) {
        return {
            movedCount: 0,
            movedFiles: [],
            skipped: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Delete a file from Drive
 */
export async function deleteFromDrive(fileId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const drive = getDrive();
        // Use trash instead of delete: trash only requires write access (not ownership),
        // so the service account can trash files it didn't create.
        await drive.files.update({ fileId, supportsAllDrives: true, requestBody: { trashed: true } });
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Duplicates a file in Drive
 */
export async function copyDriveFile(
    fileId: string,
    newFileName: string
): Promise<{ fileId?: string; error?: string }> {
    try {
        const drive = getDrive();
        const response = await drive.files.copy({
            fileId,
            supportsAllDrives: true,
            requestBody: {
                name: newFileName,
            },
            fields: 'id',
        });
        return { fileId: response.data.id || undefined };
    } catch (error) {
        console.error('Error copying file in Drive:', error);
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Uploads a file buffer directly to a specific Drive folder by ID.
 * Used for saving edited photos back to patient folders.
 */
export async function uploadFileToFolder(
    folderId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
): Promise<UploadResult> {
    try {
        const drive = getDrive();
        const stream = Readable.from(buffer);
        const response = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [folderId],
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
        console.error('Error uploading file to Drive folder:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Updates the content of an existing Drive file in-place (preserves file ID, no duplicate).
 * Requires writer access on the file — works for service account as folder writer.
 */
export async function updateFileContentInDrive(
    fileId: string,
    buffer: Buffer,
    mimeType: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const drive = getDrive();
        const stream = Readable.from(buffer);
        await drive.files.update({
            fileId,
            supportsAllDrives: true,
            media: { mimeType, body: stream },
            fields: 'id',
        });
        return { success: true };
    } catch (error) {
        console.error('[Drive] Error updating file content:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

// Template IDs from environment (recommended) or fallback to name search
const getTemplateFichaId = () => process.env.GOOGLE_SLIDES_TEMPLATE_FICHA || '';
const getTemplatePresupuestoId = () => process.env.GOOGLE_SLIDES_TEMPLATE_PRESUPUESTO || '';

/**
 * Copies templates and replaces placeholders for a new patient
 */
export async function createPatientDocuments(
    motherFolderId: string,
    patientData: {
        nombre: string;
        apellido: string;
        dni: string;
        fecha: string;
        fechaNacimiento?: string;
        edad?: string;
        whatsapp?: string;
        email?: string;
        ciudad?: string;
        barrio?: string;
        motivoConsulta?: string;
        comoNosConocio?: string;
        alergias?: string;
        medicacion?: string;
        tratamientoActivo?: string;
        observacionesGenerales?: string;
    }
): Promise<{ fichaUrl?: string; presupuestoUrl?: string; error?: string }> {
    try {
        const drive = getDrive();
        const slides = google.slides({ version: 'v1', auth: getAuth() });

        // 1. Find the PRESENTACION and PRESUPUESTO subfolders
        const subfolders = await drive.files.list({
            q: `'${motherFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
        });

        let presentacionFolder = subfolders.data.files?.find(f => f.name?.includes('PRESENTACION'));
        let presupuestoFolder = subfolders.data.files?.find(f => f.name?.includes('PRESUPUESTO'));

        if (!presentacionFolder || !presupuestoFolder) {
            // Try harder by looking for folders that might have different naming (e.g. without brackets if they were missing)
            if (!presentacionFolder) {
                 const res = await drive.files.list({
                    q: `'${motherFolderId}' in parents and name contains 'PRESENTACION' and trashed=false`,
                    fields: 'files(id, name)',
                    supportsAllDrives: true,
                });
                presentacionFolder = res.data.files?.[0];
            }
            if (!presupuestoFolder) {
                 const res = await drive.files.list({
                    q: `'${motherFolderId}' in parents and name contains 'PRESUPUESTO' and trashed=false`,
                    fields: 'files(id, name)',
                    supportsAllDrives: true,
                });
                presupuestoFolder = res.data.files?.[0];
            }
        }

        if (!presentacionFolder || !presupuestoFolder) {
            return { error: 'Standard subfolders not found in mother folder' };
        }

        const results: { fichaUrl?: string; presupuestoUrl?: string } = {};

        // 2. Copy and populate "Ficha/Presentacion"
        const fichaTemplateId = getTemplateFichaId() || (await findFileByName(drive, 'Plantilla Ficha/Presentacion'))?.id;
        console.log('Ficha template lookup:', fichaTemplateId ? `Found ID: ${fichaTemplateId}` : 'NOT FOUND - create template and set GOOGLE_SLIDES_TEMPLATE_FICHA in .env.local');
        if (fichaTemplateId) {
            const newFichaName = `Ficha - ${patientData.apellido}, ${patientData.nombre}`;
            const copyRes = await drive.files.copy({
                fileId: fichaTemplateId,
                supportsAllDrives: true,
                requestBody: {
                    name: newFichaName,
                    parents: [presentacionFolder.id!],
                },
            });

            if (copyRes.data.id) {
                await replaceSlidesPlaceholders(slides, copyRes.data.id, patientData);
                results.fichaUrl = `https://docs.google.com/presentation/d/${copyRes.data.id}/edit`;
            }
        }

        // 3. Copy and populate "Presupuesto"
        const presupuestoTemplateId = getTemplatePresupuestoId() || (await findFileByName(drive, 'Plantilla Presupuesto'))?.id;
        console.log('Presupuesto template lookup:', presupuestoTemplateId ? `Found ID: ${presupuestoTemplateId}` : 'NOT FOUND - create template and set GOOGLE_SLIDES_TEMPLATE_PRESUPUESTO in .env.local');
        if (presupuestoTemplateId) {
            const newPresuName = `Presupuesto - ${patientData.apellido}, ${patientData.nombre}`;
            const copyRes = await drive.files.copy({
                fileId: presupuestoTemplateId,
                supportsAllDrives: true,
                requestBody: {
                    name: newPresuName,
                    parents: [presupuestoFolder.id!],
                },
            });

            if (copyRes.data.id) {
                await replaceSlidesPlaceholders(slides, copyRes.data.id, patientData);
                results.presupuestoUrl = `https://docs.google.com/presentation/d/${copyRes.data.id}/edit`;
            }
        }

        return results;
    } catch (error) {
        console.error('Error creating patient documents:', error);
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Replaces placeholders in a Google Slides document
 */
async function replaceSlidesPlaceholders(
    slides: ReturnType<typeof google.slides>,
    presentationId: string,
    data: {
        nombre: string;
        apellido: string;
        dni: string;
        fecha: string;
        fechaNacimiento?: string;
        edad?: string;
        whatsapp?: string;
        email?: string;
        ciudad?: string;
        barrio?: string;
        motivoConsulta?: string;
        comoNosConocio?: string;
        alergias?: string;
        medicacion?: string;
        tratamientoActivo?: string;
        observacionesGenerales?: string;
    }
) {
    const fullName = `${data.apellido}, ${data.nombre}`;
    const replacements: Record<string, string> = {
        '{{Nombre}}': data.nombre,
        '{{Apellido}}': data.apellido,
        '{{NombreApellido}}': fullName,
        '{{DNI}}': data.dni || '-',
        '{{Fecha}}': data.fecha,
        '{{FechaNacimiento}}': data.fechaNacimiento || '-',
        '{{Edad}}': data.edad || '-',
        '{{Telefono}}': data.whatsapp || '-',
        '{{Email}}': data.email || '-',
        '{{Ciudad}}': data.ciudad || '-',
        '{{Barrio}}': data.barrio || '-',
        '{{MotivoConsulta}}': data.motivoConsulta || '-',
        '{{ComoNosConocio}}': data.comoNosConocio || '-',
        '{{Alergias}}': data.alergias || 'Sin alergias reportadas',
        '{{Medicacion}}': data.medicacion || 'Sin medicación activa',
        '{{TratamientoActivo}}': data.tratamientoActivo || 'Sin tratamiento activo',
        '{{ObservacionesGenerales}}': data.observacionesGenerales || '-',
    };

    const requests = Object.entries(replacements).map(([placeholder, value]) => ({
        replaceAllText: {
            replaceText: value,
            containsText: { text: placeholder, matchCase: false },
        },
    }));

    await slides.presentations.batchUpdate({
        presentationId,
        requestBody: { requests },
    });
}

/**
 * Utility to find a file by name anywhere in the accessible Drive
 */
async function findFileByName(drive: ReturnType<typeof google.drive>, name: string) {
    const res = await drive.files.list({
        q: `name = '${name}' and trashed = false`,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: 'files(id, name)',
        pageSize: 1,
    });
    return res.data.files && res.data.files.length > 0 ? res.data.files[0] : null;
}

/**
 * Copies a Google Doc template and replaces placeholders using the Docs API
 */
export async function createContractFromTemplate(
    folderId: string,
    templateId: string,
    fileName: string,
    placeholders: Record<string, string>
): Promise<{ docId?: string; docUrl?: string; error?: string }> {
    try {
        const drive = getDrive();
        const docs = google.docs({ version: 'v1', auth: getAuth() });

        // 1. Copy the template
        const copyRes = await drive.files.copy({
            supportsAllDrives: true,
            fileId: templateId,
            requestBody: {
                name: fileName,
                parents: [folderId],
            },
        });

        const newDocId = copyRes.data.id;
        if (!newDocId) throw new Error('Failed to copy template');

        // 2. Prepare replacement requests for Docs API
        // Note: Docs API batchUpdate uses a different structure than Slides
        const requests = Object.entries(placeholders).map(([key, value]) => ({
            replaceAllText: {
                replaceText: value || '',
                containsText: {
                    text: `{{${key}}}`,
                    matchCase: false,
                },
            },
        }));

        // 3. Apply the replacements
        await docs.documents.batchUpdate({
            documentId: newDocId,
            requestBody: { requests },
        });

        return {
            docId: newDocId,
            docUrl: `https://docs.google.com/document/d/${newDocId}/edit`,
        };
    } catch (error) {
        console.error('Error in createContractFromTemplate:', error);
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Validates access to a Drive file/folder in My Drive or Shared Drive.
 */
export async function getDriveItemAccess(fileId: string): Promise<{
    ok: boolean;
    name?: string;
    mimeType?: string;
    webViewLink?: string;
    error?: string;
}> {
    try {
        const drive = getDrive();
        const res = await drive.files.get({
            fileId,
            supportsAllDrives: true,
            fields: 'id, name, mimeType, webViewLink',
        });

        return {
            ok: Boolean(res.data.id),
            name: res.data.name || undefined,
            mimeType: res.data.mimeType || undefined,
            webViewLink: res.data.webViewLink || undefined,
        };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Ensures the [EXOCAD] and [EXOCAD]/HTML subfolders exist for a patient.
 * The mother folder is the patient's root Drive folder (e.g. "HAHN, Carolina").
 * Returns the HTML subfolder ID where the designer uploads the Exocad design.
 */
export async function ensureExocadHtmlFolder(
    motherFolderId: string
): Promise<{ htmlFolderId?: string; exocadFolderId?: string; error?: string }> {
    try {
        const drive = getDrive();

        // Get mother folder name to compose subfolder name
        const motherFile = await drive.files.get({
            fileId: motherFolderId,
            supportsAllDrives: true,
            fields: 'name',
        });
        const motherName = motherFile.data.name || 'PACIENTE';

        // Ensure [EXOCAD] subfolder
        const exocadName = `[EXOCAD] ${motherName}`;
        const exocadResult = await createDriveFolder(drive, motherFolderId, exocadName);
        if (exocadResult.error || !exocadResult.folderId) {
            return { error: exocadResult.error || 'No se pudo crear carpeta EXOCAD' };
        }

        // Ensure HTML subfolder inside [EXOCAD]
        const htmlResult = await createDriveFolder(drive, exocadResult.folderId, 'HTML');
        if (htmlResult.error || !htmlResult.folderId) {
            return { error: htmlResult.error || 'No se pudo crear carpeta HTML' };
        }

        return {
            exocadFolderId: exocadResult.folderId,
            htmlFolderId: htmlResult.folderId,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Finds the latest HTML file inside a Drive folder (most recently modified).
 * Used to detect when the designer uploaded a new Exocad design to [EXOCAD]/HTML/.
 */
export async function getLatestHtmlFileInFolder(
    folderId: string
): Promise<{ fileId?: string; fileName?: string; error?: string }> {
    try {
        const drive = getDrive();
        const res = await drive.files.list({
            q: `'${folderId}' in parents and mimeType='text/html' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, modifiedTime)',
            orderBy: 'modifiedTime desc',
            pageSize: 1,
        });

        const files = res.data.files || [];
        if (!files.length) return {};

        return {
            fileId: files[0].id!,
            fileName: files[0].name!,
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Downloads the raw content of a Drive file by ID.
 * Used to proxy the Exocad HTML file to the patient portal iframe.
 * The HTML is self-contained (includes all assets inline).
 */
export async function getDriveFileContent(
    fileId: string
): Promise<{ content?: string; error?: string }> {
    try {
        const drive = getDrive();
        const res = await drive.files.get(
            { fileId, supportsAllDrives: true, alt: 'media' },
            { responseType: 'text' }
        );
        return { content: res.data as string };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
