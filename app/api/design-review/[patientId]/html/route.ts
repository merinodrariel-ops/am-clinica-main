import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getDriveFileContent } from '@/lib/google-drive';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ patientId: string }> }
) {
    const admin = createAdminClient();
    const { patientId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return new NextResponse('Token requerido', { status: 401 });
    }

    // Validar token
    const { data: tokenData } = await admin
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, used')
        .eq('token', token)
        .eq('patient_id', patientId)
        .single();

    if (!tokenData || new Date(tokenData.expires_at) < new Date()) {
        return new NextResponse('Token inválido o expirado', { status: 401 });
    }

    // Obtener el review más reciente
    const { data: review } = await admin
        .from('patient_design_reviews')
        .select('drive_html_file_id, storage_html_url')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!review) {
        return new NextResponse('Diseño no disponible aún', { status: 404 });
    }

    // Serve from Supabase Storage first (storage_html_url is a plain storage path)
    if (review.storage_html_url) {
        const { data: fileData, error: storageError } = await admin.storage
            .from('design-files')
            .download(review.storage_html_url);

        if (!storageError && fileData) {
            const content = await fileData.text();
            return new NextResponse(content, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'X-Frame-Options': 'SAMEORIGIN',
                    'Cache-Control': 'private, no-cache',
                },
            });
        }
        console.warn('[design-review/html] Storage fetch failed, trying Drive fallback:', storageError?.message);
    }

    // Fallback: serve from Google Drive
    if (!review.drive_html_file_id) {
        return new NextResponse('Diseño no disponible aún', { status: 404 });
    }

    const { content, error } = await getDriveFileContent(review.drive_html_file_id);

    if (error || !content) {
        console.error('[design-review/html] Error fetching from Drive:', error);
        return new NextResponse('Error al cargar el diseño', { status: 502 });
    }

    return new NextResponse(content, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Frame-Options': 'SAMEORIGIN',
            'Cache-Control': 'private, no-cache',
        },
    });
}
