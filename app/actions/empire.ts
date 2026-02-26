'use server';


import { calculateDoctorLiquidation } from '@/lib/empire-engine/liquidator';
import { calculateMonthlyLeaderboard } from '@/lib/empire-engine/gamification';

export async function getMyLiquidation(providerId: string, monthStr?: string) {
    const period = monthStr
        ? { year: parseInt(monthStr.split('-')[0]), month: parseInt(monthStr.split('-')[1]) }
        : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    try {
        return await calculateDoctorLiquidation(providerId, period);
    } catch (e) {
        console.error('Error in getMyLiquidation:', e);
        return null;
    }
}

export async function getEmpireLeaderboard(monthStr?: string) {
    const period = monthStr
        ? { year: parseInt(monthStr.split('-')[0]), month: parseInt(monthStr.split('-')[1]) }
        : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };

    try {
        return await calculateMonthlyLeaderboard(period);
    } catch (e) {
        console.error('Error in getEmpireLeaderboard:', e);
        return [];
    }
}
