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
        LOWER(unaccent(area)) LIKE '%limpieza%' OR 
        LOWER(unaccent(rol)) LIKE '%limpieza%'
    ) AND 
    LOWER(unaccent(tipo)) NOT IN ('owner', 'odontologo', 'profesional') AND
    modelo_pago = 'horas';

    -- Update staff general (everyone else on hours excluding owner/odontologos/limpieza)
    UPDATE personal
    SET valor_hora_ars = p_staff_rate
    WHERE NOT (
        LOWER(unaccent(area)) LIKE '%limpieza%' OR 
        LOWER(unaccent(rol)) LIKE '%limpieza%'
    ) AND 
    LOWER(unaccent(tipo)) NOT IN ('owner', 'odontologo', 'profesional') AND
    modelo_pago = 'horas' AND
    NOT (
        LOWER(unaccent(rol)) LIKE '%owner%' OR
        LOWER(unaccent(area)) LIKE '%direccion%'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
