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

/** Activa el flujo de diseño digital: crea carpeta EXOCAD/HTML en Drive y registra en DB */
export async function activateDesignFlow(
    patientId: string,
    motherFolderUrl: string
): Promise<{ success: boolean; reviewId?: string; htmlFolderId?: string; error?: string }> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const motherFolderId = extractFolderIdFromUrl(motherFolderUrl);
    if (!motherFolderId) return { success: false, error: 'El paciente no tiene carpeta de Drive configurada' };

    const folderResult = await ensureExocadHtmlFolder(motherFolderId);
    if (folderResult.error || !folderResult.htmlFolderId) {
        return { success: false, error: folderResult.error };
    }

    const admin = createAdminClient();
    const { data, error } = await admin
        .from('patient_design_reviews')
        .upsert(
            {
                patient_id: patientId,
                exocad_folder_id: folderResult.htmlFolderId,
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
        htmlFolderId: folderResult.htmlFolderId,
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

/** Obtiene el design review activo de un paciente */
export async function getPatientDesignReview(
    patientId: string
): Promise<{
    review: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
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
        .select('id, status, label, drive_html_file_id, exocad_folder_id, patient_comment, viewed_at, responded_at, created_at')
        .eq('patient_id', patientId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return { review: null, error: error.message };
    return { review: data };
}
