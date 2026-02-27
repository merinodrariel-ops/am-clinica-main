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

        // Get file metadata to check name/mimeType
        const fileMetadata = await drive.files.get({
            fileId,
            fields: 'name, mimeType',
        });

        // Optional: Add security check here (e.g. check session or token).
        // In production, you might want to verify the patient's identity.

        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        // Create a ReadableStream from the Axios/Gaxios stream
        const stream = new ReadableStream({
            start(controller) {
                response.data.on('data', (chunk: Buffer) => controller.enqueue(chunk));
                response.data.on('end', () => controller.close());
                response.data.on('error', (err: Error) => controller.error(err));
            },
        });

        const headers = new Headers();
        headers.set('Content-Type', fileMetadata.data.mimeType || 'application/octet-stream');
        headers.set('Content-Disposition', `inline; filename="${fileMetadata.data.name}"`);
        // Add cache headers if desired
        headers.set('Cache-Control', 'private, max-age=3600');

        return new Response(stream, { headers });
    } catch (error) {
        console.error('Error fetching file from Drive:', error);
        return NextResponse.json({ error: 'Failed to fetch file from Drive' }, { status: 500 });
    }
}
