-- Realtime autosave state for annotations and text over patient photos
CREATE TABLE IF NOT EXISTS patient_photo_edit_states (
  file_id           TEXT PRIMARY KEY,
  patient_id        TEXT NOT NULL,
  rotation          INTEGER NOT NULL DEFAULT 0,
  brightness        INTEGER NOT NULL DEFAULT 100,
  draw_shapes       JSONB NOT NULL DEFAULT '[]',
  text_annotations  JSONB NOT NULL DEFAULT '[]',
  updated_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patient_photo_edit_states_patient_id_idx
  ON patient_photo_edit_states(patient_id);

CREATE OR REPLACE FUNCTION update_patient_photo_edit_states_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patient_photo_edit_states_updated_at ON patient_photo_edit_states;

CREATE TRIGGER trg_patient_photo_edit_states_updated_at
  BEFORE UPDATE ON patient_photo_edit_states
  FOR EACH ROW EXECUTE FUNCTION update_patient_photo_edit_states_updated_at();

ALTER TABLE patient_photo_edit_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all" ON patient_photo_edit_states
  FOR ALL USING (true) WITH CHECK (true);
