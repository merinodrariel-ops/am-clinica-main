'use server';

import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { WorkerProfile, WorkLog, Achievement, WorkerAchievement, ProviderGoal, GoalProgress, Liquidation } from '@/types/worker-portal';
import { revalidatePath } from 'next/cache';
import { sendInvitationEmail } from '@/lib/emailjs';

// Service-role client for admin operations that bypass RLS
function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
}

const LOCKED_FIELDS = ['documento', 'matricula_provincial', 'poliza_url'] as const;

const TableNames = {
    Profiles: 'personal',
    Logs: 'registro_horas',
    Achievements: 'achievements',
    WorkerAchievements: 'worker_achievements',
    Liquidations: 'liquidaciones_mensuales',
    Goals: 'provider_goals',
    GoalProgress: 'personal_goal_progress',
};

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE
// ─────────────────────────────────────────────────────────────────────────────

export async function getCurrentWorkerProfile(): Promise<WorkerProfile | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .select('*')
        .eq('user_id', user.id)
        .single();

    if (error) {
        console.error('Error fetching worker profile:', error);
        return null;
    }
    return data as WorkerProfile;
}

export async function getUserAppProfile(): Promise<{ role: string | null } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    return profile;
}

export async function getAppUsers(): Promise<{ id: string, full_name: string, email: string, role: string }[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name');

    if (error) {
        console.error('Error fetching app users:', error);
        return [];
    }
    return data || [];
}

export async function getAllWorkers(): Promise<WorkerProfile[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .select('*')
        .order('nombre');

    if (error) { console.error('Error fetching workers:', error); return []; }

    return (data as WorkerProfile[]).map(p => ({
        ...p,
        full_name: `${p.nombre} ${p.apellido || ''}`.trim()
    }));
}

export async function getWorkerById(id: string): Promise<WorkerProfile | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .select('*')
        .eq('id', id)
        .single();

    if (error) return null;
    return data as WorkerProfile;
}

export async function upsertWorkerProfile(profile: Partial<WorkerProfile>) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .upsert(profile)
        .select()
        .single();

    if (error) throw error;
    revalidatePath('/portal/profile');
    return data as WorkerProfile;
}

export async function uploadWorkerDocument(workerId: string, file: File, type: string) {
    const supabase = await createClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `${workerId}/${type}_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('personal-documents')
        .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
        .from('personal-documents')
        .getPublicUrl(fileName);

    // Update the JSONB documents column
    const { data: worker, error: fetchError } = await supabase
        .from(TableNames.Profiles).select('documents').eq('id', workerId).single();
    if (fetchError) throw fetchError;

    const docs = (worker?.documents as Record<string, any>) || {};
    docs[type] = { url: publicUrl, uploaded_at: new Date().toISOString(), status: 'pending_review' };

    const { error: updateError } = await supabase
        .from(TableNames.Profiles)
        .update({ documents: docs })
        .eq('id', workerId);

    if (updateError) throw updateError;

    // Auto-award Compliance Master if all required docs present
    const requiredDocs = ['dni_frente', 'dni_dorso', 'licencia', 'poliza'];
    const hasAllDocs = requiredDocs.every(d => docs[d]?.url);
    if (hasAllDocs) {
        try { await awardAchievement(workerId, 'compliance_master'); } catch { /* already earned */ }
    }

    // Update compliance goal progress
    const docCount = Object.keys(docs).length;
    await updateGoalProgressByCode(workerId, 'upload_dni', docCount >= 2 ? 1 : 0);

    revalidatePath('/portal/dashboard');
    return { success: true, url: publicUrl };
}

export async function uploadWorkerPhoto(workerId: string, file: File) {
    const supabase = await createClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `${workerId}/profile_${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
        .from('personal-documents')
        .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
        .from('personal-documents')
        .getPublicUrl(fileName);

    const { error: updateError } = await supabase
        .from(TableNames.Profiles)
        .update({ foto_url: publicUrl })
        .eq('id', workerId);

    if (updateError) throw updateError;

    revalidatePath('/portal/profile');
    revalidatePath('/admin/staff');
    revalidatePath(`/admin/staff/${workerId}`);
    return { success: true, url: publicUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// WORK LOGS
// ─────────────────────────────────────────────────────────────────────────────

export async function getWorkerLogs(personalId: string, startDate?: string, endDate?: string): Promise<WorkLog[]> {
    const supabase = await createClient();

    let query = supabase
        .from(TableNames.Logs)
        .select('*')
        .eq('personal_id', personalId)
        .order('fecha', { ascending: false });

    if (startDate) query = query.gte('fecha', startDate);
    if (endDate) query = query.lte('fecha', endDate);

    const { data, error } = await query;
    if (error) { console.error('Error fetching logs:', error); return []; }
    return data as WorkLog[];
}

export async function logWorkEntry(entry: Partial<WorkLog>) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Logs)
        .insert(entry)
        .select()
        .single();

    if (error) throw new Error(error.message);

    revalidatePath('/portal/dashboard');
    return data as WorkLog;
}

// ─────────────────────────────────────────────────────────────────────────────
// ACHIEVEMENTS
// ─────────────────────────────────────────────────────────────────────────────

export async function getWorkerAchievements(personalId: string): Promise<WorkerAchievement[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.WorkerAchievements)
        .select(`*, achievement:achievements(*)`)
        .eq('personal_id', personalId);

    if (error) { console.error('Error fetching achievements:', error); return []; }
    return data as any;
}

