
-- 1. Update Profiles Constraint to include 'laboratorio' and ensure others
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('owner', 'admin', 'reception', 'developer', 'pricing_manager', 'partner_viewer', 'laboratorio'));

-- 2. Enable RLS on inventory
ALTER TABLE public.inventario_items ENABLE ROW LEVEL SECURITY;

-- 3. Create Policies for Inventory

-- READ Policy
DROP POLICY IF EXISTS "read_inventory" ON public.inventario_items;
CREATE POLICY "read_inventory" ON public.inventario_items FOR SELECT USING (
    auth.role() = 'authenticated' AND (
        -- Roles with full view access
        (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'reception', 'developer', 'pricing_manager', 'partner_viewer')
        OR
        -- Laboratorio role restricted to LABORATORIO area
        ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'laboratorio' AND area = 'LABORATORIO')
    )
);

-- WRITE Policy (Insert, Update, Delete) for Owner/Admin/Developer
DROP POLICY IF EXISTS "admin_write_inventory" ON public.inventario_items;
CREATE POLICY "admin_write_inventory" ON public.inventario_items FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'developer')
);

-- WRITE Policy for Reception (Full Access to Inventory)
DROP POLICY IF EXISTS "reception_write_inventory" ON public.inventario_items;
CREATE POLICY "reception_write_inventory" ON public.inventario_items FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'reception'
);

-- WRITE Policy for Laboratorio (Only LABORATORIO area)
DROP POLICY IF EXISTS "laboratorio_write_inventory" ON public.inventario_items;
CREATE POLICY "laboratorio_write_inventory" ON public.inventario_items FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'laboratorio'
    AND area = 'LABORATORIO'
) WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'laboratorio'
    AND area = 'LABORATORIO'
);
