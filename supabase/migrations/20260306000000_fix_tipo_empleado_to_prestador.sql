-- ============================================================
-- Fix trigger: tipo 'empleado' → 'prestador'
-- The sync_profile_to_personal() function still mapped non-owner/odontologo
-- profiles to tipo='empleado'. This migration fixes the constraint, backfills
-- existing records, and corrects the trigger.
-- ============================================================

-- 1) Drop old constraints first (they block the UPDATE below)
ALTER TABLE public.personal      DROP CONSTRAINT IF EXISTS personal_tipo_check;
ALTER TABLE public.personal_areas DROP CONSTRAINT IF EXISTS personal_areas_tipo_personal_check;

-- 2) Backfill data BEFORE re-adding constraints
UPDATE public.personal
SET tipo = 'prestador'
WHERE tipo NOT IN ('prestador', 'odontologo', 'profesional') OR tipo IS NULL;

UPDATE public.personal_areas
SET tipo_personal = 'prestador'
WHERE tipo_personal NOT IN ('prestador', 'odontologo', 'ambos') OR tipo_personal IS NULL;

-- 3) Add new constraints now that data is clean
ALTER TABLE public.personal
    ADD CONSTRAINT personal_tipo_check
    CHECK (tipo IN ('prestador', 'odontologo', 'profesional'));

ALTER TABLE public.personal_areas
    ADD CONSTRAINT personal_areas_tipo_personal_check
    CHECK (tipo_personal IN ('prestador', 'odontologo', 'ambos'));

-- 2) Re-create trigger function with corrected tipo mapping
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
    v_rol      TEXT;
    v_pid      UUID;
BEGIN
    -- Skip if no email
    IF NEW.email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Split full_name → nombre / apellido
    v_nombre := split_part(COALESCE(NEW.full_name, NEW.email), ' ', 1);
    v_apellido := CASE
        WHEN position(' ' IN COALESCE(NEW.full_name, '')) > 0
        THEN substring(COALESCE(NEW.full_name, '') FROM position(' ' IN COALESCE(NEW.full_name, '')) + 1)
        ELSE NULL
    END;

    -- Map categoria → area
    v_area := CASE NEW.categoria
        WHEN 'owner'           THEN 'Dirección'
        WHEN 'admin'           THEN 'Administración'
        WHEN 'reception'       THEN 'Recepción'
        WHEN 'laboratorio'     THEN 'Laboratorio'
        WHEN 'asistente'       THEN 'Asistente Dental'
        WHEN 'odontologo'      THEN 'Odontología General'
        WHEN 'pricing_manager' THEN 'Administración'
        WHEN 'developer'       THEN 'Tecnología'
        WHEN 'partner_viewer'  THEN 'Administración'
        ELSE                        'General'
    END;

    -- Map categoria → tipo (fixed: use 'prestador' instead of 'empleado')
    v_tipo := CASE WHEN NEW.categoria IN ('owner', 'odontologo') THEN 'odontologo' ELSE 'prestador' END;

    -- Map categoria → rol (display label, NOT NULL in personal)
    v_rol := CASE NEW.categoria
        WHEN 'owner'           THEN 'Director/a'
        WHEN 'admin'           THEN 'Administrativo/a'
        WHEN 'reception'       THEN 'Recepcionista'
        WHEN 'laboratorio'     THEN 'Laboratorio'
        WHEN 'asistente'       THEN 'Asistente'
        WHEN 'odontologo'      THEN 'Odontólogo/a'
        WHEN 'developer'       THEN 'Desarrollador/a'
        WHEN 'partner_viewer'  THEN 'Socio/a'
        ELSE                        'Personal'
    END;

    -- Try to find linked personal record
    SELECT id INTO v_pid FROM public.personal WHERE user_id = NEW.id;

    IF v_pid IS NOT NULL THEN
        -- Already linked → update name, email, area
        UPDATE public.personal SET
            nombre     = COALESCE(NULLIF(v_nombre, ''), nombre),
            apellido   = COALESCE(v_apellido, apellido),
            email      = COALESCE(NEW.email, email),
            area       = v_area,
            updated_at = now()
        WHERE id = v_pid;
    ELSE
        -- Look for unlinked record by email to adopt
        SELECT id INTO v_pid
        FROM public.personal
        WHERE lower(email) = lower(NEW.email)
          AND user_id IS NULL
        LIMIT 1;

        IF v_pid IS NOT NULL THEN
            UPDATE public.personal SET
                user_id    = NEW.id,
                nombre     = COALESCE(NULLIF(v_nombre, ''), nombre),
                apellido   = COALESCE(v_apellido, apellido),
                area       = v_area,
                updated_at = now()
            WHERE id = v_pid;
        ELSE
            INSERT INTO public.personal (
                nombre, apellido, email, area, tipo, rol, activo, user_id, valor_hora_ars
            ) VALUES (
                v_nombre, v_apellido, NEW.email, v_area, v_tipo, v_rol, true, NEW.id, 0
            )
            ON CONFLICT DO NOTHING;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