export async function awardAchievement(personalId: string, achievementCode: string) {
    const supabase = await createClient();

    const { data: achievement, error: achError } = await supabase
        .from(TableNames.Achievements)
        .select('id')
        .eq('code', achievementCode)
        .single();

    if (achError || !achievement) throw new Error('Achievement not found: ' + achievementCode);

    const { error } = await supabase
        .from(TableNames.WorkerAchievements)
        .insert({ personal_id: personalId, achievement_id: achievement.id });

    // Ignore duplicate error (23505)
    if (error && error.code !== '23505') throw new Error(error.message);

    revalidatePath('/portal/dashboard');
    revalidatePath('/portal/medals');
}

export async function getWorkerXP(personalId: string): Promise<number> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from(TableNames.WorkerAchievements)
        .select(`achievement:achievements(xp_reward)`)
        .eq('personal_id', personalId);

    if (error || !data) return 0;

    return data.reduce((sum, wa: any) => sum + (wa.achievement?.xp_reward || 0), 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────────────────────

export async function getAllGoals(workerRole?: string): Promise<ProviderGoal[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from(TableNames.Goals)
        .select('*')
        .order('category');

    if (error) { console.error('Error fetching goals:', error); return []; }

    // Filter by role: include goals for this role or goals for all roles (role_target is null)
    const goals = data as ProviderGoal[];
    if (!workerRole) return goals;
    return goals.filter(g => !g.role_target || g.role_target === workerRole);
}

export async function getGoalProgress(personalId: string): Promise<GoalProgress[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from(TableNames.GoalProgress)
        .select(`*, goal:provider_goals(*)`)
        .eq('personal_id', personalId);

    if (error) { console.error('Error fetching goal progress:', error); return []; }
    return data as any;
}

export async function updateGoalProgressByCode(personalId: string, goalCode: string, newValue: number) {
    const supabase = await createClient();

    const { data: goal } = await supabase
        .from(TableNames.Goals)
        .select('id, target_value, xp_reward, code')
        .eq('code', goalCode)
        .single();

    if (!goal) return;

    const isCompleted = newValue >= goal.target_value;

    const { data: existing } = await supabase
        .from(TableNames.GoalProgress)
        .select('id, completed')
        .eq('personal_id', personalId)
        .eq('goal_id', goal.id)
        .single();

    if (existing) {
        // Update only if not already completed
        if (!existing.completed) {
            await supabase.from(TableNames.GoalProgress).update({
                current_value: newValue,
                completed: isCompleted,
                completed_at: isCompleted ? new Date().toISOString() : null,
                updated_at: new Date().toISOString(),
            }).eq('id', existing.id);
        }
    } else {
        await supabase.from(TableNames.GoalProgress).insert({
            personal_id: personalId,
            goal_id: goal.id,
            current_value: newValue,
            completed: isCompleted,
            completed_at: isCompleted ? new Date().toISOString() : null,
        });
    }

    revalidatePath('/portal/goals');
    revalidatePath('/portal/dashboard');
}

// ─────────────────────────────────────────────────────────────────────────────
// LIQUIDATIONS
// ─────────────────────────────────────────────────────────────────────────────

function normalizeLiquidacionEstado(raw: string | null | undefined): Liquidation['estado'] {
    const value = (raw || '').toLowerCase();
    if (value === 'approved' || value === 'aprobado') return 'approved';
    if (value === 'paid' || value === 'pagado') return 'paid';
    if (value === 'rejected' || value === 'anulado' || value === 'rechazado') return 'rejected';
    return 'pending';
}

export async function getWorkerLiquidations(personalId: string): Promise<Liquidation[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Liquidations)
        .select('*')
        .eq('personal_id', personalId)
        .order('mes', { ascending: false });

    if (error) { console.error('Error fetching liquidations:', error); return []; }

    return (data || []).map((row: Record<string, unknown>) => ({
        ...row,
        estado: normalizeLiquidacionEstado(row.estado as string | null | undefined),
    })) as Liquidation[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY STATS
// ─────────────────────────────────────────────────────────────────────────────

export async function getWorkerMonthlyStats(personalId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const [logs, achievements] = await Promise.all([
        getWorkerLogs(personalId, startDate, endDate),
        getWorkerAchievements(personalId),
    ]);

    const totalHours = logs.reduce((sum, log) => sum + Number(log.horas || 0), 0);
    const totalXP = achievements.reduce((sum, wa: any) => sum + (wa.achievement?.xp_reward || 0), 0);

    return {
        total_earnings: 0, // real value from liquidaciones
        hours_worked: totalHours,
        tasks_completed: logs.length,
        badges_earned: achievements.length,
        total_xp: totalXP,
        period: `${year}-${month}`,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKER CREATION (Admin only)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateWorkerInput {
    nombre: string;
    apellido?: string;
    rol: string;
    area?: string;
    tipo?: 'prestador' | 'profesional';
    email?: string;
    whatsapp?: string;
    documento?: string;
    condicion_afip?: string;
    valor_hora_ars?: number;
    porcentaje_honorarios?: number;
    fecha_ingreso?: string;
    especialidad?: string;
}

/** Create personal record only — no app access */
export async function createWorkerNoAccess(data: CreateWorkerInput): Promise<WorkerProfile> {
    const admin = getAdminClient();
    // DB CHECK constraint only allows 'empleado' | 'profesional'; map 'prestador' → 'empleado'
    const dbTipo = data.tipo === 'profesional' ? 'profesional' : 'empleado';
    const { data: record, error } = await admin
        .from('personal')
        .insert({
            nombre: data.nombre,
            apellido: data.apellido || null,
            rol: data.rol,
            area: data.area || 'general',
            tipo: dbTipo,
            email: data.email || null,
            whatsapp: data.whatsapp || null,
            documento: data.documento || null,
            condicion_afip: data.condicion_afip || null,
            valor_hora_ars: data.valor_hora_ars || 0,
            porcentaje_honorarios: data.porcentaje_honorarios || 0,
            fecha_ingreso: data.fecha_ingreso || new Date().toISOString().split('T')[0],
            especialidad: data.especialidad || null,
            activo: true,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    revalidatePath('/admin/staff');
    return record as WorkerProfile;
}

/** Create personal record AND send an invite email via Supabase auth */
export async function createWorkerWithInvite(data: CreateWorkerInput): Promise<WorkerProfile> {
    if (!data.email) throw new Error('Email requerido para dar acceso al portal');

    const adminSupabase = getAdminClient();

    // Map business tipo → auth role and DB tipo
    const authRole = data.tipo === 'profesional' ? 'odontologo' : 'asistente';
    const dbTipo = data.tipo === 'profesional' ? 'profesional' : 'empleado';

    // 1. Generate invite link via Supabase Auth admin
    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: 'invite',
        email: data.email,
        options: {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/auth/callback?next=/auth/update-password`,
            data: {
                full_name: `${data.nombre} ${data.apellido || ''}`.trim(),
                role: authRole,
            },
        },
    });

    if (linkError) throw new Error(linkError.message);

    const userId = linkData.user?.id;
    const actionLink = linkData.properties?.action_link;

    // 2. Send invitation email (non-blocking — worker is created even if email fails)
    if (actionLink) {
        const emailResult = await sendInvitationEmail({
            to_name: `${data.nombre} ${data.apellido || ''}`.trim(),
            to_email: data.email,
            action_link: actionLink,
        });
        if (!emailResult.success) {
            console.error('Invitation email failed:', emailResult.error);
            // Don't throw — auth user + personal record are created; admin can resend later
        }
    }

    // 3. Upsert profile (trigger may have already created it)
    await adminSupabase.from('profiles').upsert({
        id: userId,
        email: data.email,
        full_name: `${data.nombre} ${data.apellido || ''}`.trim(),
        role: authRole,
        estado: 'invitado',
        invitation_sent_at: new Date().toISOString(),
    });

    // 4. Insert personal record linked to auth user (new invite = new user, no conflict expected)
    const { data: record, error: personalError } = await adminSupabase
        .from('personal')
        .insert({
            user_id: userId,
            nombre: data.nombre,
            apellido: data.apellido || null,
            rol: data.rol,
            area: data.area || 'general',
            tipo: dbTipo,
            email: data.email,
            whatsapp: data.whatsapp || null,
            documento: data.documento || null,
            condicion_afip: data.condicion_afip || null,
            valor_hora_ars: data.valor_hora_ars || 0,
            porcentaje_honorarios: data.porcentaje_honorarios || 0,
            fecha_ingreso: data.fecha_ingreso || new Date().toISOString().split('T')[0],
            especialidad: data.especialidad || null,
            activo: true,
        })
        .select()
        .single();

    if (personalError) throw new Error(personalError.message);
    revalidatePath('/admin/staff');
    return record as WorkerProfile;
}

/** Send (or resend) portal access invite to an existing personal record */
export async function sendAccessInvite(workerId: string): Promise<void> {
    const adminSupabase = getAdminClient();

    const { data: worker, error: fetchError } = await adminSupabase
        .from('personal')
        .select('*')
        .eq('id', workerId)
        .single();

    if (fetchError || !worker) throw new Error('Prestador no encontrado');
    if (!worker.email) throw new Error('El prestador no tiene email registrado');

    const authRole = worker.tipo === 'profesional' ? 'odontologo' : 'asistente';

    const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
        type: 'invite',
        email: worker.email,
        options: {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || ''}/auth/callback?next=/auth/update-password`,
            data: {
                full_name: `${worker.nombre} ${worker.apellido || ''}`.trim(),
                role: authRole,
            },
        },
    });

    if (linkError) throw new Error(linkError.message);

    const actionLink = linkData.properties?.action_link;
    if (actionLink) {
        const emailResult = await sendInvitationEmail({
            to_name: `${worker.nombre} ${worker.apellido || ''}`.trim(),
            to_email: worker.email,
            action_link: actionLink,
        });
        if (!emailResult.success) {
            // Surface the real Resend error so admin can see it
            throw new Error(`Invitación creada pero el email falló: ${emailResult.error}`);
        }
    }

    revalidatePath('/admin/staff');
}

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE SELF-UPDATE (Prestador — with field locking)
// ─────────────────────────────────────────────────────────────────────────────

export async function updateOwnProfile(data: Partial<WorkerProfile>): Promise<void> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    // Fetch current record to check locked fields
    const { data: current, error: fetchError } = await supabase
        .from('personal')
        .select('documento, foto_url, matricula_provincial, poliza_url')
        .eq('user_id', user.id)
        .single();

    if (fetchError || !current) throw new Error('Perfil no encontrado');

    // Enforce locked fields
    for (const field of LOCKED_FIELDS) {
        if (data[field as keyof WorkerProfile] !== undefined && current[field]) {
            throw new Error(
                `El campo no puede modificarse una vez registrado. Contactá a administración.`
            );
        }
    }

    // Remove admin-only fields (safety net)
    const safeData = { ...data };
    delete (safeData as any).user_id;
    delete (safeData as any).valor_hora_ars;
    delete (safeData as any).porcentaje_honorarios;
    delete (safeData as any).pagado_mes_actual;
    delete (safeData as any).activo;

    const { error } = await supabase
        .from('personal')
        .update(safeData)
        .eq('user_id', user.id);

    if (error) throw new Error(error.message);
    revalidatePath('/portal/profile');
    revalidatePath('/portal/dashboard');
}

/**
 * ADMIN ONLY update action that bypasses field locking.
 */
export async function updateWorkerProfileAdmin(workerId: string, data: Partial<WorkerProfile>): Promise<void> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('No autenticado');

    // Role check - Check app profiles instead of personal records
    const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    if (!profile || !['admin', 'owner'].includes(profile.role || '')) {
        throw new Error('Acceso denegado: Se requieren permisos de administrador o dueño');
    }

    // Prepare data for personal update
    const cleanData = { ...data };
    const requestedAppRole = typeof cleanData.app_role === 'string' && cleanData.app_role.trim().length > 0
        ? cleanData.app_role.trim()
        : null;

    // If frontend sends empty string, persist NULL in personal.user_id
    if (cleanData.user_id === '') {
        cleanData.user_id = undefined;
    }

    delete (cleanData as any).full_name; // Computed or handled elsewhere
    delete (cleanData as any).app_role;

    // Resolve current linked auth user (before/after potential relink)
    const { data: currentWorker, error: currentWorkerError } = await supabase
        .from('personal')
        .select('user_id')
        .eq('id', workerId)
        .single();

    if (currentWorkerError) throw new Error(currentWorkerError.message);

    const { error } = await supabase
        .from('personal')
        .update(cleanData)
        .eq('id', workerId);

    if (error) throw new Error(error.message);

    if (requestedAppRole) {
        const targetUserId = (data.user_id && data.user_id.trim().length > 0)
            ? data.user_id
            : (currentWorker?.user_id || null);

        if (!targetUserId) {
            throw new Error('No se pudo actualizar el rol de app: el prestador no está vinculado a un usuario.');
        }

        const admin = getAdminClient();

        const { error: profileRoleError } = await admin
            .from('profiles')
            .update({ role: requestedAppRole })
            .eq('id', targetUserId);

        if (profileRoleError) throw new Error(profileRoleError.message);

        const { data: authUserData, error: getAuthUserError } = await admin.auth.admin.getUserById(targetUserId);
        if (getAuthUserError) throw new Error(getAuthUserError.message);

        const nextMetadata = {
            ...(authUserData.user?.user_metadata || {}),
            role: requestedAppRole,
        };

        const { error: authRoleError } = await admin.auth.admin.updateUserById(targetUserId, {
            user_metadata: nextMetadata,
        });

        if (authRoleError) throw new Error(authRoleError.message);
    }

    revalidatePath('/admin/staff');
    revalidatePath(`/admin/staff/${workerId}`);
    revalidatePath('/portal/profile');
    revalidatePath('/portal/dashboard');
}
