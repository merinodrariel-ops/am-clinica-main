-- Private, versioned patient budgets. Prices and copy are stored as a snapshot.
CREATE TABLE IF NOT EXISTS public.paciente_presupuestos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'deposit_received', 'expired', 'replaced')),
    valid_days INTEGER NOT NULL DEFAULT 7 CHECK (valid_days BETWEEN 1 AND 90),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    previous_budget_id UUID REFERENCES public.paciente_presupuestos(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paciente_presupuestos_patient ON public.paciente_presupuestos(paciente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_paciente_presupuestos_status ON public.paciente_presupuestos(status);

ALTER TABLE public.paciente_presupuestos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budgets_staff_select" ON public.paciente_presupuestos;
DROP POLICY IF EXISTS "budgets_staff_insert" ON public.paciente_presupuestos;
DROP POLICY IF EXISTS "budgets_staff_update" ON public.paciente_presupuestos;

CREATE POLICY "budgets_staff_select" ON public.paciente_presupuestos
FOR SELECT USING (public.get_my_role() IN ('owner', 'admin', 'reception'));

CREATE POLICY "budgets_staff_insert" ON public.paciente_presupuestos
FOR INSERT WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'reception') AND created_by = auth.uid());

CREATE POLICY "budgets_staff_update" ON public.paciente_presupuestos
FOR UPDATE USING (public.get_my_role() IN ('owner', 'admin', 'reception'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'reception'));
