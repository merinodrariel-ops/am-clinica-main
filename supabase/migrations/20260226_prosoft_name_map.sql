-- ============================================================
-- Prosoft Name Map — equivalencias de nombres Prosoft ↔ personal
-- ============================================================

CREATE TABLE IF NOT EXISTS public.prosoft_name_map (
    raw_name   TEXT PRIMARY KEY,
    personal_id UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.prosoft_name_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage prosoft_name_map"
ON public.prosoft_name_map FOR ALL
USING (public.get_my_role() IN ('owner', 'admin'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

CREATE INDEX IF NOT EXISTS idx_prosoft_name_map_personal
    ON public.prosoft_name_map(personal_id);
