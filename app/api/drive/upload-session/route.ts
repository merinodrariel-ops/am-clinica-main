import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { getDriveAccessToken, extractFolderIdFromUrl } from '@/lib/google-drive';
import { canUploadPatientDriveMimeType } from '@/lib/patient-drive-access';
import { createAdminClient } from '@/utils/supabase/admin';

type UploadSessionRequest = {
    fileName?: string;
    mimeType?: string;
    fileSize?: number;
    folderId?: string;
    patientId?: string;
};

export async function POST(request: Request) {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    const body = await request.json().catch(() => null) as UploadSessionRequest | null;
    const fileName = body?.fileName?.trim();
    const mimeType = body?.mimeType?.trim() || 'application/octet-stream';
    const folderId = body?.folderId?.trim();
    const patientId = body?.patientId?.trim();
    const fileSize = body?.fileSize;

    if (!profile || !fileName || !folderId || !patientId || !fileSize || fileSize <= 0) {
        return NextResponse.json({ error: 'Faltan datos para iniciar la subida' }, { status: 400 });
    }
    if (!canUploadPatientDriveMimeType(profile.categoria, mimeType)) {
        return NextResponse.json({
            error: profile.categoria === 'marketing'
                ? 'Marketing solo puede subir videos'
                : 'Tipo de archivo no permitido',
        }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    const { data: patient } = await adminSupabase
        .from('pacientes')
        .select('link_historia_clinica')
        .eq('id_paciente', patientId)
        .maybeSingle();
    const registeredFolderId = extractFolderIdFromUrl(patient?.link_historia_clinica || null);
    if (!registeredFolderId || registeredFolderId !== folderId) {
        return NextResponse.json({ error: 'La carpeta no corresponde al paciente' }, { status: 403 });
    }

    const accessToken = await getDriveAccessToken();
    const googleResponse = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': mimeType,
                'X-Upload-Content-Length': String(fileSize),
            },
            body: JSON.stringify({ name: fileName, parents: [folderId] }),
        },
    );
    const uploadUrl = googleResponse.headers.get('location');
    if (!googleResponse.ok || !uploadUrl) {
        return NextResponse.json({ error: 'No se pudo iniciar la subida a Google Drive' }, { status: 502 });
    }

    return NextResponse.json({ uploadUrl });
}
