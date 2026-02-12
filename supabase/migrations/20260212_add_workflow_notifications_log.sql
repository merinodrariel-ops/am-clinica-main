CREATE TABLE IF NOT EXISTS workflow_notifications_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES clinical_workflows(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES clinical_workflow_stages(id) ON DELETE SET NULL,
    treatment_id UUID REFERENCES patient_treatments(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    recipient_email TEXT,
    subject TEXT,
    status TEXT NOT NULL DEFAULT 'sent',
    error_message TEXT,
    event_key TEXT UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workflow_notifications_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'workflow_notifications_log'
          AND policyname = 'Permitir todo a usuarios autenticados'
    ) THEN
        CREATE POLICY "Permitir todo a usuarios autenticados"
            ON workflow_notifications_log
            FOR ALL
            USING (auth.role() = 'authenticated');
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_workflow_notifications_log_workflow_created
    ON workflow_notifications_log (workflow_id, created_at DESC);
