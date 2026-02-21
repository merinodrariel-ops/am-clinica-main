-- Fix missing RLS policies for caja_admin_movimiento_lineas
-- The previous migration 20260212_fix_caja_admin_permissions.sql had conditionally bypassed creating these 
-- due to a race condition or table not being fully detected.

ALTER TABLE public.caja_admin_movimiento_lineas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access on caja_admin_lineas" ON public.caja_admin_movimiento_lineas;
DROP POLICY IF EXISTS "Admin full access on caja_admin_lineas" ON public.caja_admin_movimiento_lineas;
DROP POLICY IF EXISTS "Partner Viewer read only caja_admin_lineas" ON public.caja_admin_movimiento_lineas;

CREATE POLICY "Owner full access on caja_admin_lineas"
ON public.caja_admin_movimiento_lineas
FOR ALL
USING (public.get_my_role() = 'owner')
WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "Admin full access on caja_admin_lineas"
ON public.caja_admin_movimiento_lineas
FOR ALL
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Partner Viewer read only caja_admin_lineas"
ON public.caja_admin_movimiento_lineas
FOR SELECT
USING (public.get_my_role() = 'partner_viewer');
