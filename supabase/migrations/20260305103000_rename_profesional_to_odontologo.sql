-- ============================================================
-- Rename personal tipo: profesional -> odontologo
-- ============================================================

-- 1) Data migration
UPDATE public.personal
SET tipo = 'odontologo'
WHERE tipo = 'profesional';

UPDATE public.personal
SET tipo = 'prestador'
WHERE tipo = 'empleado';

UPDATE public.personal_areas
SET tipo_personal = 'odontologo'
WHERE tipo_personal = 'profesional';

UPDATE public.personal_areas
SET tipo_personal = 'prestador'
WHERE tipo_personal = 'empleado';

-- 2) Constraints
ALTER TABLE public.personal
    DROP CONSTRAINT IF EXISTS personal_tipo_check;

ALTER TABLE public.personal
    ADD CONSTRAINT personal_tipo_check
    CHECK (tipo IN ('prestador', 'odontologo'));

ALTER TABLE public.personal_areas
    DROP CONSTRAINT IF EXISTS personal_areas_tipo_personal_check;

ALTER TABLE public.personal_areas
    ADD CONSTRAINT personal_areas_tipo_personal_check
    CHECK (tipo_personal IN ('prestador', 'odontologo', 'ambos'));

-- 3) Keep profile sync aligned with new naming
CREATE OR REPLACE FUNCTION public.sync_profile_to_personal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nombre   TEXT;
    v_apellido TEXT;
    v_area     TEXT;
    v_tipo     TEXT;
    v_pid      UUID;
BEGIN
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    v_nombre := split_part(COALESCE(NEW.full_name, NEW.email), ' ', 1);
    v_apellido := CASE
        WHEN position(' ' IN COALESCE(NEW.full_name, '')) > 0
        THEN substring(COALESCE(NEW.full_name, '') FROM position(' ' IN COALESCE(NEW.full_name, '')) + 1)
        ELSE NULL
    END;

    v_area := CASE NEW.role
        WHEN 'owner'           THEN 'Dirección'
        WHEN 'admin'           THEN 'Administración'
        WHEN 'reception'       THEN 'Recepción'
        WHEN 'laboratorio'     THEN 'Laboratorio'
        WHEN 'asistente'       THEN 'Asistente Dental'
        WHEN 'pricing_manager' THEN 'Administración'
        WHEN 'developer'       THEN 'Tecnología'
        WHEN 'partner_viewer'  THEN 'Administración'
        WHEN 'odontologo'      THEN 'Odontología'
        ELSE                        'General'
    END;

    v_tipo := CASE
        WHEN NEW.role = 'odontologo' THEN 'odontologo'
        ELSE 'prestador'
    END;

    SELECT id INTO v_pid FROM public.personal WHERE user_id = NEW.id;

    IF v_pid IS NOT NULL THEN
        UPDATE public.personal SET
            nombre     = COALESCE(NULLIF(v_nombre, ''), nombre),
            apellido   = COALESCE(v_apellido, apellido),
            email      = COALESCE(NEW.email, email),
            area       = v_area,
            tipo       = v_tipo,
            updated_at = now()
        WHERE id = v_pid;
    ELSE
        SELECT id INTO v_pid
        FROM public.personal
        WHERE lower(email) = lower(NEW.email)
          AND user_id IS NULL
        LIMIT 1;

        IF v_pid IS NOT NULL THEN
            UPDATE public.personal SET
                user_id    = NEW.id,
                area       = v_area,
                tipo       = v_tipo,
                updated_at = now()
            WHERE id = v_pid;
        ELSE
            IF NEW.full_name IS NOT NULL AND NEW.email IS NOT NULL THEN
                INSERT INTO public.personal (
                    nombre, apellido, email, area, tipo, activo, user_id, valor_hora_ars
                ) VALUES (
                    v_nombre, v_apellido, NEW.email, v_area, v_tipo, true, NEW.id, 0
                )
                ON CONFLICT DO NOTHING;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

-- 4) Legacy helper function alignment
CREATE OR REPLACE FUNCTION public.crear_personal(
    p_nombre TEXT,
    p_apellido TEXT DEFAULT NULL,
    p_tipo TEXT DEFAULT 'prestador',
    p_area TEXT DEFAULT 'general',
    p_email TEXT DEFAULT NULL,
    p_whatsapp TEXT DEFAULT NULL,
    p_documento TEXT DEFAULT NULL,
    p_direccion TEXT DEFAULT NULL,
    p_barrio_localidad TEXT DEFAULT NULL,
    p_condicion_afip TEXT DEFAULT NULL,
    p_valor_hora_ars NUMERIC DEFAULT 0,
    p_rol TEXT DEFAULT 'Prestador'
) RETURNS UUID AS $$
DECLARE
    _new_id UUID;
    _tipo_final TEXT;
BEGIN
    _tipo_final := CASE
        WHEN lower(coalesce(p_tipo, '')) IN ('odontologo', 'profesional') THEN 'odontologo'
        ELSE 'prestador'
    END;

    INSERT INTO public.personal (
        nombre,
        apellido,
        tipo,
        area,
        email,
        whatsapp,
        documento,
        direccion,
        barrio_localidad,
        condicion_afip,
        valor_hora_ars,
        rol,
        activo,
        fecha_ingreso
    ) VALUES (
        p_nombre,
        p_apellido,
        _tipo_final,
        p_area,
        p_email,
        p_whatsapp,
        p_documento,
        p_direccion,
        p_barrio_localidad,
        p_condicion_afip,
        p_valor_hora_ars,
        p_rol,
        true,
        CURRENT_DATE
    )
    RETURNING id INTO _new_id;

    RETURN _new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
