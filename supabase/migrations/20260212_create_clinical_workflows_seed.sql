-- Enums (Tipos de datos)
DO $$ BEGIN
    CREATE TYPE treatment_status AS ENUM ('active', 'waiting', 'production', 'finished', 'archived');
    CREATE TYPE workflow_type AS ENUM ('treatment', 'recurrent');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 1. Definición de Workflows (Tipos de flujo)
CREATE TABLE IF NOT EXISTS clinical_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL, -- ej: "Ortodoncia Invisible"
    type workflow_type NOT NULL,
    frequency_months INTEGER, -- Para recurrentes (ej: 6 meses)
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Etapas del Workflow
CREATE TABLE IF NOT EXISTS clinical_workflow_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES clinical_workflows(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- ej: "Señado", "Planificación"
    order_index INTEGER NOT NULL,
    time_limit_days INTEGER, -- Para alertas automáticas
    is_initial BOOLEAN DEFAULT false,
    is_final BOOLEAN DEFAULT false,
    color TEXT, 
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Tratamientos Activos (Las tarjetas del Kanban)
CREATE TABLE IF NOT EXISTS patient_treatments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID REFERENCES pacientes(id_paciente) ON DELETE CASCADE,
    workflow_id UUID REFERENCES clinical_workflows(id) ON DELETE CASCADE,
    current_stage_id UUID REFERENCES clinical_workflow_stages(id),
    doctor_id UUID REFERENCES users(id),
    status treatment_status DEFAULT 'active',
    start_date TIMESTAMPTZ DEFAULT NOW(),
    last_stage_change TIMESTAMPTZ DEFAULT NOW(),
    next_milestone_date TIMESTAMPTZ, -- Fecha límite o próximo hito
    metadata JSONB DEFAULT '{}'::jsonb, -- Para campos específicos: "tipo_implante", "cantidad_alineadores", etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Historial de Cambios
CREATE TABLE IF NOT EXISTS treatment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    treatment_id UUID REFERENCES patient_treatments(id) ON DELETE CASCADE,
    previous_stage_id UUID REFERENCES clinical_workflow_stages(id),
    new_stage_id UUID REFERENCES clinical_workflow_stages(id),
    changed_by UUID REFERENCES users(id),
    comments TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Políticas de Seguridad (RLS)
ALTER TABLE clinical_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_workflow_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE treatment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir todo a usuarios autenticados" ON clinical_workflows FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON clinical_workflow_stages FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON patient_treatments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Permitir todo a usuarios autenticados" ON treatment_history FOR ALL USING (auth.role() = 'authenticated');
