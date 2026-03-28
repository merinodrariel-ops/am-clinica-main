'use server';

import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';

export async function login(formData: FormData) {
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const redirectPath = (formData.get('redirect') as string) || '/dashboard';

    console.log(`[AUTH ACTION] Intento de login para: ${email} (Redirigiendo a: ${redirectPath})`);

    const supabase = await createClient();

    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        console.error(`[AUTH ACTION] Error de autenticación: ${error.message}`);
        return { error: error.message };
    }

    console.log(`[AUTH ACTION] Login exitoso para: ${email}`);

    // Return success to the client instead of using server-side redirect
    return { success: true, redirect: redirectPath };
}
