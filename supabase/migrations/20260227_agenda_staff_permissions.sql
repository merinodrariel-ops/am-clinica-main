-- Expand agenda write permissions to clinical staff roles.
-- Context: asistentes and odontologos can access Agenda 360 and need to
-- create/update appointments from the UI.

DROP POLICY IF EXISTS "Enable insert for staff" ON public.agenda_appointments;
CREATE POLICY "Enable insert for staff" ON public.agenda_appointments
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo', 'recaptacion')
    )
  );

DROP POLICY IF EXISTS "Enable update for staff" ON public.agenda_appointments;
CREATE POLICY "Enable update for staff" ON public.agenda_appointments
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo', 'recaptacion')
    )
  );
