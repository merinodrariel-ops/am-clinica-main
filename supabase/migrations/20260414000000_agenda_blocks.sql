-- Migration: agenda_blocks
-- Tabla para bloqueos de agenda (por doctor o toda la clínica)
-- Los turnos existentes NO se cancelan automáticamente; quedan como "pendientes de notificar"

CREATE TABLE IF NOT EXISTS agenda_blocks (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  doctor_id   UUID REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = toda la clínica
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  reason      TEXT,
  block_type  TEXT NOT NULL DEFAULT 'evento_externo'
                CHECK (block_type IN ('vacaciones','feriado','evento_externo','mantenimiento','otro')),
  created_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_range CHECK (end_time > start_time)
);

CREATE INDEX idx_agenda_blocks_start ON agenda_blocks(start_time);
CREATE INDEX idx_agenda_blocks_doctor ON agenda_blocks(doctor_id);

ALTER TABLE agenda_blocks ENABLE ROW LEVEL SECURITY;

-- Todos los autenticados pueden leer bloques (para mostrarlos en el calendario)
CREATE POLICY "blocks_read" ON agenda_blocks
  FOR SELECT USING (auth.role() = 'authenticated');

-- Solo owner/admin/recepcion/developer pueden crear
CREATE POLICY "blocks_insert" ON agenda_blocks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.categoria IN ('owner','admin','reception','developer')
    )
  );

-- Solo owner/admin/developer pueden eliminar
CREATE POLICY "blocks_delete" ON agenda_blocks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.categoria IN ('owner','admin','developer')
    )
  );
