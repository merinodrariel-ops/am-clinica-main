'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
    ensureExocadHtmlFolder,
    getLatestHtmlFileInFolder,
    extractFolderIdFromUrl,
} from '@/lib/google-drive';
import crypto from 'crypto';

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '';

/** Activa el flujo de diseño digital: crea registro en DB y opcionalmente carpeta EXOCAD/HTML en Drive */
export async function activateDesignFlow(
    patientId: string,
    motherFolderUrl: string | null
): Promise<{ success: boolean; reviewId?: string; htmlFolderId?: string; driveWarning?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    // Drive folder creation is optional — if it fails we still activate the flow
    let htmlFolderId: string | undefined;
    let driveWarning: string | undefined;

    const motherFolderId = extractFolderIdFromUrl(motherFolderUrl);
    if (motherFolderId) {
        try {
            const folderResult = await ensureExocadHtmlFolder(motherFolderId);
            if (folderResult.htmlFolderId) {
                htmlFolderId = folderResult.htmlFolderId;
            } else {
                driveWarning = folderResult.error || 'No se pudo crear la carpeta en Drive (podés subir el archivo directamente)';
            }
        } catch {
            driveWarning = 'Error al conectar con Drive — podés subir el archivo directamente desde este panel';
        }
    }

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('patient_design_reviews')
        .upsert(
            {
                patient_id: patientId,
                exocad_folder_id: htmlFolderId ?? null,
                label: 'Diseño de Sonrisa',
                status: 'pending',
                uploaded_by: user.id,
            },
            { onConflict: 'patient_id' }
        )
        .select('id')
        .single();

    if (error) return { success: false, error: error.message };

    return {
        success: true,
        reviewId: data.id,
        htmlFolderId,
        driveWarning,
    };
}

/** Sincroniza el archivo HTML más reciente de la carpeta Drive con el registro en DB */
export async function syncDesignHtmlFile(
    reviewId: string
): Promise<{ success: boolean; fileId?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = createAdminClient();
    const { data: review, error: rErr } = await admin
        .from('patient_design_reviews')
        .select('exocad_folder_id')
        .eq('id', reviewId)
        .single();

    if (rErr || !review?.exocad_folder_id) return { success: false, error: 'Revisión no encontrada' };

    const fileResult = await getLatestHtmlFileInFolder(review.exocad_folder_id);
    if (fileResult.error) return { success: false, error: fileResult.error };
    if (!fileResult.fileId) return { success: false, error: 'No hay archivo HTML en la carpeta EXOCAD/HTML. Pedile al diseñador que lo suba.' };

    const { error: uErr } = await admin
        .from('patient_design_reviews')
        .update({ drive_html_file_id: fileResult.fileId, status: 'pending' })
        .eq('id', reviewId);

    if (uErr) return { success: false, error: uErr.message };
    return { success: true, fileId: fileResult.fileId };
}

/** Genera token de portal apuntando a un design review específico */
export async function generateDesignReviewToken(
    patientId: string,
    reviewId: string
): Promise<{ success: boolean; url?: string; whatsappUrl?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = createAdminClient();
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    const { error } = await admin
        .from('patient_portal_tokens')
        .upsert(
            {
                patient_id: patientId,
                token,
                expires_at: expiresAt.toISOString(),
                used: false,
                review_id: reviewId,
            },
            { onConflict: 'patient_id' }
        );

    if (error) return { success: false, error: error.message };

    const { data: patient } = await admin
        .from('pacientes')
        .select('nombre, apellido')
        .eq('id_paciente', patientId)
        .single();

    const nombre = patient?.nombre || 'tu paciente';
    const portalUrl = `${APP_URL}/mi-clinica/${token}`;
    const waMessage = encodeURIComponent(
        `Hola ${nombre}! 🦷✨\n\nTu diseño de sonrisa ya está listo para que lo veas.\n\nEntrá desde este link y contanos qué te parece:\n${portalUrl}`
    );
    const whatsappUrl = `https://wa.me/?text=${waMessage}`;

    return { success: true, url: portalUrl, whatsappUrl };
}

/** Genera una URL firmada para que el cliente suba el HTML directamente a Supabase Storage */
export async function getDesignUploadUrl(
    reviewId: string,
    patientId: string
): Promise<{ success: boolean; signedUrl?: string; storagePath?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const storagePath = `${patientId}/${reviewId}.html`;
    const admin = createAdminClient();

    const { data, error } = await admin.storage
        .from('design-files')
        .createSignedUploadUrl(storagePath, { upsert: true });

    if (error || !data?.signedUrl) {
        return { success: false, error: error?.message || 'No se pudo generar la URL de subida' };
    }

    return { success: true, signedUrl: data.signedUrl, storagePath };
}

/** Guarda el storage path en el DB luego de una subida exitosa */
export async function saveDesignFileUrl(
    reviewId: string,
    storagePath: string
): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const admin = createAdminClient();

    // Store the storage PATH directly (not a public URL) so the HTML proxy
    // route can download it via admin client regardless of bucket visibility.
    const { error } = await admin
        .from('patient_design_reviews')
        .update({
            storage_html_url: storagePath,
            status: 'pending',
        })
        .eq('id', reviewId);

    if (error) return { success: false, error: error.message };
    return { success: true };
}

/** Obtiene el design review activo de un paciente */
export async function getPatientDesignReview(
    patientId: string
): Promise<{
    review: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
        storage_html_url: string | null;
        exocad_folder_id: string | null;
        patient_comment: string | null;
        viewed_at: string | null;
        responded_at: string | null;
        created_at: string;
    } | null;
    error?: string;
}> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('patient_design_reviews')
        .select('id, status, label, drive_html_file_id, storage_html_url, exocad_folder_id, patient_comment, viewed_at, responded_at, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return { review: null, error: error.message };
    return { review: data };
}
