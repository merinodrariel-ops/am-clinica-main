-- =============================================
-- Migration: Audit Traceability & CSV Import Support
-- Created: 2026-02-06
-- =============================================

-- 1. Create historial_ediciones table for field-level change tracking
CREATE TABLE IF NOT EXISTS public.historial_ediciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    id_registro UUID NOT NULL,
    tabla_origen TEXT NOT NULL CHECK (tabla_origen IN (
        'caja_recepcion_movimientos', 
        'caja_admin_movimientos',
        'pacientes',
        'planes_tratamiento'
    )),
    campo_modificado TEXT NOT NULL,
    valor_anterior TEXT,
    valor_nuevo TEXT,
    usuario_editor UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_email TEXT,
    fecha_edicion TIMESTAMPTZ DEFAULT now(),
    motivo_edicion TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups by record
CREATE INDEX IF NOT EXISTS idx_historial_ediciones_registro 
    ON public.historial_ediciones(id_registro, tabla_origen);

-- RLS for historial_ediciones
ALTER TABLE public.historial_ediciones ENABLE ROW LEVEL SECURITY;

-- Policy: Only admin/owner can view edit history
CREATE POLICY "Admin and owner can view edit history"
    ON public.historial_ediciones
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- Policy: Any authenticated user can insert (triggered by app)
CREATE POLICY "Authenticated users can insert edit history"
    ON public.historial_ediciones
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);


-- =============================================
-- 2. Add estado_registro column to caja tables
-- =============================================

-- Caja Recepcion Movimientos
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS estado_registro TEXT 
    DEFAULT 'activo' 
    CHECK (estado_registro IN ('activo', 'anulado'));

-- Caja Admin Movimientos
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS estado_registro TEXT 
    DEFAULT 'activo' 
    CHECK (estado_registro IN ('activo', 'anulado'));


-- =============================================
-- 3. Add import tracking columns
-- =============================================

-- Caja Recepcion Movimientos
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'manual'
        CHECK (origen IN ('manual', 'importado_csv', 'sistema'));
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS importado_por UUID REFERENCES auth.users(id);
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS fecha_importacion TIMESTAMPTZ;
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS archivo_origen TEXT;

-- Caja Admin Movimientos  
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'manual'
        CHECK (origen IN ('manual', 'importado_csv', 'sistema'));
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS importado_por UUID REFERENCES auth.users(id);
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS fecha_importacion TIMESTAMPTZ;
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS archivo_origen TEXT;


-- =============================================
-- 4. Add registro_editado flag
-- =============================================

ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS registro_editado BOOLEAN DEFAULT false;

ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS registro_editado BOOLEAN DEFAULT false;


-- =============================================
-- 5. Add created_by, updated_by, updated_at columns
-- =============================================

-- Caja Recepcion Movimientos
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.caja_recepcion_movimientos 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- Caja Admin Movimientos
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);
ALTER TABLE public.caja_admin_movimientos 
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;


-- =============================================
-- 6. Function to log field-level edits
-- =============================================

CREATE OR REPLACE FUNCTION public.log_field_edit(
    p_registro_id UUID,
    p_tabla TEXT,
    p_campo TEXT,
    p_valor_anterior TEXT,
    p_valor_nuevo TEXT,
    p_motivo TEXT
) RETURNS UUID AS $$
DECLARE
    _user_id UUID;
    _email TEXT;
    _new_id UUID;
BEGIN
    _user_id := auth.uid();
    
    SELECT email INTO _email FROM public.profiles WHERE id = _user_id;
    
    INSERT INTO public.historial_ediciones (
        id_registro,
        tabla_origen,
        campo_modificado,
        valor_anterior,
        valor_nuevo,
        usuario_editor,
        usuario_email,
        motivo_edicion
    ) VALUES (
        p_registro_id,
        p_tabla,
        p_campo,
        p_valor_anterior,
        p_valor_nuevo,
        _user_id,
        _email,
        p_motivo
    )
    RETURNING id INTO _new_id;
    
    RETURN _new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================
-- 7. Trigger to auto-update updated_at and mark as edited
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
           OR OLD.metodo_pago IS DISTINCT FROM NEW.metodo_pago THEN
            NEW.registro_editado := true;
        END IF;
    END IF;
    
    IF TG_TABLE_NAME = 'caja_admin_movimientos' THEN
        IF OLD.descripcion IS DISTINCT FROM NEW.descripcion
           OR OLD.usd_equivalente_total IS DISTINCT FROM NEW.usd_equivalente_total THEN
            NEW.registro_editado := true;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply trigger to caja_recepcion_movimientos
DROP TRIGGER IF EXISTS on_caja_recepcion_update ON public.caja_recepcion_movimientos;
CREATE TRIGGER on_caja_recepcion_update
    BEFORE UPDATE ON public.caja_recepcion_movimientos
    FOR EACH ROW EXECUTE FUNCTION public.handle_record_update();

-- Apply trigger to caja_admin_movimientos
DROP TRIGGER IF EXISTS on_caja_admin_update ON public.caja_admin_movimientos;
CREATE TRIGGER on_caja_admin_update
    BEFORE UPDATE ON public.caja_admin_movimientos
    FOR EACH ROW EXECUTE FUNCTION public.handle_record_update();


-- =============================================
-- 8. Function to check if user can edit record
-- =============================================

CREATE OR REPLACE FUNCTION public.can_user_edit_record(
    p_tabla TEXT,
    p_record_date TIMESTAMPTZ
) RETURNS BOOLEAN AS $$
DECLARE
    _role TEXT;
    _today DATE;
BEGIN
    SELECT role INTO _role FROM public.profiles WHERE id = auth.uid();
    _today := CURRENT_DATE;
    
    -- Owner and admin can edit any record
    IF _role IN ('owner', 'admin') THEN
        RETURN true;
    END IF;
    
    -- Reception can only edit same-day records
    IF _role = 'reception' THEN
        RETURN p_record_date::DATE = _today;
    END IF;
    
    -- Other roles cannot edit
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
