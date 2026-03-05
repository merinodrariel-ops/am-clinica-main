import { createAdminClient } from '@/utils/supabase/admin';
const supabase = createAdminClient();
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

    // 1. Fetch data for the current period
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

    // 1.b Fetch Hours and Attendance for the current period
    const { data: hourRecords } = await supabase
        .from('registro_horas')
        .select('personal_id, horas, hora_ingreso, hora_egreso, fecha')
        .gte('fecha', startDate.split('T')[0])
        .lte('fecha', endDate.split('T')[0]);

    const { data: appointments } = await supabase
        .from('agenda_appointments')
        .select('doctor_id, status')
        .gte('start_time', startDate)
        .lte('end_time', endDate);

    // 2. Aggregate stats
    const userStats = new Map<string, {
        points: number;
        taskCount: number;
        slidesCount: number;
        onTimeCount: number;
        totalHours: number;
        daysWorked: number;
        earlyStarts: number;
        lateFinishes: number;
        attendedAppts: number;
        totalAppts: number;
    }>();

    profiles?.forEach((p: { id: string }) => {
        userStats.set(p.id, {
            points: 0,
            taskCount: 0,
            slidesCount: 0,
            onTimeCount: 0,
            totalHours: 0,
            daysWorked: 0,
            earlyStarts: 0,
            lateFinishes: 0,
            attendedAppts: 0,
            totalAppts: 0
        });
    });

    prestations?.forEach((p: { profesional_id: string }) => {
        const stats = userStats.get(p.profesional_id);
        if (stats) stats.points += 10;
    });

    hourRecords?.forEach((h: { personal_id: string; horas: number; hora_ingreso: string | null; hora_egreso: string | null }) => {
        const stats = userStats.get(h.personal_id);
        if (stats) {
            stats.totalHours += h.horas;
            stats.daysWorked++;
            // Proactivity checks (assuming standard 9 AM start and 6 PM finish)
            if (h.hora_ingreso && h.hora_ingreso < '08:55') stats.earlyStarts++;
            if (h.hora_egreso && h.hora_egreso > '18:05') stats.lateFinishes++;
        }
    });

    appointments?.forEach((a: { doctor_id: string | null; status: string }) => {
        if (!a.doctor_id) return;
        const stats = userStats.get(a.doctor_id);
        if (stats) {
            stats.totalAppts++;
            if (a.status === 'attended' || a.status === 'completed') stats.attendedAppts++;
        }
    });

    tasks?.forEach((t: { assigned_to_id: string | null; created_by: string; status: string; updated_at: string; due_date: string | null; title: string; description: string | null }) => {
        const userId = t.assigned_to_id || t.created_by;
        if (!userId) return;
        const stats = userStats.get(userId);
        if (!stats) return;

        stats.taskCount++;
        if (t.status === 'completed') {
            stats.points += 5;
            if (t.due_date && new Date(t.updated_at) <= new Date(t.due_date)) {
                stats.points += 10;
                stats.onTimeCount++;
            }
            if (t.title.toLowerCase().includes('slides') && t.description?.includes('https://')) {
                stats.points += 15;
                stats.slidesCount++;
            }
        }
    });

    // 3. Award Badges (Meritocratic)
    const leaderboard: LeaderboardEntry[] = Array.from(userStats.entries()).map(([id, stats]) => {
        const profile = profiles?.find((p: { id: string; nombre: string }) => p.id === id);
        const badges: string[] = [];

        // 1. Asistencia Perfecta: 100% attended, min 10 appts
        if (stats.totalAppts >= 10 && stats.attendedAppts === stats.totalAppts) {
            badges.push('Asistencia Perfecta');
        }

        // 2. Alto Rendimiento: > 170 hours
        if (stats.totalHours > 170) {
            badges.push('Alto Rendimiento');
        }

        // 3. Constancia: Worked > 20 days in the month
        if (stats.daysWorked >= 22) {
            badges.push('Constancia');
        }

        // 4. Proactividad: > 10 early starts or late finishes
        if ((stats.earlyStarts + stats.lateFinishes) >= 10) {
            badges.push('Proactividad');
        }

        // Keep legacy ones for points if needed, or replace them
        if (stats.slidesCount > 5 && stats.slidesCount >= (stats.taskCount * 0.8)) {
            badges.push('Master of Evidence');
        }

        return {
            profileId: id,
            name: profile?.nombre || 'Unknown',
            points: stats.points + (badges.length * 50), // Bonus points for badges
            badges
        };
    });

    return leaderboard.sort((a, b) => b.points - a.points);
}
