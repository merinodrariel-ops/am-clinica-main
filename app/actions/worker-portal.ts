'use server';

import { createClient } from '@/utils/supabase/server'; // Corrected import path
import { WorkerProfile, WorkLog, Achievement, WorkerAchievement } from '@/types/worker-portal';
import { revalidatePath } from 'next/cache';

const TableNames = {
    Profiles: 'personal', // Using the main personal table
    Logs: 'registro_horas', // Renamed to clinical table
    Achievements: 'achievements',
    WorkerAchievements: 'worker_achievements',
    Liquidations: 'liquidaciones_mensuales'
};


/**
 * Get the worker profile for the currently authenticated user
 */
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

/**
 * Get all worker profiles
 */
export async function getAllWorkers(): Promise<WorkerProfile[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .select('*')
        .order('nombre');

    if (error) {
        console.error('Error fetching workers:', error);
        return [];
    }

    return (data as WorkerProfile[]).map(p => ({
        ...p,
        full_name: `${p.nombre} ${p.apellido || ''}`.trim()
    }));
}

/**
 * Create or Update a worker profile
 */
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

/**
 * Upload a worker document (DNI, Contract, etc.)
 */
export async function uploadWorkerDocument(workerId: string, file: File, type: string) {
    const supabase = await createClient();

    const fileExt = file.name.split('.').pop();
    const fileName = `${workerId}/${type}_${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
        .from('personal-documents')
        .upload(filePath, file);

    if (uploadError) throw uploadError;

    // Get public URL or signed URL
    const { data: { publicUrl } } = supabase.storage
        .from('personal-documents')
        .getPublicUrl(filePath);

    // Update the worker profile documents JSONB
    const { data: worker, error: fetchError } = await supabase.from(TableNames.Profiles).select('documents').eq('id', workerId).single();
    if (fetchError) throw fetchError;

    const docs = worker?.documents || {};

    docs[type] = {
        url: publicUrl,
        uploaded_at: new Date().toISOString(),
        status: 'pending_review'
    };

    const { error: updateError } = await supabase
        .from(TableNames.Profiles)
        .update({ documents: docs })
        .eq('id', workerId);

    if (updateError) throw updateError;

    // Check for Compliance Master badge
    const requiredDocs = ['dni_frente', 'dni_dorso', 'licencia', 'poliza'];
    const hasAllDocs = requiredDocs.every(d => docs[d]?.url);

    if (hasAllDocs) {
        try {
            await awardAchievement(workerId, 'compliance_master');
        } catch (e) {
            console.error('Compliance badge awarding failed:', e);
        }
    }

    revalidatePath('/portal/profile');
    revalidatePath('/portal/dashboard');
    return { success: true, url: publicUrl };
}

/**
 * Get work logs for a specific worker
 */
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

    if (error) {
        console.error('Error fetching logs:', error);
        return [];
    }

    return data as WorkLog[];
}

/**
 * Log a new work entry (Shift, etc.)
 */
export async function logWorkEntry(entry: Partial<WorkLog>) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from(TableNames.Logs)
        .insert(entry)
        .select()
        .single();

    if (error) {
        console.error('Error logging work:', error);
        throw new Error(error.message);
    }

    revalidatePath('/portal/dashboard');
    return data as WorkLog;
}

/**
 * Get Achievements for a worker
 */
export async function getWorkerAchievements(personalId: string): Promise<WorkerAchievement[]> {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from(TableNames.WorkerAchievements)
        .select(`
            *,
            achievement:achievements(*)
        `)
        .eq('personal_id', personalId);

    if (error) {
        console.error('Error fetching achievements:', error);
        return [];
    }

    return data as any;
}

/**
 * Award an achievement to a worker
 */
export async function awardAchievement(personalId: string, achievementCode: string) {
    const supabase = await createClient();

    const { data: achievement, error: achError } = await supabase
        .from(TableNames.Achievements)
        .select('id')
        .eq('code', achievementCode)
        .single();

    if (achError || !achievement) throw new Error('Achievement not found');

    const { error } = await supabase
        .from(TableNames.WorkerAchievements)
        .insert({
            personal_id: personalId,
            achievement_id: achievement.id
        });

    if (error && error.code !== '23505') {
        console.error('Error awarding badge:', error);
        throw new Error(error.message);
    }

    revalidatePath('/portal/dashboard');
}

/**
 * Get Liquidation History for a worker
 */
export async function getWorkerLiquidations(personalId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from(TableNames.Liquidations)
        .select('*')
        .eq('personal_id', personalId)
        .order('mes', { ascending: false });

    if (error) {
        console.error('Error fetching liquidations:', error);
        return [];
    }

    return data;
}

/**
 * Calculate Monthly Stats
 */
export async function getWorkerMonthlyStats(personalId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const logs = await getWorkerLogs(personalId, startDate, endDate);

    // Simple calculation based on registro_horas
    const totalHours = logs.reduce((sum, log) => sum + Number(log.horas || 0), 0);
    const tasksCompleted = logs.length; // Each log entry counts as a task/shift for now

    return {
        total_earnings: 0, // Would need to fetch from liquidations_mensuales for accuracy
        hours_worked: totalHours,
        tasks_completed: tasksCompleted,
        period: `${year}-${month}`
    };
}
