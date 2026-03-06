-- Add billing mode flag to personal: hourly vs per-prestacion
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS cobra_por_horas BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.personal.cobra_por_horas IS
    'true = entra en lógica de horarios (valor_hora_ars), false = cobra por lista de prestaciones';
