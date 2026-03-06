-- ============================================================
-- RLS Audit Hardening — AM Clínica
-- Fecha: 2026-03-08
--
-- Hallazgos del audit:
-- 1. clinical_workflows / clinical_workflow_stages / patient_treatments /
--    treatment_history → "Permitir todo a usuarios autenticados" (FOR ALL)
--    cualquier usuario logueado puede eliminar registros clínicos.
-- 2. prestaciones_realizadas → doctor policy era FOR ALL; odontólogos
--    podían INSERT, UPDATE, DELETE sus propios registros. Solo deben SELECT.
-- 3. registro_horas → trabajadores no podían INSERT desde el portal.
-- 4. prestaciones_lista → precio_base visible para odontólogos (violación
--    de regla de negocio). RLS no permite restricción por columna; se
--    retira el SELECT para 'odontologo' — deben consultar solo sus
--    prestaciones_realizadas, no el catálogo con precios.
-- 5. audit_logs → RLS activo sin políticas = solo service_role puede
--    escribir (correcto); se agrega SELECT para owner/admin.
-- ============================================================


-- ── 1. CLINICAL WORKFLOWS (tablas de configuración de flujo) ──────────────
-- Antes: FOR ALL para auth.role() = 'authenticated'
-- Ahora: admin/owner/developer gestionan; staff clínico solo lee.

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.clinical_workflows;
DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.clinical_workflow_stages;

CREATE POLICY "clinical_workflows_admin"
ON public.clinical_workflows FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'developer'));

CREATE POLICY "clinical_workflows_staff_read"
ON public.clinical_workflows FOR SELECT
USING (public.get_my_role() IN ('reception', 'asistente', 'odontologo', 'laboratorio', 'recaptacion', 'partner_viewer'));

CREATE POLICY "clinical_workflow_stages_admin"
ON public.clinical_workflow_stages FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'developer'));

CREATE POLICY "clinical_workflow_stages_staff_read"
ON public.clinical_workflow_stages FOR SELECT
USING (public.get_my_role() IN ('reception', 'asistente', 'odontologo', 'laboratorio', 'recaptacion', 'partner_viewer'));


-- ── 2. PATIENT_TREATMENTS (historial clínico activo del paciente) ─────────
-- CRÍTICO: cualquier usuario autenticado podía borrar tratamientos.
-- Regla: admin/owner/asistente/reception gestionan; odontologo lee sus pacientes;
-- laboratorio lee; partner_viewer y recaptacion leen.

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.patient_treatments;

-- Admin gestión completa
CREATE POLICY "patient_treatments_admin"
ON public.patient_treatments FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'developer'));

-- Asistentes y recepción: gestión completa (ellas cargan y actualizan el workflow)
CREATE POLICY "patient_treatments_staff_write"
ON public.patient_treatments FOR ALL
USING (public.get_my_role() IN ('reception', 'asistente'))
WITH CHECK (public.get_my_role() IN ('reception', 'asistente'));

-- Odontólogos, laboratorio, partner_viewer, recaptacion: solo lectura
CREATE POLICY "patient_treatments_read"
ON public.patient_treatments FOR SELECT
USING (public.get_my_role() IN ('odontologo', 'laboratorio', 'partner_viewer', 'recaptacion'));


-- ── 3. TREATMENT_HISTORY (historial de cambios de etapa) ─────────────────
-- CRÍTICO: mismo problema que patient_treatments.
-- Regla: admin/owner/developer gestionan; asistente/reception insertan;
-- todos los demás solo leen.

DROP POLICY IF EXISTS "Permitir todo a usuarios autenticados" ON public.treatment_history;

CREATE POLICY "treatment_history_admin"
ON public.treatment_history FOR ALL
USING (public.get_my_role() IN ('owner', 'admin', 'developer'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'developer'));

-- Asistente y recepción: insertan registros de historia (avance de etapa)
CREATE POLICY "treatment_history_staff_insert"
ON public.treatment_history FOR INSERT
WITH CHECK (public.get_my_role() IN ('reception', 'asistente'));

-- Staff clínico solo lee
CREATE POLICY "treatment_history_read"
ON public.treatment_history FOR SELECT
USING (public.get_my_role() IN ('reception', 'asistente', 'odontologo', 'laboratorio', 'partner_viewer', 'recaptacion'));


-- ── 4. PRESTACIONES_REALIZADAS ────────────────────────────────────────────
-- Problema: policy "prestaciones_realizadas_doctor" era FOR ALL.
-- Los odontólogos podían insertar/actualizar/eliminar sus propias filas.
-- Regla de negocio: asistentes CARGAN las prestaciones; odontólogos
-- solo CONSULTAN las suyas (privacidad inter-profesional: no ven colegas).

-- Eliminar el policy permisivo anterior
DROP POLICY IF EXISTS "prestaciones_realizadas_doctor" ON public.prestaciones_realizadas;

-- Asistentes y recepción: insertan y actualizan (cargan el servicio realizado)
DROP POLICY IF EXISTS "prestaciones_realizadas_staff_write" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_staff_write"
ON public.prestaciones_realizadas
FOR INSERT
WITH CHECK (public.get_my_role() IN ('reception', 'asistente', 'owner', 'admin'));

DROP POLICY IF EXISTS "prestaciones_realizadas_staff_update" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_staff_update"
ON public.prestaciones_realizadas
FOR UPDATE
USING (public.get_my_role() IN ('reception', 'asistente', 'owner', 'admin'));

-- Reception también puede leer todo (necesita ver el historial completo del paciente)
DROP POLICY IF EXISTS "prestaciones_realizadas_reception_read" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_reception_read"
ON public.prestaciones_realizadas
FOR SELECT
USING (public.get_my_role() IN ('reception', 'asistente'));

