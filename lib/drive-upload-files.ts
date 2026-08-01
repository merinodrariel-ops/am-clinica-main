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

const DIRECT_DRIVE_EXTENSIONS = new Set(['ply', 'stl', 'obj', 'dentalproject']);

function getFileExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');
    return dotIndex >= 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
}

export function shouldUploadDirectlyToDrive(file: File): boolean {
    return file.type.startsWith('video/')
        || DIRECT_DRIVE_EXTENSIONS.has(getFileExtension(file.name));
}

export function getUploadName(file: File, fileNamePrefix: string | undefined, index: number): string {
    if (!fileNamePrefix || !file.type.startsWith('image/')) return file.name;
    const ext = file.name.includes('.') ? file.name.substring(file.name.lastIndexOf('.')) : '';
    return buildSeoFileName(fileNamePrefix, index, ext);
}

async function uploadDirectlyToDrive(file: File, uploadName: string, opts: UploadToDriveOptions) {
    const mimeType = file.type || 'application/octet-stream';
    const sessionResponse = await fetch('/api/drive/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileName: uploadName,
            mimeType,
            fileSize: file.size,
            folderId: opts.folderId,
            patientId: opts.patientId,
        }),
    });
    const session = await sessionResponse.json().catch(() => ({})) as { uploadUrl?: string; error?: string };
    if (!sessionResponse.ok || !session.uploadUrl) {
        throw new Error(session.error || 'No se pudo iniciar la subida directa a Google Drive');
    }

    const uploadResponse = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
    });
    if (!uploadResponse.ok) {
        const googleError = await uploadResponse.json().catch(() => null) as { error?: { message?: string } } | null;
        throw new Error(googleError?.error?.message || `Google Drive no pudo completar la subida (código ${uploadResponse.status})`);
    }

    const uploadedFile = await uploadResponse.json().catch(() => null) as { id?: string } | null;
    if (!uploadedFile?.id) {
        throw new Error('Google Drive recibió el archivo pero no confirmó su identificador');
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

            const uploadName = getUploadName(file, opts.fileNamePrefix, i + 1);

            if (shouldUploadDirectlyToDrive(file)) {
                await uploadDirectlyToDrive(file, uploadName, opts);
                successCount++;
                continue;
            }

            const formData = new FormData();
            formData.append('file', fileToUpload, uploadName);
            formData.append('folderId', opts.folderId);
            formData.append('patientId', opts.patientId);

            const res = await fetch('/api/drive/upload', { method: 'POST', body: formData });
            const responseBody = await res.json().catch(() => ({})) as { fileId?: string; error?: string };
            if (!res.ok) {
                throw new Error(responseBody.error || `El servidor rechazó la carga (código ${res.status})`);
            }
            if (!responseBody.fileId) {
                throw new Error('Google Drive recibió el archivo pero no confirmó su identificador');
            }
            successCount++;
        } catch (error) {
            errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }

    return { successCount, errors };
}
