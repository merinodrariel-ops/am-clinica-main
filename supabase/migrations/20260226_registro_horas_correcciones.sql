-- ============================================================
-- Auditoría de correcciones de registro_horas
-- Cada edición queda registrada con motivo obligatorio
-- ============================================================

CREATE TABLE IF NOT EXISTS public.registro_horas_correcciones (
    id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    registro_id     UUID NOT NULL REFERENCES public.registro_horas(id) ON DELETE CASCADE,
    editado_por     UUID NOT NULL REFERENCES public.profiles(id),
    motivo          TEXT NOT NULL,
    campo           TEXT NOT NULL,          -- 'horas', 'hora_ingreso', 'hora_egreso', 'fecha'
    valor_anterior  TEXT,
    valor_nuevo     TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.registro_horas_correcciones ENABLE ROW LEVEL SECURITY;

-- Solo admins/owners pueden ver el historial completo
CREATE POLICY "Admin read correcciones"
ON public.registro_horas_correcciones FOR SELECT
USING (public.get_my_role() IN ('owner', 'admin'));

-- Solo admins/owners pueden insertar correcciones (vía server action con admin client)
CREATE POLICY "Admin insert correcciones"
ON public.registro_horas_correcciones FOR INSERT
WITH CHECK (public.get_my_role() IN ('owner', 'admin'));

-- Índice para buscar correcciones de un registro específico
CREATE INDEX IF NOT EXISTS idx_correcciones_registro
    ON public.registro_horas_correcciones(registro_id, created_at DESC);
