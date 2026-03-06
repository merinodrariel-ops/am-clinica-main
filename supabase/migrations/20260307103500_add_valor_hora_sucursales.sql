-- Add valor_hora columns for general staff to sucursales table
ALTER TABLE sucursales
ADD COLUMN IF NOT EXISTS valor_hora_staff_ars numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_hora_limpieza_ars numeric DEFAULT 0;
