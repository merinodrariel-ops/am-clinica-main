-- =============================================
-- Migration: Create historial_ediciones table (if not exists)
-- Created: 2026-02-08
-- Purpose: Ensure audit trail for edit tracking
-- =============================================

-- 1. Create historial_ediciones table for field-level change tracking
CREATE TABLE IF NOT EXISTS public.historial_ediciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    id_registro UUID NOT NULL,
    tabla_origen TEXT NOT NULL,
    campo_modificado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario_editor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_email TEXT,
    fecha_edicion TIMESTAMPTZ DEFAULT now(),
    motivo_edicion TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by record
CREATE INDEX IF NOT EXISTS idx_historial_ediciones_registro 
    ON public.historial_ediciones(id_registro, tabla_origen);

-- RLS for historial_ediciones
ALTER TABLE public.historial_ediciones ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid errors)
DROP POLICY IF EXISTS "Admin and owner can view edit history" ON public.historial_ediciones;
DROP POLICY IF EXISTS "Authenticated users can insert edit history" ON public.historial_ediciones;
DROP POLICY IF EXISTS "historial_select_admin_owner" ON public.historial_ediciones;
DROP POLICY IF EXISTS "historial_insert_authenticated" ON public.historial_ediciones;

-- Policy: Admin/Owner can view all edit history
CREATE POLICY "historial_select_admin_owner"
    ON public.historial_ediciones
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- Policy: Any authenticated user can insert (for audit logging)
CREATE POLICY "historial_insert_authenticated"
    ON public.historial_ediciones
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
