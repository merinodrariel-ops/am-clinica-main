-- ═══════════════════════════════════════════════════════════════════
-- WORKFLOW: Prospectos - 1ra Consulta
-- ═══════════════════════════════════════════════════════════════════
-- Pacientes que vinieron a consultar pero NO dejaron señal ni iniciaron
-- tratamiento. Son el punto de mayor pérdida de revenue del consultorio.
-- Este workflow los persigue hasta que conviertan o se marquen como perdidos.

-- 1. Insert workflow
INSERT INTO clinical_workflows (id, name, type, active)
VALUES (
    '11111111-0000-0000-0000-000000000001'::uuid,
    'Prospectos - 1ra Consulta',
    'treatment',
    true
)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, active = true;

-- 2. Insert stages (ordered by conversion funnel)
INSERT INTO clinical_workflow_stages
    (id, workflow_id, name, order_index, time_limit_days, is_initial, is_final, color)
VALUES
    -- Stage 1: Just came in for consultation, no further action yet
    ('11111111-0001-0000-0000-000000000001'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'Consulta Realizada', 1, 2, true, false, '#6366f1'),

    -- Stage 2: First follow-up sent (WhatsApp + email within 48h)
    ('11111111-0001-0000-0000-000000000002'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     '1er Contacto Enviado', 2, 7, false, false, '#8b5cf6'),

    -- Stage 3: Formal proposal sent (treatment plan, pricing, financing)
    ('11111111-0001-0000-0000-000000000003'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'Propuesta Formal', 3, 14, false, false, '#a855f7'),

    -- Stage 4: Active follow-up — multiple touchpoints happening
    ('11111111-0001-0000-0000-000000000004'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'En Seguimiento Activo', 4, 30, false, false, '#c084fc'),

    -- Stage 5: Warm — patient re-engaged, asking questions
    ('11111111-0001-0000-0000-000000000005'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'Retomó Contacto', 5, 14, false, false, '#e879f9'),

    -- Stage 6: Deposit received — converting!
    ('11111111-0001-0000-0000-000000000006'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'Señado ✓', 6, 7, false, false, '#10b981'),

    -- Terminal: Converted — moved to treatment workflow
    ('11111111-0001-0000-0000-000000000007'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'Convertido → Tratamiento', 7, null, false, true, '#059669'),

    -- Terminal: Lost — not interested or unreachable
    ('11111111-0001-0000-0000-000000000008'::uuid,
     '11111111-0000-0000-0000-000000000001'::uuid,
     'No Interesado', 8, null, false, true, '#6b7280')

ON CONFLICT (id) DO UPDATE
    SET name = EXCLUDED.name,
        order_index = EXCLUDED.order_index,
        time_limit_days = EXCLUDED.time_limit_days,
        color = EXCLUDED.color;

-- 3. Add prospect-specific columns to patient_treatments if not exist
ALTER TABLE patient_treatments
    ADD COLUMN IF NOT EXISTS prospect_main_interest TEXT,     -- "ortodoncia" | "carillas" | "implantes" | "blanqueamiento" | "otro"
    ADD COLUMN IF NOT EXISTS prospect_budget_range TEXT,      -- "$" | "$$" | "$$$" | "premium"
    ADD COLUMN IF NOT EXISTS prospect_urgency TEXT,           -- "inmediata" | "3_meses" | "6_meses" | "sin_urgencia"
    ADD COLUMN IF NOT EXISTS prospect_consulta_date DATE,     -- Date of the original consultation
    ADD COLUMN IF NOT EXISTS prospect_last_contact DATE,      -- Date of last contact attempt
    ADD COLUMN IF NOT EXISTS prospect_contact_count INT DEFAULT 0, -- How many times contacted
    ADD COLUMN IF NOT EXISTS prospect_converted_to UUID REFERENCES patient_treatments(id); -- Link to treatment when converted

-- 4. Add stage notifications for the prospect workflow
-- These are the automated messages that fire when a patient moves to each stage.
-- Using a DO block to safely insert without conflicts.

DO $$
DECLARE
    wf_id UUID := '11111111-0000-0000-0000-000000000001'::uuid;
    s1 UUID := '11111111-0001-0000-0000-000000000001'::uuid;
    s2 UUID := '11111111-0001-0000-0000-000000000002'::uuid;
    s3 UUID := '11111111-0001-0000-0000-000000000003'::uuid;
    s4 UUID := '11111111-0001-0000-0000-000000000004'::uuid;
BEGIN
    -- On "Consulta Realizada": alert the team to follow up within 48h
    INSERT INTO clinical_workflow_stage_notifications
        (stage_id, workflow_id, notification_type, recipient_type, template_key, delay_hours, enabled)
    VALUES
        (s1, wf_id, 'team_alert', 'internal', 'prospect_new_consult_alert', 1, true),
        (s1, wf_id, 'whatsapp', 'patient', 'prospect_thank_you_48h', 4, true),
        (s2, wf_id, 'email', 'patient', 'prospect_followup_proposal', 0, true),
        (s3, wf_id, 'team_alert', 'internal', 'prospect_proposal_followup_reminder', 168, true), -- 7 days
        (s4, wf_id, 'whatsapp', 'patient', 'prospect_reengagement_30d', 0, true)
    ON CONFLICT DO NOTHING;

EXCEPTION WHEN undefined_table THEN
    -- Table may not exist yet in all environments — safe to skip
    RAISE NOTICE 'clinical_workflow_stage_notifications table not found, skipping notifications seed.';
END $$;
