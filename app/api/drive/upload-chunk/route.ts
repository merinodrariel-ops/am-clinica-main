import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { canUploadPatientDrive } from '@/lib/patient-drive-access';

export const runtime = 'nodejs';
export const maxDuration = 180;

const MAX_CHUNK_SIZE = 3 * 1024 * 1024;
const CONTENT_RANGE_PATTERN = /^bytes (\d+)-(\d+)\/(\d+)$/;

function isGoogleDriveResumableUrl(value: string): boolean {
    try {
        const url = new URL(value);
        return url.protocol === 'https:'
            && url.hostname === 'www.googleapis.com'
            && url.pathname === '/upload/drive/v3/files'
            && url.searchParams.get('uploadType') === 'resumable'
            && Boolean(url.searchParams.get('upload_id'));
    } catch {
        return false;
    }
}

export async function PUT(request: Request) {
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
    if (!profile || !canUploadPatientDrive(profile.categoria)) {
        return NextResponse.json({ error: 'No tenés permisos para subir archivos' }, { status: 403 });
    }

    const uploadUrl = request.headers.get('x-drive-upload-url') || '';
    const contentRange = request.headers.get('content-range') || '';
    const rangeMatch = contentRange.match(CONTENT_RANGE_PATTERN);
    if (!isGoogleDriveResumableUrl(uploadUrl) || !rangeMatch) {
        return NextResponse.json({ error: 'Sesión de carga inválida' }, { status: 400 });
    }

    const start = Number(rangeMatch[1]);
    const end = Number(rangeMatch[2]);
    const total = Number(rangeMatch[3]);
    const expectedLength = end - start + 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(total)
        || start < 0 || end < start || end >= total || expectedLength > MAX_CHUNK_SIZE) {
        return NextResponse.json({ error: 'Rango de carga inválido' }, { status: 400 });
    }

    const chunk = await request.arrayBuffer();
    if (chunk.byteLength !== expectedLength) {
        return NextResponse.json({ error: 'La parte recibida está incompleta' }, { status: 400 });
    }

    try {
        const googleResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': request.headers.get('content-type') || 'application/octet-stream',
                'Content-Length': String(chunk.byteLength),
                'Content-Range': contentRange,
            },
            body: chunk,
            redirect: 'manual',
        });

        if (googleResponse.status === 308) {
            return NextResponse.json({ complete: false });
        }

        const googleBody = await googleResponse.json().catch(() => null) as {
            id?: string;
            error?: { message?: string };
        } | null;
        if (!googleResponse.ok) {
            return NextResponse.json(
                { error: googleBody?.error?.message || `Google Drive rechazó la carga (código ${googleResponse.status})` },
                { status: 502 },
            );
        }
        if (!googleBody?.id) {
            return NextResponse.json(
                { error: 'Google Drive no confirmó el archivo cargado' },
                { status: 502 },
            );
        }

        return NextResponse.json({ complete: true, fileId: googleBody.id });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'No se pudo conectar con Google Drive' },
            { status: 502 },
        );
    }
}
