-- ============================================================
-- AM-Scheduler PRO — Migration
-- Replaces Google Calendar + Calendly with native scheduling
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. Extend agenda_appointments with scheduler metadata
-- ─────────────────────────────────────────────────────────────
ALTER TABLE agenda_appointments
  ADD COLUMN IF NOT EXISTS color_tag       TEXT,                         -- hex color override per event
  ADD COLUMN IF NOT EXISTS external_id     TEXT,                         -- Google Cal / Calendly event id
  ADD COLUMN IF NOT EXISTS source          TEXT DEFAULT 'manual',        -- 'manual' | 'google_calendar' | 'calendly'
  ADD COLUMN IF NOT EXISTS checked_in_at   TIMESTAMPTZ,                  -- when patient physically arrived
  ADD COLUMN IF NOT EXISTS survey_sent_at  TIMESTAMPTZ,                  -- post-appointment survey timestamp
  ADD COLUMN IF NOT EXISTS reminder_sent_24h BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_sent_1h  BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_agenda_appointments_external_id ON agenda_appointments(external_id);
CREATE INDEX IF NOT EXISTS idx_agenda_appointments_source      ON agenda_appointments(source);
CREATE INDEX IF NOT EXISTS idx_agenda_appointments_status      ON agenda_appointments(status);

-- ─────────────────────────────────────────────────────────────
-- 2. doctor_schedules — Working hours & buffer per doctor/day
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doctor_schedules (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week            INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  -- 0=Sunday, 1=Monday … 6=Saturday
  start_time             TIME NOT NULL DEFAULT '08:00',
  end_time               TIME NOT NULL DEFAULT '18:00',
  slot_duration_minutes  INTEGER NOT NULL DEFAULT 30,
  buffer_minutes         INTEGER NOT NULL DEFAULT 5,   -- "tiempo de sillón"
  max_appointments       INTEGER DEFAULT 12,
  is_active              BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(doctor_id, day_of_week)
);

ALTER TABLE doctor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor_schedules_read_all" ON doctor_schedules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "doctor_schedules_write_staff" ON doctor_schedules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'developer')
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. notification_rules — Configurable reminder engine
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_rules (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name                 TEXT NOT NULL,
  description          TEXT,
  -- negative = before appointment, positive = after (for post-care)
  trigger_offset_hours NUMERIC(6,2) NOT NULL,
  -- which appointment statuses activate this rule
  trigger_on_statuses  TEXT[]  DEFAULT ARRAY['confirmed', 'pending'],
  channel              TEXT    NOT NULL DEFAULT 'email',
  -- 'email' | 'whatsapp' | 'both'
  template_key         TEXT    NOT NULL,
  -- e.g. 'reminder_24h', 'reminder_1h', 'cancellation', 'survey'
  is_active            BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_rules_read_all" ON notification_rules
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "notification_rules_write_admin" ON notification_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'developer')
    )
  );

-- Seed default rules
INSERT INTO notification_rules (name, description, trigger_offset_hours, channel, template_key, is_active) VALUES
  ('Recordatorio 24h', 'Pedido de confirmación 24 horas antes del turno', -24, 'both', 'reminder_24h', TRUE),
  ('Recordatorio 1h', 'Aviso de llegada 1 hora antes del turno', -1, 'both', 'reminder_1h', TRUE),
  ('Confirmación inmediata', 'Confirmación al crear el turno', 0, 'email', 'appointment_confirmed', TRUE),
  ('Encuesta post-turno', 'Encuesta de satisfacción 30 min después de finalizado', 0.5, 'whatsapp', 'survey_post_appointment', TRUE),
  ('Cancelación', 'Aviso de cancelación al paciente', 0, 'both', 'appointment_cancelled', TRUE)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 4. notification_logs — Audit trail for every notification
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_logs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id   UUID REFERENCES agenda_appointments(id) ON DELETE CASCADE,
  rule_id          UUID REFERENCES notification_rules(id) ON DELETE SET NULL,
  channel          TEXT NOT NULL,          -- 'email' | 'whatsapp'
  recipient_email  TEXT,
  recipient_phone  TEXT,
  template_key     TEXT,
  payload          JSONB,                  -- serialized template vars
  status           TEXT NOT NULL DEFAULT 'pending',
  -- 'pending' | 'sent' | 'failed' | 'bounced'
  provider_id      TEXT,                  -- Resend/Twilio message id
  error_message    TEXT,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_appointment ON notification_logs(appointment_id);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status      ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_sent_at     ON notification_logs(sent_at);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_logs_read_staff" ON notification_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('owner', 'admin', 'reception', 'developer')
    )
  );

