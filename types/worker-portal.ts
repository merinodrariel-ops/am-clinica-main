export type PaymentModel = 'hourly' | 'commission' | 'fixed' | 'hybrid';

export type WorkerRole = 'dentist' | 'assistant' | 'technician' | 'cleaning' | 'admin' | 'reception' | 'other';

export type WorkLogType = 'shift' | 'procedure' | 'task' | 'bonus' | 'deduction';

export type WorkLogStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'observado';

export interface WorkerProfile {
    id: string;
    user_id?: string;
    nombre: string;
    apellido?: string;
    rol: string;
    especialidad?: string;
    foto_url?: string;
    email?: string;
    whatsapp?: string;
    documento?: string;

    // Financial Config
    valor_hora_ars?: number;
    porcentaje_honorarios?: number;

    // UI/UX compatibility fields (mapping from personal table)
    full_name?: string; // Virtual field for UI

    // Documents
    dni_frente_url?: string;
    dni_dorso_url?: string;
    poliza_url?: string;
    poliza_vencimiento?: string;
    documents?: any[]; // JSONB array for extra docs

    status?: 'active' | 'inactive' | 'on_leave';
    fecha_ingreso?: string;

    sanciones_notas?: string;

    created_at?: string;
    updated_at?: string;
}

export interface WorkLog {
    id: string;
    personal_id: string;
    fecha: string; // ISO Date YYYY-MM-DD
    horas: number;

    type?: WorkLogType; // Virtual or mapped from category

    observaciones?: string;
    estado: WorkLogStatus;

    hora_ingreso?: string;
    hora_egreso?: string;
    evidencia_url?: string;

    created_at: string;
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
    personal_id: string;
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
