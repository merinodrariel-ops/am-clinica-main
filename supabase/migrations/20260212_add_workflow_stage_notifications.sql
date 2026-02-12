ALTER TABLE clinical_workflow_stages
ADD COLUMN IF NOT EXISTS notify_on_entry BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS notify_before_days INTEGER,
ADD COLUMN IF NOT EXISTS notify_emails TEXT[] NOT NULL DEFAULT '{}';
