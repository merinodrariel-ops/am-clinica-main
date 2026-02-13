-- =============================================
-- RECALL ENGINE — Database Schema
-- Applied: 2026-02-14
-- =============================================

-- 1) Recall Rule Types ENUM
DO $$ BEGIN
  CREATE TYPE recall_type AS ENUM (
    'limpieza','botox','control_carillas','blanqueamiento',
    'control_ortodoncia','mantenimiento_implantes','otro'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Recall Operational State ENUM
DO $$ BEGIN
  CREATE TYPE recall_state AS ENUM (
    'pending_contact','contacted','scheduled','completed','snoozed','not_applicable'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3) Main table: recall_rules
CREATE TABLE IF NOT EXISTS recall_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
  recall_type     recall_type NOT NULL DEFAULT 'limpieza',
  custom_label    TEXT,
  interval_months INTEGER NOT NULL DEFAULT 6,
  window_days     INTEGER NOT NULL DEFAULT 30,
  state           recall_state NOT NULL DEFAULT 'pending_contact',
  priority        INTEGER NOT NULL DEFAULT 0,
  last_completed_at   TIMESTAMPTZ,
  next_due_date       DATE,
  visible_from        DATE,
  snoozed_until       DATE,
  linked_appointment_id UUID,
  contact_channels    TEXT[] DEFAULT '{"whatsapp","phone"}'::TEXT[],
  assigned_to         TEXT,
  notes               TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          TEXT,
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          TEXT,
  CONSTRAINT uq_patient_recall_type UNIQUE (patient_id, recall_type) DEFERRABLE INITIALLY DEFERRED
);

-- 4) Activity Log
CREATE TABLE IF NOT EXISTS recall_activity_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_rule_id  UUID NOT NULL REFERENCES recall_rules(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,
  old_state       recall_state,
  new_state       recall_state,
  details         JSONB DEFAULT '{}'::JSONB,
  performed_by    TEXT,
  performed_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_recall_rules_patient ON recall_rules(patient_id);
CREATE INDEX IF NOT EXISTS idx_recall_rules_state ON recall_rules(state) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recall_rules_next_due ON recall_rules(next_due_date) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recall_rules_visible_from ON recall_rules(visible_from) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_recall_activity_log_rule ON recall_activity_log(recall_rule_id);
CREATE INDEX IF NOT EXISTS idx_recall_activity_log_time ON recall_activity_log(performed_at DESC);

-- 6) RLS
ALTER TABLE recall_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE recall_activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recall_rules_all" ON recall_rules FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "recall_activity_log_all" ON recall_activity_log FOR ALL USING (TRUE) WITH CHECK (TRUE);
CREATE POLICY "recall_rules_anon_read" ON recall_rules FOR SELECT TO anon USING (TRUE);
CREATE POLICY "recall_activity_log_anon_read" ON recall_activity_log FOR SELECT TO anon USING (TRUE);

-- 7) Auto-update trigger
CREATE OR REPLACE FUNCTION update_recall_rules_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_recall_rules_updated_at ON recall_rules;
CREATE TRIGGER trg_recall_rules_updated_at BEFORE UPDATE ON recall_rules
  FOR EACH ROW EXECUTE FUNCTION update_recall_rules_updated_at();
