-- Provider companies (for grouped payroll/liquidations)

CREATE TABLE IF NOT EXISTS public.empresas_prestadoras (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre TEXT NOT NULL UNIQUE,
    descripcion TEXT,
    area_default TEXT,
    activo BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS empresa_prestadora_id UUID REFERENCES public.empresas_prestadoras(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_personal_empresa_prestadora_id
    ON public.personal(empresa_prestadora_id);

CREATE OR REPLACE FUNCTION public.handle_empresas_prestadoras_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_empresas_prestadoras_update ON public.empresas_prestadoras;
CREATE TRIGGER on_empresas_prestadoras_update
    BEFORE UPDATE ON public.empresas_prestadoras
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_empresas_prestadoras_updated_at();

ALTER TABLE public.empresas_prestadoras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresas_prestadoras_select" ON public.empresas_prestadoras;
CREATE POLICY "empresas_prestadoras_select"
    ON public.empresas_prestadoras FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "empresas_prestadoras_admin" ON public.empresas_prestadoras;
CREATE POLICY "empresas_prestadoras_admin"
    ON public.empresas_prestadoras FOR ALL
    USING (public.get_my_role() IN ('owner', 'admin'))
    WITH CHECK (public.get_my_role() IN ('owner', 'admin'));
