'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { EmailService } from '@/lib/email-service';
import { normalizeCategoriaAlias } from '@/lib/categoria-normalizer';

// Initialize Admin Client securely
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Define strict types for the fallback mock to avoid 'any'


const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : {
        auth: {
            admin: {
                listUsers: () => Promise.resolve({ data: { users: [] }, error: null }),
                inviteUserByEmail: () => Promise.resolve({ data: { user: null }, error: 'Build time mock' }),
                updateUserById: () => Promise.resolve({ error: null }),
                deleteUser: () => Promise.resolve({ error: null }),
                getUserById: () => Promise.resolve({ data: { user: null }, error: null }),
                resetPasswordForEmail: () => Promise.resolve({ error: null }),
            }
        },
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
        })
    } as unknown as ReturnType<typeof createClient>; // Cast to client type instead of any, or use the mock structure if strictly needed for tests

interface Profile {
    id: string;
    email?: string;
    last_sign_in_at?: string;
    created_at: string;
    full_name?: string;
    categoria?: string;
    whatsapp?: string;
    estado?: string;
    invitation_sent_at?: string;
    [key: string]: unknown; // Allow other props for now to be safe
}

const PROVIDER_MANAGED_CATEGORIES = new Set(['odontologo', 'laboratorio', 'asistente', 'dentist']);

function getErrorMessage(error: unknown, fallback = 'Error desconocido') {
    if (error instanceof Error && error.message) return error.message;

    if (typeof error === 'string' && error.trim()) return error;

    if (error && typeof error === 'object') {
        const maybe = error as Record<string, unknown>;
        const message = typeof maybe.message === 'string' ? maybe.message : '';
        const details = typeof maybe.details === 'string' ? maybe.details : '';
        const hint = typeof maybe.hint === 'string' ? maybe.hint : '';
        const code = typeof maybe.code === 'string' ? maybe.code : '';

        const composed = [message, details, hint].filter(Boolean).join(' | ');
        if (composed) {
            return code ? `${composed} (code: ${code})` : composed;
        }

        try {
            return JSON.stringify(error);
        } catch {
            return fallback;
        }
    }

    return fallback;
}

