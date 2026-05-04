'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { getCategoryDefault, MODULE_DEFINITIONS } from '@/lib/access-overrides';
import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

type AccessOverrideValue = 'read' | 'edit' | 'none';

export type ControlUser = {
    id: string;
    email: string;
    full_name: string;
    categoria: string;
    estado: string;
    is_active: boolean;
    created_at: string | null;
    last_sign_in_at: string | null;
    access_overrides: Record<string, AccessOverrideValue> | null;
    sensitive_access: string[];
};

export type BlackBoxEvent = {
    id: string;
    created_at: string;
    user_email: string | null;
    categoria: string | null;
    action: string;
    table_name: string;
    record_id: string | null;
    metadata: Record<string, unknown> | null;
};

type ControlProfile = {
    id: string;
    email: string | null;
    full_name: string | null;
    categoria: string | null;
    estado: string | null;
    is_active: boolean | null;
    created_at: string | null;
    access_overrides: Record<string, AccessOverrideValue> | null;
};

const CONTROL_ROLES = new Set(['owner', 'admin', 'developer']);
const MUTATION_ROLES = new Set(['owner']);

const SENSITIVE_MODULES = new Set([
    'patients',
    'caja_recepcion',
    'caja_admin',
    'liquidaciones',
    'staff',
    'email_templates',
]);

async function getActor(requiredRoles: Set<string>) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'No autenticado' as const };
    }

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, categoria')
        .eq('id', user.id)
        .single();

    const categoria = normalizeCategoriaAlias(profile?.categoria || user.user_metadata?.categoria || '') || '';
    if (error || !profile || !requiredRoles.has(categoria)) {
        return { error: 'No autorizado' as const };
    }

    return {
        actor: {
            id: user.id,
            email: profile.email || user.email || null,
            full_name: profile.full_name || null,
            categoria,
        },
    };
}

