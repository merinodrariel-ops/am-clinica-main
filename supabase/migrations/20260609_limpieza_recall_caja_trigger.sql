-- Add limpieza subtypes to recall_type enum
ALTER TYPE recall_type ADD VALUE IF NOT EXISTS 'limpieza_convencional';
ALTER TYPE recall_type ADD VALUE IF NOT EXISTS 'limpieza_laser';

-- Add recall_auto_rules for limpieza_convencional (6 months, creates tentative appointment)
INSERT INTO recall_auto_rules (
    appointment_type,
    recall_type,
    label,
    interval_days,
    is_active,
    creates_appointment,
    next_appointment_type
)
SELECT
    'limpieza_convencional',
    'limpieza_convencional',
    'Próxima limpieza convencional',
    180,
    true,
    true,
    'limpieza_convencional'
WHERE NOT EXISTS (
    SELECT 1 FROM recall_auto_rules WHERE appointment_type = 'limpieza_convencional'
);

-- Add recall_auto_rules for limpieza_laser (4 months default, creates tentative appointment)
INSERT INTO recall_auto_rules (
    appointment_type,
    recall_type,
    label,
    interval_days,
    is_active,
    creates_appointment,
    next_appointment_type
)
SELECT
    'limpieza_laser',
    'limpieza_laser',
    'Próxima limpieza con láser',
    120,
    true,
    true,
    'limpieza_laser'
WHERE NOT EXISTS (
    SELECT 1 FROM recall_auto_rules WHERE appointment_type = 'limpieza_laser'
);

-- Deactivate the old generic limpieza rule (replaced by the two typed rules above)
UPDATE recall_auto_rules
SET is_active = false
WHERE appointment_type = 'limpieza'
  AND recall_type::text = 'limpieza';
