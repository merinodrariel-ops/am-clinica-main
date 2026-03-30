-- Multi-canvas persistence for Photo Studio
CREATE TABLE IF NOT EXISTS patient_canvases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id  TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'Lienzo',
  ratio       TEXT NOT NULL DEFAULT '1:1',
  layers      JSONB NOT NULL DEFAULT '[]',
  bg_color    TEXT NOT NULL DEFAULT '#ffffff',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Index for fast patient lookups
CREATE INDEX IF NOT EXISTS patient_canvases_patient_id_idx ON patient_canvases(patient_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_patient_canvases_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_patient_canvases_updated_at
  BEFORE UPDATE ON patient_canvases
  FOR EACH ROW EXECUTE FUNCTION update_patient_canvases_updated_at();

-- RLS
ALTER TABLE patient_canvases ENABLE ROW LEVEL SECURITY;

-- Staff can do everything (we use admin client from server actions anyway)
CREATE POLICY "staff_all" ON patient_canvases
  FOR ALL USING (true) WITH CHECK (true);
