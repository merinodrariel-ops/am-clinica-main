export type PaymentModel = 'hourly' | 'commission' | 'fixed' | 'hybrid';

export type WorkerRole = 'dentist' | 'assistant' | 'technician' | 'cleaning' | 'admin' | 'reception' | 'other';

export type WorkLogType = 'shift' | 'procedure' | 'task' | 'bonus' | 'deduction';

export type WorkLogStatus = 'pending' | 'approved' | 'paid' | 'rejected';

export interface WorkerProfile {
    id: string;
    user_id?: string;
    full_name: string;
    role: WorkerRole;
    specialty?: string;
    photo_url?: string;

    // Financial Config
    payment_model: PaymentModel;
    hourly_rate?: number;
    commission_percentage?: number;
    fixed_salary?: number;

    status: 'active' | 'inactive' | 'on_leave';
    hire_date: string;

    created_at: string;
    updated_at: string;
}

export interface WorkLog {
    id: string;
    worker_id: string;
    date: string; // ISO Date YYYY-MM-DD
    type: WorkLogType;

    reference_id?: string;
    description?: string;

    duration_minutes?: number;
    amount_calculated?: number;

    status: WorkLogStatus;

    created_at: string;
    updated_at: string;
}

export interface Achievement {
    id: string;
    code: string;
    name: string;
    description: string;
    icon_url?: string;
    category: string;
}

export interface WorkerAchievement {
    id: string;
    worker_id: string;
    achievement_id: string;
    awarded_at: string;
    achievement?: Achievement; // Joined data
}

export interface WorkerStats {
    total_earnings: number;
    hours_worked: number;
    tasks_completed: number;
    badges_earned: number;
    period: string; // 'current_month' | 'last_month'
}
