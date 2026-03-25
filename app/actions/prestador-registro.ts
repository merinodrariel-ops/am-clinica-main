'use server';

import { createAdminClient } from '@/utils/supabase/admin';
import { EmailService } from '@/lib/email-service';
import { revalidatePath } from 'next/cache';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');

export interface PrestadorAutoRegistroInput {
    // Paso 1
    nombre: string;
    apellido: string;
    documento: string;
    fecha_nacimiento?: string;
    // Paso 2
    email: string;
    whatsapp: string;
    direccion?: string;
    barrio_localidad?: string;
    // Paso 3
    tipo_trabajo: string;
    condicion_afip?: 'monotributista' | 'responsable_inscripto' | 'relacion_dependencia' | 'otro';
    // Paso 4
    cbu?: string;
    cbu_alias?: string;
    cuit?: string;
}

export async function registerPrestadorPublico(
    data: PrestadorAutoRegistroInput
): Promise<{ success?: true; error?: string }> {
    const adminSupabase = createAdminClient();

    // Duplicate check by documento
    const { data: existing } = await adminSupabase
        .from('personal')
        .select('id')
        .eq('documento', data.documento)
        .maybeSingle();

    if (existing) {
        return { error: 'Ya existe un prestador registrado con ese DNI.' };
    }

    const { error } = await adminSupabase.from('personal').insert({
        nombre: data.nombre,
        apellido: data.apellido,
        documento: data.documento,
        email: data.email,
        whatsapp: data.whatsapp,
        direccion: data.direccion || null,
        barrio_localidad: data.barrio_localidad || null,
        area: data.tipo_trabajo,
        tipo: 'prestador',
        condicion_afip: data.condicion_afip || null,
        cbu: data.cbu || null,
        cbu_alias: data.cbu_alias || null,
        cuit: data.cuit || null,
        activo: false,
        fuente_registro: 'autoregistro',
        fecha_ingreso: new Date().toISOString().split('T')[0],
    });

    if (error) {
        console.error('registerPrestadorPublico error:', error);
        return { error: 'Error al registrar. Intentá de nuevo.' };
    }

    // Crear cuenta de acceso e invitar automáticamente por email.
    // Si ya tiene una cuenta (reintento), generateLink con type 'recovery' también funciona.
    try {
        const fullName = `${data.nombre} ${data.apellido}`;

        // Intentar crear el usuario (puede ya existir si rellenó el form antes)
        const { data: existingAuthUser } = await adminSupabase.auth.admin.listUsers();
        const alreadyExists = existingAuthUser?.users?.some((u: { email?: string }) => u.email === data.email);

        let linkType: 'invite' | 'recovery' = 'invite';
        if (alreadyExists) {
            linkType = 'recovery';
        } else {
            // Crear usuario en auth con metadata
            await adminSupabase.auth.admin.createUser({
                email: data.email,
                user_metadata: {
                    full_name: fullName,
                    categoria: 'laboratorio', // default; admin puede cambiarlo luego
                },
                email_confirm: false,
            });
            linkType = 'invite';
        }

        const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
            type: linkType,
            email: data.email,
            options: {
                redirectTo: `${APP_URL}/auth/callback?next=/auth/update-password`,
                data: { full_name: fullName },
            },
        });

        if (!linkError && linkData?.properties?.action_link) {
            await EmailService.sendInvitation(
                fullName,
                data.email,
                linkData.properties.action_link,
                data.tipo_trabajo,
            );
        } else {
            console.error('[registerPrestadorPublico] invite link error:', linkError);
        }
    } catch (inviteErr) {
        // No bloqueamos el registro si falla el email; el admin puede reenviar luego
        console.error('[registerPrestadorPublico] invite error (non-blocking):', inviteErr);
    }

    revalidatePath('/caja-admin/personal');
    return { success: true };
}
