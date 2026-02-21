'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { sendInvitationEmail } from '@/lib/emailjs';

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
    role?: string;
    telefono?: string;
    estado?: string;
    invitation_sent_at?: string;
    [key: string]: unknown; // Allow other props for now to be safe
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
                role: profile.role || 'user',
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
    const role = formData.get('role') as string;
    const telefono = formData.get('telefono') as string;

    const publicUrl = getAppPublicUrl();

    try {
        // 1. Generate Invite Link (Manual)
        const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
            type: 'invite',
            email: email,
            options: {
                data: { full_name: fullName, role: role },
                redirectTo: `${publicUrl}/auth/update-password`
            }
        });

        if (linkError) throw linkError;
        if (!linkData.user) throw new Error('No user created');

        // 2. Send Custom Email via EmailJS
        const emailResult = await sendInvitationEmail({
            to_email: email,
            to_name: fullName,
            action_link: linkData.properties.action_link
        });

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
                role: role,
                telefono: telefono,
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
    telefono?: string;
    role?: string;
}

export async function updateUser(userId: string, data: UpdateUserData) {
    try {
        // Update Profile
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({
                full_name: data.full_name,
                telefono: data.telefono,
                role: data.role,
                // Support status update manually
            })
            .eq('id', userId);

        if (error) throw error;

        // Also update Auth Metadata if needed for consistency
        if (data.role || data.full_name) {
            await supabaseAdmin.auth.admin.updateUserById(userId, {
                user_metadata: {
                    role: data.role,
                    full_name: data.full_name
                }
            });
        }

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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

        if (reqError || requestorProfile.role !== 'owner') {
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
                redirectTo: `${publicUrl}/auth/update-password`
            }
        });

        if (linkError) throw linkError;

        const emailRes = await sendInvitationEmail({
            to_email: targetUser.email!,
            to_name: targetUser.user_metadata?.full_name || 'Usuario',
            action_link: linkData.properties.action_link
        });

        if (!emailRes.success) throw new Error(`Email failed: ${emailRes.error}`);

        actionType = linkType === 'invite' ? 'resend_invite' : 'send_reset_password';

        // 4. Audit Log
        await supabaseAdmin.from('audit_logs').insert({
            user_id: ownerId,
            user_email: requestorProfile.email,
            role: 'owner',
            action: 'resend_access_email',
            table_name: 'profiles',
            record_id: userId,
            metadata: {
                target_email: targetUser.email,
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
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${getAppPublicUrl()}/auth/update-password`
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

        if (reqError || !['owner', 'admin'].includes(requestorProfile.role)) {
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
            role: requestorProfile.role,
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
