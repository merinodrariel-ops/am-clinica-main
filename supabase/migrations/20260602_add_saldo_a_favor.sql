-- Add credit balance column to pacientes table
ALTER TABLE public.pacientes
    ADD COLUMN IF NOT EXISTS saldo_a_favor_usd NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;

COMMENT ON COLUMN public.pacientes.saldo_a_favor_usd IS
    'Monto de saldo a favor acumulado del paciente en dolares (USD).';

-- Add credit tracking columns to caja_recepcion_movimientos table
ALTER TABLE public.caja_recepcion_movimientos
    ADD COLUMN IF NOT EXISTS saldo_a_favor_aplicado_usd NUMERIC(10, 2) DEFAULT 0.00 NOT NULL,
    ADD COLUMN IF NOT EXISTS saldo_a_favor_generado_usd NUMERIC(10, 2) DEFAULT 0.00 NOT NULL;

COMMENT ON COLUMN public.caja_recepcion_movimientos.saldo_a_favor_aplicado_usd IS
    'Monto de saldo a favor (credito) del paciente consumido en este movimiento en dolares (USD).';

COMMENT ON COLUMN public.caja_recepcion_movimientos.saldo_a_favor_generado_usd IS
    'Monto de saldo a favor (credito) para el paciente generado en este movimiento por sobrepago en dolares (USD).';
