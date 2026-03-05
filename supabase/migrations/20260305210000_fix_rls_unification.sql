-- God Migration: Fix all RLS policies referencing 'profiles.role'
-- Following the rename of 'role' to 'categoria' in the 'profiles' table.
-- Most policies are updated to use the helper function 'public.get_my_role()'.

BEGIN;

-- 1. Fix policies on 'inventario_items'
DROP POLICY IF EXISTS "read_inventory" ON public.inventario_items;
CREATE POLICY "read_inventory" ON public.inventario_items FOR SELECT USING (
    auth.role() = 'authenticated' AND (
        public.get_my_role() IN ('owner', 'admin', 'reception', 'developer', 'pricing_manager', 'partner_viewer')
        OR
        (public.get_my_role() = 'laboratorio' AND area = 'LABORATORIO')
    )
);

DROP POLICY IF EXISTS "admin_write_inventory" ON public.inventario_items;
CREATE POLICY "admin_write_inventory" ON public.inventario_items FOR ALL USING (
    public.get_my_role() IN ('owner', 'admin', 'developer')
);

DROP POLICY IF EXISTS "reception_write_inventory" ON public.inventario_items;
CREATE POLICY "reception_write_inventory" ON public.inventario_items FOR ALL USING (
    public.get_my_role() = 'reception'
);

DROP POLICY IF EXISTS "laboratorio_write_inventory" ON public.inventario_items;
CREATE POLICY "laboratorio_write_inventory" ON public.inventario_items FOR ALL USING (
    public.get_my_role() = 'laboratorio' AND area = 'LABORATORIO'
) WITH CHECK (
    public.get_my_role() = 'laboratorio' AND area = 'LABORATORIO'
);

-- 2. Fix policies on 'caja_recepcion_movimientos'
DROP POLICY IF EXISTS "admin_all_access" ON public.caja_recepcion_movimientos;
CREATE POLICY "admin_all_access" ON public.caja_recepcion_movimientos FOR ALL USING (
    public.get_my_role() IN ('owner', 'admin', 'developer')
);

DROP POLICY IF EXISTS "reception_own_access" ON public.caja_recepcion_movimientos;
CREATE POLICY "reception_own_access" ON public.caja_recepcion_movimientos FOR ALL USING (
    public.get_my_role() = 'reception'
);

-- 3. Fix policies on 'pacientes'
DROP POLICY IF EXISTS "view_patients" ON public.pacientes;
CREATE POLICY "view_patients" ON public.pacientes FOR SELECT USING (
    public.get_my_role() IN ('owner', 'admin', 'reception', 'developer', 'partner_viewer', 'odontologo', 'asistente')
);

DROP POLICY IF EXISTS "admin_write_patients" ON public.pacientes;
CREATE POLICY "admin_write_patients" ON public.pacientes FOR ALL USING (
    public.get_my_role() IN ('owner', 'admin', 'developer', 'reception')
);

-- 4. For 'prestaciones_lista'
DROP POLICY IF EXISTS "admin_manage_prestaciones" ON public.prestaciones_lista;
CREATE POLICY "admin_manage_prestaciones" ON public.prestaciones_lista FOR ALL USING (
    public.get_my_role() IN ('owner', 'admin')
);

-- 5. For 'caja_admin_movimientos'
DROP POLICY IF EXISTS "owner_full_access" ON public.caja_admin_movimientos;
CREATE POLICY "owner_full_access" ON public.caja_admin_movimientos FOR ALL USING (
    public.get_my_role() = 'owner'
);

-- Ensure get_my_role() is correctly defined
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT categoria FROM public.profiles WHERE id = auth.uid();
$$;

COMMIT;
