-- Migration: Add welcome_email_sent column to pacientes table
-- Up migration
CREATE OR REPLACE FUNCTION public.up() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    ALTER TABLE public.pacientes
    ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT FALSE;
END;
$$;

-- Down migration
CREATE OR REPLACE FUNCTION public.down() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    ALTER TABLE public.pacientes
    DROP COLUMN IF EXISTS welcome_email_sent;
END;
$$;
