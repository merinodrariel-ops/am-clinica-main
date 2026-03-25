-- patient_file_tags: dental photo classification tags for Drive files
CREATE TABLE IF NOT EXISTS patient_file_tags (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id      TEXT        NOT NULL,          -- Google Drive file ID
    patient_id   UUID,                          -- pacientes.id_paciente
    category     TEXT        NOT NULL,          -- 'rostro' | 'labios' | 'intraoral' | 'escaneado'
    subcategory  TEXT,                          -- e.g. 'frente', 'perfil_izq', 'oclusal_sup'
    tagged_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    tagged_by    UUID,                          -- profiles.id
    UNIQUE (file_id)
);

ALTER TABLE patient_file_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff can manage photo tags"
    ON patient_file_tags FOR ALL
    USING (get_my_role() IN ('owner','admin','asistente','odontologo','reception','developer','laboratorio'));
