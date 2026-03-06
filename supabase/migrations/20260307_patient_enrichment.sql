-- ============================================================
-- Patient enrichment: como_nos_conocio column + token index
-- Adds referral source tracking to pacientes table.
-- ============================================================

ALTER TABLE public.pacientes
    ADD COLUMN IF NOT EXISTS como_nos_conocio TEXT;

COMMENT ON COLUMN public.pacientes.como_nos_conocio IS
    'Cómo llegó el paciente a la clínica: redes_sociales, google, anuncios, recomendacion, ya_era_paciente, otro';
