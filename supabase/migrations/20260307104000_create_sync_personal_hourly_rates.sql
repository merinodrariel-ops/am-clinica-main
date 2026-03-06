-- Creates an RPC function to bulk update hourly rates for general staff and cleaning roles.

CREATE OR REPLACE FUNCTION sync_personal_hourly_rates(
    p_staff_rate numeric,
    p_limpieza_rate numeric
) RETURNS void AS $$
BEGIN
    -- Update limpieza
    UPDATE personal
    SET valor_hora_ars = p_limpieza_rate
    WHERE (
        LOWER(unaccent(COALESCE(area, ''))) LIKE '%limpieza%' OR 
        LOWER(unaccent(COALESCE(rol, ''))) LIKE '%limpieza%'
    ) AND 
    LOWER(unaccent(COALESCE(tipo, ''))) NOT IN ('owner', 'odontologo', 'profesional') AND
    modelo_pago = 'horas';

    -- Update staff general (everyone else on hours excluding owner/odontologos/limpieza)
    UPDATE personal
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
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
