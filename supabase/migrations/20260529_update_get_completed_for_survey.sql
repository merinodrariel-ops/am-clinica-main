-- Update get_completed_for_survey RPC
-- Modificamos la restricción de que el teléfono no sea nulo, permitiendo a pacientes con email recibir la encuesta.

DROP FUNCTION IF EXISTS public.get_completed_for_survey(TIMESTAMPTZ);

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
    p.whatsapp                      AS patient_phone,
    p.email                         AS patient_email,
    pr.full_name                    AS doctor_name
  FROM agenda_appointments a
  LEFT JOIN public.pacientes p  ON p.id_paciente = a.patient_id
  LEFT JOIN public.profiles  pr ON pr.id = a.doctor_id
  WHERE a.status = 'completed'
    AND a.end_time BETWEEN (p_now - INTERVAL '35 minutes') AND (p_now - INTERVAL '25 minutes')
    AND a.survey_sent_at IS NULL
    AND (p.whatsapp IS NOT NULL OR p.email IS NOT NULL)
  ORDER BY a.end_time;
$$;
