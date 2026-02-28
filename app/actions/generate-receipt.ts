'use server';

import { uploadToStorage } from '@/lib/supabase-storage';
import { createClient } from '@supabase/supabase-js';

const getSupabase = () =>
    createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

/**
 * Save a receipt image to Supabase Storage and update the movement record
 * with the storage path (not a signed URL — we regenerate those on demand).
 */
export async function saveReceiptAndLinkToMovement(
    movementId: string,
    receiptNumber: string,
    base64ImageData: string // base64 without data URL prefix
): Promise<{ success: boolean; path?: string; error?: string }> {
    try {
        // 1. Upload to Supabase Storage
        const fileName = `recibo-${receiptNumber}-${Date.now()}.jpg`;
        const result = await uploadToStorage(
            'caja-recepcion',
            fileName,
            base64ImageData,
            'image/jpeg'
        );

        if (!result.success || !result.path) {
            return { success: false, error: result.error || 'Upload failed' };
        }

        // 2. Update the movement record with the storage path
        // We store the path (not signed URL) so we can regenerate signed URLs on demand
        const { error: updateError } = await getSupabase()
            .from('caja_recepcion_movimientos')
            .update({ comprobante_url: `storage:caja-recepcion:${result.path}` })
            .eq('id', movementId);

        if (updateError) {
            console.error('Error updating movement with receipt path:', updateError);
            // Receipt was uploaded successfully, just couldn't link it
            return { success: true, path: result.path, error: 'Receipt saved but could not link to movement' };
        }

        return { success: true, path: result.path };
    } catch (error) {
        console.error('Error in saveReceiptAndLinkToMovement:', error);
        return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Get a fresh signed URL for a receipt stored in Supabase Storage.
 * Handles both the new storage: format and legacy signed URLs.
 */
export async function getReceiptSignedUrl(
    comprobanteUrl: string,
    expiresIn = 60 * 60 * 2 // 2 hours default
): Promise<string | null> {
    try {
        // New format: "storage:caja-recepcion:2026-02/recibo-xxx.jpg"
        if (comprobanteUrl.startsWith('storage:')) {
            const parts = comprobanteUrl.split(':');
            if (parts.length < 3) return null;
            const bucket = parts[1];
            const path = parts.slice(2).join(':');

            const { data, error } = await getSupabase().storage
                .from(bucket)
                .createSignedUrl(path, expiresIn);

            if (error) return null;
            return data?.signedUrl ?? null;
        }

        // Legacy: already a signed URL or direct URL — try to refresh
        if (comprobanteUrl.startsWith('https://')) {
            // Try to extract path from existing signed URL
            try {
                const url = new URL(comprobanteUrl);
                const match = url.pathname.match(/\/object\/sign\/([^/]+)\/(.+)/);
                if (match) {
                    const bucket = match[1];
                    const path = match[2];
                    const { data, error } = await getSupabase().storage
                        .from(bucket)
                        .createSignedUrl(path, expiresIn);
                    if (!error && data?.signedUrl) return data.signedUrl;
                }
            } catch {
                // Ignore URL parse errors
            }
            // If refresh fails, return the original (might still work)
            return comprobanteUrl;
        }

        return null;
    } catch {
        return null;
    }
}
