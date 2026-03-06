-- Fix modelo_pago on existing personal records
-- Previously all records had modelo_pago = 'prestaciones' by default.
-- Rule: area-based classification matches the liquidaciones business logic.

-- Step 1: Professionals/odontologists → prestaciones
UPDATE public.personal
SET modelo_pago = 'prestaciones'
WHERE tipo IN ('odontologo', 'profesional')
   OR lower(area) SIMILAR TO '%(odontolog|laboratorio|lab)%';

-- Step 2: Staff / admin / limpieza / reception / assistants → horas
-- This runs AFTER step 1 so odontólogos are already handled.
UPDATE public.personal
SET modelo_pago = 'horas'
WHERE modelo_pago = 'prestaciones'
  AND tipo NOT IN ('odontologo', 'profesional')
  AND lower(area) NOT SIMILAR TO '%(odontolog|laboratorio|lab)%';

-- Step 3: Any remaining prestador with no area that still has prestaciones → horas
UPDATE public.personal
SET modelo_pago = 'horas'
WHERE tipo = 'prestador'
  AND modelo_pago = 'prestaciones'
  AND (area IS NULL OR lower(area) NOT SIMILAR TO '%(odontolog|laboratorio|lab)%');
