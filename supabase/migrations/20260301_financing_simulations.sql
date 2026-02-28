-- ============================================================
-- Shared financing simulations (public token links)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financing_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
    treatment TEXT NOT NULL,
    total_usd NUMERIC(12,2) NOT NULL CHECK (total_usd > 0),
    bna_venta_ars NUMERIC(12,2) NOT NULL CHECK (bna_venta_ars > 0),
    monthly_interest_pct NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (monthly_interest_pct >= 0),
    base_installments SMALLINT NOT NULL DEFAULT 12 CHECK (base_installments IN (3, 6, 12)),
    allowed_installment_options SMALLINT[] NOT NULL DEFAULT ARRAY[3,6,12],
    allowed_upfront_options SMALLINT[] NOT NULL DEFAULT ARRAY[30,40,50],
    status TEXT NOT NULL DEFAULT 'shared'
        CHECK (status IN ('shared', 'selected', 'contracted', 'expired')),
    selected_installments SMALLINT,
    selected_upfront_pct SMALLINT,
    selected_at TIMESTAMPTZ,
    share_token TEXT NOT NULL UNIQUE,
    shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financing_simulations_patient
    ON public.financing_simulations(patient_id);

CREATE INDEX IF NOT EXISTS idx_financing_simulations_status
    ON public.financing_simulations(status);

CREATE INDEX IF NOT EXISTS idx_financing_simulations_expires
    ON public.financing_simulations(expires_at DESC);

ALTER TABLE public.financing_simulations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin/reception full access on financing_simulations" ON public.financing_simulations;
DROP POLICY IF EXISTS "Clinical staff read financing_simulations" ON public.financing_simulations;

CREATE POLICY "Admin/reception full access on financing_simulations"
ON public.financing_simulations FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'reception'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'reception'));

CREATE POLICY "Clinical staff read financing_simulations"
ON public.financing_simulations FOR SELECT
USING (public.get_my_role() IN ('odontologo', 'asistente', 'recaptacion'));
