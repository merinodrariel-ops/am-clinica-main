-- =============================================
-- Migration: Fix Foreign Key for PostgREST Join
-- Created: 2026-02-09
-- Purpose: Point usuario_editor to public.profiles instead of auth.users
--          This enables the API call .select('*, profiles:usuario_editor (*)') to work.
-- =============================================

-- 1. Drop old constraint referencing auth.users
ALTER TABLE public.historial_ediciones
DROP CONSTRAINT IF EXISTS historial_ediciones_usuario_editor_fkey;

-- 2. Add new constraint referencing public.profiles
-- Note: ON DELETE SET NULL is preserved.
ALTER TABLE public.historial_ediciones
ADD CONSTRAINT historial_ediciones_usuario_editor_profiles_fkey
FOREIGN KEY (usuario_editor)
REFERENCES public.profiles(id)
ON DELETE SET NULL;