function sanitizeOverrides(input: Record<string, string> | null | undefined) {
    const allowedKeys = new Set<string>(MODULE_DEFINITIONS.map(definition => definition.key));
    const sanitized: Record<string, AccessOverrideValue> = {};

    for (const [key, value] of Object.entries(input || {})) {
        if (!allowedKeys.has(key)) continue;
        if (value === 'read' || value === 'edit' || value === 'none') {
            sanitized[key] = value;
        }
    }

    return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function resolveSensitiveAccess(categoria: string, overrides: Record<string, AccessOverrideValue> | null) {
    const sensitive: string[] = [];

    for (const definition of MODULE_DEFINITIONS) {
        if (!SENSITIVE_MODULES.has(definition.key)) continue;

        const override = overrides?.[definition.key];
        const hasAccess = override
            ? override !== 'none'
            : getCategoryDefault(categoria, definition.key) === 'full';

        if (hasAccess) {
            sensitive.push(definition.label);
        }
    }

    return sensitive;
}

export async function getInternalControlData(): Promise<{
    success: boolean;
    users?: ControlUser[];
    events?: BlackBoxEvent[];
    error?: string;
}> {
    const actorResult = await getActor(CONTROL_ROLES);
    if ('error' in actorResult) return { success: false, error: actorResult.error };

    try {
        const admin = createAdminClient();
        const [{ data: profiles, error: profilesError }, authResult, { data: events, error: eventsError }] = await Promise.all([
            admin
                .from('profiles')
                .select('id, email, full_name, categoria, estado, is_active, created_at, access_overrides')
                .order('created_at', { ascending: false }),
            admin.auth.admin.listUsers({ perPage: 1000 }),
            admin
                .from('audit_logs')
                .select('id, created_at, user_email, categoria, role, action, table_name, record_id, metadata')
                .order('created_at', { ascending: false })
                .limit(160),
        ]);

        if (profilesError) throw profilesError;
        if (authResult.error) throw authResult.error;
        if (eventsError) throw eventsError;

        const authUsers = authResult.data.users as Array<{
            id: string;
            email?: string;
            created_at?: string;
            last_sign_in_at?: string;
        }>;
        const users = ((profiles || []) as ControlProfile[]).map(profile => {
            const authUser = authUsers.find(user => user.id === profile.id);
            const categoria = normalizeCategoriaAlias(profile.categoria || '') || 'partner_viewer';
            const overrides = sanitizeOverrides(profile.access_overrides || null);

            return {
                id: profile.id,
                email: authUser?.email || profile.email || '',
                full_name: profile.full_name || '',
                categoria,
                estado: profile.estado || (profile.is_active === false ? 'inactivo' : 'activo'),
                is_active: profile.is_active !== false,
                created_at: authUser?.created_at || profile.created_at,
                last_sign_in_at: authUser?.last_sign_in_at || null,
                access_overrides: overrides,
                sensitive_access: resolveSensitiveAccess(categoria, overrides),
            };
        });

        const blackBoxEvents = (events || []).map((event: Record<string, unknown>) => ({
            id: String(event.id),
            created_at: String(event.created_at),
            user_email: typeof event.user_email === 'string' ? event.user_email : null,
            categoria: typeof event.categoria === 'string'
                ? event.categoria
                : (typeof event.role === 'string' ? event.role : null),
            action: String(event.action || ''),
            table_name: String(event.table_name || ''),
            record_id: typeof event.record_id === 'string' ? event.record_id : null,
            metadata: event.metadata && typeof event.metadata === 'object'
                ? event.metadata as Record<string, unknown>
                : null,
        }));

        return { success: true, users, events: blackBoxEvents };
    } catch (error) {
        console.error('[control-interno] getInternalControlData error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Error cargando control interno' };
    }
}

export async function updateInternalUserAccess(input: {
    targetUserId: string;
    categoria: string;
    is_active: boolean;
    access_overrides: Record<string, string>;
}): Promise<{ success: boolean; error?: string }> {
    const actorResult = await getActor(MUTATION_ROLES);
    if ('error' in actorResult) return { success: false, error: actorResult.error };

    try {
        const admin = createAdminClient();
        const targetUserId = input.targetUserId;
        const categoria = normalizeCategoriaAlias(input.categoria) || 'partner_viewer';
        const accessOverrides = sanitizeOverrides(input.access_overrides);

        if (!targetUserId) throw new Error('Usuario inválido');

        const { data: before, error: beforeError } = await admin
            .from('profiles')
            .select('id, email, full_name, categoria, estado, is_active, access_overrides')
            .eq('id', targetUserId)
            .single();

        if (beforeError || !before) throw beforeError || new Error('Usuario no encontrado');

        if (before.categoria === 'owner' && categoria !== 'owner') {
            const { count, error } = await admin
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('categoria', 'owner')
                .neq('id', targetUserId);

            if (error) throw error;
            if ((count || 0) < 1) throw new Error('No se puede quitar el último owner');
        }

        const patch = {
            categoria,
            is_active: input.is_active,
            estado: input.is_active ? 'activo' : 'inactivo',
            access_overrides: accessOverrides,
        };

        const { error: updateError } = await admin
            .from('profiles')
            .update(patch)
            .eq('id', targetUserId);

        if (updateError) throw updateError;

        const { error: authError } = await admin.auth.admin.updateUserById(targetUserId, {
            ban_duration: input.is_active ? 'none' : '876000h',
            user_metadata: {
                categoria,
                full_name: before.full_name || undefined,
            },
        });

        if (authError) throw authError;

        await admin.from('audit_logs').insert({
            user_id: actorResult.actor.id,
            user_email: actorResult.actor.email,
            categoria: actorResult.actor.categoria,
            role: actorResult.actor.categoria,
            action: 'internal_control_update_user_access',
            table_name: 'profiles',
            record_id: targetUserId,
            old_data: {
                categoria: before.categoria,
                estado: before.estado,
                is_active: before.is_active,
                access_overrides: before.access_overrides,
            },
            new_data: patch,
            metadata: {
                module: 'control_interno',
                target_email: before.email,
                target_name: before.full_name,
                sensitive_access: resolveSensitiveAccess(categoria, accessOverrides),
                changed_at: new Date().toISOString(),
            },
        });

        revalidatePath('/admin/control-interno');
        revalidatePath('/admin-users');
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        console.error('[control-interno] updateInternalUserAccess error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Error actualizando permisos' };
    }
}
