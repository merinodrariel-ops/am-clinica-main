-- ============================================================
-- Drive presentations sync index per patient
-- ============================================================

CREATE TABLE IF NOT EXISTS public.paciente_presentaciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paciente_id UUID NOT NULL REFERENCES public.pacientes(id_paciente) ON DELETE CASCADE,
    drive_file_id TEXT NOT NULL,
    drive_folder_id TEXT,
    drive_name TEXT NOT NULL,
    drive_web_view_link TEXT,
    drive_mime_type TEXT,
    drive_created_time TIMESTAMPTZ,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    sync_status TEXT NOT NULL DEFAULT 'synced' CHECK (sync_status IN ('synced', 'manual_review')),
    sync_error TEXT,
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (paciente_id, drive_file_id)
);

CREATE INDEX IF NOT EXISTS idx_paciente_presentaciones_paciente
    ON public.paciente_presentaciones(paciente_id);

CREATE INDEX IF NOT EXISTS idx_paciente_presentaciones_sync_status
    ON public.paciente_presentaciones(sync_status);

CREATE INDEX IF NOT EXISTS idx_paciente_presentaciones_last_synced
    ON public.paciente_presentaciones(last_synced_at DESC);

ALTER TABLE public.paciente_presentaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on paciente_presentaciones" ON public.paciente_presentaciones;
DROP POLICY IF EXISTS "Odontologo read paciente_presentaciones" ON public.paciente_presentaciones;
DROP POLICY IF EXISTS "Asistente read paciente_presentaciones" ON public.paciente_presentaciones;

CREATE POLICY "Admin full access on paciente_presentaciones"
ON public.paciente_presentaciones FOR ALL
USING (public.get_my_role() IN ('owner','admin'))
WITH CHECK (public.get_my_role() IN ('owner','admin'));

CREATE POLICY "Odontologo read paciente_presentaciones"
ON public.paciente_presentaciones FOR SELECT
USING (public.get_my_role() = 'odontologo');

CREATE POLICY "Asistente read paciente_presentaciones"
ON public.paciente_presentaciones FOR SELECT
USING (public.get_my_role() = 'asistente');
