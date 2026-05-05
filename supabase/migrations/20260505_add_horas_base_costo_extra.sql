-- Adds tiered hourly rate support to personal.
-- horas_base: monthly base hours threshold. Hours above this are paid at costo_hora_extra.
-- costo_hora_extra: rate for hours beyond horas_base. NULL = all hours at valor_hora_ars.

ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS horas_base NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS costo_hora_extra NUMERIC(12,2);

COMMENT ON COLUMN public.personal.horas_base IS
    'Umbral mensual de horas base. Si total_horas supera este valor, las horas extra se pagan a costo_hora_extra.';
COMMENT ON COLUMN public.personal.costo_hora_extra IS
    'Tarifa por hora para las horas que superen horas_base. NULL = todas las horas al mismo valor_hora_ars.';

-- Set Giorgi's tiered rates
UPDATE public.personal
SET
    valor_hora_ars  = 15000,
    horas_base      = 60,
    costo_hora_extra = 9000
WHERE lower(COALESCE(apellido, '')) LIKE '%giorgi%'
   OR lower(COALESCE(nombre, ''))   LIKE '%giorgi%';