-- Odontólogos: solo ven sus propias prestaciones (NO las de colegas)
DROP POLICY IF EXISTS "prestaciones_realizadas_odontologo_own" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_odontologo_own"
ON public.prestaciones_realizadas
FOR SELECT
USING (
    public.get_my_role() = 'odontologo'
    AND profesional_id IN (
        SELECT id FROM public.personal WHERE user_id = auth.uid()
    )
);

-- Laboratorio: ve prestaciones del área laboratorio (para coordinación)
DROP POLICY IF EXISTS "prestaciones_realizadas_laboratorio_read" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_laboratorio_read"
ON public.prestaciones_realizadas
FOR SELECT
USING (
    public.get_my_role() = 'laboratorio'
    AND (prestacion_nombre ILIKE '%lab%' OR profesional_id IN (
        SELECT id FROM public.personal
        WHERE lower(area) SIMILAR TO '%(laboratorio|lab)%'
    ))
);


-- ── 5. PRESTACIONES_LISTA (catálogo con precios) ──────────────────────────
-- Problema: "prestaciones_lista_select" permitía SELECT a cualquier
-- usuario autenticado, exponiendo precio_base a odontólogos.
-- NOTA: PostgreSQL RLS no puede restringir columnas individuales, solo filas.
-- Solución: retiramos SELECT para 'odontologo' a nivel de tabla.
-- Los odontólogos acceden a sus servicios a través de prestaciones_realizadas
-- (que ya tiene price data oculto en app layer) no del catálogo directamente.

DROP POLICY IF EXISTS "prestaciones_lista_select" ON public.prestaciones_lista;

-- Staff con necesidad de ver precios para cargar servicios
CREATE POLICY "prestaciones_lista_staff_select"
ON public.prestaciones_lista FOR SELECT
USING (
    public.get_my_role() IN ('owner', 'admin', 'reception', 'asistente', 'developer', 'pricing_manager')
);

-- partner_viewer: puede ver el catálogo (sin datos financieros críticos por app-layer)
CREATE POLICY "prestaciones_lista_partner_select"
ON public.prestaciones_lista FOR SELECT
USING (
    public.get_my_role() = 'partner_viewer'
    AND activo = true
);

-- NOTA: 'odontologo' deliberadamente excluido del SELECT en prestaciones_lista.
-- Regla de negocio: odontólogos no deben ver precio_base en ningún momento.
-- Si en el futuro necesitan ver nombres (sin precios), crear la vista:
--   CREATE VIEW prestaciones_sin_precio AS
--     SELECT id, nombre, area_id, area_nombre, activo FROM public.prestaciones_lista;
-- y otorgar SELECT en esa vista al rol 'authenticated'.


-- ── 6. REGISTRO_HORAS (portal de trabajadores) ────────────────────────────
-- Problema: trabajadores solo tenían SELECT propio. No podían enviar horas.
-- Regla: trabajadores pueden INSERT nuevas horas y UPDATE las propias
-- en estado 'pending' o 'observado' (antes de aprobación del admin).

DROP POLICY IF EXISTS "Worker insert own horas" ON public.registro_horas;
CREATE POLICY "Worker insert own horas"
ON public.registro_horas FOR INSERT
WITH CHECK (
    personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid())
    AND public.get_my_role() NOT IN ('partner_viewer', 'recaptacion')
);

DROP POLICY IF EXISTS "Worker update own pending horas" ON public.registro_horas;
CREATE POLICY "Worker update own pending horas"
ON public.registro_horas FOR UPDATE
USING (
    personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid())
    AND estado IN ('pending', 'observado')
)
WITH CHECK (
    personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid())
    AND estado IN ('pending', 'observado')
);


-- ── 7. AUDIT_LOGS (trazabilidad) ──────────────────────────────────────────
-- Estado: RLS activo sin políticas → solo service_role puede operar
-- (correcto: inserts solo desde server actions con admin client).
-- Agregar SELECT para owner/admin para poder revisar el log desde el panel.

DROP POLICY IF EXISTS "audit_logs_admin_read" ON public.audit_logs;
CREATE POLICY "audit_logs_admin_read"
ON public.audit_logs FOR SELECT
USING (public.get_my_role() IN ('owner', 'admin'));

-- INSERT sigue siendo exclusivo del service_role (admin client en server actions).
-- NO se agrega INSERT policy para browser clients.


-- ── 8. AGENDA_APPOINTMENTS SELECT (refuerzo) ─────────────────────────────
-- Estado actual: "Enable read access for authenticated users" → auth.role() = 'authenticated'
-- Para una clínica pequeña esto es aceptable. Sin embargo, excluimos
-- explícitamente a 'partner_viewer' y 'recaptacion' que no necesitan ver agenda.
-- NOTA: Se deja comentado porque puede romper funcionalidad existente.
-- Descomentear solo si se confirma que partner_viewer no usa la agenda.

-- DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.agenda_appointments;
-- CREATE POLICY "Enable read access for staff" ON public.agenda_appointments FOR SELECT
-- USING (public.get_my_role() IN ('owner', 'admin', 'reception', 'asistente', 'odontologo', 'developer', 'laboratorio'));


-- ── VERIFICACIÓN FINAL ────────────────────────────────────────────────────
-- Después de aplicar, verificar con:
-- SELECT schemaname, tablename, policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN (
--   'clinical_workflows','clinical_workflow_stages',
--   'patient_treatments','treatment_history',
--   'prestaciones_realizadas','prestaciones_lista',
--   'registro_horas','audit_logs'
-- )
-- ORDER BY tablename, cmd;
