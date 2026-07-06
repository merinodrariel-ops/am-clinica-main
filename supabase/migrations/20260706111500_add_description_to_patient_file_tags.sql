-- Store the operator's clinical free-text description for Drive photo tags.
ALTER TABLE patient_file_tags
    ADD COLUMN IF NOT EXISTS description TEXT;
