-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Patient Portal Token Table
-- Date: 2026-02-21
-- Purpose: Secure magic-link tokens for passwordless patient portal access
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.patient_portal_tokens (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id    text NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
    token         text NOT NULL UNIQUE,
    expires_at    timestamptz NOT NULL,
    used          boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now(),

    -- One active token per patient (upsert on conflict)
    CONSTRAINT uq_patient_portal_tokens_patient UNIQUE (patient_id)
);

-- Index for fast token lookup on portal access
CREATE INDEX IF NOT EXISTS idx_ppt_token ON public.patient_portal_tokens(token);

-- RLS: only service role can read/write (portal API uses service key)
ALTER TABLE public.patient_portal_tokens ENABLE ROW LEVEL SECURITY;

-- No public access — all reads go through the API with service role
CREATE POLICY "No public access" ON public.patient_portal_tokens
    FOR ALL TO anon, authenticated
    USING (false);
