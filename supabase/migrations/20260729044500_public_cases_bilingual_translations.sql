ALTER TABLE public.public_clinical_cases
    ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.public_clinical_case_assets
    ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.public_clinical_cases.translations IS
    'Localized editorial content keyed by language, for example {"en":{"title":"...","description":"...","copy":"..."}}.';

COMMENT ON COLUMN public.public_clinical_case_assets.translations IS
    'Localized image metadata keyed by language, for example {"en":{"alt":"...","caption":"..."}}.';
