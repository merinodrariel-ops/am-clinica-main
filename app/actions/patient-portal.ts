'use server';

import { createClient } from '@/utils/supabase/server';
import { cookies } from 'next/headers';

/**
 * Gets or generates a portal URL for a specific patient.
 * If the patient has a valid login_token, it returns the existing one.
 * If not, it could potentially trigger a token generation (though for safety, 
 * we mostly fetch existing ones here).
 */
export async function getPatientPortalUrl(patientId: string) {
    const supabase = await createClient();

    // Fetch the patient's login token
    const { data: patient, error } = await supabase
        .from('pacientes')
        .select('login_token')
        .eq('id_paciente', patientId)
        .single();

    if (error || !patient?.login_token) {
        throw new Error('No se pudo encontrar un token de acceso para este paciente. Por favor, genera uno desde su ficha.');
    }

    // Return the relative URL
    return `/mi-clinica/${patient.login_token}`;
}
