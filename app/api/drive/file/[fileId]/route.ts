import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/google-drive';
import { createClient } from '@/utils/supabase/server';
import { canViewPatientRecords } from '@/lib/patient-access';
import { isMarketingMediaMimeType } from '@/lib/patient-drive-access';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const { fileId } = await params;
    const searchParams = new URL(request.url).searchParams;
    const forceFresh = searchParams.has('t') || searchParams.get('fresh') === '1';

    if (!fileId) {
        return NextResponse.json({ error: 'File ID required' }, { status: 400 });
    }

    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .maybeSingle();
        const role = profile?.categoria || user.user_metadata?.categoria || '';
        if (!canViewPatientRecords(role)) {
            return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
        }

        const drive = getDriveClient();
        const metadata = await drive.files.get({
            fileId,
            fields: 'mimeType',
        });
        const mimeType = metadata.data.mimeType || 'application/octet-stream';

        if (role === 'marketing' && !isMarketingMediaMimeType(mimeType)) {
            return NextResponse.json({ error: 'Marketing solo puede descargar fotos y videos' }, { status: 403 });
        }

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        const contentType = (response.headers as Record<string, string>)['content-type'] || mimeType;

        const stream = new ReadableStream({
            start(controller) {
                response.data.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                response.data.on('end', () => controller.close());
                response.data.on('error', (err: Error) => controller.error(err));
            },
        });

        const headers = new Headers();
        headers.set('Content-Type', contentType);
        // Serve through Vercel's shared edge/CDN cache, not just the browser: after the
        // first hit per region the file is served without touching the Drive API again.
        // Display URLs are versioned with `?v=modifiedTime`, so an in-place "replace
        // original" (same fileId, new bytes) yields a fresh URL and never serves stale.
        headers.set('Cache-Control', forceFresh
            ? 'no-store, max-age=0'
            : 'public, max-age=600, s-maxage=604800, stale-while-revalidate=86400');
        // Allow canvas drawImage() without tainting (needed for PhotoStudio export)
        headers.set('Access-Control-Allow-Origin', '*');
        if (mimeType === 'text/html') {
            // Exocad exports are interactive documents supplied from Drive.
            // They may run their viewer scripts in a new tab, but the CSP
            // sandbox prevents them from inheriting the authenticated clinic
            // origin or navigating the opener.
            headers.set('Content-Type', 'text/html; charset=utf-8');
            headers.set(
                'Content-Security-Policy',
                "sandbox allow-scripts allow-downloads allow-pointer-lock; default-src 'self' data: blob: https:; script-src 'unsafe-inline' 'unsafe-eval' data: blob: https:; style-src 'unsafe-inline' data: blob: https:; img-src data: blob: https:; connect-src data: blob: https:"
            );
            headers.set('Content-Disposition', 'inline');
        }

        return new Response(stream, { headers });
    } catch (error) {
        console.error('Error fetching file from Drive:', error);
        return NextResponse.json({ error: 'Failed to fetch file from Drive' }, { status: 500 });
    }
}
