-- Cancellation notices are event-driven from updateAppointment.
-- The old scheduled rule sent a cancellation at the appointment start time
-- for every confirmed/pending appointment.
UPDATE public.notification_rules
SET is_active = FALSE,
    updated_at = NOW()
WHERE template_key = 'appointment_cancelled';

-- Keep the RPC safe if an old/duplicate rule is reactivated accidentally:
-- cancellation templates may only run for cancelled appointments.
CREATE OR REPLACE FUNCTION public.get_pending_reminders(p_now timestamp with time zone)
RETURNS TABLE(appointment_id uuid, rule_id uuid, template_key text, channel text,
  patient_name text, patient_email text, patient_whatsapp text, doctor_name text,
  start_time timestamp with time zone, end_time timestamp with time zone,
  appointment_type text, appointment_status text)
LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  SELECT a.id, r.id, r.template_key, r.channel,
    COALESCE(p.nombre || ' ' || p.apellido, a.title), p.email, p.whatsapp,
    pr.full_name, a.start_time, a.end_time, a.type::text, a.status::text
  FROM agenda_appointments a
  JOIN notification_rules r ON TRUE
  LEFT JOIN pacientes p ON p.id_paciente = a.patient_id
  LEFT JOIN profiles pr ON pr.id = a.doctor_id
  WHERE r.is_active = TRUE
    AND a.status::text = ANY(r.trigger_on_statuses)
    AND (r.template_key <> 'appointment_cancelled' OR a.status::text = 'cancelled')
    AND (a.start_time + (r.trigger_offset_hours || ' hours')::INTERVAL)
      BETWEEN (p_now - INTERVAL '5 minutes') AND (p_now + INTERVAL '5 minutes')
    AND NOT EXISTS (
      SELECT 1 FROM notification_logs nl
      WHERE nl.appointment_id = a.id AND nl.rule_id = r.id
        AND nl.status IN ('sent','pending')
    )
  ORDER BY a.start_time;
$function$;
