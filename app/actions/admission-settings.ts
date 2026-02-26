'use server';

import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function getAdmissionSettingsAction() {
    try {
        const { data, error } = await supabase
            .from('admission_settings')
            .select('*')
            .single();

        if (error) {
            console.error('Error fetching admission settings:', error);
            return { success: false, error: 'No se pudieron cargar los ajustes' };
        }

        return { success: true, settings: data.settings };
    } catch (err) {
        console.error('Unexpected error fetching settings:', err);
        return { success: false, error: 'Error inesperado' };
    }
}

export async function updateAdmissionSettingsAction(settings: any) {
    try {
        const { error } = await supabase
            .from('admission_settings')
            .update({ settings, updated_at: new Date().toISOString() })
            .eq('id', (await supabase.from('admission_settings').select('id').single()).data?.id);

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
