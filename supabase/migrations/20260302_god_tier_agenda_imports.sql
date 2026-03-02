-- ============================================================
-- God-Tier Agenda: Imports & Recurrence
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Extend agenda_appointments for Recurrence
-- ─────────────────────────────────────────────────────────────
ALTER TABLE agenda_appointments
  ADD COLUMN IF NOT EXISTS parent_id        UUID REFERENCES agenda_appointments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recurrence_rule  TEXT; -- e.g., 'FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,WE,FR'

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_parent_id ON agenda_appointments(parent_id);

-- ─────────────────────────────────────────────────────────────
-- 2. agenda_import_jobs — Tracks bulk import sessions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_import_jobs (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  source         TEXT NOT NULL,          -- 'google_calendar', 'calendly', 'other'
  status         TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'mapped' | 'completed' | 'failed'
  total_rows     INTEGER DEFAULT 0,
  matched_rows   INTEGER DEFAULT 0,
  imported_rows  INTEGER DEFAULT 0,
  error_message  TEXT,
  settings       JSONB,                  -- metadata like mapped columns
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agenda_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_import_jobs_read_all" ON agenda_import_jobs
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "agenda_import_jobs_write_staff" ON agenda_import_jobs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'developer', 'reception')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. agenda_import_rows — Granular conflict resolution
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agenda_import_rows (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id               UUID NOT NULL REFERENCES agenda_import_jobs(id) ON DELETE CASCADE,
  raw_data             JSONB NOT NULL,         -- The parsed CSV row
  status               TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'matched' | 'resolved' | 'imported' | 'skipped'
  suggested_patient_id UUID REFERENCES pacientes(id_paciente) ON DELETE SET NULL,
  resolved_patient_id  UUID REFERENCES pacientes(id_paciente) ON DELETE SET NULL,
  match_confidence     INTEGER DEFAULT 0,      -- 0-100 score from the correlation engine
  match_reasons        TEXT[],                 -- e.g., ['email_match', 'name_fuzzy_match']
  error_message        TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agenda_import_rows_job_id ON agenda_import_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_agenda_import_rows_status ON agenda_import_rows(status);

ALTER TABLE agenda_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agenda_import_rows_read_all" ON agenda_import_rows
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "agenda_import_rows_write_staff" ON agenda_import_rows
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'developer', 'reception')
    )
  );
