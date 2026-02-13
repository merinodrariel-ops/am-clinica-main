-- =============================================
-- PERFORMANCE INDEXES & RLS OPTIMIZATION
-- Applied: 2026-02-15
-- =============================================

-- 1. Indexing for Clinical Workflows (Critical for Dashboard & Kanban Performance)
-- These prevent Sequential Scans when filtering by patient, workflow, or status.
CREATE INDEX IF NOT EXISTS idx_patient_treatments_patient_id ON patient_treatments(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_workflow_id ON patient_treatments(workflow_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_current_stage_id ON patient_treatments(current_stage_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_doctor_id ON patient_treatments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_patient_treatments_status ON patient_treatments(status);

-- 2. Indexing for Treatment History (Audit Logs)
-- Ensures fast retrieval of history for a specific treatment or user.
CREATE INDEX IF NOT EXISTS idx_treatment_history_treatment_id ON treatment_history(treatment_id);
CREATE INDEX IF NOT EXISTS idx_treatment_history_changed_by ON treatment_history(changed_by);

-- 3. Indexing for Workflow Stages
-- Speeds up workflow definition loading.
CREATE INDEX IF NOT EXISTS idx_clinical_workflow_stages_workflow_id ON clinical_workflow_stages(workflow_id);
CREATE INDEX IF NOT EXISTS idx_clinical_workflow_stages_order_index ON clinical_workflow_stages(order_index);

-- 4. Indexing for Patient Dashboard Lookups (High Traffic Area)
-- Ensures instant loading of patient financial history.
CREATE INDEX IF NOT EXISTS idx_caja_recepcion_movimientos_paciente_id ON caja_recepcion_movimientos(paciente_id);
CREATE INDEX IF NOT EXISTS idx_caja_recepcion_movimientos_fecha_hora ON caja_recepcion_movimientos(fecha_hora DESC);

-- 5. Indexing for Agenda Appointments (If missing)
-- Ensures fast loading of patient appointment history.
CREATE INDEX IF NOT EXISTS idx_agenda_appointments_patient_id ON agenda_appointments(patient_id);
CREATE INDEX IF NOT EXISTS idx_agenda_appointments_start_time ON agenda_appointments(start_time DESC);

-- 6. Indexing for Inventory Management (Prevent slow joins)
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_id ON inventory_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at ON inventory_movements(created_at DESC);
