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

-- ── liquidacion_hour_values ──────────────────────────────────
DROP POLICY IF EXISTS "liquidacion_hour_values_admin_rw" ON public.liquidacion_hour_values;
CREATE POLICY liquidacion_hour_values_admin_rw
ON public.liquidacion_hour_values FOR ALL TO authenticated
USING (public.get_my_role() IN ('owner', 'admin'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- ── internal_services ────────────────────────────────────────
DROP POLICY IF EXISTS "internal_services_admin_rw" ON public.internal_services;
CREATE POLICY internal_services_admin_rw
ON public.internal_services FOR ALL TO authenticated
USING (public.get_my_role() IN ('owner', 'admin'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- ── provider_service_records ─────────────────────────────────
DROP POLICY IF EXISTS "provider_service_records_admin_rw" ON public.provider_service_records;
CREATE POLICY provider_service_records_admin_rw
ON public.provider_service_records FOR ALL TO authenticated
USING (public.get_my_role() IN ('owner', 'admin'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- ── provider_monthly_hours ───────────────────────────────────
DROP POLICY IF EXISTS "provider_monthly_hours_admin_rw" ON public.provider_monthly_hours;
CREATE POLICY provider_monthly_hours_admin_rw
ON public.provider_monthly_hours FOR ALL TO authenticated
USING (public.get_my_role() IN ('owner', 'admin'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
