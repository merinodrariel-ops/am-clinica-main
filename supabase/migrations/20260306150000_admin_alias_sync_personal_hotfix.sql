-- Hotfix: admin alias normalization + personal sync compatibility
-- Context:
-- - Some environments have public.personal.categoria as NOT NULL.
-- - Some environments no longer have public.personal.rol.
-- - We need administradora/administracion aliases to behave exactly as admin.

BEGIN;

-- =========================================================
-- 1) sync_profile_to_personal without rol, with categoria
-- =========================================================
CREATE OR REPLACE FUNCTION public.sync_profile_to_personal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_nombre        TEXT;
    v_apellido      TEXT;
    v_area          TEXT;
    v_tipo          TEXT;
    v_categoria_raw TEXT;
    v_categoria     TEXT;
    v_pid           UUID;
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

    v_categoria_raw := lower(translate(coalesce(NEW.categoria, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'));

    v_categoria := CASE
        WHEN v_categoria_raw IN ('administradora','administrador','administracion','admin') THEN 'admin'
        WHEN v_categoria_raw = 'dentist' THEN 'odontologo'
        WHEN v_categoria_raw = 'assistant' THEN 'asistente'
        WHEN v_categoria_raw = 'lab' THEN 'laboratorio'
        WHEN v_categoria_raw IN (
            'owner','admin','reception','developer','laboratorio','asistente',
            'odontologo','recaptacion','pricing_manager','partner_viewer',
            'socio','contador','cleaning','other'
        ) THEN v_categoria_raw
        ELSE 'admin'
    END;

    v_tipo := CASE
        WHEN v_categoria IN ('owner','odontologo') THEN 'odontologo'
        ELSE 'prestador'
    END;

    v_area := CASE v_categoria
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

    SELECT id INTO v_pid
    FROM public.personal
    WHERE user_id = NEW.id
    LIMIT 1;

    IF v_pid IS NOT NULL THEN
        UPDATE public.personal
        SET
            nombre    = COALESCE(NULLIF(v_nombre, ''), nombre),
            apellido  = COALESCE(v_apellido, apellido),
            email     = COALESCE(NEW.email, email),
            area      = v_area,
            tipo      = v_tipo,
            categoria = v_categoria
        WHERE id = v_pid;

        RETURN NEW;
    END IF;

    SELECT id INTO v_pid
    FROM public.personal
    WHERE lower(email) = lower(NEW.email)
      AND user_id IS NULL
    LIMIT 1;

    IF v_pid IS NOT NULL THEN
        UPDATE public.personal
        SET
            user_id   = NEW.id,
            nombre    = COALESCE(NULLIF(v_nombre, ''), nombre),
            apellido  = COALESCE(v_apellido, apellido),
            area      = v_area,
            tipo      = v_tipo,
            categoria = v_categoria
        WHERE id = v_pid;

        RETURN NEW;
    END IF;

    INSERT INTO public.personal (
        nombre, apellido, email, area, tipo, categoria, activo, user_id, valor_hora_ars
    ) VALUES (
        v_nombre, v_apellido, NEW.email, v_area, v_tipo, v_categoria, true, NEW.id, 0
    )
    ON CONFLICT DO NOTHING;

    RETURN NEW;
END;
$$;

-- =========================================================
-- 2) recreate crear_personal preserving legacy signature
-- =========================================================
DROP FUNCTION IF EXISTS public.crear_personal(text,text,text,text,text,text,text,text,text,text,numeric,text);

CREATE FUNCTION public.crear_personal(
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
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _new_id UUID;
    _input TEXT;
    _tipo_final TEXT;
    _categoria_final TEXT;
BEGIN
    _input := lower(translate(coalesce(p_tipo, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'));

    IF _input IN ('odontologo','profesional','dentist') THEN
        _tipo_final := 'odontologo';
        _categoria_final := 'odontologo';
    ELSIF _input IN ('administradora','administrador','administracion','admin') THEN
        _tipo_final := 'prestador';
        _categoria_final := 'admin';
    ELSIF _input IN ('asistente','assistant') THEN
        _tipo_final := 'prestador';
        _categoria_final := 'asistente';
    ELSIF _input IN ('laboratorio','lab') THEN
        _tipo_final := 'prestador';
        _categoria_final := 'laboratorio';
    ELSE
        _tipo_final := 'prestador';
        _categoria_final := 'admin';
    END IF;

    INSERT INTO public.personal (
        nombre,
        apellido,
        tipo,
        categoria,
        area,
        email,
        whatsapp,
        documento,
        direccion,
        barrio_localidad,
        condicion_afip,
        valor_hora_ars,
        activo,
        fecha_ingreso
    ) VALUES (
        p_nombre,
        p_apellido,
        _tipo_final,
        _categoria_final,
        p_area,
        p_email,
        p_whatsapp,
        p_documento,
        p_direccion,
        p_barrio_localidad,
        p_condicion_afip,
        p_valor_hora_ars,
        true,
        CURRENT_DATE
    )
    RETURNING id INTO _new_id;

    RETURN _new_id;
END;
$$;

-- =========================================================
-- 3) normalize aliases to admin
-- =========================================================
UPDATE public.profiles
SET categoria = 'admin'
WHERE lower(translate(coalesce(categoria, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) IN (
    'administradora','administrador','administracion','admin'
);

UPDATE auth.users
SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('categoria', 'admin')
WHERE lower(translate(coalesce(raw_user_meta_data->>'categoria', ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) IN (
    'administradora','administrador','administracion','admin'
);

UPDATE public.personal
SET categoria = CASE WHEN tipo = 'odontologo' THEN 'odontologo' ELSE 'admin' END
WHERE categoria IS NULL;

-- =========================================================
-- 4) get_my_role robust to admin aliases
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
  v_normalized text;
BEGIN
  SELECT categoria INTO v_categoria
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_categoria IS NULL THEN
    RETURN NULL;
  END IF;

  v_normalized := lower(translate(v_categoria, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'));

  IF v_normalized IN ('administradora','administrador','administracion','admin') THEN
    RETURN 'admin';
  END IF;

  RETURN v_normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

COMMIT;
