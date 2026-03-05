// ─── Recall Engine Types & Constants ──────────────────────────────────────────
// Separate file because 'use server' files can only export async functions.

export type RecallType =
    | 'limpieza'
    | 'botox'
    | 'control_carillas'
    | 'blanqueamiento'
    | 'control_ortodoncia'
    | 'mantenimiento_implantes'
    | 'otro';

export type RecallState =
    | 'pending_contact'
    | 'contacted'
    | 'scheduled'
    | 'completed'
    | 'snoozed'
    | 'not_applicable';

export interface RecallRule {
    id: string;
    patient_id: string;
    recall_type: RecallType;
    custom_label: string | null;
    interval_months: number;
    window_days: number;
    state: RecallState;
    priority: number;
    last_completed_at: string | null;
    next_due_date: string | null;
    visible_from: string | null;
    snoozed_until: string | null;
    linked_appointment_id: string | null;
    contact_channels: string[];
    assigned_to: string | null;
    notes: string | null;
    is_active: boolean;
    created_at: string;
    created_by: string | null;
    updated_at: string;
    updated_by: string | null;
    // Joined
    patient?: {
        id_paciente: string;
        nombre: string;
        apellido: string;
        whatsapp: string | null;
        whatsapp_pais_code: string | null;
        whatsapp_numero: string | null;
        email: string | null;
    };
}

export interface RecallActivityLogEntry {
    id: string;
    recall_rule_id: string;
    action: string;
    old_state: RecallState | null;
    new_state: RecallState | null;
    details: Record<string, unknown>;
    performed_by: string | null;
    performed_at: string;
}

export const RECALL_TYPE_LABELS: Record<RecallType, string> = {
    limpieza: 'Limpieza Dental',
    botox: 'Botox',
    control_carillas: 'Control Carillas',
    blanqueamiento: 'Blanqueamiento',
    control_ortodoncia: 'Control Ortodoncia',
    mantenimiento_implantes: 'Mantenimiento Implantes',
    otro: 'Otro',
};

export const RECALL_STATE_LABELS: Record<RecallState, string> = {
    pending_contact: 'Pendiente Contacto',
    contacted: 'Contactado',
    scheduled: 'Agendado',
    completed: 'Realizado',
    snoozed: 'Pospuesto',
    not_applicable: 'No Aplica',
};

export const RECALL_TYPE_COLORS: Record<RecallType, string> = {
    limpieza: '#06b6d4',
    botox: '#a855f7',
    control_carillas: '#f59e0b',
    blanqueamiento: '#3b82f6',
    control_ortodoncia: '#10b981',
    mantenimiento_implantes: '#ef4444',
    otro: '#6b7280',
};

export const RECALL_TYPE_INTERVALS: Record<RecallType, number> = {
    limpieza: 6,
    botox: 4,
    control_carillas: 12,
    blanqueamiento: 6,
    control_ortodoncia: 6,
    mantenimiento_implantes: 12,
    otro: 6,
};

export type WorklistFilter = 'today' | 'next7' | 'next30' | 'past_due' | 'all';
