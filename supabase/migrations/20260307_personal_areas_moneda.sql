-- Add moneda_liquidacion to personal_areas
ALTER TABLE public.personal_areas
    ADD COLUMN IF NOT EXISTS moneda_liquidacion text NOT NULL DEFAULT 'ARS'
        CHECK (moneda_liquidacion IN ('ARS', 'USD'));
