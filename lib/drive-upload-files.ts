import { compressImage } from '@/lib/image-compression';

/** SEO-friendly upload name: `<prefix>_<YYYY-MM>_<NNN><ext>`. */
export function buildSeoFileName(prefix: string, index: number, ext: string): string {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const seq = String(index).padStart(3, '0');
    const cleanExt = ext.startsWith('.') ? ext : ext ? `.${ext}` : '';
    return `${prefix}_${ym}_${seq}${cleanExt}`;
}

export interface UploadToDriveOptions {
    folderId: string;
    patientId: string;
    fileNamePrefix?: string;
}

export interface UploadToDriveResult {
    successCount: number;
    errors: string[]; // "filename: message"
}

async function uploadVideoDirectlyToDrive(file: File, uploadName: string, opts: UploadToDriveOptions) {
    const sessionResponse = await fetch('/api/drive/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileName: uploadName,
            mimeType: file.type,
            fileSize: file.size,
            folderId: opts.folderId,
            patientId: opts.patientId,
        }),
    });
    const session = await sessionResponse.json().catch(() => ({})) as { uploadUrl?: string; error?: string };
    if (!sessionResponse.ok || !session.uploadUrl) {
        throw new Error(session.error || 'No se pudo iniciar la subida del video');
    }

    const uploadResponse = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
    });
    if (!uploadResponse.ok) {
        throw new Error('Google Drive no pudo completar la subida del video');
    }
}

/**
 * Shared uploader used by both the upload button and the full-screen drop overlay,
 * so dropping files anywhere on the patient folder uploads them (not only on the
 * small centered dropzone). Compresses large images, then POSTs to /api/drive/upload.
 */
export async function uploadFilesToDrive(
    files: FileList | File[],
    opts: UploadToDriveOptions,
): Promise<UploadToDriveResult> {
    const filesArray = Array.from(files);
    let successCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < filesArray.length; i++) {
        const file = filesArray[i];
        try {
            let fileToUpload: File | Blob = file;

            if (file.type.startsWith('image/') && file.size > 500 * 1024) {
                const compressed = await compressImage(file, {
                    maxWidth: 2000,
                    maxHeight: 2000,
                    quality: 0.8,
                    maxSizeKB: 500,
                });
                fileToUpload = compressed.blob;
            }

            const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
            const uploadName = opts.fileNamePrefix
                ? buildSeoFileName(opts.fileNamePrefix, i + 1, ext)
                : file.name;

            if (file.type.startsWith('video/')) {
                await uploadVideoDirectlyToDrive(file, uploadName, opts);
                successCount++;
                continue;
            }

            const formData = new FormData();
            formData.append('file', fileToUpload, uploadName);
            formData.append('folderId', opts.folderId);
            formData.append('patientId', opts.patientId);

            const res = await fetch('/api/drive/upload', { method: 'POST', body: formData });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Error al subir');
            }
            successCount++;
        } catch (error) {
            errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }

    return { successCount, errors };
}
