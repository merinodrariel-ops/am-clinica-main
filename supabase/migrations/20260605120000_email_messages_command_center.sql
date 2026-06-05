-- Unified outbound email trace table for the internal Emails module.

CREATE TABLE IF NOT EXISTS public.email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  direction TEXT NOT NULL DEFAULT 'outbound',
  status TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'resend',
  provider_message_id TEXT,
  provider_event_id TEXT,
  from_email TEXT,
  from_name TEXT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  cc JSONB NOT NULL DEFAULT '[]'::jsonb,
  bcc JSONB NOT NULL DEFAULT '[]'::jsonb,
  reply_to TEXT,
  subject TEXT NOT NULL,
  template_key TEXT,
  template_label TEXT,
  message_type TEXT NOT NULL DEFAULT 'other',
  source_module TEXT NOT NULL DEFAULT 'email_service',
  patient_id UUID REFERENCES public.pacientes(id_paciente) ON DELETE SET NULL,
  appointment_id UUID REFERENCES public.agenda_appointments(id) ON DELETE SET NULL,
  workflow_id UUID REFERENCES public.clinical_workflows(id) ON DELETE SET NULL,
  treatment_id UUID REFERENCES public.patient_treatments(id) ON DELETE SET NULL,
  scheduled_message_id UUID,
  idempotency_key TEXT,
  html_snapshot TEXT,
  text_snapshot TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  queued_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  bounced_at TIMESTAMPTZ,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT email_messages_direction_check CHECK (direction IN ('outbound', 'inbound')),
  CONSTRAINT email_messages_status_check CHECK (status IN (
    'queued',
    'sending',
    'sent',
    'failed',
    'delivered',
    'bounced',
    'opened',
    'clicked',
    'cancelled'
  )),
  CONSTRAINT email_messages_type_check CHECK (message_type IN (
    'appointment_reminder',
    'appointment_confirmation',
    'appointment_cancellation',
    'survey_first_visit',
    'survey_post_appointment',
    'portal_invitation',
    'password_reset',
    'workflow_notification',
    'treatment_followup',
    'budget',
    'payment_confirmation',
    'test',
    'other'
  ))
);

CREATE INDEX IF NOT EXISTS idx_email_messages_created_at ON public.email_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON public.email_messages(status);
CREATE INDEX IF NOT EXISTS idx_email_messages_message_type ON public.email_messages(message_type);
CREATE INDEX IF NOT EXISTS idx_email_messages_provider ON public.email_messages(provider);
CREATE INDEX IF NOT EXISTS idx_email_messages_to_email ON public.email_messages(LOWER(to_email));
CREATE INDEX IF NOT EXISTS idx_email_messages_patient_id ON public.email_messages(patient_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_appointment_id ON public.email_messages(appointment_id);
CREATE INDEX IF NOT EXISTS idx_email_messages_source_module ON public.email_messages(source_module);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_idempotency_key
  ON public.email_messages(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_email_messages_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_email_messages_updated_at ON public.email_messages;
CREATE TRIGGER trg_email_messages_updated_at
  BEFORE UPDATE ON public.email_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_email_messages_updated_at();

ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.email_messages TO authenticated;
REVOKE ALL ON public.email_messages FROM anon;

DROP POLICY IF EXISTS "email_messages_read_internal" ON public.email_messages;
CREATE POLICY "email_messages_read_internal"
ON public.email_messages
FOR SELECT
USING (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer'));

DROP POLICY IF EXISTS "email_messages_insert_internal" ON public.email_messages;
CREATE POLICY "email_messages_insert_internal"
ON public.email_messages
FOR INSERT
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer'));

DROP POLICY IF EXISTS "email_messages_update_internal" ON public.email_messages;
CREATE POLICY "email_messages_update_internal"
ON public.email_messages
FOR UPDATE
USING (public.get_my_role() IN ('owner', 'admin', 'developer'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'developer'));
