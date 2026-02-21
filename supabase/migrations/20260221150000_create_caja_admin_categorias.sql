-- Create caja_admin_categorias table
CREATE TABLE IF NOT EXISTS public.caja_admin_categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id UUID REFERENCES public.sucursales(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo_movimiento TEXT NOT NULL, -- e.g. 'EGRESO', 'GIRO_ACTIVO', 'INGRESO_ADMIN'
    requiere_adjunto BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    orden INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(sucursal_id, nombre, tipo_movimiento)
);

-- Turn on RLS
ALTER TABLE public.caja_admin_categorias ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users on caja_admin_categorias"
    ON public.caja_admin_categorias FOR SELECT
    USING (true);

CREATE POLICY "Enable write access for admins on caja_admin_categorias"
    ON public.caja_admin_categorias FOR ALL
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'owner')));

-- Insert default categories for existing branches (as a baseline)
DO $$
DECLARE
    sucursal RECORD;
    cat_names TEXT[] := ARRAY[
        'Liquidaciones', 'Alquileres', 'Expensas', 'Materiales Dentales',
        'Laboratorio', 'Equipamiento', 'Personal Ariel', 'Residuos Patológicos',
        'Servicios', 'Imprenta', 'Indumentaria', 'Banco', 'Gastos Varios', 'Otro'
    ];
    adjunto_obligatorio TEXT[] := ARRAY[
        'Alquileres', 'Expensas', 'Materiales Dentales', 'Laboratorio',
        'Equipamiento', 'Servicios', 'Banco', 'Liquidaciones'
    ];
    cat_name TEXT;
    seq_orden INTEGER := 10;
BEGIN
    FOR sucursal IN SELECT id FROM public.sucursales LOOP
        FOREACH cat_name IN ARRAY cat_names LOOP
            INSERT INTO public.caja_admin_categorias (
                sucursal_id, nombre, tipo_movimiento, requiere_adjunto, orden
            )
            VALUES (
                sucursal.id,
                cat_name,
                'EGRESO',
                cat_name = ANY(adjunto_obligatorio),
                seq_orden
            ) ON CONFLICT DO NOTHING;
            seq_orden := seq_orden + 10;
        END LOOP;
        
        -- Also insert basic ones for GIRO_ACTIVO if needed (we can just leave it to default EGRESO for now, 
        -- but users can add more types via UI).
    END LOOP;
END $$;
