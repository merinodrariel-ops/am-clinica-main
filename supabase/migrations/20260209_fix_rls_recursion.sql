-- =============================================
-- Migration: Fix RLS Infinite Recursion
-- Created: 2026-02-09
-- Purpose: Use SECURITY DEFINER function to break recursion in profile checks
-- =============================================

-- 1. Create helper function to check admin role without triggering RLS
CREATE OR REPLACE FUNCTION public.is_admin_or_owner()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role IN ('owner', 'admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Update profiles policy to use the helper
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        -- Allow if user is looking at their own profile (usually covered by other policies, but good fallback)
        auth.uid() = id 
        OR 
        -- Allow if user is admin/owner (using secure function)
        public.is_admin_or_owner()
    );

-- 3. Update historial_ediciones policy to use the helper too (cleaner)
DROP POLICY IF EXISTS "historial_select_admin_owner" ON public.historial_ediciones;

CREATE POLICY "historial_select_admin_owner"
    ON public.historial_ediciones
    FOR SELECT
    USING (
        public.is_admin_or_owner()
    );
