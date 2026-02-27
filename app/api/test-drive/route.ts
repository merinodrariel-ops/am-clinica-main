import { NextResponse } from 'next/server';
import { getDriveClient } from '@/lib/google-drive';
import { Readable } from 'stream';

export async function GET() {
    try {
        const folderId = process.env.GOOGLE_DRIVE_FOLDER_ADMIN;

        if (!folderId) {
            return NextResponse.json({
                success: false,
                error: 'Folder ID not configured',
            }, { status: 500 });
        }

        const drive = getDriveClient();

        // Create simple test content
        const testContent = Buffer.from(`Test file created at ${new Date().toISOString()}\nFolder ID: ${folderId}`);
        const stream = Readable.from(testContent);

        // Upload directly to the shared folder
        const response = await drive.files.create({
            requestBody: {
                name: `test-${Date.now()}.txt`,
                parents: [folderId],
            },
            media: {
                mimeType: 'text/plain',
                body: stream,
            },
            fields: 'id, webViewLink, name',
        });

        return NextResponse.json({
            success: true,
            message: 'Archivo de prueba subido exitosamente a Google Drive',
            file: {
                id: response.data.id,
                name: response.data.name,
                link: response.data.webViewLink,
            },
            folderId: folderId,
        });

    } catch (error) {
        console.error('Drive test error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
