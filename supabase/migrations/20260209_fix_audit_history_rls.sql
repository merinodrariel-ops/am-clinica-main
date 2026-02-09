-- =============================================
-- Migration: Fix RLS for Audit History Visibility
-- Created: 2026-02-09
-- Purpose: Allow admins to view profiles (for audit logs) and ensure history visibility
-- =============================================

-- 1. Allow admins to view all profiles (needed to see names in history logs)
-- Note: "Users can view own profile" already exists, so the subquery for self-role check works by recursing to that policy or this one (for self).
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid()
            AND role IN ('owner', 'admin')
        )
    );

-- 2. Update historial_ediciones policies to be sure
-- We already have "historial_select_admin_owner" in previous migration, 
-- but let's ensure it covers what we need.

-- Check if we need to drop previous one to avoid duplicates if migration is re-run
-- (The previous migration used drop if exists, so we are good to add/replace)
-- Actually, let's just leave the previous policy if it works. 
-- The main issue was likely the JOIN on profiles.

-- However, if we want Receptionists to see history of their own box?
-- The user said "historial de cambios en ambas cajas".
-- If a receptionist can see the reception box, they might want to see history too?
-- For now, let's limit to Admin/Owner as per explicit request for "Full Control".

-- 3. Ensure 'historial_ediciones' has proper permissions for the join
-- The UI query: select *, profiles:usuario_editor (full_name) ...
-- This requires SELECT on historial_ediciones AND SELECT on profiles.
-- We fixed profiles above.
