-- Caja Admin permissions hardening
-- Goal: owner/admin can edit everything in caja admin movements + lines.

ALTER TABLE IF EXISTS public.caja_admin_movimientos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner full access on caja_admin" ON public.caja_admin_movimientos;
DROP POLICY IF EXISTS "Admin full access on caja_admin" ON public.caja_admin_movimientos;
DROP POLICY IF EXISTS "Partner Viewer read only caja_admin" ON public.caja_admin_movimientos;

CREATE POLICY "Owner full access on caja_admin"
ON public.caja_admin_movimientos
FOR ALL
USING (public.get_my_role() = 'owner')
WITH CHECK (public.get_my_role() = 'owner');

CREATE POLICY "Admin full access on caja_admin"
ON public.caja_admin_movimientos
FOR ALL
USING (public.get_my_role() = 'admin')
WITH CHECK (public.get_my_role() = 'admin');

CREATE POLICY "Partner Viewer read only caja_admin"
ON public.caja_admin_movimientos
FOR SELECT
USING (public.get_my_role() = 'partner_viewer');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'caja_admin_movimiento_lineas'
  ) THEN
    EXECUTE 'ALTER TABLE public.caja_admin_movimiento_lineas ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "Owner full access on caja_admin_lineas" ON public.caja_admin_movimiento_lineas';
    EXECUTE 'DROP POLICY IF EXISTS "Admin full access on caja_admin_lineas" ON public.caja_admin_movimiento_lineas';
    EXECUTE 'DROP POLICY IF EXISTS "Partner Viewer read only caja_admin_lineas" ON public.caja_admin_movimiento_lineas';

    EXECUTE 'CREATE POLICY "Owner full access on caja_admin_lineas" ON public.caja_admin_movimiento_lineas FOR ALL USING (public.get_my_role() = ''owner'') WITH CHECK (public.get_my_role() = ''owner'')';
    EXECUTE 'CREATE POLICY "Admin full access on caja_admin_lineas" ON public.caja_admin_movimiento_lineas FOR ALL USING (public.get_my_role() = ''admin'') WITH CHECK (public.get_my_role() = ''admin'')';
    EXECUTE 'CREATE POLICY "Partner Viewer read only caja_admin_lineas" ON public.caja_admin_movimiento_lineas FOR SELECT USING (public.get_my_role() = ''partner_viewer'')';
  END IF;
END
$$;
