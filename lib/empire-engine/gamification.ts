import { supabase } from '../supabase';
import { LiquidationPeriod } from './types';

export interface LeaderboardEntry {
    profileId: string;
    name: string;
    points: number;
    badges: string[];
    rank?: number;
}

export async function calculateMonthlyLeaderboard(period: LiquidationPeriod): Promise<LeaderboardEntry[]> {
    const startDate = new Date(period.year, period.month - 1, 1).toISOString();
    const endDate = new Date(period.year, period.month, 0, 23, 59, 59).toISOString();

    // 1. Fetch all prestations and tasks for all users
    const { data: prestations } = await supabase
        .from('prestaciones_realizadas')
        .select('profesional_id, id')
        .gte('fecha', startDate)
        .lte('fecha', endDate);

    const { data: tasks } = await supabase
        .from('todos')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

    const { data: profiles } = await supabase
        .from('personal')
        .select('id, nombre');

    // 2. Aggregate points
    const userStats = new Map<string, { points: number; taskCount: number; slidesCount: number; onTimeCount: number }>();

    profiles?.forEach(p => {
        userStats.set(p.id, { points: 0, taskCount: 0, slidesCount: 0, onTimeCount: 0 });
    });

    prestations?.forEach(p => {
        const stats = userStats.get(p.profesional_id);
        if (stats) stats.points += 10; // 10 pts per prestation
    });

    tasks?.forEach(t => {
        const userId = t.assigned_to_id || t.created_by;
        if (!userId) return;
        const stats = userStats.get(userId);
        if (!stats) return;

        stats.taskCount++;
        if (t.status === 'completed') {
            stats.points += 5;
            // Check if on time
            if (t.due_date && new Date(t.updated_at) <= new Date(t.due_date)) {
                stats.points += 10;
                stats.onTimeCount++;
            }
            // Check if slides
            if (t.title.toLowerCase().includes('slides') && t.description?.includes('https://')) {
                stats.points += 15;
                stats.slidesCount++;
            }
        }
    });

    // 3. Award Badges and Build Leaderboard
    const leaderboard: LeaderboardEntry[] = Array.from(userStats.entries()).map(([id, stats]) => {
        const profile = profiles?.find(p => p.id === id);
        const badges: string[] = [];

        if (stats.slidesCount > 5 && stats.slidesCount >= (stats.taskCount * 0.8)) {
            badges.push('Master of Evidence');
        }
        if (stats.onTimeCount > 0 && stats.onTimeCount === stats.taskCount) {
            badges.push('Swiss Clock');
        }
        if (stats.taskCount > 20) {
            badges.push('Reception Ninja');
        }

        return {
            profileId: id,
            name: profile?.nombre || 'Unknown',
            points: stats.points,
            badges
        };
    });

    return leaderboard.sort((a, b) => b.points - a.points);
}
