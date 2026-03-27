ALTER TABLE public.registro_horas
ADD COLUMN IF NOT EXISTS salida_dia_siguiente boolean NOT NULL DEFAULT false;

UPDATE public.registro_horas
SET salida_dia_siguiente = true
WHERE COALESCE(hora_ingreso, '') <> ''
  AND COALESCE(hora_egreso, '') <> ''
  AND hora_egreso < hora_ingreso;
