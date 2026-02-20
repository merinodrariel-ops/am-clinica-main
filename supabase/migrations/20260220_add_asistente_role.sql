-- =============================================
-- ASISTENTE ROLE — Add support
-- Applied: 2026-02-20
-- Permisos: pacientes, inventario (todas las áreas), recalls, tareas, agenda
-- Sin acceso: cajas, prestadores, gestión de usuarios
-- =============================================

-- 1. Actualizar constraint de profiles para incluir 'asistente'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('owner', 'admin', 'reception', 'developer', 'pricing_manager', 'partner_viewer', 'laboratorio', 'asistente'));

-- 2. PACIENTES — Asistente con acceso completo (igual que reception/admin)
DROP POLICY IF EXISTS "Asistente manage pacientes" ON public.pacientes;
CREATE POLICY "Asistente manage pacientes" ON public.pacientes FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'asistente'
);

-- 3. INVENTARIO ITEMS — Asistente con acceso completo a todas las áreas
DROP POLICY IF EXISTS "asistente_read_inventory" ON public.inventario_items;
CREATE POLICY "asistente_read_inventory" ON public.inventario_items FOR SELECT USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'asistente'
);

DROP POLICY IF EXISTS "asistente_write_inventory" ON public.inventario_items;
CREATE POLICY "asistente_write_inventory" ON public.inventario_items FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'asistente'
) WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'asistente'
);

-- 4. INVENTARIO MOVIMIENTOS — Asistente con acceso completo
DROP POLICY IF EXISTS "asistente_inventory_movimientos" ON public.inventario_movimientos;
CREATE POLICY "asistente_inventory_movimientos" ON public.inventario_movimientos FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'asistente'
) WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'asistente'
);

-- NOTA: recall_rules y recall_activity_log ya tienen políticas abiertas (USING TRUE)
-- y no requieren cambios para el rol asistente.

-- NOTA: Las cajas (caja_recepcion_movimientos, caja_admin_movimientos) NO tienen
-- política para 'asistente', por lo que el acceso queda bloqueado a nivel de DB.
