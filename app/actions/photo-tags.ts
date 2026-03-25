'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { createClient } from '@/utils/supabase/server';

export interface PhotoTag {
    file_id: string;
    category: string;
    subcategory?: string | null;
}

export async function savePhotoTagAction(
    fileId: string,
    patientId: string,
    category: string,
    subcategory: string | null,
) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autenticado' };

    const admin = createAdminClient();
    const { error } = await admin.from('patient_file_tags').upsert({
        file_id:     fileId,
        patient_id:  patientId,
        category,
        subcategory: subcategory ?? null,
        tagged_by:   user.id,
        tagged_at:   new Date().toISOString(),
    }, { onConflict: 'file_id' });

    if (error) return { error: error.message };
    return { success: true };
}

export async function removePhotoTagAction(fileId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No autenticado' };

    const admin = createAdminClient();
    const { error } = await admin.from('patient_file_tags').delete().eq('file_id', fileId);
    if (error) return { error: error.message };
    return { success: true };
}

export async function getPhotoTagsForPatientAction(patientId: string): Promise<PhotoTag[]> {
    const admin = createAdminClient();
    const { data } = await admin
        .from('patient_file_tags')
        .select('file_id, category, subcategory')
        .eq('patient_id', patientId);
    return (data as PhotoTag[]) ?? [];
}
