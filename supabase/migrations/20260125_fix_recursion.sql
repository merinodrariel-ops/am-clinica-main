-- FUNCTION: get_my_role
-- Purpose: Get current user's role without triggering RLS recursion.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- 1. DROP EXISTING POLICIES (to replace them)
DROP POLICY IF EXISTS "Owner can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Owner full access on pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Owner full access on caja_recepcion" ON public.caja_recepcion_movimientos;
DROP POLICY IF EXISTS "Owner full access on caja_admin" ON public.caja_admin_movimientos;

DROP POLICY IF EXISTS "Partner Viewer read only pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Partner Viewer read only caja_recepcion" ON public.caja_recepcion_movimientos;
DROP POLICY IF EXISTS "Partner Viewer read only caja_admin" ON public.caja_admin_movimientos;

DROP POLICY IF EXISTS "Reception manage pacientes" ON public.pacientes;
DROP POLICY IF EXISTS "Reception manage caja_recepcion" ON public.caja_recepcion_movimientos;

DROP POLICY IF EXISTS "Admin full access on caja_admin" ON public.caja_admin_movimientos;


-- 2. RECREATE POLICIES USING get_my_role()

-- PROFILES
CREATE POLICY "Owner can manage all profiles" ON public.profiles USING (
  get_my_role() = 'owner'
);

-- PACIENTES
CREATE POLICY "Owner full access on pacientes" ON public.pacientes FOR ALL USING (
  get_my_role() = 'owner'
);
CREATE POLICY "Partner Viewer read only pacientes" ON public.pacientes FOR SELECT USING (
  get_my_role() = 'partner_viewer'
);
CREATE POLICY "Reception manage pacientes" ON public.pacientes USING (
  get_my_role() IN ('reception', 'admin')
);

-- CAJA RECEPCION
CREATE POLICY "Owner full access on caja_recepcion" ON public.caja_recepcion_movimientos FOR ALL USING (
  get_my_role() = 'owner'
);
CREATE POLICY "Partner Viewer read only caja_recepcion" ON public.caja_recepcion_movimientos FOR SELECT USING (
  get_my_role() = 'partner_viewer'
);
CREATE POLICY "Reception manage caja_recepcion" ON public.caja_recepcion_movimientos USING (
  get_my_role() IN ('reception', 'admin')
);

-- CAJA ADMIN
CREATE POLICY "Owner full access on caja_admin" ON public.caja_admin_movimientos FOR ALL USING (
  get_my_role() = 'owner'
);
CREATE POLICY "Partner Viewer read only caja_admin" ON public.caja_admin_movimientos FOR SELECT USING (
  get_my_role() = 'partner_viewer'
);
CREATE POLICY "Admin full access on caja_admin" ON public.caja_admin_movimientos USING (
  get_my_role() = 'admin'
);
