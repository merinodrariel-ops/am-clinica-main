export type WorkflowType = 'treatment' | 'recurrent';

export type TreatmentStatus = 'active' | 'waiting' | 'production' | 'finished' | 'archived';

export interface WorkflowStage {
    id: string;
    name: string;
    color?: string | null;
    order_index?: number | null;
    time_limit_days?: number | null;
    is_initial?: boolean | null;
    is_final?: boolean | null;
    notify_on_entry?: boolean | null;
    notify_before_days?: number | null;
    notify_emails?: string[] | null;
}

export interface ClinicalWorkflow {
    id: string;
    name: string;
    type: WorkflowType;
    frequency_months?: number | null;
    stages: WorkflowStage[];
}

export interface PatientSummary {
    id_paciente: string;
    nombre: string;
    apellido: string;
    documento?: string | null;
}

export interface WorkflowSummary {
    name: string;
}

export interface PatientTreatment {
    id: string;
    patient_id: string;
    workflow_id: string;
    current_stage_id: string;
    status: TreatmentStatus;
    start_date?: string | null;
    created_at?: string | null;
    last_stage_change: string;
    next_milestone_date?: string | null;
    metadata?: Record<string, unknown> | null;
    patient: PatientSummary;
    stage?: WorkflowStage | null;
    workflow?: WorkflowSummary | null;
}

export interface PatientSearchResult {
    id_paciente: string;
    nombre: string;
    apellido: string;
    documento?: string | null;
    email?: string | null;
}

export interface TreatmentHistoryEntry {
    id: string;
    created_at: string;
    comments?: string | null;
    previous_stage?: { name?: string | null } | null;
    new_stage?: { name?: string | null } | null;
}

export interface WorkflowNotificationLogEntry {
    id: string;
    created_at: string;
    event_type: string;
    recipient_email?: string | null;
    subject?: string | null;
    status: string;
    error_message?: string | null;
    stage?: { name?: string | null } | null;
}
