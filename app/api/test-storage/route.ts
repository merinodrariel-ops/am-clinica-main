import { NextResponse } from 'next/server';
import { initStorageBuckets, uploadToStorage, listStorageFiles } from '@/lib/supabase-storage';

export async function GET() {
    try {
        // First, ensure buckets exist
        const initResults = await initStorageBuckets();

        // Create a simple test file
        const testContent = Buffer.from(`Test file created at ${new Date().toISOString()}`);

        const result = await uploadToStorage(
            'caja-admin',
            `test-${Date.now()}.txt`,
            testContent,
            'text/plain'
        );

        if (result.success) {
            // List files to verify
            const files = await listStorageFiles('caja-admin');
            const personalFiles = await listStorageFiles('personal-documents');

            return NextResponse.json({
                success: true,
                message: 'Archivo de prueba subido exitosamente a Supabase Storage',
                uploadResult: result,
                bucketsInitialized: initResults,
                filesInCajaAdmin: files.files?.slice(0, 5) || [],
                filesInPersonalDocs: personalFiles.files?.slice(0, 5) || [],
            });
        } else {
            return NextResponse.json({
                success: false,
                error: result.error,
                bucketsInitialized: initResults,
            }, { status: 500 });
        }
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : String(error),
        }, { status: 500 });
    }
}
