import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getDriveFileContent } from '@/lib/google-drive';

const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
    request: Request,
    { params }: { params: Promise<{ patientId: string }> }
) {
    const { patientId } = await params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
        return new NextResponse('Token requerido', { status: 401 });
    }

    // Validar token
    const { data: tokenData } = await admin
        .from('patient_portal_tokens')
        .select('patient_id, expires_at, is_active')
        .eq('token', token)
        .eq('patient_id', patientId)
        .single();

    if (!tokenData || !tokenData.is_active || new Date(tokenData.expires_at) < new Date()) {
        return new NextResponse('Token inválido o expirado', { status: 401 });
    }

    // Obtener el file_id del HTML
    const { data: review } = await admin
        .from('patient_design_reviews')
        .select('drive_html_file_id')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (!review?.drive_html_file_id) {
        return new NextResponse('Diseño no disponible aún', { status: 404 });
    }

    // Proxy del HTML desde Drive
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
