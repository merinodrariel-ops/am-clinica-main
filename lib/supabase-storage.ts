'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Bucket names for different areas
const BUCKETS = {
    'caja-admin': 'caja-admin',
    'caja-recepcion': 'caja-recepcion',
    'pacientes': 'pacientes',
} as const;

type AreaType = keyof typeof BUCKETS;

export interface UploadResult {
    success: boolean;
    path?: string;
    publicUrl?: string;
    error?: string;
}

/**
 * Initialize storage buckets (run once)
 */
export async function initStorageBuckets() {
    const results: { bucket: string; status: string }[] = [];

    for (const [, bucketName] of Object.entries(BUCKETS)) {
        const { error } = await supabase.storage.createBucket(bucketName, {
            public: false,
            fileSizeLimit: 10485760, // 10MB
        });

        if (error && !error.message.includes('already exists')) {
            results.push({ bucket: bucketName, status: `Error: ${error.message}` });
        } else {
            results.push({ bucket: bucketName, status: 'OK' });
        }
    }

    return results;
}

/**
 * Upload a file to Supabase Storage
 * @param area - The area bucket to upload to (caja-admin, caja-recepcion, pacientes)
 * @param fileName - Name of the file (can include path like '2026-02/ticket-001.pdf')
 * @param fileContent - Content as base64 string or Buffer
 * @param contentType - MIME type of the file
 */
export async function uploadToStorage(
    area: AreaType,
    fileName: string,
    fileContent: string | Buffer,
    contentType: string
): Promise<UploadResult> {
    try {
        const bucket = BUCKETS[area];

        // Convert base64 to buffer if needed
        const buffer = typeof fileContent === 'string'
            ? Buffer.from(fileContent, 'base64')
            : fileContent;

        // Generate unique filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 7); // YYYY-MM
        const path = `${timestamp}/${fileName}`;

        const { data, error } = await supabase.storage
            .from(bucket)
            .upload(path, buffer, {
                contentType,
                upsert: false,
            });

        if (error) {
            return { success: false, error: error.message };
        }

        // Get a signed URL valid for 1 hour
        const { data: signedData } = await supabase.storage
            .from(bucket)
            .createSignedUrl(data.path, 3600);

        return {
            success: true,
            path: data.path,
            publicUrl: signedData?.signedUrl,
        };
    } catch (error) {
        console.error('Error uploading to Storage:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * List files in a bucket/folder
 */
export async function listStorageFiles(
    area: AreaType,
    folder?: string
): Promise<{ files?: { name: string; size: number; createdAt: string }[]; error?: string }> {
    try {
        const bucket = BUCKETS[area];

        const { data, error } = await supabase.storage
            .from(bucket)
            .list(folder || '', {
                sortBy: { column: 'created_at', order: 'desc' },
            });

        if (error) {
            return { error: error.message };
        }

        return {
            files: data?.map(f => ({
                name: f.name,
                size: f.metadata?.size || 0,
                createdAt: f.created_at || '',
            })) || [],
        };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Get a signed URL for downloading a file
 */
export async function getFileUrl(
    area: AreaType,
    filePath: string,
    expiresIn: number = 3600
): Promise<{ url?: string; error?: string }> {
    try {
        const bucket = BUCKETS[area];

        const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUrl(filePath, expiresIn);

        if (error) {
            return { error: error.message };
        }

        return { url: data.signedUrl };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Delete a file from storage
 */
export async function deleteFromStorage(
    area: AreaType,
    filePath: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const bucket = BUCKETS[area];

        const { error } = await supabase.storage
            .from(bucket)
            .remove([filePath]);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}
