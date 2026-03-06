-- Historical hourly rates per sucursal
-- Allows date-aware rate lookups so past-month calculations use the correct rate.
CREATE TABLE IF NOT EXISTS public.sucursal_valores_hora_historia (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id uuid NOT NULL REFERENCES public.sucursales(id) ON DELETE CASCADE,
    fecha_desde date NOT NULL,
    valor_hora_staff_ars    numeric(12,2) NOT NULL DEFAULT 0,
    valor_hora_limpieza_ars numeric(12,2) NOT NULL DEFAULT 0,
    notas       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_sucursal_fecha UNIQUE (sucursal_id, fecha_desde)
);

-- RLS
ALTER TABLE public.sucursal_valores_hora_historia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_admin_full_access_historia" ON public.sucursal_valores_hora_historia
    FOR ALL
    USING  (get_my_role() IN ('owner', 'admin', 'developer'))
    WITH CHECK (get_my_role() IN ('owner', 'admin', 'developer'));

CREATE POLICY "staff_read_historia" ON public.sucursal_valores_hora_historia
    FOR SELECT
    USING (get_my_role() IN ('reception', 'asistente'));

-- Seed with current values so nothing breaks on first use
-- One row per active sucursal using 2025-01-01 as the start date
INSERT INTO public.sucursal_valores_hora_historia (sucursal_id, fecha_desde, valor_hora_staff_ars, valor_hora_limpieza_ars, notas)
SELECT
    id,
    '2025-01-01'::date,
    COALESCE(valor_hora_staff_ars, 0),
    COALESCE(valor_hora_limpieza_ars, 0),
    'Valores iniciales migrados automáticamente'
FROM public.sucursales
WHERE activa = true
ON CONFLICT (sucursal_id, fecha_desde) DO NOTHING;
