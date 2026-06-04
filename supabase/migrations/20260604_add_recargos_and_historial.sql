-- Enable unaccent extension in the database
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 1. Add recargo columns to personal table if they don't exist
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS recargo_sabado BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS recargo_domingo_feriado BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS recargo_nocturno BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.personal.recargo_sabado IS 'Indica si este prestador cobra adicional del 50% (1.5x) los sábados.';
COMMENT ON COLUMN public.personal.recargo_domingo_feriado IS 'Indica si este prestador cobra adicional del 100% (2.0x) los domingos y feriados.';
COMMENT ON COLUMN public.personal.recargo_nocturno IS 'Indica si este prestador cobra adicional del 20% (+0.2x) por nocturnidad (22h a 04h).';

-- 2. Update existing records
-- For laboratory staff (usually no multipliers apply by agreement)
UPDATE public.personal
SET
    recargo_sabado = false,
    recargo_domingo_feriado = false,
    recargo_nocturno = false
WHERE 
    LOWER(unaccent(COALESCE(area, ''))) LIKE '%laboratorio%' OR 
    LOWER(unaccent(COALESCE(categoria, ''))) LIKE '%laboratorio%' OR
    LOWER(unaccent(COALESCE(area, ''))) = 'lab' OR
    LOWER(unaccent(COALESCE(categoria, ''))) = 'lab';

-- 3. Recreate the sync_personal_hourly_rates function using categoria instead of non-existent rol column
CREATE OR REPLACE FUNCTION public.sync_personal_hourly_rates(
    p_staff_rate numeric,
    p_limpieza_rate numeric
) RETURNS void AS $$
BEGIN
    -- Update limpieza (only if they do not have a custom rate or custom rule)
    UPDATE public.personal
    SET valor_hora_ars = p_limpieza_rate
    WHERE (
        LOWER(unaccent(COALESCE(area, ''))) LIKE '%limpieza%' OR 
        LOWER(unaccent(COALESCE(categoria, ''))) LIKE '%limpieza%'
    ) AND 
    LOWER(unaccent(COALESCE(tipo, ''))) NOT IN ('owner', 'odontologo', 'profesional') AND
    modelo_pago = 'horas' AND
    valor_hora_personalizado = false AND
    horas_base IS NULL AND
    costo_hora_extra IS NULL;

    -- Update staff general (everyone else on hours excluding owner/odontologos/limpieza/custom)
    UPDATE public.personal
    SET valor_hora_ars = p_staff_rate
    WHERE NOT (
        LOWER(unaccent(COALESCE(area, ''))) LIKE '%limpieza%' OR 
        LOWER(unaccent(COALESCE(categoria, ''))) LIKE '%limpieza%'
    ) AND 
    LOWER(unaccent(COALESCE(tipo, ''))) NOT IN ('owner', 'odontologo', 'profesional') AND
    (modelo_pago = 'horas' OR modelo_pago IS NULL) AND
    NOT (
        LOWER(unaccent(COALESCE(categoria, ''))) LIKE '%owner%' OR
        LOWER(unaccent(COALESCE(area, ''))) LIKE '%direccion%'
    ) AND
    valor_hora_personalizado = false AND
    horas_base IS NULL AND
    costo_hora_extra IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Create public.personal_valores_hora_historia table to track hourly rates and surcharge settings history
CREATE TABLE IF NOT EXISTS public.personal_valores_hora_historia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personal_id UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    fecha_desde DATE NOT NULL DEFAULT CURRENT_DATE,
    valor_hora_ars NUMERIC(12,2) NOT NULL DEFAULT 0,
    horas_base NUMERIC(10,2),
    costo_hora_extra NUMERIC(12,2),
    valor_hora_personalizado BOOLEAN DEFAULT false,
    recargo_sabado BOOLEAN DEFAULT true,
    recargo_domingo_feriado BOOLEAN DEFAULT true,
    recargo_nocturno BOOLEAN DEFAULT false,
    notas TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- RLS
ALTER TABLE public.personal_valores_hora_historia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_admin_developer_full_access" ON public.personal_valores_hora_historia;
CREATE POLICY "owner_admin_developer_full_access" ON public.personal_valores_hora_historia
    FOR ALL
    USING (get_my_role() IN ('owner', 'admin', 'developer'))
    WITH CHECK (get_my_role() IN ('owner', 'admin', 'developer'));

DROP POLICY IF EXISTS "staff_read_own_or_all" ON public.personal_valores_hora_historia;
CREATE POLICY "staff_read_own_or_all" ON public.personal_valores_hora_historia
    FOR SELECT
    USING (
        get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente') OR 
        personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid())
    );

-- 5. Create Trigger function to log automatic rate changes
CREATE OR REPLACE FUNCTION public.log_personal_hourly_rate_change()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') OR 
       (OLD.valor_hora_ars IS DISTINCT FROM NEW.valor_hora_ars) OR
       (OLD.horas_base IS DISTINCT FROM NEW.horas_base) OR
       (OLD.costo_hora_extra IS DISTINCT FROM NEW.costo_hora_extra) OR
       (OLD.valor_hora_personalizado IS DISTINCT FROM NEW.valor_hora_personalizado) OR
       (OLD.recargo_sabado IS DISTINCT FROM NEW.recargo_sabado) OR
       (OLD.recargo_domingo_feriado IS DISTINCT FROM NEW.recargo_domingo_feriado) OR
       (OLD.recargo_nocturno IS DISTINCT FROM NEW.recargo_nocturno) THEN
       
       INSERT INTO public.personal_valores_hora_historia (
           personal_id,
           fecha_desde,
           valor_hora_ars,
           horas_base,
           costo_hora_extra,
           valor_hora_personalizado,
           recargo_sabado,
           recargo_domingo_feriado,
           recargo_nocturno,
           notas,
           created_by
       ) VALUES (
           NEW.id,
           CURRENT_DATE,
           COALESCE(NEW.valor_hora_ars, 0),
           NEW.horas_base,
           NEW.costo_hora_extra,
           NEW.valor_hora_personalizado,
           NEW.recargo_sabado,
           NEW.recargo_domingo_feriado,
           NEW.recargo_nocturno,
           'Cambio de parámetros/tarifa de hora',
           auth.uid()
       );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind trigger
DROP TRIGGER IF EXISTS trg_log_personal_hourly_rate_change ON public.personal;
CREATE TRIGGER trg_log_personal_hourly_rate_change
    AFTER INSERT OR UPDATE OF 
        valor_hora_ars, 
        horas_base, 
        costo_hora_extra, 
        valor_hora_personalizado,
        recargo_sabado,
        recargo_domingo_feriado,
        recargo_nocturno
    ON public.personal
    FOR EACH ROW
    EXECUTE FUNCTION public.log_personal_hourly_rate_change();
