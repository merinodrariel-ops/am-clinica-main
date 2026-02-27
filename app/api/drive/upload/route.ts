import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDriveClient } from '@/lib/google-drive';
import { Readable } from 'stream';

const UPLOAD_ALLOWED_ROLES = ['owner', 'admin', 'asistente', 'laboratorio'];

function getDriveUploadErrorMessage(error: unknown): string {
    const fallback = error instanceof Error ? error.message : 'Error subiendo archivo';

    if (!error || typeof error !== 'object') {
        return fallback;
    }

    const maybeResponse = (error as { response?: { data?: { error?: { message?: string; errors?: Array<{ reason?: string }> } } } }).response;
    const apiError = maybeResponse?.data?.error;
    const reason = apiError?.errors?.[0]?.reason;

    if (reason === 'storageQuotaExceeded') {
        return 'No se pudo subir el archivo porque la autenticacion actual usa Service Account sin cuota de almacenamiento. Configura OAuth de usuario (GOOGLE_DRIVE_OAUTH_CLIENT_ID, GOOGLE_DRIVE_OAUTH_CLIENT_SECRET y GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN).';
    }

    return apiError?.message || fallback;
}

export async function POST(request: Request) {
    try {
        // 1. Verify session + role
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();

        if (authError || !user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (!profile || !UPLOAD_ALLOWED_ROLES.includes(profile.role)) {
            return NextResponse.json({ error: 'No tenés permisos para subir archivos' }, { status: 403 });
        }

        // 2. Parse FormData
        const formData = await request.formData();
        const file = formData.get('file') as File | null;
        const folderId = formData.get('folderId') as string | null;

        if (!file || !folderId) {
            return NextResponse.json({ error: 'Faltan campos: file y folderId' }, { status: 400 });
        }

        // 3. Upload to Drive
        const drive = getDriveClient();
        const buffer = Buffer.from(await file.arrayBuffer());
        const stream = Readable.from(buffer);

        const response = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: file.name,
                parents: [folderId],
            },
            media: {
                mimeType: file.type || 'application/octet-stream',
                body: stream,
            },
            fields: 'id, webViewLink, name, thumbnailLink',
        });

        return NextResponse.json({
            fileId: response.data.id,
            webViewLink: response.data.webViewLink,
            name: response.data.name,
            thumbnailLink: response.data.thumbnailLink || null,
        });
    } catch (error) {
        console.error('Drive upload error:', error);
        return NextResponse.json(
            { error: getDriveUploadErrorMessage(error) },
            { status: 500 }
        );
    }
}
