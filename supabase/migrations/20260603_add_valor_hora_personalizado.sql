-- Add valor_hora_personalizado column to personal table if not exists
ALTER TABLE public.personal 
ADD COLUMN IF NOT EXISTS valor_hora_personalizado BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.personal.valor_hora_personalizado IS 
'Define si este prestador tiene una tarifa por hora personalizada que debe ignorar la sincronización masiva de la sucursal.';

-- Recreate the sync_personal_hourly_rates RPC function
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
        LOWER(unaccent(COALESCE(rol, ''))) LIKE '%limpieza%'
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
        LOWER(unaccent(COALESCE(rol, ''))) LIKE '%limpieza%'
    ) AND 
    LOWER(unaccent(COALESCE(tipo, ''))) NOT IN ('owner', 'odontologo', 'profesional') AND
    (modelo_pago = 'horas' OR modelo_pago IS NULL) AND
    NOT (
        LOWER(unaccent(COALESCE(rol, ''))) LIKE '%owner%' OR
        LOWER(unaccent(COALESCE(area, ''))) LIKE '%direccion%'
    ) AND
    valor_hora_personalizado = false AND
    horas_base IS NULL AND
    costo_hora_extra IS NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
