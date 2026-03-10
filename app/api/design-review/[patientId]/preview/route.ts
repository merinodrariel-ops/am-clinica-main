import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getDriveFileContent } from '@/lib/google-drive';

// Staff-side preview: authenticated via session (no patient token required)
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ patientId: string }> }
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return new NextResponse('No autenticado', { status: 401 });
    }

    const { patientId } = await params;
    const admin = createAdminClient();

    const { data: review } = await admin
        .from('patient_design_reviews')
        .select('drive_html_file_id, storage_html_url')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!review) {
        return new NextResponse('Diseño no disponible', { status: 404 });
    }

    // Try Storage first
    if (review.storage_html_url) {
        const { data: fileData, error: storageError } = await admin.storage
            .from('design-files')
            .download(review.storage_html_url);

        if (!storageError && fileData) {
            const content = await fileData.text();
            return new NextResponse(content, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'private, no-store',
                },
            });
        }
        console.warn('[design-review/preview] Storage error:', storageError?.message);
    }

    // Fallback: Drive
    if (review.drive_html_file_id) {
        const { content, error } = await getDriveFileContent(review.drive_html_file_id);
        if (!error && content) {
            return new NextResponse(content, {
                headers: {
                    'Content-Type': 'text/html; charset=utf-8',
                    'Cache-Control': 'private, no-store',
                },
            });
        }
    }

    return new NextResponse('Archivo no encontrado', { status: 404 });
}
