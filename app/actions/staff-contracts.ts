'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import type { ContractRecord, AnexoRol } from '@/lib/staff-contracts/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function deriveAnexoRol(categoria: string, area?: string | null): AnexoRol {
    const cat = (categoria || '').toLowerCase().trim();
    const ar = (area || '').toLowerCase().trim();

    if (cat === 'odontologo' || cat === 'dentist') return 'odontologo';
    if (cat === 'laboratorio' || cat === 'lab') return 'laboratorio';
    if (cat === 'asistente' || cat === 'assistant') return 'asistente';
    if (cat === 'admin' || cat === 'reception' || cat === 'administradora' || cat === 'administrador') return 'admin';
    if (ar.includes('fideliz') || ar.includes('recaptacion') || cat === 'recaptacion') return 'fidelizacion';
    if (ar.includes('marketing') || cat === 'marketing') return 'marketing';
    return 'admin';
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Get all contracts for a staff member, ordered newest first.
 */
export async function getPersonalContratos(personalId: string): Promise<ContractRecord[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('personal_contratos')
        .select('*')
        .eq('personal_id', personalId)
        .order('generado_at', { ascending: false });

    if (error) {
        console.error('[getPersonalContratos]', error.message);
        return [];
    }

    return (data || []) as ContractRecord[];
}

/**
 * Determine the AnexoRol for a personal record based on their categoria/area.
 */
export async function getAnexoRolForPersonal(personalId: string): Promise<AnexoRol> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('personal')
        .select('categoria, area')
        .eq('id', personalId)
        .single();

    if (error || !data) return 'admin';
    return deriveAnexoRol(data.categoria || '', data.area);
}

/**
 * Record a generated staff contract in the DB.
 * The PDF is generated client-side (jsPDF is a browser lib),
 * so this action receives the pdfBase64 and stores metadata.
 * Drive upload is skipped (no staff Drive folder integration).
 */
export async function recordStaffContractAction(
    personalId: string,
    pdfBase64: string
): Promise<{ success: boolean; contrato?: ContractRecord; error?: string }> {
    try {
        // 1. Verify caller is authenticated and has admin rights
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { success: false, error: 'No autenticado' };
        }

        const admin = createAdminClient();

        // 2. Check caller categoria
        const { data: profile } = await admin
            .from('profiles')
            .select('categoria')
            .eq('id', user.id)
            .single();

        if (!profile || !['owner', 'admin', 'developer'].includes(profile.categoria || '')) {
            return { success: false, error: 'Sin permisos para generar contratos' };
        }

        // 3. Fetch personal record to determine role
        const { data: personal, error: personalError } = await admin
            .from('personal')
            .select('id, nombre, apellido, categoria, area')
            .eq('id', personalId)
            .single();

        if (personalError || !personal) {
            return { success: false, error: 'Prestador no encontrado' };
        }

        const anexoRol = deriveAnexoRol(personal.categoria || '', personal.area);

        // 4. Optionally upload PDF to Supabase Storage
        let driveUrl: string | null = null;
        try {
            const pdfBytes = Buffer.from(pdfBase64, 'base64');
            const fileName = `contratos/${personalId}/${Date.now()}.pdf`;

            const { data: uploadData, error: uploadError } = await admin
                .storage
                .from('staff-documents')
                .upload(fileName, pdfBytes, {
                    contentType: 'application/pdf',
                    upsert: false,
                });

            if (!uploadError && uploadData) {
                const { data: urlData } = admin
                    .storage
                    .from('staff-documents')
                    .getPublicUrl(uploadData.path);
                driveUrl = urlData?.publicUrl || null;
            }
        } catch (storageErr) {
            // Storage upload is optional — proceed without URL
            console.warn('[recordStaffContractAction] Storage upload failed (non-fatal):', storageErr);
        }

        // 5. Record in DB
        const { data: contrato, error: insertError } = await admin
            .from('personal_contratos')
            .insert({
                personal_id: personalId,
                anexo_rol: anexoRol,
                drive_url: driveUrl,
                estado: 'pendiente_firma',
                created_by: user.id,
            })
            .select('*')
            .single();

        if (insertError || !contrato) {
            return { success: false, error: insertError?.message || 'Error al guardar el contrato' };
        }

        return { success: true, contrato: contrato as ContractRecord };
    } catch (err) {
        console.error('[recordStaffContractAction]', err);
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}

/**
 * Mark an existing contract as signed.
 */
export async function markContractSignedAction(
    contratoId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const supabase = await createClient();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return { success: false, error: 'No autenticado' };
        }

        const admin = createAdminClient();

        const { error } = await admin
            .from('personal_contratos')
            .update({
                estado: 'firmado',
                firmado_at: new Date().toISOString(),
            })
            .eq('id', contratoId);

        if (error) {
            return { success: false, error: error.message };
        }

        return { success: true };
    } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
    }
}
