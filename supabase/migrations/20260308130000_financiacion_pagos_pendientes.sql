-- ============================================================
-- Pagos de financiacion pendientes de asignar
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financiacion_pagos_pendientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    movement_id UUID UNIQUE REFERENCES public.caja_recepcion_movimientos(id) ON DELETE CASCADE,
    paciente_id UUID REFERENCES public.pacientes(id_paciente) ON DELETE SET NULL,
    paciente_nombre TEXT NOT NULL,
    presupuesto_ref TEXT,
    cuota_nro INTEGER CHECK (cuota_nro IS NULL OR cuota_nro > 0),
    cuotas_total INTEGER CHECK (cuotas_total IS NULL OR cuotas_total > 0),
    monto_usd NUMERIC(12,2) NOT NULL CHECK (monto_usd >= 0),
    monto_original NUMERIC(12,2) NOT NULL CHECK (monto_original >= 0),
    moneda TEXT NOT NULL CHECK (moneda IN ('USD', 'ARS', 'USDT')),
    motivo TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'resuelto', 'descartado')),
    match_snapshot JSONB,
    error_message TEXT,
    notes TEXT,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_financiacion_pagos_pendientes_estado
    ON public.financiacion_pagos_pendientes(estado, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financiacion_pagos_pendientes_paciente
    ON public.financiacion_pagos_pendientes(paciente_id, created_at DESC);

ALTER TABLE public.financiacion_pagos_pendientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Financiacion pendientes manage" ON public.financiacion_pagos_pendientes;
DROP POLICY IF EXISTS "Financiacion pendientes read clinical" ON public.financiacion_pagos_pendientes;

CREATE POLICY "Financiacion pendientes manage"
ON public.financiacion_pagos_pendientes FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente'));

CREATE POLICY "Financiacion pendientes read clinical"
ON public.financiacion_pagos_pendientes FOR SELECT
USING (public.get_my_role() IN ('odontologo', 'laboratorio', 'partner_viewer', 'recaptacion'));
