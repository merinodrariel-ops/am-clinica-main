ALTER TABLE agenda_appointments
ADD COLUMN IF NOT EXISTS modality text NOT NULL DEFAULT 'presencial';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'agenda_appointments_modality_check'
    ) THEN
        ALTER TABLE agenda_appointments
        ADD CONSTRAINT agenda_appointments_modality_check
        CHECK (modality IN ('presencial', 'virtual'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_modality
ON agenda_appointments(modality);
