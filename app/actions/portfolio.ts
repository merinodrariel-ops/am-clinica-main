'use server';

import { createClient } from '@/utils/supabase/server';
import {
    getDriveClient,
    createDriveFolder,
    PACIENTES_ROOT_FOLDER_ID,
    getPatientFolderName,
} from '@/lib/google-drive';
import { Readable } from 'stream';

export async function getPatientDrivePhotos(pacienteNombre: string): Promise<{
    photos?: Array<{ id: string; name: string; thumbnailLink?: string; webViewLink: string }>;
    error?: string;
}> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();

        const parts = pacienteNombre.trim().split(/\s+/);
        const apellido = parts[parts.length - 1].toUpperCase();

        const safeName = apellido.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        const foldersRes = await drive.files.list({
            q: `name contains '${safeName}' and '${PACIENTES_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name)',
            pageSize: 10,
        });

        const motherFolder = foldersRes.data.files?.[0];
        if (!motherFolder?.id) return { photos: [] };

        const subRes = await drive.files.list({
            q: `name contains 'FOTO' and '${motherFolder.id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name)',
            pageSize: 5,
        });

        const fotoFolder = subRes.data.files?.[0];
        if (!fotoFolder?.id) return { photos: [] };

        const filesRes = await drive.files.list({
            q: `'${fotoFolder.id}' in parents and trashed=false and (mimeType contains 'image/')`,
            includeItemsFromAllDrives: true,
            supportsAllDrives: true,
            fields: 'files(id, name, webViewLink, thumbnailLink)',
            orderBy: 'createdTime desc',
            pageSize: 50,
        });

        return {
            photos: (filesRes.data.files || []).map(f => ({
                id: f.id!,
                name: f.name!,
                thumbnailLink: f.thumbnailLink || undefined,
                webViewLink: f.webViewLink!,
            })),
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

export async function getDriveImageBase64(fileId: string): Promise<{
    base64?: string;
    mimeType?: string;
    error?: string;
}> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();
        const metaRes = await drive.files.get({
            fileId,
            supportsAllDrives: true,
            fields: 'mimeType',
        });
        const mimeType = metaRes.data.mimeType || 'image/jpeg';

        const res = await drive.files.get(
            { fileId, supportsAllDrives: true, alt: 'media' },
            { responseType: 'arraybuffer' }
        );
        const buffer = Buffer.from(res.data as ArrayBuffer);
        const base64 = buffer.toString('base64');

        return { base64, mimeType };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

export async function uploadPhotoToPatientDrive(
    pacienteNombre: string,
    fileName: string,
    base64: string,
    mimeType: string
): Promise<{ webViewLink?: string; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();
        const parts = pacienteNombre.trim().split(/\s+/);
        const apellido = parts[parts.length - 1];
        const nombre = parts.slice(0, -1).join(' ');
        const folderName = getPatientFolderName(apellido, nombre);

        const motherRes = await createDriveFolder(drive, PACIENTES_ROOT_FOLDER_ID, folderName);
        if (motherRes.error || !motherRes.folderId) return { error: motherRes.error };

        const fotoFolderName = `[FOTO & VIDEO] ${folderName}`;
        const fotoRes = await createDriveFolder(drive, motherRes.folderId, fotoFolderName);
        if (fotoRes.error || !fotoRes.folderId) return { error: fotoRes.error };

        const buffer = Buffer.from(base64, 'base64');
        const stream = Readable.from(buffer);
        const uploadRes = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [fotoRes.folderId],
            },
            media: { mimeType, body: stream },
            fields: 'id, webViewLink',
        });

        return { webViewLink: uploadRes.data.webViewLink || undefined };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

export async function uploadPortfolioPdf(
    profesionalNombre: string,
    mes: string,
    pdfBase64: string
): Promise<{ webViewLink?: string; error?: string }> {
    try {
        if (!mes || !/^\d{4}-\d{2}$/.test(mes)) {
            return { error: 'Formato de mes inválido (esperado YYYY-MM)' };
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return { error: 'No autenticado' };

        const drive = getDriveClient();
        const adminFolder = process.env.GOOGLE_DRIVE_FOLDER_ADMIN || '';
        if (!adminFolder) return { error: 'GOOGLE_DRIVE_FOLDER_ADMIN no configurado' };

        const portfoliosRes = await createDriveFolder(drive, adminFolder, 'Portfolios');
        if (portfoliosRes.error || !portfoliosRes.folderId) return { error: portfoliosRes.error };

        const profRes = await createDriveFolder(drive, portfoliosRes.folderId, profesionalNombre);
        if (profRes.error || !profRes.folderId) return { error: profRes.error };

        const [year, month] = mes.split('-');
        const mesNombre = new Date(Number(year), Number(month) - 1, 1)
            .toLocaleString('es-AR', { month: 'long', year: 'numeric' });
        const mesRes = await createDriveFolder(drive, profRes.folderId, mesNombre);
        if (mesRes.error || !mesRes.folderId) return { error: mesRes.error };

        const buffer = Buffer.from(pdfBase64, 'base64');
        const stream = Readable.from(buffer);
        const fileName = `Portfolio ${profesionalNombre} - ${mesNombre}.pdf`;

        const uploadRes = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [mesRes.folderId],
                mimeType: 'application/pdf',
            },
            media: { mimeType: 'application/pdf', body: stream },
            fields: 'id, webViewLink',
        });

        return { webViewLink: uploadRes.data.webViewLink || undefined };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
