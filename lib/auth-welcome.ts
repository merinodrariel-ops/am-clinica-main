import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { sendResendEmail } from '@/lib/resend-email';

type ProfileSyncResult = {
    success: boolean;
    error?: string;
};

function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceRole) return null;
    return createSupabaseAdminClient(url, serviceRole);
}

function extractFullName(user: User) {
    const metadata = user.user_metadata || {};
    return (
        metadata.full_name ||
        metadata.name ||
        [metadata.given_name, metadata.family_name].filter(Boolean).join(' ').trim() ||
        user.email ||
        'Usuario'
    );
}

function extractAvatar(user: User) {
    const metadata = user.user_metadata || {};
    return metadata.avatar_url || metadata.picture || null;
}

function extractProvider(user: User) {
    const appMeta = user.app_metadata || {};
    const provider = typeof appMeta.provider === 'string' ? appMeta.provider : '';
    if (provider) return provider;

    const providers = Array.isArray(appMeta.providers) ? appMeta.providers : [];
    return typeof providers[0] === 'string' ? providers[0] : 'email';
}

function normalizeRole(rawRole: unknown) {
    const role = String(rawRole || '').toLowerCase();
    const allowed = new Set([
        'owner',
        'admin',
        'reception',
        'developer',
        'pricing_manager',
        'partner_viewer',
        'laboratorio',
        'google_user',
    ]);
    return allowed.has(role) ? role : 'google_user';
}

function buildWelcomeHtml(name: string) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; color: #0f172a;">
            <h2 style="margin-bottom: 10px;">Bienvenido a Google Gravity</h2>
            <p>Hola ${name}, tu acceso fue activado correctamente.</p>
            <p>Ya podes ingresar y usar la plataforma de AM Clinica para gestionar pacientes, agenda, caja e inventario.</p>
            <p style="margin-top: 18px; color: #475569; font-size: 13px;">
                Si no reconoces este acceso, por favor responde este email o contacta al administrador.
            </p>
        </div>
    `;
}

export async function syncUserProfileAndSendFirstWelcome(user: User): Promise<ProfileSyncResult> {
    const admin = getAdminClient();
    if (!admin) {
        return { success: false, error: 'Supabase service role no configurado' };
    }

    const fullName = extractFullName(user);
    const avatarUrl = extractAvatar(user);
    const provider = extractProvider(user);
    const desiredRole = normalizeRole(user.user_metadata?.role);

    const { data: profileBefore } = await admin
        .from('profiles')
        .select('id, role, welcome_email_sent')
        .eq('id', user.id)
        .maybeSingle();

    const roleForInsert = normalizeRole(profileBefore?.role || desiredRole);

    const { error: upsertError } = await admin
        .from('profiles')
        .upsert(
            {
                id: user.id,
                email: user.email,
                full_name: fullName,
                role: roleForInsert,
                is_active: true,
                estado: 'activo',
                ultimo_login: new Date().toISOString(),
                avatar_url: avatarUrl,
                auth_provider: provider,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
        );

    if (upsertError) {
        return { success: false, error: upsertError.message };
    }

    const shouldSend = !profileBefore?.welcome_email_sent && Boolean(user.email);
    if (!shouldSend) {
        return { success: true };
    }

    const send = await sendResendEmail({
        to: user.email!,
        subject: 'Bienvenido a Google Gravity',
        html: buildWelcomeHtml(fullName),
    });

    if (!send.success) {
        return { success: false, error: send.error || 'No se pudo enviar welcome email' };
    }

    await admin
        .from('profiles')
        .update({
            welcome_email_sent: true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

    return { success: true };
}
