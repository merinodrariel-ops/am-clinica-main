'use server';

import { createClient } from '@supabase/supabase-js';

const getSupabase = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase environment variables are missing');
    }

    return createClient(supabaseUrl, supabaseServiceKey);
};

// Bucket config for different areas
const BUCKETS = {
    'caja-admin': { name: 'caja-admin', isPublic: false },
    'caja-recepcion': { name: 'caja-recepcion', isPublic: false },
    'pacientes': { name: 'pacientes', isPublic: false },
    'inventory-products': { name: 'inventory-products', isPublic: true },
    'personal-documents': { name: 'personal-documents', isPublic: true },
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
        const { error } = await getSupabase().storage.createBucket(bucketName.name, {
            public: bucketName.isPublic,
            fileSizeLimit: 10485760, // 10MB
        });

        if (error && !error.message.includes('already exists')) {
            results.push({ bucket: bucketName.name, status: `Error: ${error.message}` });
        } else {
            results.push({ bucket: bucketName.name, status: 'OK' });
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
        const bucketConfig = BUCKETS[area];
        const bucket = bucketConfig.name;

        // Convert base64 to buffer if needed
        const buffer = typeof fileContent === 'string'
            ? Buffer.from(fileContent, 'base64')
            : fileContent;

        // Generate unique filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 7); // YYYY-MM
        const path = `${timestamp}/${fileName}`;

        const { data, error } = await getSupabase().storage
            .from(bucket)
            .upload(path, buffer, {
                contentType,
                upsert: false,
            });

        if (error) {
            return { success: false, error: error.message };
        }

        let publicOrSignedUrl: string | undefined;

        if (bucketConfig.isPublic) {
            const { data: publicData } = getSupabase().storage
                .from(bucket)
                .getPublicUrl(data.path);
            publicOrSignedUrl = publicData.publicUrl;
        } else {
            // Get a signed URL valid for 7 days (604800 s)
            const { data: signedData } = await getSupabase().storage
                .from(bucket)
                .createSignedUrl(data.path, 60 * 60 * 24 * 7);
            publicOrSignedUrl = signedData?.signedUrl;
        }

        return {
            success: true,
            path: data.path,
            publicUrl: publicOrSignedUrl,
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
        const bucket = BUCKETS[area].name;

        const { data, error } = await getSupabase().storage
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
        const bucket = BUCKETS[area].name;

        const { data, error } = await getSupabase().storage
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
        const bucket = BUCKETS[area].name;

        const { error } = await getSupabase().storage
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

/**
 * Regenera una URL firmada fresca a partir de una URL expirada o un path.
 * Soporta tanto URLs viejas ya almacenadas en DB (con token JWT expirado)
 * como paths crudos (p.ej. "2026-02/mov-xxx.jpg").
 *
 * Formato signed URL de Supabase:
 *   https://{ref}.supabase.co/storage/v1/object/sign/{bucket}/{path}?token=...
 */
export async function refreshSignedUrl(
    storedValue: string,
    area: AreaType,
    expiresIn = 60 * 60 * 24 * 7 // 7 días por defecto
): Promise<string | null> {
    try {
        if (storedValue.startsWith('storage:')) {
            const parts = storedValue.split(':');
            if (parts.length < 3) return null;
            const bucket = parts[1];
            const filePath = parts.slice(2).join(':');

            const { data, error } = await getSupabase().storage
                .from(bucket)
                .createSignedUrl(filePath, expiresIn);

            if (error) return null;
            return data?.signedUrl ?? null;
        }

        let filePath: string;

        if (storedValue.startsWith('https://')) {
            // URL firmada ya expirada — extraer el path del bucket
            const url = new URL(storedValue);
            const match = url.pathname.match(/\/object\/sign\/[^/]+\/(.+)/);
            if (!match) return null;
            filePath = match[1];
        } else {
            // Ya es un path directo
            filePath = storedValue;
        }

        const { data, error } = await getSupabase().storage
            .from(BUCKETS[area].name)
            .createSignedUrl(filePath, expiresIn);

        if (error) return null;
        return data?.signedUrl ?? null;
    } catch {
        return null;
    }
}
