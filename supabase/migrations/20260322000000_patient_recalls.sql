-- ─────────────────────────────────────────────────────────────────────────────
-- recall_auto_rules: Reglas de auto-creación de recalls al completar turnos
-- La tabla recall_rules (instancias por paciente) ya existe en producción.
-- Este archivo solo agrega la tabla de plantillas de reglas.
-- Creado: 2026-03-22
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS recall_auto_rules (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    appointment_type text NOT NULL,    -- tipo de turno: cementado, limpieza, botox…
    recall_type      text NOT NULL,    -- tipo en recall_rules: limpieza, botox, control_carillas…
    label            text NOT NULL,    -- etiqueta del recall
    interval_days    integer NOT NULL, -- días desde el turno original
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE recall_auto_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "recall_auto_rules_read"   ON recall_auto_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "recall_auto_rules_manage" ON recall_auto_rules FOR ALL    TO authenticated
    USING (get_my_role() IN ('owner','admin','developer'));

-- Reglas iniciales (basadas en protocolo AM Clínica)
INSERT INTO recall_auto_rules (appointment_type, recall_type, label, interval_days) VALUES
    ('cementado', 'control_carillas', 'Control post-cementado',           10),
    ('cementado', 'control_carillas', 'Control anual de restauración',   365),
    ('tallado',   'control_carillas', 'Control post-tallado',              10),
    ('limpieza',  'limpieza',         'Próxima limpieza',                 180),
    ('botox',     'botox',            'Próxima aplicación de botox',      120),
    ('control',   'otro',             'Próximo control anual',            365),
    ('consulta',  'otro',             'Primer control de seguimiento',     30),
    ('urgencia',  'otro',             'Control post-urgencia',             14)
ON CONFLICT DO NOTHING;
