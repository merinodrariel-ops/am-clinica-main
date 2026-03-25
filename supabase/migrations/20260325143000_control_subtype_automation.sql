ALTER TABLE scheduled_messages
ADD COLUMN IF NOT EXISTS subject text;

UPDATE recall_auto_rules
SET is_active = false
WHERE appointment_type = 'cementado'
  AND label = 'Control anual de restauración'
  AND interval_days = 365;

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
    'control_carilla_inmediato',
    'control_carillas',
    'Control anual de carillas',
    365,
    true,
    true,
    'control_carilla_anual'
WHERE NOT EXISTS (
    SELECT 1
    FROM recall_auto_rules
    WHERE appointment_type = 'control_carilla_inmediato'
      AND label = 'Control anual de carillas'
);

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
    'control_carilla_anual',
    'control_carillas',
    'Proximo control anual de carillas',
    365,
    true,
    true,
    'control_carilla_anual'
WHERE NOT EXISTS (
    SELECT 1
    FROM recall_auto_rules
    WHERE appointment_type = 'control_carilla_anual'
      AND label = 'Proximo control anual de carillas'
);

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
    'control_ortodoncia',
    'control_ortodoncia',
    'Proximo control ortodoncia',
    30,
    true,
    true,
    'control_ortodoncia'
WHERE NOT EXISTS (
    SELECT 1
    FROM recall_auto_rules
    WHERE appointment_type = 'control_ortodoncia'
      AND label = 'Proximo control ortodoncia'
);
