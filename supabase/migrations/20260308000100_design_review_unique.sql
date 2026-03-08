-- Add unique constraint on patient_id so upsert with onConflict works
ALTER TABLE public.patient_design_reviews
ADD CONSTRAINT patient_design_reviews_patient_id_key UNIQUE (patient_id);
