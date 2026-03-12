-- Migration: Prestador auto-registro
-- 2026-03-12
-- Adds CBU/alias/CUIT columns and fuente_registro to personal table

ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS cbu TEXT,
    ADD COLUMN IF NOT EXISTS cbu_alias TEXT,
    ADD COLUMN IF NOT EXISTS cuit TEXT,
    ADD COLUMN IF NOT EXISTS fuente_registro TEXT DEFAULT 'admin';

-- Allow anonymous INSERT only with activo = false and fuente_registro = 'autoregistro'
-- This lets a provider self-register without auth
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'personal'
        AND policyname = 'anon_can_self_register_prestador'
    ) THEN
        CREATE POLICY "anon_can_self_register_prestador"
            ON public.personal
            FOR INSERT
            TO anon
            WITH CHECK (activo = false AND fuente_registro = 'autoregistro');
    END IF;
END
$$;