CREATE POLICY "notification_logs_insert_system" ON notification_logs
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────
-- 5. satisfaction_surveys — Post-appointment feedback (PRO)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS satisfaction_surveys (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  appointment_id UUID REFERENCES agenda_appointments(id) ON DELETE CASCADE,
  patient_id     UUID,                     -- denormalized for speed
  token          TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  sent_at        TIMESTAMPTZ,
  responded_at   TIMESTAMPTZ,
  rating         INTEGER CHECK (rating BETWEEN 1 AND 5),
  feedback       TEXT,
  doctor_rating  INTEGER CHECK (doctor_rating BETWEEN 1 AND 5),
  would_recommend BOOLEAN,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_appointment ON satisfaction_surveys(appointment_id);
CREATE INDEX IF NOT EXISTS idx_satisfaction_surveys_token       ON satisfaction_surveys(token);

ALTER TABLE satisfaction_surveys ENABLE ROW LEVEL SECURITY;

-- Public access via token (patient portal, no auth required)
CREATE POLICY "satisfaction_surveys_public_read_by_token" ON satisfaction_surveys
  FOR SELECT USING (TRUE);

CREATE POLICY "satisfaction_surveys_public_update_by_token" ON satisfaction_surveys
  FOR UPDATE USING (TRUE);

CREATE POLICY "satisfaction_surveys_insert_system" ON satisfaction_surveys
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "satisfaction_surveys_staff_read" ON satisfaction_surveys
  FOR SELECT USING (auth.role() = 'authenticated');

-- ─────────────────────────────────────────────────────────────
-- 6. Helper: get_pending_reminders() RPC
-- Called by the cron job at /api/agenda/remind
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_pending_reminders(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
  appointment_id   UUID,
  rule_id          UUID,
  template_key     TEXT,
  channel          TEXT,
  patient_name     TEXT,
  patient_email    TEXT,
  patient_phone    TEXT,
  doctor_name      TEXT,
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  appointment_type TEXT,
  appointment_status TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    a.id                           AS appointment_id,
    r.id                           AS rule_id,
    r.template_key,
    r.channel,
    COALESCE(p.nombre || ' ' || p.apellido, a.title) AS patient_name,
    p.email                         AS patient_email,
    p.telefono                      AS patient_phone,
    pr.full_name                    AS doctor_name,
    a.start_time,
    a.end_time,
    a.type                          AS appointment_type,
    a.status                        AS appointment_status
  FROM agenda_appointments a
  JOIN notification_rules r ON TRUE
  LEFT JOIN pacientes p        ON p.id_paciente = a.patient_id
  LEFT JOIN profiles  pr       ON pr.id = a.doctor_id
  WHERE r.is_active = TRUE
    AND a.status = ANY(r.trigger_on_statuses::text[])
    -- Fire window: ±5 min around the scheduled trigger moment
    AND (a.start_time + (r.trigger_offset_hours || ' hours')::INTERVAL)
        BETWEEN (p_now - INTERVAL '5 minutes') AND (p_now + INTERVAL '5 minutes')
    -- Avoid duplicates via notification_logs
    AND NOT EXISTS (
      SELECT 1 FROM notification_logs nl
      WHERE nl.appointment_id = a.id
        AND nl.rule_id = r.id
        AND nl.status IN ('sent', 'pending')
    )
  ORDER BY a.start_time;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. Helper: get_completed_for_survey() RPC
-- Returns appointments finished ~30 min ago without survey
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_completed_for_survey(p_now TIMESTAMPTZ DEFAULT NOW())
RETURNS TABLE (
  appointment_id UUID,
  patient_name   TEXT,
  patient_phone  TEXT,
  patient_email  TEXT,
  doctor_name    TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    a.id                           AS appointment_id,
    COALESCE(p.nombre || ' ' || p.apellido, a.title) AS patient_name,
    p.telefono                      AS patient_phone,
    p.email                         AS patient_email,
    pr.full_name                    AS doctor_name
  FROM agenda_appointments a
  LEFT JOIN pacientes p  ON p.id_paciente = a.patient_id
  LEFT JOIN profiles  pr ON pr.id = a.doctor_id
  WHERE a.status = 'completed'
    AND a.end_time BETWEEN (p_now - INTERVAL '35 minutes') AND (p_now - INTERVAL '25 minutes')
    AND a.survey_sent_at IS NULL
    AND p.telefono IS NOT NULL
  ORDER BY a.end_time;
$$;

-- ─────────────────────────────────────────────────────────────
-- 8. Waiting room view: active patients in clinic today
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW waiting_room_today AS
SELECT
  a.id,
  a.start_time,
  a.end_time,
  a.status,
  a.type,
  a.checked_in_at,
  EXTRACT(EPOCH FROM (NOW() - a.checked_in_at)) / 60 AS waiting_minutes,
  COALESCE(p.nombre || ' ' || p.apellido, a.title)  AS patient_name,
  p.telefono                                          AS patient_phone,
  pr.full_name                                        AS doctor_name,
  a.doctor_id,
  a.patient_id
FROM agenda_appointments a
LEFT JOIN pacientes p  ON p.id_paciente = a.patient_id
LEFT JOIN profiles  pr ON pr.id = a.doctor_id
WHERE a.start_time::DATE = CURRENT_DATE
  AND a.status IN ('arrived', 'pending', 'confirmed', 'in_progress')
ORDER BY
  CASE a.status
    WHEN 'arrived'     THEN 1
    WHEN 'in_progress' THEN 2
    WHEN 'confirmed'   THEN 3
    WHEN 'pending'     THEN 4
  END,
  a.checked_in_at NULLS LAST,
  a.start_time;
