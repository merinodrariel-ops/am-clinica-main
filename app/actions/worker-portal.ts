'use server';

import { createClient } from '@/lib/supabase/server'; // Adjust import path if needed
import { WorkerProfile, WorkLog, Achievement, WorkerAchievement } from '@/types/worker-portal';
import { revalidatePath } from 'next/cache';

const TableNames = {
    Profiles: 'worker_profiles',
    Logs: 'work_logs',
    Achievements: 'achievements',
    WorkerAchievements: 'worker_achievements'
};

/**
 * Get the worker profile for the currently authenticated user
 */
export async function getCurrentWorkerProfile(): Promise<WorkerProfile | null> {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) return null;

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
 * Get all worker profiles (Admin only usually, but RLS handles security)
 */
export async function getAllWorkers(): Promise<WorkerProfile[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .select('*')
        .order('full_name');

    if (error) {
        console.error('Error fetching workers:', error);
        return [];
    }

    return data as WorkerProfile[];
}

/**
 * Create or Update a worker profile
 */
export async function upsertWorkerProfile(profile: Partial<WorkerProfile>) {
    const supabase = createClient();

    // Remove undefined fields to avoid overwriting with null
    const cleanProfile = Object.fromEntries(
        Object.entries(profile).filter(([_, v]) => v !== undefined)
    );

    const { data, error } = await supabase
        .from(TableNames.Profiles)
        .upsert(cleanProfile)
        .select()
        .single();

    if (error) {
        console.error('Error upserting worker:', error);
        throw new Error(error.message);
    }

    revalidatePath('/portal');
    return data as WorkerProfile;
}

/**
 * Get work logs for a specific worker
 */
export async function getWorkerLogs(workerId: string, startDate?: string, endDate?: string): Promise<WorkLog[]> {
    const supabase = createClient();

    let query = supabase
        .from(TableNames.Logs)
        .select('*')
        .eq('worker_id', workerId)
        .order('date', { ascending: false });

    if (startDate) query = query.gte('date', startDate);
    if (endDate) query = query.lte('date', endDate);

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching logs:', error);
        return [];
    }

    return data as WorkLog[];
}

/**
 * Log a new work entry (Shift, Procedure, etc.)
 */
export async function logWorkEntry(entry: Partial<WorkLog>) {
    const supabase = createClient();

    const { data, error } = await supabase
        .from(TableNames.Logs)
        .insert(entry)
        .select()
        .single();

    if (error) {
        console.error('Error logging work:', error);
        throw new Error(error.message);
    }

    revalidatePath('/portal');
    revalidatePath('/admin/staff/liquidation');
    return data as WorkLog;
}

/**
 * Get Achievements for a worker
 */
export async function getWorkerAchievements(workerId: string): Promise<WorkerAchievement[]> {
    const supabase = createClient();

    const { data, error } = await supabase
        .from(TableNames.WorkerAchievements)
        .select(`
            *,
            achievement:achievements(*)
        `)
        .eq('worker_id', workerId);

    if (error) {
        console.error('Error fetching achievements:', error);
        return [];
    }

    // Map nested data to match interface if needed, relying on Supabase join structure for now
    return data as any;
}

/**
 * Award an achievement to a worker
 */
export async function awardAchievement(workerId: string, achievementCode: string) {
    const supabase = createClient();

    // 1. Get Achievement ID
    const { data: achievement, error: achError } = await supabase
        .from(TableNames.Achievements)
        .select('id')
        .eq('code', achievementCode)
        .single();

    if (achError || !achievement) throw new Error('Achievement not found');

    // 2. Insert Record
    const { error } = await supabase
        .from(TableNames.WorkerAchievements)
        .insert({
            worker_id: workerId,
            achievement_id: achievement.id
        });

    if (error) {
        // Ignore duplicate key error (already awarded)
        if (error.code !== '23505') {
            console.error('Error awarding badge:', error);
            throw new Error(error.message);
        }
    }

    revalidatePath('/portal/dashboard');
}

/**
 * Calculate Monthly Stats (Simple Aggregation)
 */
export async function getWorkerMonthlyStats(workerId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const logs = await getWorkerLogs(workerId, startDate, endDate);

    const totalEarnings = logs.reduce((sum, log) => sum + (log.amount_calculated || 0), 0);
    const totalMinutes = logs
        .filter(l => l.type === 'shift')
        .reduce((sum, log) => sum + (log.duration_minutes || 0), 0);

    const tasksCompleted = logs.filter(l => l.type === 'task' || l.type === 'procedure').length;

    return {
        total_earnings: totalEarnings,
        hours_worked: Math.round(totalMinutes / 60 * 10) / 10,
        tasks_completed: tasksCompleted,
        period: `${year}-${month}`
    };
}
