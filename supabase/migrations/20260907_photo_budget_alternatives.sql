ALTER TABLE public.patient_photo_edit_states
  ADD COLUMN IF NOT EXISTS budget_alternatives JSONB NOT NULL DEFAULT '[]'::jsonb;
