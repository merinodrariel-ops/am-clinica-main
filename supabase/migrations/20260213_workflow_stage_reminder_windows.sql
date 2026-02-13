ALTER TABLE public.clinical_workflow_stages
ADD COLUMN IF NOT EXISTS reminder_windows_days INTEGER[] NOT NULL DEFAULT '{}';
