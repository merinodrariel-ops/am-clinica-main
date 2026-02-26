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
        scopes: [
            'https://www.googleapis.com/auth/drive',
            'https://www.googleapis.com/auth/presentations',
            'https://www.googleapis.com/auth/documents'
        ],
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
        const contractFolderName = `${motherFolderName} - Contrato`;

        let resolvedMotherFolderId = motherFolderId;

        if (resolvedMotherFolderId) {
            try {
                await drive.files.get({ fileId: resolvedMotherFolderId, fields: 'id' });
            } catch {
                resolvedMotherFolderId = undefined;
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

// Template IDs (These should ideally be in .env)
const TEMPLATE_FICHA_ID = '1r-Sbwz9eXU3z0z2M3_7HIs-1AtL5U-z3L7Hj0s9z0A'; // Example ID
const TEMPLATE_PRESUPUESTO_ID = '1LzL0z9eXU3z0z2M3_7HIs-1AtL5U-z3L7Hj0s9z0A'; // Example ID

/**
 * Copies templates and replaces placeholders for a new patient
 */
export async function createPatientDocuments(
    motherFolderId: string,
    patientData: { nombre: string; apellido: string; dni: string; fecha: string }
): Promise<{ fichaUrl?: string; presupuestoUrl?: string; error?: string }> {
    try {
        const drive = getDrive();
        const slides = google.slides({ version: 'v1', auth: getAuth() });

        // 1. Find the PRESENTACION and PRESUPUESTO subfolders
        const subfolders = await drive.files.list({
            q: `'${motherFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        const presentacionFolder = subfolders.data.files?.find(f => f.name?.includes('PRESENTACION'));
        const presupuestoFolder = subfolders.data.files?.find(f => f.name?.includes('PRESUPUESTO'));

        if (!presentacionFolder || !presupuestoFolder) {
            return { error: 'Standard subfolders not found in mother folder' };
        }

        const results: { fichaUrl?: string; presupuestoUrl?: string } = {};

        // 2. Copy and populate "Ficha/Presentacion"
        // Search for template by name if ID is not confirmed
        const fichaTemplate = await findFileByName(drive, 'Plantilla Ficha/Presentacion');
        if (fichaTemplate) {
            const newFichaName = `Ficha - ${patientData.apellido}, ${patientData.nombre}`;
            const copyRes = await drive.files.copy({
                fileId: fichaTemplate.id!,
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
        const presupuestoTemplate = await findFileByName(drive, 'Plantilla Presupuesto');
        if (presupuestoTemplate) {
            const newPresuName = `Presupuesto - ${patientData.apellido}, ${patientData.nombre}`;
            const copyRes = await drive.files.copy({
                fileId: presupuestoTemplate.id!,
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
    data: { nombre: string; apellido: string; dni: string; fecha: string }
) {
    const requests = [
        { replaceAllText: { replaceText: data.nombre, containsText: { text: '{{Nombre}}', matchCase: false } } },
        { replaceAllText: { replaceText: data.apellido, containsText: { text: '{{Apellido}}', matchCase: false } } },
        { replaceAllText: { replaceText: data.dni, containsText: { text: '{{DNI}}', matchCase: false } } },
        { replaceAllText: { replaceText: data.fecha, containsText: { text: '{{Fecha}}', matchCase: false } } },
    ];

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
