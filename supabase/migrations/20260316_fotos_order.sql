-- Add fotos_order JSONB column to pacientes to persist photo ordering per folder.
-- Schema: { [folderId: string]: string[] }  (array of file IDs in display order)
ALTER TABLE pacientes
    ADD COLUMN IF NOT EXISTS fotos_order JSONB DEFAULT '{}'::jsonb NOT NULL;
