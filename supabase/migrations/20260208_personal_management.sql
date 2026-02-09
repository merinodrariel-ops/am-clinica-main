-- =============================================
-- Migration: Expanded Personal Management
-- Created: 2026-02-08
-- Purpose: Full staff management for clinic operations
-- =============================================

-- 1. Add new columns to personal table
ALTER TABLE public.personal 
    ADD COLUMN IF NOT EXISTS apellido TEXT,
    ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'empleado' CHECK (tipo IN ('empleado', 'profesional')),
    ADD COLUMN IF NOT EXISTS area TEXT DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS email TEXT,
    ADD COLUMN IF NOT EXISTS whatsapp TEXT,
    ADD COLUMN IF NOT EXISTS documento TEXT,
    ADD COLUMN IF NOT EXISTS dni_frente_url TEXT,
    ADD COLUMN IF NOT EXISTS dni_dorso_url TEXT,
    ADD COLUMN IF NOT EXISTS direccion TEXT,
    ADD COLUMN IF NOT EXISTS barrio_localidad TEXT,
    ADD COLUMN IF NOT EXISTS condicion_afip TEXT CHECK (condicion_afip IN ('monotributista', 'responsable_inscripto', 'relacion_dependencia', 'otro')),
    ADD COLUMN IF NOT EXISTS foto_url TEXT,
    ADD COLUMN IF NOT EXISTS fecha_ingreso DATE,
    ADD COLUMN IF NOT EXISTS descripcion TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. Professional-specific columns
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS matricula_provincial TEXT,
    ADD COLUMN IF NOT EXISTS especialidad TEXT,
    ADD COLUMN IF NOT EXISTS poliza_url TEXT,
    ADD COLUMN IF NOT EXISTS poliza_vencimiento DATE,
    ADD COLUMN IF NOT EXISTS consentimientos_urls TEXT[], -- Array of URLs
    ADD COLUMN IF NOT EXISTS sanciones_notas TEXT,
    ADD COLUMN IF NOT EXISTS porcentaje_honorarios NUMERIC(5,2) DEFAULT 0;

-- 3. Payment tracking
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS pagado_mes_actual BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS ultimo_pago_fecha DATE,
    ADD COLUMN IF NOT EXISTS ultimo_pago_monto NUMERIC(12,2);

-- 4. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_personal_tipo ON public.personal(tipo);
CREATE INDEX IF NOT EXISTS idx_personal_area ON public.personal(area);
CREATE INDEX IF NOT EXISTS idx_personal_activo ON public.personal(activo);

-- 5. Create lookup table for areas
CREATE TABLE IF NOT EXISTS public.personal_areas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    tipo_personal TEXT DEFAULT 'empleado' CHECK (tipo_personal IN ('empleado', 'profesional', 'ambos')),
    color TEXT DEFAULT '#6366f1',
    icono TEXT DEFAULT 'User',
    activo BOOLEAN DEFAULT true,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default areas
INSERT INTO public.personal_areas (nombre, descripcion, tipo_personal, color, icono, orden) VALUES
    ('Limpieza', 'Personal de limpieza y mantenimiento', 'empleado', '#84cc16', 'Sparkles', 1),
    ('Recepción', 'Recepcionistas y atención al cliente', 'empleado', '#06b6d4', 'Phone', 2),
    ('Asistente Dental', 'Asistentes de consultorio', 'empleado', '#8b5cf6', 'Heart', 3),
    ('Marketing', 'Marketing y redes sociales', 'empleado', '#f43f5e', 'Megaphone', 4),
    ('Ventas', 'Comercial y ventas', 'empleado', '#f97316', 'TrendingUp', 5),
    ('Administración', 'Personal administrativo', 'empleado', '#3b82f6', 'FileText', 6),
    ('Odontología General', 'Odontólogos generales', 'profesional', '#10b981', 'Stethoscope', 10),
    ('Ortodoncia', 'Especialistas en ortodoncia', 'profesional', '#6366f1', 'Smile', 11),
    ('Implantología', 'Especialistas en implantes', 'profesional', '#ec4899', 'Bone', 12),
    ('Endodoncia', 'Especialistas en tratamientos de conducto', 'profesional', '#eab308', 'Zap', 13),
    ('Cirugía', 'Cirujanos bucomaxilofaciales', 'profesional', '#ef4444', 'Scissors', 14),
    ('Periodoncia', 'Especialistas en encías', 'profesional', '#14b8a6', 'Leaf', 15),
    ('Estética Dental', 'Carillas, blanqueamiento, etc.', 'profesional', '#d946ef', 'Sparkle', 16)
ON CONFLICT (nombre) DO NOTHING;

-- 6. RLS for personal_areas
ALTER TABLE public.personal_areas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "personal_areas_select" ON public.personal_areas;
CREATE POLICY "personal_areas_select"
    ON public.personal_areas FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "personal_areas_admin" ON public.personal_areas;
CREATE POLICY "personal_areas_admin"
    ON public.personal_areas FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() 
            AND role IN ('owner', 'admin')
        )
    );

-- 7. Function to create new personal member
CREATE OR REPLACE FUNCTION public.crear_personal(
    p_nombre TEXT,
    p_apellido TEXT DEFAULT NULL,
    p_tipo TEXT DEFAULT 'empleado',
    p_area TEXT DEFAULT 'general',
    p_email TEXT DEFAULT NULL,
    p_whatsapp TEXT DEFAULT NULL,
    p_documento TEXT DEFAULT NULL,
    p_direccion TEXT DEFAULT NULL,
    p_barrio_localidad TEXT DEFAULT NULL,
    p_condicion_afip TEXT DEFAULT NULL,
    p_valor_hora_ars NUMERIC DEFAULT 0,
    p_rol TEXT DEFAULT 'Empleado'
) RETURNS UUID AS $$
DECLARE
    _new_id UUID;
BEGIN
    INSERT INTO public.personal (
        nombre,
        apellido,
        tipo,
        area,
        email,
        whatsapp,
        documento,
        direccion,
        barrio_localidad,
        condicion_afip,
        valor_hora_ars,
        rol,
        activo,
        fecha_ingreso
    ) VALUES (
        p_nombre,
        p_apellido,
        p_tipo,
        p_area,
        p_email,
        p_whatsapp,
        p_documento,
        p_direccion,
        p_barrio_localidad,
        p_condicion_afip,
        p_valor_hora_ars,
        p_rol,
        true,
        CURRENT_DATE
    )
    RETURNING id INTO _new_id;
    
    RETURN _new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Update trigger for personal
CREATE OR REPLACE FUNCTION public.handle_personal_update()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_personal_update ON public.personal;
CREATE TRIGGER on_personal_update
    BEFORE UPDATE ON public.personal
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_personal_update();
