-- Liquidaciones simplificadas por grupos operativos
-- Grupos soportados: Limpieza, Staff General, Laboratorio, Odontologia

CREATE TABLE IF NOT EXISTS public.liquidacion_hour_values (
    id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    cleaning_hour_value NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (cleaning_hour_value >= 0),
    staff_general_hour_value NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (staff_general_hour_value >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.internal_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    internal_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (internal_price >= 0),
    area TEXT NOT NULL CHECK (area IN ('Odontología', 'Laboratorio')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_services
    ADD CONSTRAINT internal_services_name_area_unique UNIQUE (name, area);

CREATE TABLE IF NOT EXISTS public.provider_service_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    service_id UUID NOT NULL REFERENCES public.internal_services(id) ON DELETE RESTRICT,
    performed_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.provider_monthly_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    total_hours NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_hours >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT provider_monthly_hours_month_start CHECK (date_trunc('month', month::timestamp)::date = month),
    CONSTRAINT provider_monthly_hours_provider_month_unique UNIQUE (provider_id, month)
);

CREATE INDEX IF NOT EXISTS idx_provider_service_records_performed_date
    ON public.provider_service_records (performed_date);

CREATE INDEX IF NOT EXISTS idx_provider_service_records_provider_date
    ON public.provider_service_records (provider_id, performed_date);

CREATE INDEX IF NOT EXISTS idx_provider_monthly_hours_month
    ON public.provider_monthly_hours (month);

INSERT INTO public.liquidacion_hour_values (id, cleaning_hour_value, staff_general_hour_value)
VALUES (1, 0, 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.internal_services (name, internal_price, area, active)
SELECT DISTINCT
    pl.nombre,
    COALESCE(pl.precio_base, 0),
    CASE
        WHEN lower(COALESCE(pl.area_nombre, '')) LIKE '%laborat%' THEN 'Laboratorio'
        ELSE 'Odontología'
    END,
    TRUE
FROM public.prestaciones_lista pl
WHERE pl.activo = TRUE
  AND (
      lower(COALESCE(pl.area_nombre, '')) LIKE '%odont%'
      OR lower(COALESCE(pl.area_nombre, '')) LIKE '%laborat%'
  )
ON CONFLICT (name, area) DO NOTHING;

ALTER TABLE public.liquidacion_hour_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_service_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_monthly_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS liquidacion_hour_values_admin_rw ON public.liquidacion_hour_values;
CREATE POLICY liquidacion_hour_values_admin_rw
    ON public.liquidacion_hour_values
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS internal_services_admin_rw ON public.internal_services;
CREATE POLICY internal_services_admin_rw
    ON public.internal_services
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS provider_service_records_admin_rw ON public.provider_service_records;
CREATE POLICY provider_service_records_admin_rw
    ON public.provider_service_records
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    );

DROP POLICY IF EXISTS provider_monthly_hours_admin_rw ON public.provider_monthly_hours;
CREATE POLICY provider_monthly_hours_admin_rw
    ON public.provider_monthly_hours
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM public.profiles p
            WHERE p.id = auth.uid()
              AND p.categoria IN ('owner', 'admin')
        )
    );
