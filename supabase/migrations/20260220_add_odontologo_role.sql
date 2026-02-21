-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Add 'odontologo' role + rename 'empleado' → 'prestador'
-- Date: 2026-02-20
-- Context: todos son prestadores de servicio bajo locación de servicios,
--          nadie es empleado en relación de dependencia.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add 'odontologo' to profiles.role constraint ──────────────────────────
-- Drop old constraint and recreate with the new role
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN (
        'owner',
        'admin',
        'reception',
        'developer',
        'pricing_manager',
        'partner_viewer',
        'laboratorio',
        'asistente',
        'odontologo'
    ));

-- ── 2. Rename personal.tipo values: 'empleado' → 'prestador' ─────────────────
-- Update existing data first
UPDATE public.personal
SET tipo = 'prestador'
WHERE tipo = 'empleado';

-- Drop old constraint and recreate
ALTER TABLE public.personal
    DROP CONSTRAINT IF EXISTS personal_tipo_check;

ALTER TABLE public.personal
    ADD CONSTRAINT personal_tipo_check CHECK (tipo IN ('prestador', 'profesional'));

-- ── 3. Update personal_areas.tipo_personal constraint ─────────────────────────
ALTER TABLE public.personal_areas
    DROP CONSTRAINT IF EXISTS personal_areas_tipo_personal_check;

ALTER TABLE public.personal_areas
    ADD CONSTRAINT personal_areas_tipo_personal_check
    CHECK (tipo_personal IN ('prestador', 'profesional', 'ambos'));

-- Update existing data in areas table
UPDATE public.personal_areas
SET tipo_personal = 'prestador'
WHERE tipo_personal = 'empleado';

-- Add 'Odontología' area if it doesn't exist
INSERT INTO public.personal_areas (nombre, descripcion, tipo_personal, color, icono, activo, orden)
VALUES ('Odontología', 'Odontólogos y profesionales de la salud dental', 'profesional', '#6366f1', 'Stethoscope', true, 1)
ON CONFLICT (nombre) DO NOTHING;

-- ── 4. Update the sync trigger to include 'odontologo' and use 'prestador' ────
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

    -- Odontólogos son profesionales; el resto presta servicios como prestadores
    v_tipo := CASE
        WHEN NEW.role IN ('owner', 'odontologo') THEN 'profesional'
        ELSE 'prestador'
    END;

    SELECT id INTO v_pid FROM public.personal WHERE user_id = NEW.id;

    IF v_pid IS NOT NULL THEN
        UPDATE public.personal SET
            nombre     = COALESCE(NULLIF(v_nombre, ''), nombre),
            apellido   = COALESCE(v_apellido, apellido),
            email      = COALESCE(NEW.email, email),
            area       = v_area,
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
