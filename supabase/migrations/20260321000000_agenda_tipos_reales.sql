-- Agregar tipos de turno reales de AM Clínica
-- Los valores viejos (tratamiento, otro) se mantienen en el enum para no romper
-- datos históricos, pero no aparecen en la UI.

ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'limpieza';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'cementado';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'tallado';
ALTER TYPE appointment_type ADD VALUE IF NOT EXISTS 'botox';
