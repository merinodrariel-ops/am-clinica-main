-- Migration: Trazabilidad paciente en movimientos de inventario
-- 2026-03-13

ALTER TABLE public.inventario_movimientos
    ADD COLUMN IF NOT EXISTS paciente_id UUID REFERENCES public.pacientes(id_paciente) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS paciente_nombre TEXT;

CREATE INDEX IF NOT EXISTS idx_inventario_movimientos_paciente
    ON public.inventario_movimientos (paciente_id)
    WHERE paciente_id IS NOT NULL;
