-- ============================================================
-- Fix all RLS policies that reference profiles.role directly.
-- Column was renamed from `role` to `categoria` in profiles.
-- All policies now use get_my_role() which reads `categoria`.
-- Also fixes is_admin_or_owner() helper function.
-- ============================================================

-- Fix helper function from 20260209_fix_rls_recursion.sql
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT public.get_my_role() IN ('owner', 'admin');
$$;

-- ── 1. Update trigger function for personal sync ────────────────────────────
-- This function was using NEW.role which now breaks.
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

    -- Map categoria → tipo
    v_tipo := CASE WHEN NEW.categoria IN ('owner', 'odontologo') THEN 'profesional' ELSE 'empleado' END;

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

-- Re-attach trigger monitoring 'categoria' instead of 'role'
DROP TRIGGER IF EXISTS trg_sync_profile_to_personal ON public.profiles;
CREATE TRIGGER trg_sync_profile_to_personal
    AFTER INSERT OR UPDATE OF full_name, email, categoria
    ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_profile_to_personal();

-- ── 2. Table RLS Fixes ──────────────────────────────────────────

-- ── prestaciones_lista ───────────────────────────────────────
DROP POLICY IF EXISTS "prestaciones_lista_admin" ON public.prestaciones_lista;
CREATE POLICY "prestaciones_lista_admin"
ON public.prestaciones_lista FOR ALL
USING (public.get_my_role() IN ('owner', 'admin'));

-- ── prestaciones_realizadas ──────────────────────────────────
DROP POLICY IF EXISTS "prestaciones_realizadas_admin" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_admin"
ON public.prestaciones_realizadas FOR ALL
USING (public.get_my_role() IN ('owner', 'admin'));

-- ── caja_admin_categorias ────────────────────────────────────
DROP POLICY IF EXISTS "Enable write access for admins on caja_admin_categorias" ON public.caja_admin_categorias;
CREATE POLICY "Enable write access for admins on caja_admin_categorias"
ON public.caja_admin_categorias FOR ALL
USING (public.get_my_role() IN ('owner', 'admin'));

-- ── agenda_appointments ──────────────────────────────────────
DROP POLICY IF EXISTS "Enable insert for staff" ON public.agenda_appointments;
DROP POLICY IF EXISTS "Enable update for staff" ON public.agenda_appointments;
DROP POLICY IF EXISTS "Enable delete for admins" ON public.agenda_appointments;

CREATE POLICY "Enable insert for staff"
ON public.agenda_appointments FOR INSERT
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo', 'recaptacion'));

CREATE POLICY "Enable update for staff"
ON public.agenda_appointments FOR UPDATE
USING (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo', 'recaptacion'));

CREATE POLICY "Enable delete for admins"
ON public.agenda_appointments FOR DELETE
USING (public.get_my_role() IN ('owner', 'admin', 'developer'));

-- ── agenda_import_jobs ───────────────────────────────────────
DROP POLICY IF EXISTS "agenda_import_jobs_write_staff" ON public.agenda_import_jobs;
CREATE POLICY "agenda_import_jobs_write_staff"
ON public.agenda_import_jobs FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer', 'reception'));

-- ── agenda_import_rows ───────────────────────────────────────
DROP POLICY IF EXISTS "agenda_import_rows_write_staff" ON public.agenda_import_rows;
CREATE POLICY "agenda_import_rows_write_staff"
ON public.agenda_import_rows FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer', 'reception'));

-- ── doctor_schedules ─────────────────────────────────────────
DROP POLICY IF EXISTS "doctor_schedules_write_staff" ON public.doctor_schedules;
CREATE POLICY "doctor_schedules_write_staff"
ON public.doctor_schedules FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer'));

-- ── notification_rules ───────────────────────────────────────
DROP POLICY IF EXISTS "notification_rules_write_admin" ON public.notification_rules;
CREATE POLICY "notification_rules_write_admin"
ON public.notification_rules FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer'));

-- ── notification_logs ────────────────────────────────────────
DROP POLICY IF EXISTS "notification_logs_read_staff" ON public.notification_logs;
CREATE POLICY "notification_logs_read_staff"
ON public.notification_logs FOR SELECT
USING (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer'));

-- ── personal_areas ───────────────────────────────────────────
DROP POLICY IF EXISTS "personal_areas_admin" ON public.personal_areas;
CREATE POLICY "personal_areas_admin"
ON public.personal_areas FOR ALL
USING (public.get_my_role() IN ('owner', 'admin'));

-- ── historial_ediciones ──────────────────────────────────────
DROP POLICY IF EXISTS "historial_select_admin_owner" ON public.historial_ediciones;
DROP POLICY IF EXISTS "Admin and owner can view edit history" ON public.historial_ediciones;
CREATE POLICY "historial_select_admin_owner"
ON public.historial_ediciones FOR SELECT
USING (public.get_my_role() IN ('owner', 'admin'));

-- ── profiles ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (auth.uid() = id OR public.get_my_role() IN ('owner', 'admin'));

-- ── AM-Scheduler Pro Extra Fixes ─────────────────────────────
DROP POLICY IF EXISTS "doctor_schedules_write_staff" ON public.doctor_schedules;
CREATE POLICY "doctor_schedules_write_staff" ON public.doctor_schedules
FOR ALL USING (public.get_my_role() IN ('owner', 'admin', 'developer'));

DROP POLICY IF EXISTS "notification_rules_write_admin" ON public.notification_rules;
CREATE POLICY "notification_rules_write_admin" ON public.notification_rules
FOR ALL USING (public.get_my_role() IN ('owner', 'admin', 'developer'));

DROP POLICY IF EXISTS "notification_logs_read_staff" ON public.notification_logs;
CREATE POLICY "notification_logs_read_staff" ON public.notification_logs
FOR SELECT USING (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer'));

