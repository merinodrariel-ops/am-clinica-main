-- Add cuil field to personal table
ALTER TABLE personal ADD COLUMN IF NOT EXISTS cuil TEXT;

-- Create personal_contratos table
CREATE TABLE IF NOT EXISTS personal_contratos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personal_id UUID NOT NULL REFERENCES personal(id) ON DELETE CASCADE,
    anexo_rol TEXT NOT NULL,
    drive_url TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente_firma' CHECK (estado IN ('pendiente_firma', 'firmado')),
    generado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    firmado_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE personal_contratos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_contratos_admin_all" ON personal_contratos
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.categoria IN ('owner', 'admin', 'developer')
        )
    );
