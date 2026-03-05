'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function getAdmissionSettingsAction() {
    try {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from('admission_settings')
            .select('*')
            .single();

        if (error) {
            console.error('Error fetching admission settings:', error);
            return { success: false, error: 'No se pudieron cargar los ajustes' };
        }

        const settings = (data as any)?.settings ?? null;
        return { success: true, settings };
    } catch (err) {
        console.error('Unexpected error fetching settings:', err);
        return { success: false, error: 'Error inesperado' };
    }
}

export async function updateAdmissionSettingsAction(settings: unknown) {
    try {
        const supabase = await createClient();

        const { data: idResult, error: fetchError } = await supabase
            .from('admission_settings')
            .select('id')
            .single();

        if (fetchError || !idResult) {
            return { success: false, error: 'No se encontró configuración para actualizar' };
        }

        const { error } = await supabase
            .from('admission_settings')
            .update({ settings, updated_at: new Date().toISOString() })
            .eq('id', idResult.id);

        if (error) {
            console.error('Error updating admission settings:', error);
            return { success: false, error: 'Error al actualizar los ajustes' };
        }

        revalidatePath('/admision');
        revalidatePath('/admin/admissions');

        return { success: true };
    } catch (err) {
        console.error('Unexpected error updating settings:', err);
        return { success: false, error: 'Error inesperado' };
    }
}
