import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/google-drive';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const { fileId } = await params;

    if (!fileId) {
        return NextResponse.json({ error: 'File ID required' }, { status: 400 });
    }

    try {
        const drive = getDriveClient();

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        const contentType = (response.headers as Record<string, string>)['content-type'] || 'image/jpeg';

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
        headers.set('Cache-Control', 'public, max-age=600, s-maxage=604800, stale-while-revalidate=86400');
        // Allow canvas drawImage() without tainting (needed for PhotoStudio export)
        headers.set('Access-Control-Allow-Origin', '*');

        return new Response(stream, { headers });
    } catch (error) {
        console.error('Error fetching file from Drive:', error);
        return NextResponse.json({ error: 'Failed to fetch file from Drive' }, { status: 500 });
    }
}
