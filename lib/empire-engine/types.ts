export interface LiquidationPeriod {
    month: number; // 1-12
    year: number;
}

export interface DoctorLiquidation {
    providerId: string;
    totalUsd: number;
    totalArs: number;
    exchangeRate: number;
    performances: PerformanceItem[];
    status: 'PENDING_TASKS' | 'READY' | 'PAID';
}

export interface PerformanceItem {
    id: string;
    date: string;
    patientName: string;
    treatmentName: string;
    usdValue: number;
    hasSlidesUrl: boolean;
    slidesUrl?: string;
    isTaskDone: boolean;
}

export interface StaffLiquidation {
    staffId: string;
    totalHours: number;
    hourlyRateArs: number;
    totalArs: number;
    period: LiquidationPeriod;
}
