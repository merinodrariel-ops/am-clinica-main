-- Add missing unique constraint on patient_portal_tokens.patient_id
-- Needed for upsert onConflict: 'patient_id' in generatePatientUpdateToken
ALTER TABLE patient_portal_tokens
    ADD CONSTRAINT IF NOT EXISTS patient_portal_tokens_patient_id_key UNIQUE (patient_id);
