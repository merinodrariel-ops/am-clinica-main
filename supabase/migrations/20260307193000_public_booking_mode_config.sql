-- Public booking mode config + initial schedule seed
-- Source of truth for public links:
--   /admision/agendar?modo=merino
--   /admision/agendar?modo=staff

CREATE TABLE IF NOT EXISTS public.public_booking_doctor_modes (
  doctor_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  booking_mode TEXT NOT NULL CHECK (booking_mode IN ('merino', 'staff')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.public_booking_doctor_modes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_booking_doctor_modes_read_authenticated" ON public.public_booking_doctor_modes;
CREATE POLICY "public_booking_doctor_modes_read_authenticated"
ON public.public_booking_doctor_modes FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "public_booking_doctor_modes_write_staff" ON public.public_booking_doctor_modes;
CREATE POLICY "public_booking_doctor_modes_write_staff"
ON public.public_booking_doctor_modes FOR ALL
USING (
  get_my_role() = ANY (ARRAY['owner', 'admin', 'developer', 'reception'])
)
WITH CHECK (
  get_my_role() = ANY (ARRAY['owner', 'admin', 'developer', 'reception'])
);

WITH active_doctors AS (
  SELECT DISTINCT
    p.id AS doctor_id,
    COALESCE(pr.full_name, TRIM(COALESCE(p.nombre, '') || ' ' || COALESCE(p.apellido, ''))) AS doctor_name
  FROM public.personal p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.activo = TRUE
    AND p.user_id IS NOT NULL
    AND p.tipo IN ('odontologo', 'profesional')
    AND COALESCE(pr.is_active, TRUE) = TRUE
),
merino_doctor AS (
  SELECT doctor_id
  FROM active_doctors
  WHERE LOWER(doctor_name) LIKE '%ariel%'
    AND LOWER(doctor_name) LIKE '%merino%'
  ORDER BY doctor_name
  LIMIT 1
),
staff_doctors AS (
  SELECT d.doctor_id
  FROM active_doctors d
  LEFT JOIN merino_doctor m ON m.doctor_id = d.doctor_id
  WHERE m.doctor_id IS NULL
)
INSERT INTO public.public_booking_doctor_modes (doctor_id, booking_mode, is_active)
SELECT doctor_id, 'merino', TRUE FROM merino_doctor
ON CONFLICT (doctor_id) DO UPDATE
SET booking_mode = EXCLUDED.booking_mode,
    is_active = TRUE,
    updated_at = NOW();

WITH active_doctors AS (
  SELECT DISTINCT
    p.id AS doctor_id,
    COALESCE(pr.full_name, TRIM(COALESCE(p.nombre, '') || ' ' || COALESCE(p.apellido, ''))) AS doctor_name
  FROM public.personal p
  JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.activo = TRUE
    AND p.user_id IS NOT NULL
    AND p.tipo IN ('odontologo', 'profesional')
    AND COALESCE(pr.is_active, TRUE) = TRUE
),
merino_doctor AS (
  SELECT doctor_id
  FROM active_doctors
  WHERE LOWER(doctor_name) LIKE '%ariel%'
    AND LOWER(doctor_name) LIKE '%merino%'
  ORDER BY doctor_name
  LIMIT 1
),
staff_doctors AS (
  SELECT d.doctor_id
  FROM active_doctors d
  LEFT JOIN merino_doctor m ON m.doctor_id = d.doctor_id
  WHERE m.doctor_id IS NULL
)
INSERT INTO public.public_booking_doctor_modes (doctor_id, booking_mode, is_active)
SELECT doctor_id, 'staff', TRUE FROM staff_doctors
ON CONFLICT (doctor_id) DO UPDATE
SET booking_mode = EXCLUDED.booking_mode,
    is_active = TRUE,
    updated_at = NOW();

-- Approved baseline seed (infer + validate):
-- Merino: Mon/Wed/Fri 14:00-18:30, slot 60, buffer 10
WITH merino AS (
  SELECT doctor_id
  FROM public.public_booking_doctor_modes
  WHERE booking_mode = 'merino' AND is_active = TRUE
  ORDER BY doctor_id
  LIMIT 1
),
target_rows AS (
  SELECT doctor_id, day_of_week, '14:00'::time AS start_time, '18:30'::time AS end_time, 60 AS slot_duration_minutes, 10 AS buffer_minutes, 12 AS max_appointments
  FROM merino
  CROSS JOIN (VALUES (1), (3), (5)) d(day_of_week)
)
INSERT INTO public.doctor_schedules (
  doctor_id,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  buffer_minutes,
  max_appointments,
  is_active,
  updated_at
)
SELECT
  doctor_id,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  buffer_minutes,
  max_appointments,
  TRUE,
  NOW()
FROM target_rows
ON CONFLICT (doctor_id, day_of_week) DO UPDATE
SET start_time = EXCLUDED.start_time,
    end_time = EXCLUDED.end_time,
    slot_duration_minutes = EXCLUDED.slot_duration_minutes,
    buffer_minutes = EXCLUDED.buffer_minutes,
    max_appointments = EXCLUDED.max_appointments,
    is_active = TRUE,
    updated_at = NOW();

-- Staff baseline only for doctors without any configured schedule:
-- Thu 15:30-18:30, slot 60, buffer 0
WITH staff_without_schedule AS (
  SELECT m.doctor_id
  FROM public.public_booking_doctor_modes m
  WHERE m.booking_mode = 'staff'
    AND m.is_active = TRUE
    AND NOT EXISTS (
      SELECT 1
      FROM public.doctor_schedules s
      WHERE s.doctor_id = m.doctor_id
    )
)
INSERT INTO public.doctor_schedules (
  doctor_id,
  day_of_week,
  start_time,
  end_time,
  slot_duration_minutes,
  buffer_minutes,
  max_appointments,
  is_active,
  updated_at
)
SELECT
  doctor_id,
  4,
  '15:30'::time,
  '18:30'::time,
  60,
  0,
  12,
  TRUE,
  NOW()
FROM staff_without_schedule
ON CONFLICT (doctor_id, day_of_week) DO NOTHING;
