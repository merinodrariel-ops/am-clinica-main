-- Add monthly currency selector support for provider configuration
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS moneda_mensual text NOT NULL DEFAULT 'ARS';

-- Keep allowed values constrained
ALTER TABLE public.personal
    DROP CONSTRAINT IF EXISTS personal_moneda_mensual_check;

ALTER TABLE public.personal
    ADD CONSTRAINT personal_moneda_mensual_check
    CHECK (moneda_mensual IN ('ARS', 'USD'));
