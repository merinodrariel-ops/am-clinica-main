import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/google-drive';

const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ fileId: string }> }
) {
    const { fileId } = await params;

    if (!fileId || !DRIVE_ID_RE.test(fileId)) {
        return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 });
    }

    try {
        const drive = getDriveClient();

        // Always stream through our authenticated server — Drive thumbnailLink CDN URLs
        // require the browser to be logged into the same Google account, which clinic
        // users are not. Redirecting to lh3.googleusercontent.com returns a dark
        // placeholder instead of the real image for unauthenticated browsers.
        const meta = await drive.files.get({
            fileId,
            fields: 'thumbnailLink, mimeType, size',
        });

        const mimeType = meta.data.mimeType || 'image/jpeg';
        const thumbUrl = meta.data.thumbnailLink;

        // Prefer thumbnailLink (small CDN image, ~100KB) proxied server-side.
        // Direct browser redirect to lh3.googleusercontent.com returns a dark
        // placeholder for unauthenticated browsers; server-side fetch bypasses that.
        if (thumbUrl) {
            const bigger = thumbUrl.replace(/=s\d+(-[a-z])?$/i, '=s800').replace(/=s\d+$/, '=s800');
            const thumbRes = await fetch(bigger);
            if (thumbRes.ok) {
                return new Response(thumbRes.body, {
                    headers: {
                        'Content-Type': thumbRes.headers.get('Content-Type') || 'image/jpeg',
                        'Cache-Control': 'public, max-age=3600',
                    },
                });
            }
        }

        // thumbnailLink missing (freshly uploaded file): stream the file itself.
        // Only reached for images — other types without a thumbnail are not previewable.
        if (mimeType.startsWith('image/')) {
            const response = await drive.files.get(
                { fileId, alt: 'media' },
                { responseType: 'stream' }
            );

            const stream = new ReadableStream({
                start(controller) {
                    response.data.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                    response.data.on('end', () => controller.close());
                    response.data.on('error', (err: Error) => controller.error(err));
                },
            });

            return new Response(stream, {
                headers: {
                    'Content-Type': mimeType,
                    'Cache-Control': 'public, max-age=60',
                },
            });
        }

        return NextResponse.json({ error: 'Thumbnail unavailable' }, { status: 404 });
    } catch (error) {
        console.error('[drive/thumbnail] error:', error);
        return NextResponse.json({ error: 'Thumbnail unavailable' }, { status: 404 });
    }
}
