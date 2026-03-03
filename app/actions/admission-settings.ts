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

        const settings = (data as unknown as { settings?: unknown } | null)?.settings ?? null;
        return { success: true, settings };
    } catch (err) {
        console.error('Unexpected error fetching settings:', err);
        return { success: false, error: 'Error inesperado' };
    }
}

export async function updateAdmissionSettingsAction(settings: unknown) {
    try {
        const admissionSettingsSelect = supabase.from('admission_settings') as unknown as {
            select: (columns: string) => {
                single: () => Promise<{ data: unknown; error: unknown }>;
            };
        };

        const idResult = await admissionSettingsSelect.select('id').single();
        const settingsId = (idResult.data as unknown as { id?: string } | null)?.id;

        if (!settingsId) {
            return { success: false, error: 'No se encontró configuración para actualizar' };
        }

        const admissionSettingsUpdate = supabase.from('admission_settings') as unknown as {
            update: (values: Record<string, unknown>) => {
                eq: (column: string, value: string) => Promise<{ error: unknown }>;
            };
        };

        const { error } = await admissionSettingsUpdate
            .update({ settings, updated_at: new Date().toISOString() })
            .eq('id', settingsId);

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
