-- Fix inventory RLS: drop ALL old policies (some used profiles.role, others excluded asistente)
-- and create clean policies using get_my_role() with asistente included.

-- ─── inventario_items ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "admin_write_inventory"     ON public.inventario_items;
DROP POLICY IF EXISTS "laboratorio_write_inventory" ON public.inventario_items;
DROP POLICY IF EXISTS "reception_write_inventory" ON public.inventario_items;
DROP POLICY IF EXISTS "read_inventory"            ON public.inventario_items;
DROP POLICY IF EXISTS "read_inventory_items"      ON public.inventario_items;
DROP POLICY IF EXISTS "staff_write_inventory"     ON public.inventario_items;

-- READ: all authenticated staff can see inventory
CREATE POLICY "read_inventory_items" ON public.inventario_items FOR SELECT USING (
    auth.role() = 'authenticated'
);

-- WRITE: owner, admin, developer, reception, asistente can edit all items
CREATE POLICY "staff_write_inventory" ON public.inventario_items FOR ALL USING (
    public.get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente')
) WITH CHECK (
    public.get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente')
);

-- WRITE: laboratorio can only touch LABORATORIO area items
CREATE POLICY "laboratorio_write_inventory" ON public.inventario_items FOR ALL USING (
    public.get_my_role() = 'laboratorio' AND area = 'LABORATORIO'
) WITH CHECK (
    public.get_my_role() = 'laboratorio' AND area = 'LABORATORIO'
);


-- ─── inventario_movimientos ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "read_inventory_movements"   ON public.inventario_movimientos;
DROP POLICY IF EXISTS "insert_inventory_movements" ON public.inventario_movimientos;
DROP POLICY IF EXISTS "admin_modify_movements"     ON public.inventario_movimientos;
DROP POLICY IF EXISTS "admin_delete_movements"     ON public.inventario_movimientos;
DROP POLICY IF EXISTS "staff_insert_movements"     ON public.inventario_movimientos;

-- READ: all authenticated
CREATE POLICY "read_inventory_movements" ON public.inventario_movimientos FOR SELECT USING (
    auth.role() = 'authenticated'
);

-- INSERT: same roles as items
CREATE POLICY "insert_inventory_movements" ON public.inventario_movimientos FOR INSERT WITH CHECK (
    public.get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente')
    OR (
        public.get_my_role() = 'laboratorio'
        AND EXISTS (
            SELECT 1 FROM public.inventario_items
            WHERE id = item_id AND area = 'LABORATORIO'
        )
    )
);

-- UPDATE/DELETE: owner, admin, developer only
CREATE POLICY "admin_modify_movements" ON public.inventario_movimientos FOR UPDATE USING (
    public.get_my_role() IN ('owner', 'admin', 'developer')
);

CREATE POLICY "admin_delete_movements" ON public.inventario_movimientos FOR DELETE USING (
    public.get_my_role() IN ('owner', 'admin', 'developer')
);
