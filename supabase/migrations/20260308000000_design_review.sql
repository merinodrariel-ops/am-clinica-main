-- patient_design_reviews: estado de revisión de cada diseño de sonrisa
CREATE TABLE IF NOT EXISTS public.patient_design_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- C1: patient_id es TEXT (pacientes.id_paciente es TEXT, no UUID)
  patient_id          TEXT NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
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

-- I4: Índices para búsquedas por patient_id y (patient_id, status)
CREATE INDEX IF NOT EXISTS idx_pdr_patient_id ON public.patient_design_reviews(patient_id);
CREATE INDEX IF NOT EXISTS idx_pdr_patient_status ON public.patient_design_reviews(patient_id, status);

ALTER TABLE public.patient_design_reviews ENABLE ROW LEVEL SECURITY;

-- I3: El acceso del paciente se hace vía admin client (service_role) bypaseando RLS,
-- por lo que no se necesita policy adicional para anon/authenticated en este lado.
-- Solo staff autorizado tiene policy explícita.
DROP POLICY IF EXISTS "design_reviews_staff_all" ON public.patient_design_reviews;
CREATE POLICY "design_reviews_staff_all"
ON public.patient_design_reviews FOR ALL
-- I1: Usar public.get_my_role() en todas las policies
USING (public.get_my_role() = ANY(ARRAY['owner','admin','reception','developer','asistente']))
WITH CHECK (public.get_my_role() = ANY(ARRAY['owner','admin','reception','developer','asistente']));

-- Agregar review_id a patient_portal_tokens
-- C2: ON DELETE SET NULL para no invalidar el token si se borra la review
ALTER TABLE public.patient_portal_tokens
ADD COLUMN IF NOT EXISTS review_id UUID NULL REFERENCES public.patient_design_reviews(id) ON DELETE SET NULL;

-- m3: Tabla renombrada a design_review_destinatarios (nombre en español, coherente con el proyecto)
-- Notifiees → Destinatarios: quiénes reciben notificaciones de diseño
CREATE TABLE IF NOT EXISTS public.design_review_destinatarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- I2: CHECK constraint que garantiza que solo valores válidos estén en el array
  notify_on   TEXT[] NOT NULL DEFAULT ARRAY['viewed','approved','revision']
              CHECK (notify_on <@ ARRAY['viewed','approved','revision','pending']::TEXT[]),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(profile_id)
);

ALTER TABLE public.design_review_destinatarios ENABLE ROW LEVEL SECURITY;

-- m3: Policy renombrada para reflejar el nuevo nombre de tabla
DROP POLICY IF EXISTS "notifiees_admin_all" ON public.design_review_destinatarios;
CREATE POLICY "destinatarios_admin_all"
ON public.design_review_destinatarios FOR ALL
-- I1: Usar public.get_my_role() en todas las policies
USING (public.get_my_role() = ANY(ARRAY['owner','admin','developer']))
WITH CHECK (public.get_my_role() = ANY(ARRAY['owner','admin','developer']));
