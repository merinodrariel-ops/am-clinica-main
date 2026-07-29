-- Clinical area assigned to each appointment.
-- Reuses personal_areas so the same area configured for a professional is used by Agenda.
ALTER TABLE public.agenda_appointments
    ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.personal_areas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_area_id
    ON public.agenda_appointments(area_id);

