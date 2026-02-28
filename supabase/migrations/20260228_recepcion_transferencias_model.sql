-- Reception cash operations model
-- Distinguish operational cash from non-operational movements:
-- 1) RETIRO_EFECTIVO: cash withdrawal (does not count as operating expense)
-- 2) TRASPASO_INTERNO: transfer between cash boxes (neutral in consolidated view)

ALTER TABLE public.transferencias_caja
    ADD COLUMN IF NOT EXISTS tipo_transferencia TEXT,
    ADD COLUMN IF NOT EXISTS caja_origen TEXT,
    ADD COLUMN IF NOT EXISTS caja_destino TEXT,
    ADD COLUMN IF NOT EXISTS movimiento_grupo_id UUID;

-- Backfill legacy rows
UPDATE public.transferencias_caja
SET
    tipo_transferencia = COALESCE(tipo_transferencia, 'TRASPASO_INTERNO'),
    caja_origen = COALESCE(caja_origen, 'RECEPCION'),
    caja_destino = COALESCE(caja_destino, 'ADMIN'),
    movimiento_grupo_id = COALESCE(movimiento_grupo_id, gen_random_uuid());

ALTER TABLE public.transferencias_caja
    ALTER COLUMN tipo_transferencia SET DEFAULT 'TRASPASO_INTERNO',
    ALTER COLUMN tipo_transferencia SET NOT NULL,
    ALTER COLUMN caja_origen SET DEFAULT 'RECEPCION',
    ALTER COLUMN caja_origen SET NOT NULL,
    ALTER COLUMN movimiento_grupo_id SET DEFAULT gen_random_uuid(),
    ALTER COLUMN movimiento_grupo_id SET NOT NULL;

ALTER TABLE public.transferencias_caja
    DROP CONSTRAINT IF EXISTS transferencias_caja_tipo_transferencia_check,
    DROP CONSTRAINT IF EXISTS transferencias_caja_caja_origen_check,
    DROP CONSTRAINT IF EXISTS transferencias_caja_caja_destino_check,
    DROP CONSTRAINT IF EXISTS transferencias_caja_tipo_vs_destino_check;

ALTER TABLE public.transferencias_caja
    ADD CONSTRAINT transferencias_caja_tipo_transferencia_check
        CHECK (tipo_transferencia IN ('TRASPASO_INTERNO', 'RETIRO_EFECTIVO')),
    ADD CONSTRAINT transferencias_caja_caja_origen_check
        CHECK (caja_origen IN ('RECEPCION', 'ADMIN')),
    ADD CONSTRAINT transferencias_caja_caja_destino_check
        CHECK (caja_destino IS NULL OR caja_destino IN ('RECEPCION', 'ADMIN')),
    ADD CONSTRAINT transferencias_caja_tipo_vs_destino_check
        CHECK (
            (tipo_transferencia = 'RETIRO_EFECTIVO' AND caja_destino IS NULL)
            OR
            (tipo_transferencia = 'TRASPASO_INTERNO' AND caja_destino IS NOT NULL AND caja_destino <> caja_origen)
        );

CREATE INDEX IF NOT EXISTS idx_transferencias_tipo_fecha
    ON public.transferencias_caja (tipo_transferencia, fecha_hora DESC);

CREATE INDEX IF NOT EXISTS idx_transferencias_origen_destino_estado
    ON public.transferencias_caja (caja_origen, caja_destino, estado);
