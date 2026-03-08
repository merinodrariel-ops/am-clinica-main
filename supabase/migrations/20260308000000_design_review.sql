-- patient_design_reviews: estado de revisión de cada diseño de sonrisa
CREATE TABLE IF NOT EXISTS public.patient_design_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          UUID NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
  drive_html_file_id  TEXT NULL,
  exocad_folder_id    TEXT NULL,
  label               TEXT NOT NULL DEFAULT 'Diseño de Sonrisa',
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'viewed', 'approved', 'revision')),
  patient_comment     TEXT NULL,
  uploaded_by         UUID NULL REFERENCES public.profiles(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  viewed_at           TIMESTAMPTZ NULL,
  responded_at        TIMESTAMPTZ NULL
);

ALTER TABLE public.patient_design_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "design_reviews_staff_all" ON public.patient_design_reviews;
CREATE POLICY "design_reviews_staff_all"
ON public.patient_design_reviews FOR ALL
USING (get_my_role() = ANY(ARRAY['owner','admin','reception','developer','asistente']))
WITH CHECK (get_my_role() = ANY(ARRAY['owner','admin','reception','developer','asistente']));

-- Agregar review_id a patient_portal_tokens
ALTER TABLE public.patient_portal_tokens
ADD COLUMN IF NOT EXISTS review_id UUID NULL REFERENCES public.patient_design_reviews(id);

-- Notifiees: quiénes reciben notificaciones de diseño
CREATE TABLE IF NOT EXISTS public.design_review_notifiees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notify_on   TEXT[] NOT NULL DEFAULT ARRAY['viewed','approved','revision'],
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

ALTER TABLE public.design_review_notifiees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifiees_admin_all" ON public.design_review_notifiees;
CREATE POLICY "notifiees_admin_all"
ON public.design_review_notifiees FOR ALL
USING (get_my_role() = ANY(ARRAY['owner','admin','developer']))
WITH CHECK (get_my_role() = ANY(ARRAY['owner','admin','developer']));
