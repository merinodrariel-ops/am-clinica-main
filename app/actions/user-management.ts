'use server';

import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

// Initialize Admin Client securely
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
    : {} as any;

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
        const mergedUsers = profiles.map((profile: any) => {
            const authUser = users.find((u: any) => u.id === profile.id);
            return {
                ...profile,
                email: authUser?.email || profile.email, // Fallback
                last_sign_in_at: authUser?.last_sign_in_at,
                created_at: authUser?.created_at || profile.created_at,
                // If status is 'invitado' but they have signed in, arguably they are 'activo'
                // But we'll respect the profile status mostly.
                // Auto-fix: If 'invitado' and last_sign_in exists -> set active?
                // Let's leave that logic for now.
            };
        });

        return { success: true, data: mergedUsers };
    } catch (error: any) {
        console.error('Error fetching users:', error);
        return { success: false, error: error.message };
    }
}

export async function inviteUser(formData: FormData) {
    const email = formData.get('email') as string;
    const fullName = formData.get('fullName') as string;
    const role = formData.get('role') as string;
    const telefono = formData.get('telefono') as string;

    try {
        // 1. Invite via Supabase Auth
        const { data: authData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
            data: {
                full_name: fullName,
                role: role,
            },
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password` // Redirect to set password
        });

        if (inviteError) throw inviteError;

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
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function resendInvitation(email: string) {
    try {
        // Just calling invite again resends the email for unconfirmed users
        const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
        if (error) throw error;

        // Update timestamp
        // Need to find ID first or update by email (profiles has email)
        await supabaseAdmin.from('profiles')
            .update({ invitation_sent_at: new Date().toISOString() })
            .eq('email', email);

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function updateUser(userId: string, data: any) {
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
    } catch (error: any) {
        return { success: false, error: error.message };
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
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function resetUserPassword(email: string) {
    try {
        // Send recovery email
        const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`
        });

        if (error) throw error;
        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
