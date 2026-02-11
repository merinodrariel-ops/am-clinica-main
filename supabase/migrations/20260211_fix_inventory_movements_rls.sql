
-- Enable RLS on inventario_movimientos (movements) table
ALTER TABLE public.inventario_movimientos ENABLE ROW LEVEL SECURITY;

-- 1. READ Policy (Select)
-- Allow anyone with authenticated role to read movements (history)
-- Or restrict based on item area permissions?
-- Generally, reading history is safer than writing. Let's allow authenticated read.
DROP POLICY IF EXISTS "read_inventory_movements" ON public.inventario_movimientos;
CREATE POLICY "read_inventory_movements" ON public.inventario_movimientos FOR SELECT USING (
    auth.role() = 'authenticated'
);

-- 2. INSERT Policy (Create Movement)
-- This is critical. We must check permissions based on the linked item's area.

DROP POLICY IF EXISTS "insert_inventory_movements" ON public.inventario_movimientos;
CREATE POLICY "insert_inventory_movements" ON public.inventario_movimientos FOR INSERT WITH CHECK (
    -- Admin, Owner, Dev, Reception have full access
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'developer', 'reception')
    OR
    -- Laboratorio role can ONLY insert if the item belongs to LABORATORIO area
    (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'laboratorio'
        AND
        EXISTS (
            SELECT 1 FROM public.inventario_items
            WHERE id = item_id -- Check the item_id being inserted
            AND area = 'LABORATORIO' -- Ensure it is a lab item
        )
    )
);

-- 3. UPDATE/DELETE Policy?
-- Usually movements should be immutable for audit, but maybe allow recent edits?
-- For now, let's implement UPDATE only for Admin/Owner.

DROP POLICY IF EXISTS "admin_modify_movements" ON public.inventario_movimientos;
CREATE POLICY "admin_modify_movements" ON public.inventario_movimientos FOR UPDATE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'developer')
);

DROP POLICY IF EXISTS "admin_delete_movements" ON public.inventario_movimientos;
CREATE POLICY "admin_delete_movements" ON public.inventario_movimientos FOR DELETE USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'developer')
);
