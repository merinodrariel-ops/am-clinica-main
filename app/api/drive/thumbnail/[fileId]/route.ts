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

        // Prefer Drive's own thumbnailLink (fast, CDN-backed) but fall back to streaming
        // the file when thumbnailLink is missing (non-image, freshly-uploaded files).
        const meta = await drive.files.get({
            fileId,
            fields: 'thumbnailLink, mimeType',
        });

        const thumbUrl = meta.data.thumbnailLink;
        if (thumbUrl) {
            // Drive thumbnails default to s220 — bump to s800 for crisp grid cards.
            const bigger = thumbUrl.replace(/=s\d+(-[a-z])?$/i, '=s800').replace(/=s\d+$/, '=s800');
            return NextResponse.redirect(bigger, {
                status: 302,
                headers: {
                    'Cache-Control': 'public, max-age=3600, s-maxage=3600',
                },
            });
        }

        // Fallback: stream the file itself (small thumbs only).
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
                'Content-Type': meta.data.mimeType || 'image/jpeg',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error) {
        console.error('[drive/thumbnail] error:', error);
        return NextResponse.json({ error: 'Thumbnail unavailable' }, { status: 404 });
    }
}
