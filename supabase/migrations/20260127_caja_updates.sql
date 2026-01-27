-- Add snapshot column to store full closure details
ALTER TABLE caja_recepcion_arqueos ADD COLUMN IF NOT EXISTS snapshot_datos JSONB DEFAULT '{}'::jsonb;
ALTER TABLE caja_admin_arqueos ADD COLUMN IF NOT EXISTS snapshot_datos JSONB DEFAULT '{}'::jsonb;

-- Link movements to closure
ALTER TABLE caja_recepcion_movimientos ADD COLUMN IF NOT EXISTS cierre_id UUID REFERENCES caja_recepcion_arqueos(id);
ALTER TABLE caja_admin_movimientos ADD COLUMN IF NOT EXISTS cierre_id UUID REFERENCES caja_admin_arqueos(id);

-- Make start time nullable (removing "opening" concept)
ALTER TABLE caja_recepcion_arqueos ALTER COLUMN hora_inicio DROP NOT NULL;
ALTER TABLE caja_admin_arqueos ALTER COLUMN hora_inicio DROP NOT NULL;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_caja_recepcion_mov_cierre ON caja_recepcion_movimientos(cierre_id);
CREATE INDEX IF NOT EXISTS idx_caja_admin_mov_cierre ON caja_admin_movimientos(cierre_id);
