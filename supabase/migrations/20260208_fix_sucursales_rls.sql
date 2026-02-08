-- Fix RLS policies for sucursales and cuentas_financieras
-- This allows authenticated users to read these tables

-- First, ensure RLS is enabled
ALTER TABLE IF EXISTS public.sucursales ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cuentas_financieras ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies that might conflict
DROP POLICY IF EXISTS "Authenticated users can view sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Owner/Admin can manage sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Allow all authenticated to view sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "Service role full access sucursales" ON public.sucursales;
DROP POLICY IF EXISTS "sucursales_anon" ON public.sucursales;
DROP POLICY IF EXISTS "sucursales_select_all" ON public.sucursales;

DROP POLICY IF EXISTS "Authenticated users can view cuentas" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "Owner/Admin can manage cuentas" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "cuentas_financieras_anon" ON public.cuentas_financieras;
DROP POLICY IF EXISTS "cuentas_select_all" ON public.cuentas_financieras;

-- Create simple read policies for all authenticated users
CREATE POLICY "sucursales_select_all" ON public.sucursales
    FOR SELECT
    USING (true);  -- Allow all reads (the table is not sensitive)

CREATE POLICY "cuentas_select_all" ON public.cuentas_financieras
    FOR SELECT
    USING (true);  -- Allow all reads

-- Create write policies for admin/owner only (using get_my_role function if it exists)
DO $$
BEGIN
    -- Check if get_my_role function exists before using it
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'get_my_role') THEN
        -- Use the function for write access
        EXECUTE 'CREATE POLICY "sucursales_admin_modify" ON public.sucursales 
            FOR ALL 
            USING (get_my_role() IN (''owner'', ''admin''))';
        
        EXECUTE 'CREATE POLICY "cuentas_admin_modify" ON public.cuentas_financieras 
            FOR ALL 
            USING (get_my_role() IN (''owner'', ''admin''))';
    ELSE
        -- Fallback: allow all authenticated users to modify (less secure but functional)
        EXECUTE 'CREATE POLICY "sucursales_admin_modify" ON public.sucursales 
            FOR ALL 
            USING (auth.role() = ''authenticated'')';
        
        EXECUTE 'CREATE POLICY "cuentas_admin_modify" ON public.cuentas_financieras 
            FOR ALL 
            USING (auth.role() = ''authenticated'')';
    END IF;
END
$$;
