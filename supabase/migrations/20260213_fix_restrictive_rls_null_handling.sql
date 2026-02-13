-- =============================================
-- FIX: RESTRICTIVE RLS policies blocking anon/null roles
-- Applied: 2026-02-13
-- 
-- Problem: The RESTRICTIVE policies created for google_user restriction
-- applied to ALL roles (including 'anon'). Since get_my_role() returns 
-- NULL for anon users, and NULL <> 'google_user' evaluates to NULL 
-- (not TRUE), the RESTRICTIVE policy was blocking ALL access for anon.
-- This caused 0 rows to be visible for any query without a valid JWT.
--
-- Root Cause: RESTRICTIVE policies were set TO public (all roles),
-- and the condition didn't handle NULL from get_my_role().
--
-- Solution: 
-- 1. Scope RESTRICTIVE policies to 'authenticated' role only (TO authenticated)
-- 2. Add COALESCE to handle NULL get_my_role() gracefully
-- =============================================

-- 1. Fix pacientes
DROP POLICY IF EXISTS "google_user_restrict_own_rows" ON pacientes;
CREATE POLICY "google_user_restrict_own_rows" 
    ON pacientes 
    AS RESTRICTIVE 
    FOR ALL 
    TO authenticated
    USING (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR (auth.uid())::text = created_by
    )
    WITH CHECK (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR (auth.uid())::text = created_by
    );

-- 2. Fix caja_admin_movimientos
DROP POLICY IF EXISTS "google_user_restrict_own_rows" ON caja_admin_movimientos;
CREATE POLICY "google_user_restrict_own_rows" 
    ON caja_admin_movimientos 
    AS RESTRICTIVE 
    FOR ALL 
    TO authenticated
    USING (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR (auth.uid())::text = created_by
    )
    WITH CHECK (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR (auth.uid())::text = created_by
    );

-- 3. Fix caja_recepcion_movimientos
DROP POLICY IF EXISTS "google_user_restrict_own_rows" ON caja_recepcion_movimientos;
CREATE POLICY "google_user_restrict_own_rows" 
    ON caja_recepcion_movimientos 
    AS RESTRICTIVE 
    FOR ALL 
    TO authenticated
    USING (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR auth.uid() = created_by
    )
    WITH CHECK (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR auth.uid() = created_by
    );

-- 4. Fix profiles - SELECT
DROP POLICY IF EXISTS "google_user_restrict_profiles_select" ON profiles;
CREATE POLICY "google_user_restrict_profiles_select" 
    ON profiles 
    AS RESTRICTIVE 
    FOR SELECT 
    TO authenticated
    USING (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR auth.uid() = id
    );

-- 5. Fix profiles - UPDATE
DROP POLICY IF EXISTS "google_user_restrict_profiles_update" ON profiles;
CREATE POLICY "google_user_restrict_profiles_update" 
    ON profiles 
    AS RESTRICTIVE 
    FOR UPDATE 
    TO authenticated
    USING (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR auth.uid() = id
    )
    WITH CHECK (
        COALESCE(get_my_role(), 'authenticated') <> 'google_user' 
        OR auth.uid() = id
    );
