-- Daily agenda delivery settings for doctors

CREATE TABLE IF NOT EXISTS public.doctor_daily_agenda_settings (
  doctor_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  whatsapp TEXT,
  send_email BOOLEAN NOT NULL DEFAULT TRUE,
  send_whatsapp BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  send_time TIME NOT NULL DEFAULT '08:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.doctor_daily_agenda_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  agenda_date DATE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email', 'whatsapp')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  appointment_count INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (doctor_id, agenda_date, channel, recipient)
);

CREATE INDEX IF NOT EXISTS idx_doctor_daily_agenda_settings_active
  ON public.doctor_daily_agenda_settings(is_active);

CREATE INDEX IF NOT EXISTS idx_doctor_daily_agenda_logs_date
  ON public.doctor_daily_agenda_logs(agenda_date);

ALTER TABLE public.doctor_daily_agenda_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_daily_agenda_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctor_daily_agenda_settings_read_staff" ON public.doctor_daily_agenda_settings;
CREATE POLICY "doctor_daily_agenda_settings_read_staff"
  ON public.doctor_daily_agenda_settings
  FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "doctor_daily_agenda_settings_write_admin" ON public.doctor_daily_agenda_settings;
CREATE POLICY "doctor_daily_agenda_settings_write_admin"
  ON public.doctor_daily_agenda_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND COALESCE(categoria, role) IN ('owner', 'admin', 'developer')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND COALESCE(categoria, role) IN ('owner', 'admin', 'developer')
    )
  );

DROP POLICY IF EXISTS "doctor_daily_agenda_logs_read_staff" ON public.doctor_daily_agenda_logs;
CREATE POLICY "doctor_daily_agenda_logs_read_staff"
  ON public.doctor_daily_agenda_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
      AND COALESCE(categoria, role) IN ('owner', 'admin', 'reception', 'asistente', 'developer')
    )
  );

DROP POLICY IF EXISTS "doctor_daily_agenda_logs_insert_system" ON public.doctor_daily_agenda_logs;
CREATE POLICY "doctor_daily_agenda_logs_insert_system"
  ON public.doctor_daily_agenda_logs
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE OR REPLACE FUNCTION public.touch_doctor_daily_agenda_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_doctor_daily_agenda_settings ON public.doctor_daily_agenda_settings;
CREATE TRIGGER trg_touch_doctor_daily_agenda_settings
  BEFORE UPDATE ON public.doctor_daily_agenda_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_doctor_daily_agenda_settings();

-- Seed Dr. Ariel Merino's daily agenda email so the owner receives the morning agenda by default.
INSERT INTO public.doctor_daily_agenda_settings (
  doctor_id,
  email,
  send_email,
  send_whatsapp,
  is_active
)
SELECT
  pr.id,
  'drarielmerino@gmail.com',
  TRUE,
  TRUE,
  TRUE
FROM public.profiles pr
WHERE (
    lower(coalesce(pr.full_name, '')) LIKE '%ariel%'
    AND lower(coalesce(pr.full_name, '')) LIKE '%merino%'
  )
  OR lower(coalesce(pr.email, '')) IN (
    'dr.arielmerinopersonal@gmail.com',
    'doctor.arielmerinopersonal@gmail.com'
  )
ON CONFLICT (doctor_id) DO UPDATE
SET
  email = EXCLUDED.email,
  send_email = TRUE,
  is_active = TRUE,
  updated_at = NOW();
