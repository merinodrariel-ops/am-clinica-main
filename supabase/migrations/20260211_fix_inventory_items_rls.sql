
-- Update inventory update policy to allow owner/admin to update EVERYTHING
DROP POLICY IF EXISTS "admin_write_inventory" ON public.inventario_items;
CREATE POLICY "admin_write_inventory" ON public.inventario_items FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) IN ('owner', 'admin', 'developer', 'reception')
);

-- Ensure Laboratorio remains restricted
DROP POLICY IF EXISTS "laboratorio_write_inventory" ON public.inventario_items;
CREATE POLICY "laboratorio_write_inventory" ON public.inventario_items FOR ALL USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'laboratorio'
    AND area = 'LABORATORIO'
) WITH CHECK (
    (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'laboratorio'
    AND area = 'LABORATORIO'
);
