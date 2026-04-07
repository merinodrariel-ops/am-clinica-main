-- ─────────────────────────────────────────────────────────────────────────────
-- Seguimientos manuales: recordatorios internos que el área de recepción/admin
-- crea manualmente para hacer seguimiento de pacientes (o cualquier contacto).
-- Son independientes del sistema de recalls automáticos.
-- Creado: 2026-04-06
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seguimientos_manuales (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id      UUID REFERENCES pacientes(id_paciente) ON DELETE SET NULL,  -- opcional
    contacto_libre  TEXT,           -- nombre libre si no es paciente (ej: "Proveedor Dental X")
    motivo          TEXT NOT NULL,  -- descripción del seguimiento
    due_date        DATE NOT NULL,  -- fecha objetivo de contacto
    state           TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (state IN ('pendiente', 'realizado', 'pospuesto', 'no_aplica')),
    notes           TEXT,
    assigned_to     TEXT,           -- email del responsable (opcional)
    linked_agenda_id UUID,          -- si se creó desde un recordatorio_interno en la agenda
    created_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE seguimientos_manuales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seguimientos_read" ON seguimientos_manuales
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "seguimientos_write" ON seguimientos_manuales
    FOR ALL TO authenticated
    USING (get_my_role() IN ('owner', 'admin', 'reception', 'developer'))
    WITH CHECK (get_my_role() IN ('owner', 'admin', 'reception', 'developer'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_seguimientos_due_date    ON seguimientos_manuales(due_date);
CREATE INDEX IF NOT EXISTS idx_seguimientos_patient_id  ON seguimientos_manuales(patient_id);
CREATE INDEX IF NOT EXISTS idx_seguimientos_state       ON seguimientos_manuales(state);

-- appointment_type: agregar recordatorio_interno
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'recordatorio_interno';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_seguimientos_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_seguimientos_updated_at
    BEFORE UPDATE ON seguimientos_manuales
    FOR EACH ROW EXECUTE FUNCTION update_seguimientos_updated_at();
