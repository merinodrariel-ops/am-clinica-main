export type PaymentModel = 'hourly' | 'commission' | 'fixed' | 'hybrid';

export type WorkerCategory = 'owner' | 'admin' | 'socio' | 'contador' | 'reception' | 'dentist' | 'odontologo' | 'assistant' | 'asistente' | 'technician' | 'laboratorio' | 'lab' | 'recaptacion' | 'cleaning' | 'marketing' | 'developer' | 'pricing_manager' | 'partner_viewer' | 'other';

export type WorkLogType = 'shift' | 'procedure' | 'task' | 'bonus' | 'deduction';

export type WorkLogStatus = 'pending' | 'approved' | 'paid' | 'rejected' | 'observado';

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';

export type GoalCategory = 'compliance' | 'attendance' | 'performance' | 'growth' | 'financial' | 'loyalty';

export interface WorkerProfile {
    id: string;
    user_id?: string;
    app_category?: string;
    empresa_prestadora_id?: string | null;
    empresa_prestadora_nombre?: string | null;
    nombre: string;
    apellido?: string;
    categoria: string;
    area?: string;
    tipo?: string;
    especialidad?: string;
    foto_url?: string;
    email?: string;
    whatsapp?: string;
    documento?: string;

    // Identity
    cuil?: string;

    // Location & Legal
    direccion?: string;
    barrio_localidad?: string;
    condicion_afip?: string;
    matricula_provincial?: string;

    // Financial Config
    valor_hora_ars?: number;
    porcentaje_honorarios?: number;
    pagado_mes_actual?: boolean;
    ultimo_pago_fecha?: string;
    ultimo_pago_monto?: number;
    monto_mensual?: number;
    datos_bancarios?: string;

    // UI/UX compatibility fields (mapping from personal table)
    full_name?: string; // Virtual field for UI

    // Documents (flat fields on the personal table)
    dni_frente_url?: string;
    dni_dorso_url?: string;
    poliza_url?: string;
    poliza_vencimiento?: string;
    documents?: Record<string, { url: string; uploaded_at: string; status: string }>; // JSONB

    // Billing mode: true = hourly rate, false = per-prestacion list
    cobra_por_horas?: boolean;
    modelo_pago?: 'horas' | 'prestaciones' | 'mensual' | null;

    status?: 'active' | 'inactive' | 'on_leave';
    activo?: boolean;
    fecha_ingreso?: string;

    sanciones_notas?: string;
    descripcion?: string;

    created_at?: string;
    updated_at?: string;
}

export interface EmpresaPrestadora {
    id: string;
    nombre: string;
    descripcion?: string | null;
    area_default?: string | null;
    activo: boolean;
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
    salida_dia_siguiente?: boolean;
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
    xp_reward?: number;
    rarity?: AchievementRarity;
    created_at?: string;
}

export interface WorkerAchievement {
    id: string;
    personal_id: string;
    achievement_id: string;
    awarded_at: string;
    achievement?: Achievement; // Joined data
}

export interface ProviderGoal {
    id: string;
    code: string;
    title: string;
    description?: string;
    category: GoalCategory;
    category_target?: string | null; // null = all categories
    target_value: number;
    unit: string; // 'count', 'hours', 'pesos', '%'
    xp_reward: number;
    icon: string;
    created_at?: string;
}

export interface GoalProgress {
    id: string;
    personal_id: string;
    goal_id: string;
    current_value: number;
    completed: boolean;
    completed_at?: string;
    goal?: ProviderGoal; // Joined
}

export interface Liquidation {
    id: string;
    personal_id: string;
    mes: string; // Date YYYY-MM-01
    total_horas?: number;
    valor_hora_snapshot?: number;
    total_ars?: number;
    tc_liquidacion?: number;
    total_usd?: number;
    estado: 'pending' | 'approved' | 'paid' | 'rejected';
    fecha_pago?: string;
    observaciones?: string;
    created_at: string;
}

export interface WorkerStats {
    total_earnings: number;
    hours_worked: number;
    tasks_completed: number;
    badges_earned: number;
    total_xp: number;
    period: string; // 'current_month' | 'last_month'
}