export async function getUsers() {
    try {
        // 1. Fetch Auth Users (System source of truth for Email, Last Sign In)
        // Pagination might be needed for large sets, simplified here
        const { data: { users }, error: authError } = await supabaseAdmin.auth.admin.listUsers({
            perPage: 1000
        });

        if (authError) throw authError;

        // 2. Fetch Profiles (App source of truth for Role, Name, Status)
        const { data: profiles, error: dbError } = await supabaseAdmin
            .from('profiles')
            .select('*');

        if (dbError) throw dbError;

        // 3. Merge Data
        const mergedUsers = (profiles as Profile[]).map((profile) => {
            const authUser = users.find((u) => u.id === profile.id);
            return {
                ...profile,
                email: authUser?.email || profile.email || '',
                last_sign_in_at: authUser?.last_sign_in_at,
                created_at: authUser?.created_at || profile.created_at,
                full_name: profile.full_name || '',
                categoria: normalizeCategoriaAlias(profile.categoria || '') || 'user',
                estado: profile.estado || 'inactivo',
            };
        });

        return { success: true, data: mergedUsers };
    } catch (error) {
        console.error('Error fetching users:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

// Helper to determine the correct public URL
// Always returns a production URL, never localhost (invites must work from any env)
function getAppPublicUrl() {
    const url = process.env.NEXT_PUBLIC_APP_URL;

    // 1. Explicit Env Var, solo si NO es localhost
    if (url && !url.includes('localhost')) {
        return url.replace(/\/$/, '');
    }

    // 2. Vercel System Env Var (automático en Vercel)
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }

    // 3. Fallback producción
    return 'https://am-clinica-main.vercel.app';
}

export async function inviteUser(formData: FormData) {
    const email = formData.get('email') as string;
    const fullName = formData.get('fullName') as string;
    const rawCategoria = (formData.get('role') as string) || (formData.get('categoria') as string);
    const categoria = normalizeCategoriaAlias(rawCategoria) || 'partner_viewer';
    const whatsapp = formData.get('whatsapp') as string;

    const publicUrl = getAppPublicUrl();

    if (PROVIDER_MANAGED_CATEGORIES.has(categoria)) {
        return {
            success: false,
            error: 'Las altas de prestadores se gestionan desde Prestadores / Personal. Este módulo no permite asignar esta categoría.',
        };
    }

    try {
        // 1. Generate Invite Link (Manual)
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'invite',
            email: email,
            options: {
                data: { full_name: fullName, categoria: categoria },
                redirectTo: `${publicUrl}/auth/update-password`
            }
        });

        if (linkError) throw linkError;
        if (!linkData.user) throw new Error('No user created');

        // 2. Send Custom Email via EmailService (Resend)
        const emailResult = await EmailService.sendInvitation(
            fullName,
            email,
            linkData.properties.action_link
        );

        if (!emailResult.success) {
            console.error('Email sending failed:', emailResult.error);
            // Optionally delete the user if email failed? No, improved DX is to return error but keep user.
            // But for now, let's return error so UI shows it.
            return { success: false, error: `Usuario creado pero falló el email: ${emailResult.error}` };
        }

        const authData = linkData; // Adaptation for existing code

        // if (inviteError) throw inviteError; // Removed

        if (!authData.user) throw new Error('No user created');

        // 2. Update Profile with extra details
        // The trigger 'handle_new_user' should have created the profile. 
        // We update specific fields.
        const { error: profileError } = await supabaseAdmin
            .from('profiles')
            .update({
                full_name: fullName,
                categoria: categoria,
                whatsapp: whatsapp,
                estado: 'invitado', // Explicitly set as invited
                invitation_sent_at: new Date().toISOString()
            })
            .eq('id', authData.user.id);

        if (profileError) {
            // If trigger failed or race condition, upsert could be safer but update should work if trigger fired.
            console.error('Profile update error:', profileError);
        }

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function resendInvitation(email: string) {
    // This function seems unused in favor of resendUserAccessEmail, but limiting scope for now.
    // If used, it needs similar fix. 
    try {
        const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${getAppPublicUrl()}/auth/update-password`
        });
        if (error) throw error;

        await supabaseAdmin.from('profiles')
            .update({ invitation_sent_at: new Date().toISOString() })
            .eq('email', email);

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

interface UpdateUserData {
    full_name?: string;
    whatsapp?: string;
    categoria?: string;
    email?: string;
    estado?: string;
    is_active?: boolean;
}

export async function updateUser(userId: string, data: UpdateUserData, requesterId?: string) {
    try {
        const normalizedCategoria = typeof data.categoria === 'string'
            ? (normalizeCategoriaAlias(data.categoria) || undefined)
            : undefined;

        // Block category changes to provider roles, UNLESS the requester is the owner
        if (typeof normalizedCategoria === 'string' && PROVIDER_MANAGED_CATEGORIES.has(normalizedCategoria)) {
            let requesterIsOwner = false;
            if (requesterId) {
                const { data: rp } = await supabaseAdmin.from('profiles').select('categoria').eq('id', requesterId).single();
                requesterIsOwner = rp?.categoria === 'owner';
            }
            if (!requesterIsOwner) {
                throw new Error('Las altas y cambios de categoría de prestadores se gestionan desde Prestadores / Personal.');
            }
        }

        const profilePatch: Record<string, unknown> = {
            full_name: data.full_name,
            whatsapp: data.whatsapp,
            categoria: normalizedCategoria,
        };

        if (typeof data.estado === 'string') {
            profilePatch.estado = data.estado;
        }

        if (typeof data.is_active === 'boolean') {
            profilePatch.is_active = data.is_active;
        }

        if (typeof data.email === 'string' && data.email.trim()) {
            profilePatch.email = data.email.trim().toLowerCase();
        }

        // Update Profile
        const { error } = await supabaseAdmin
            .from('profiles')
            .update(profilePatch)
            .eq('id', userId);

        if (error) throw error;

        // Also update Auth Metadata if needed for consistency
        const authPatch: Record<string, unknown> = {};

        if (normalizedCategoria || data.full_name) {
            authPatch.user_metadata = {
                categoria: normalizedCategoria,
                full_name: data.full_name
            };
        }

        if (typeof data.email === 'string' && data.email.trim()) {
            authPatch.email = data.email.trim().toLowerCase();
        }

        if (Object.keys(authPatch).length > 0) {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, authPatch);
            if (authError) throw authError;
        }

        revalidatePath('/admin-users');
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function deleteUserAccount(targetUserId: string, requesterId: string) {
    try {
        if (!targetUserId || !requesterId) {
            throw new Error('Datos inválidos para eliminar usuario');
        }

        if (targetUserId === requesterId) {
            throw new Error('No podés eliminar tu propio usuario desde esta pantalla');
        }

        const { data: requestorProfile, error: reqError } = await supabaseAdmin
            .from('profiles')
            .select('id, email, categoria')
            .eq('id', requesterId)
            .single();

        if (reqError || !requestorProfile || !['owner', 'admin'].includes(requestorProfile.categoria)) {
            throw new Error('No autorizado para eliminar usuarios');
        }

        const { data: targetProfile } = await supabaseAdmin
            .from('profiles')
            .select('id, categoria, email, full_name')
            .eq('id', targetUserId)
            .single();

        if (targetProfile?.categoria === 'owner' && requestorProfile.categoria !== 'owner') {
            throw new Error('Solo un dueño puede eliminar otro usuario dueño');
        }

        if (targetProfile?.categoria === 'owner') {
            const { count: ownersCount, error: ownersError } = await supabaseAdmin
                .from('profiles')
                .select('id', { count: 'exact', head: true })
                .eq('categoria', 'owner');

            if (ownersError) throw ownersError;
            if ((ownersCount || 0) <= 1) {
                throw new Error('No se puede eliminar el último usuario dueño');
            }
        }

        // Detach staff linkage to avoid foreign key blocks if present.
        await supabaseAdmin
            .from('personal')
            .update({ user_id: null })
            .eq('user_id', targetUserId);

        let deleteMode: 'hard' | 'soft' = 'hard';
        let deleteErrorMessage: string | null = null;

        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(targetUserId);

        if (deleteError) {
            // Fallback: when hard delete fails due DB dependencies (FK RESTRICT, etc),
            // perform a safe soft-delete so the user can no longer access the system.
            deleteMode = 'soft';
            deleteErrorMessage = deleteError.message;

            const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
                ban_duration: '876000h', // 100 years
                user_metadata: {
                    deleted_at: new Date().toISOString(),
                    deleted_by: requesterId,
                    deletion_mode: 'soft',
                },
            });

            if (banError) {
                throw new Error(`No se pudo eliminar ni desactivar el usuario: ${deleteError.message}`);
            }

            const softEmail = `deleted+${targetUserId.slice(0, 8)}@am-clinica.local`;

            // Best effort: free original email for future invites.
            await supabaseAdmin.auth.admin.updateUserById(targetUserId, { email: softEmail });

            const { error: profileSoftDeleteError } = await supabaseAdmin
                .from('profiles')
                .update({
                    full_name: `Eliminado (${targetProfile?.full_name || targetUserId.slice(0, 8)})`,
                    email: softEmail,
                    categoria: 'partner_viewer',
                    estado: 'eliminado',
                    is_active: false,
                    whatsapp: null,
                })
                .eq('id', targetUserId);

            if (profileSoftDeleteError) throw profileSoftDeleteError;
        }

        await supabaseAdmin.from('audit_logs').insert({
            user_id: requesterId,
            user_email: requestorProfile.email,
            categoria: requestorProfile.categoria,
            action: 'delete_user_account',
            table_name: 'auth.users',
            record_id: targetUserId,
            metadata: {
                target_categoria: targetProfile?.categoria || null,
                target_email: targetProfile?.email || null,
                delete_mode: deleteMode,
                delete_error: deleteErrorMessage,
                deleted_at: new Date().toISOString(),
            },
        });

        revalidatePath('/admin-users');
        revalidatePath('/admin/users');
        return { success: true, mode: deleteMode };
    } catch (error) {
        console.error('deleteUserAccount error:', error);
        return { success: false, error: getErrorMessage(error) };
    }
}

export async function suspendUser(userId: string) {
    try {
        // 1. Soft suspend in Profile
        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({ estado: 'suspendido' })
            .eq('id', userId);

        if (dbError) throw dbError;

        // 2. Ban in Auth
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            ban_duration: '876000h' // 100 years
        });

        if (banError) throw banError;

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function reactivateUser(userId: string) {
    try {
        // 1. Activate in Profile
        const { error: dbError } = await supabaseAdmin
            .from('profiles')
            .update({ estado: 'activo' })
            .eq('id', userId);

        if (dbError) throw dbError;

        // 2. Unban in Auth
        const { error: banError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
            ban_duration: 'none'
        });

        if (banError) throw banError;

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}


export async function resendUserAccessEmail(userId: string, ownerId: string) {
    try {
        // 1. Verify Requestor is Owner
        const { data: requestorProfile, error: reqError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', ownerId)
            .single();

        if (reqError || requestorProfile.categoria !== 'owner') {
            throw new Error('Unauthorized: Only Only owners can perform this action');
        }

        // 2. Get Target User Profile & Auth Data
        const { data: { user: targetUser }, error: userError } = await supabaseAdmin.auth.admin.getUserById(userId);
        if (userError || !targetUser) throw new Error('User not found');

        let actionType = '';
        const publicUrl = getAppPublicUrl();

        // 3. Determine link type and send via nodemailer (both cases)
        // Case A (unconfirmed): generate invite link
        // Case B (confirmed): generate recovery link
        // Both paths use our own email (Gmail/nodemailer) — avoids Supabase rate limits
        const linkType = !targetUser.email_confirmed_at ? 'invite' : 'recovery';
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: linkType,
            email: targetUser.email!,
            options: {
                redirectTo: `${publicUrl}/auth/callback?next=/auth/update-password`
            }
        });

        if (linkError) throw linkError;

        const emailRes = await EmailService.sendInvitation(
            targetUser.user_metadata?.full_name || 'Usuario',
            targetUser.email!,
            linkData.properties.action_link
        );

        if (!emailRes.success) throw new Error(`Email failed: ${emailRes.error}`);

        actionType = linkType === 'invite' ? 'resend_invite' : 'send_reset_password';

        // 4. Audit Log
        await supabaseAdmin.from('audit_logs').insert({
            user_id: ownerId,
            user_email: requestorProfile.email,
            categoria: 'owner',
            action: 'resend_access_email',
            table_name: 'profiles',
            record_id: userId,
            metadata: {
                target_email: targetUser.email,
                target_categoria: targetUser.user_metadata?.categoria || null,
                sub_action: actionType,
                timestamp: new Date().toISOString()
            }
        });

        return { success: true, message: actionType === 'resend_invite' ? 'Email de invitación reenviado.' : 'Email de restablecimiento de contraseña enviado.' };
    } catch (error) {
        console.error('Error resending access email:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function resetUserPassword(email: string) {
    try {
        // Send recovery email
        // redirectTo must go through /auth/callback so the code is exchanged for a session
        // before landing on the update-password page (PKCE flow requires this)
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${getAppPublicUrl()}/auth/callback?next=/auth/update-password`
        });

        if (error) throw error;
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function setUserPassword(targetUserId: string, newPassword: string, requesterId: string) {
    try {
        // 1. Verify Requestor is Owner or Admin
        const { data: requestorProfile, error: reqError } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .eq('id', requesterId)
            .single();

        if (reqError || !['owner', 'admin'].includes(requestorProfile.categoria)) {
            throw new Error('Unauthorized: Only owners or admins can perform this action');
        }

        // 2. Update User Password
        const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(targetUserId, {
            password: newPassword
        });

        if (updateError) throw updateError;

        // 3. Audit Log
        await supabaseAdmin.from('audit_logs').insert({
            user_id: requesterId,
            user_email: requestorProfile.email,
            categoria: requestorProfile.categoria,
            action: 'manual_password_reset',
            table_name: 'auth.users',
            record_id: targetUserId,
            metadata: {
                timestamp: new Date().toISOString(),
                performed_by: requestorProfile.email
            }
        });

        return { success: true, message: 'Contraseña actualizada correctamente' };
    } catch (error) {
        console.error('Error setting password:', error);
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function updateUserAccessOverrides(
    targetUserId: string,
    overrides: Record<string, string>,
    requesterId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        if (!targetUserId || !requesterId) throw new Error('Datos inválidos');

        // Verify requester is owner or admin
        const { data: requesterProfile, error: reqError } = await supabaseAdmin
            .from('profiles')
            .select('id, categoria')
            .eq('id', requesterId)
            .single();

        if (reqError || !requesterProfile || requesterProfile.categoria !== 'owner') {
            throw new Error('No autorizado: solo el dueño puede modificar permisos de acceso');
        }

        // Sanitize: drop 'inherit' entries (NULL = inherit all is the default)
        const sanitized: Record<string, string> = {};
        for (const [key, value] of Object.entries(overrides)) {
            if (['read', 'edit', 'none'].includes(value)) {
                sanitized[key] = value;
            }
        }
        const overridesToStore = Object.keys(sanitized).length > 0 ? sanitized : null;

        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ access_overrides: overridesToStore })
            .eq('id', targetUserId);

        if (error) throw error;

        revalidatePath('/admin-users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}
