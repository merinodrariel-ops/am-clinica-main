-- Enable RLS on catalog tables if not already enabled
ALTER TABLE IF EXISTS public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuentas_financieras ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profesionales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.personal ENABLE ROW LEVEL SECURITY;

-- 1. SUCURSALES POLICIES
DROP POLICY IF EXISTS "sucursales_anon" ON public.sucursales;

-- Allow read access to all authenticated users (needed for selectors)
CREATE POLICY "Authenticated users can view sucursales" ON public.sucursales FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- Allow Owner/Admin to manage sucursales
CREATE POLICY "Owner/Admin can manage sucursales" ON public.sucursales USING (
  get_my_role() IN ('owner', 'admin')
);

-- 2. CUENTAS FINANCIERAS POLICIES
-- Allow read access to all authenticated users
CREATE POLICY "Authenticated users can view cuentas" ON public.cuentas_financieras FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- Allow Owner/Admin to manage cuentas
CREATE POLICY "Owner/Admin can manage cuentas" ON public.cuentas_financieras USING (
  get_my_role() IN ('owner', 'admin')
);

-- 3. PROFESIONALES POLICIES
-- Allow read access
CREATE POLICY "Authenticated users can view profesionales" ON public.profesionales FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- Allow Owner/Admin/Reception to manage
CREATE POLICY "Staff can manage profesionales" ON public.profesionales USING (
  get_my_role() IN ('owner', 'admin', 'reception')
);

-- 4. PERSONAL POLICIES
-- Allow read access
CREATE POLICY "Authenticated users can view personal" ON public.personal FOR SELECT USING (
  auth.role() = 'authenticated'
);

-- Allow Owner/Admin to manage
CREATE POLICY "Owner/Admin can manage personal" ON public.personal USING (
  get_my_role() IN ('owner', 'admin')
);
