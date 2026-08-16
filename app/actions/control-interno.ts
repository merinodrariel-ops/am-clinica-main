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

export type ControlAccessGrant = {
    id: string;
    target_user_id: string;
    target_name: string;
    target_email: string;
    module_key: string;
    access_level: 'read' | 'edit';
    reason: string;
    starts_at: string;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
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
const GRANT_ROLES = new Set(['owner', 'admin', 'developer']);

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
    grants?: ControlAccessGrant[];
    error?: string;
}> {
    const actorResult = await getActor(CONTROL_ROLES);
    if ('error' in actorResult) return { success: false, error: actorResult.error };

    try {
        const admin = createAdminClient();
        const [{ data: profiles, error: profilesError }, authResult, { data: events, error: eventsError }, { data: grants, error: grantsError }] = await Promise.all([
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
            admin
                .from('access_grants')
                .select('id, target_user_id, module_key, access_level, reason, starts_at, expires_at, revoked_at, created_at')
                .order('created_at', { ascending: false })
                .limit(120),
        ]);

        if (profilesError) throw profilesError;
        if (authResult.error) throw authResult.error;
        if (eventsError) throw eventsError;
        // Keep the existing center readable during a staged rollout where the
        // migration has not reached the remote database yet. Grant mutations
        // remain unavailable until the table exists; the rest of the console
        // must not disappear because of that deployment ordering.
        if (grantsError && !/access_grants|relation .* does not exist/i.test(grantsError.message || '')) throw grantsError;

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

        const profileById = new Map(users.map(user => [user.id, user]));
        const controlGrants = (grants || []).map((grant: Record<string, unknown>) => {
            const target = profileById.get(String(grant.target_user_id));
            return {
                id: String(grant.id),
                target_user_id: String(grant.target_user_id),
                target_name: target?.full_name || 'Sin nombre',
                target_email: target?.email || '',
                module_key: String(grant.module_key),
                access_level: grant.access_level === 'edit' ? 'edit' : 'read',
                reason: String(grant.reason || ''),
                starts_at: String(grant.starts_at),
                expires_at: String(grant.expires_at),
                revoked_at: typeof grant.revoked_at === 'string' ? grant.revoked_at : null,
                created_at: String(grant.created_at),
            } satisfies ControlAccessGrant;
        });

        return { success: true, users, events: blackBoxEvents, grants: controlGrants };
    } catch (error) {
        console.error('[control-interno] getInternalControlData error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Error cargando control interno' };
    }
}

export async function createAccessGrant(input: {
    targetUserId: string;
    moduleKey: string;
    accessLevel: 'read' | 'edit';
    reason: string;
    expiresAt: string;
}): Promise<{ success: boolean; error?: string }> {
    const actorResult = await getActor(GRANT_ROLES);
    if ('error' in actorResult) return { success: false, error: actorResult.error };

    try {
        const moduleDefinition = MODULE_DEFINITIONS.find(definition => definition.key === input.moduleKey);
        if (!moduleDefinition) throw new Error('Módulo inválido');
        if (input.accessLevel !== 'read' && input.accessLevel !== 'edit') throw new Error('Nivel inválido');
        if (!input.targetUserId || input.reason.trim().length < 3) throw new Error('Indicá usuario y motivo');

        const expiresAt = new Date(input.expiresAt);
        const now = new Date();
        const maxExpiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) throw new Error('La fecha de vencimiento debe ser futura');
        if (expiresAt > maxExpiry) throw new Error('El acceso temporal no puede superar 30 días');

        const admin = createAdminClient();
        const { data: target, error: targetError } = await admin
            .from('profiles')
            .select('id, email, full_name, is_active')
            .eq('id', input.targetUserId)
            .single();
        if (targetError || !target) throw targetError || new Error('Usuario no encontrado');
        if (target.is_active === false) throw new Error('No se puede otorgar acceso a un usuario inactivo');

        const { error } = await admin.from('access_grants').insert({
            target_user_id: input.targetUserId,
            module_key: moduleDefinition.key,
            access_level: input.accessLevel,
            reason: input.reason.trim(),
            expires_at: expiresAt.toISOString(),
            created_by: actorResult.actor.id,
        });
        if (error) throw error;

        await admin.from('audit_logs').insert({
            user_id: actorResult.actor.id,
            user_email: actorResult.actor.email,
            categoria: actorResult.actor.categoria,
            role: actorResult.actor.categoria,
            action: 'access_center_create_temporary_grant',
            table_name: 'access_grants',
            metadata: {
                target_user_id: input.targetUserId,
                target_email: target.email,
                module_key: moduleDefinition.key,
                access_level: input.accessLevel,
                reason: input.reason.trim(),
                expires_at: expiresAt.toISOString(),
            },
        });

        revalidatePath('/admin/control-interno');
        return { success: true };
    } catch (error) {
        console.error('[control-interno] createAccessGrant error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo crear el acceso temporal' };
    }
}

export async function revokeAccessGrant(grantId: string): Promise<{ success: boolean; error?: string }> {
    const actorResult = await getActor(GRANT_ROLES);
    if ('error' in actorResult) return { success: false, error: actorResult.error };
    try {
        if (!grantId) throw new Error('Acceso temporal inválido');
        const admin = createAdminClient();
        const { data: grant, error: grantError } = await admin
            .from('access_grants')
            .select('id, target_user_id, module_key, access_level')
            .eq('id', grantId)
            .is('revoked_at', null)
            .single();
        if (grantError || !grant) throw grantError || new Error('Acceso temporal no encontrado');

        const { error } = await admin
            .from('access_grants')
            .update({ revoked_at: new Date().toISOString(), revoked_by: actorResult.actor.id })
            .eq('id', grantId)
            .is('revoked_at', null);
        if (error) throw error;

        await admin.from('audit_logs').insert({
            user_id: actorResult.actor.id,
            user_email: actorResult.actor.email,
            categoria: actorResult.actor.categoria,
            role: actorResult.actor.categoria,
            action: 'access_center_revoke_temporary_grant',
            table_name: 'access_grants',
            record_id: grantId,
            metadata: grant,
        });

        revalidatePath('/admin/control-interno');
        return { success: true };
    } catch (error) {
        console.error('[control-interno] revokeAccessGrant error:', error);
        return { success: false, error: error instanceof Error ? error.message : 'No se pudo revocar el acceso temporal' };
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
