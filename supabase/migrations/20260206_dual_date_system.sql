-- =============================================
-- Migration: Dual Date System (fecha_movimiento)
-- Created: 2026-02-06
-- Purpose: Separate reporting date from creation timestamp
-- =============================================

-- =============================================
-- 1. Add fecha_movimiento column to caja tables
-- =============================================

-- Caja Recepcion Movimientos
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS fecha_movimiento DATE;

-- Populate with date from fecha_hora (for existing records)
UPDATE public.caja_recepcion_movimientos 
SET fecha_movimiento = DATE(fecha_hora)
WHERE fecha_movimiento IS NULL;

-- Make it NOT NULL for future inserts
-- Note: Can't use ALTER COLUMN SET NOT NULL until all nulls are populated
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.caja_recepcion_movimientos 
        WHERE fecha_movimiento IS NULL
    ) THEN
        ALTER TABLE public.caja_recepcion_movimientos 
            ALTER COLUMN fecha_movimiento SET NOT NULL;
    END IF;
END $$;

-- Caja Admin Movimientos
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS fecha_movimiento DATE;

UPDATE public.caja_admin_movimientos 
SET fecha_movimiento = DATE(fecha_hora)
WHERE fecha_movimiento IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.caja_admin_movimientos 
        WHERE fecha_movimiento IS NULL
    ) THEN
        ALTER TABLE public.caja_admin_movimientos 
            ALTER COLUMN fecha_movimiento SET NOT NULL;
    END IF;
END $$;


-- =============================================
-- 2. Update origen CHECK constraint to include 'carga_historica'
-- =============================================

-- Drop existing constraint and recreate with new value
ALTER TABLE public.caja_recepcion_movimientos 
    DROP CONSTRAINT IF EXISTS caja_recepcion_movimientos_origen_check;

ALTER TABLE public.caja_recepcion_movimientos 
    ADD CONSTRAINT caja_recepcion_movimientos_origen_check 
    CHECK (origen IN ('manual', 'importado_csv', 'sistema', 'carga_historica'));

ALTER TABLE public.caja_admin_movimientos 
    DROP CONSTRAINT IF EXISTS caja_admin_movimientos_origen_check;

ALTER TABLE public.caja_admin_movimientos 
    ADD CONSTRAINT caja_admin_movimientos_origen_check 
    CHECK (origen IN ('manual', 'importado_csv', 'sistema', 'carga_historica'));


-- =============================================
-- 3. Create indexes for fecha_movimiento (reporting performance)
-- =============================================

CREATE INDEX IF NOT EXISTS idx_caja_recepcion_fecha_movimiento 
    ON public.caja_recepcion_movimientos(fecha_movimiento);

CREATE INDEX IF NOT EXISTS idx_caja_admin_fecha_movimiento 
    ON public.caja_admin_movimientos(fecha_movimiento);


-- =============================================
-- 4. Update trigger to also track fecha_movimiento edits
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_record_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
    
    -- Mark as edited if any significant field changed
    IF TG_TABLE_NAME = 'caja_recepcion_movimientos' THEN
        IF OLD.monto IS DISTINCT FROM NEW.monto 
           OR OLD.concepto_nombre IS DISTINCT FROM NEW.concepto_nombre
           OR OLD.metodo_pago IS DISTINCT FROM NEW.metodo_pago
           OR OLD.fecha_movimiento IS DISTINCT FROM NEW.fecha_movimiento THEN
            NEW.registro_editado := true;
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'caja_admin_movimientos' THEN
        IF OLD.descripcion IS DISTINCT FROM NEW.descripcion
           OR OLD.usd_equivalente_total IS DISTINCT FROM NEW.usd_equivalente_total
           OR OLD.fecha_movimiento IS DISTINCT FROM NEW.fecha_movimiento THEN
            NEW.registro_editado := true;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
