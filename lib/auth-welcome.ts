import 'server-only';

import { createClient as createSupabaseAdminClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { EmailService } from '@/lib/email-service';
import { generatePremiumWelcomeEmail } from '@/lib/email-templates';

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

function normalizeCategoria(rawCategoria: unknown) {
    const categoria = String(rawCategoria || '').toLowerCase();
    const allowed = new Set([
        'owner',
        'admin',
        'reception',
        'developer',
        'pricing_manager',
        'partner_viewer',
        'laboratorio',
        'google_user',
        'asistente',
        'odontologo',
        'recaptacion',
        'contador',
        'socio'
    ]);
    return allowed.has(categoria) ? categoria : 'google_user';
}

function buildWelcomeHtml(name: string) {
    // Legacy function, now using template from email-templates.ts
    return generatePremiumWelcomeEmail(name, `${process.env.NEXT_PUBLIC_APP_URL || ''}/portal`);
}

export async function syncUserProfileAndSendFirstWelcome(user: User): Promise<ProfileSyncResult> {
    const admin = getAdminClient();
    if (!admin) {
        return { success: false, error: 'Supabase service role no configurado' };
    }

    const fullName = extractFullName(user);
    const avatarUrl = extractAvatar(user);
    const provider = extractProvider(user);
    const desiredCategoria = normalizeCategoria(user.user_metadata?.categoria);

    const { data: profileBefore } = await admin
        .from('profiles')
        .select('id, categoria, welcome_email_sent')
        .eq('id', user.id)
        .maybeSingle();

    const categoriaForInsert = normalizeCategoria(profileBefore?.categoria || desiredCategoria);

    const { error: upsertError } = await admin
        .from('profiles')
        .upsert(
            {
                id: user.id,
                email: user.email,
                full_name: fullName,
                categoria: categoriaForInsert,
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

    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || ''}/portal`;

    const send = await EmailService.sendWelcome(fullName, user.email!);

    if (!send.success) {
        return { success: false, error: (send as any).error || 'No se pudo enviar welcome email' };
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
