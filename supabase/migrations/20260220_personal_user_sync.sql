-- ════════════════════════════════════════════════════════════════════════════
-- Migration: Sync profiles → personal (prestadores)
-- Date: 2026-02-20
-- Purpose:
--   1. Add user_id FK to personal so each prestador can be linked to an auth user
--   2. Backfill: link existing personal records that share email with a profile
--   3. Backfill: create personal records for profiles that have no match yet
--   4. Trigger: auto-create/update personal record whenever a profile is created/updated
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Add user_id to personal ───────────────────────────────────────────────
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Unique index: one personal record per auth user
CREATE UNIQUE INDEX IF NOT EXISTS idx_personal_user_id
    ON public.personal(user_id)
    WHERE user_id IS NOT NULL;

-- Index on email for fast lookup during sync
CREATE INDEX IF NOT EXISTS idx_personal_email_lower
    ON public.personal(lower(email))
    WHERE email IS NOT NULL;

-- ── 2. Backfill: link existing personal ↔ profiles by email ──────────────────
UPDATE public.personal p
SET user_id = pr.id
FROM public.profiles pr
WHERE lower(p.email) = lower(pr.email)
  AND p.user_id IS NULL
  AND pr.email IS NOT NULL;

-- ── 3. Backfill: create personal records for profiles with no match ───────────
INSERT INTO public.personal (
    nombre,
    apellido,
    email,
    area,
    tipo,
    activo,
    user_id,
    valor_hora_ars
)
SELECT
    split_part(COALESCE(pr.full_name, pr.email), ' ', 1)                AS nombre,
    CASE
        WHEN position(' ' IN COALESCE(pr.full_name, '')) > 0
        THEN substring(COALESCE(pr.full_name, '') FROM position(' ' IN COALESCE(pr.full_name, '')) + 1)
        ELSE NULL
    END                                                                  AS apellido,
    pr.email,
    CASE pr.role
        WHEN 'owner'           THEN 'Dirección'
        WHEN 'admin'           THEN 'Administración'
        WHEN 'reception'       THEN 'Recepción'
        WHEN 'laboratorio'     THEN 'Laboratorio'
        WHEN 'asistente'       THEN 'Asistente Dental'
        WHEN 'pricing_manager' THEN 'Administración'
        WHEN 'developer'       THEN 'Tecnología'
        WHEN 'partner_viewer'  THEN 'Administración'
        ELSE                        'General'
    END                                                                  AS area,
    CASE WHEN pr.role IN ('owner', 'odontologo') THEN 'profesional' ELSE 'prestador' END  AS tipo,
    true                                                                 AS activo,
    pr.id                                                                AS user_id,
    0                                                                    AS valor_hora_ars
FROM public.profiles pr
WHERE pr.email IS NOT NULL
  -- No existing link by user_id
  AND NOT EXISTS (
      SELECT 1 FROM public.personal p2 WHERE p2.user_id = pr.id
  )
  -- No existing record with same email (already linked by step 2)
  AND NOT EXISTS (
      SELECT 1 FROM public.personal p3 WHERE lower(p3.email) = lower(pr.email)
  );

-- ── 4. Trigger function ────────────────────────────────────────────────────────
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

    -- Map role → area
    v_area := CASE NEW.role
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

    -- Map role → tipo
    v_tipo := CASE WHEN NEW.role IN ('owner', 'odontologo') THEN 'profesional' ELSE 'empleado' END;

    -- Map role → rol (display label, NOT NULL in personal)
    v_rol := CASE NEW.role
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
            -- Link the existing record
            UPDATE public.personal SET
                user_id    = NEW.id,
                area       = v_area,
                updated_at = now()
            WHERE id = v_pid;
        ELSE
            -- Create brand new record (all NOT NULL columns covered)
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

-- ── 5. Attach trigger to profiles ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_sync_profile_to_personal ON public.profiles;

CREATE TRIGGER trg_sync_profile_to_personal
    AFTER INSERT OR UPDATE OF full_name, email, role
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_to_personal();
