-- Full Reset Migration for Clinical Workflows
-- This cleans up all duplicate data and re-seeds the exact structure requested.

BEGIN;

-- 1. DELETE ALL DATA (Order matters for FKs)
DELETE FROM treatment_history;
DELETE FROM patient_treatments;
DELETE FROM clinical_workflow_stages;
DELETE FROM clinical_workflows;

-- 2. Insert Workflows
INSERT INTO clinical_workflows (name, type, frequency_months) VALUES
('Ortodoncia Invisible', 'treatment', NULL),
('Cirugía e Implantes', 'treatment', NULL),
('Diseño de Sonrisa', 'treatment', NULL),
('Control Ortodoncia', 'recurrent', 6),
('Mantenimiento Implantes', 'recurrent', 12),
('Control Carillas', 'recurrent', 12),
('Limpieza Dental', 'recurrent', 6),
('Aplicación de Botox', 'recurrent', 4);

-- 3. Insert specific stages for "Ortodoncia Invisible"
WITH wf AS (SELECT id FROM clinical_workflows WHERE name = 'Ortodoncia Invisible')
INSERT INTO clinical_workflow_stages (workflow_id, name, order_index, is_initial, is_final) VALUES
((SELECT id FROM wf), 'Señado / Pendiente de diseño', 1, true, false),
((SELECT id FROM wf), 'Fotos clínicas completas', 2, false, false),
((SELECT id FROM wf), 'Escaneo digital cargado', 3, false, false),
((SELECT id FROM wf), 'Estudios cargados', 4, false, false),
((SELECT id FROM wf), 'Setup digital', 5, false, false),
((SELECT id FROM wf), 'Diseño de alineadores', 6, false, false),
((SELECT id FROM wf), 'Revisión profesional', 7, false, false),
((SELECT id FROM wf), 'Ajustes necesarios', 8, false, false),
((SELECT id FROM wf), 'Aprobación del setup', 9, false, false),
((SELECT id FROM wf), 'Producción alineadores', 10, false, false),
((SELECT id FROM wf), 'Caso enviado a laboratorio', 11, false, false),
((SELECT id FROM wf), 'Entrega alineadores', 12, false, false),
((SELECT id FROM wf), 'Seguimiento activo', 13, false, false),
((SELECT id FROM wf), 'Refinamiento', 14, false, false),
((SELECT id FROM wf), 'Retención', 15, false, false),
((SELECT id FROM wf), 'Finalización', 16, false, true);

-- 4. Insert specific stages for "Cirugía e Implantes"
WITH wf AS (SELECT id FROM clinical_workflows WHERE name = 'Cirugía e Implantes')
INSERT INTO clinical_workflow_stages (workflow_id, name, order_index, is_initial, is_final) VALUES
((SELECT id FROM wf), 'Planificación quirúrgica', 1, true, false),
((SELECT id FROM wf), 'CBCT cargado', 2, false, false),
((SELECT id FROM wf), 'Planificación del implante', 3, false, false),
((SELECT id FROM wf), 'Cirugía realizada', 4, false, false),
((SELECT id FROM wf), 'Osteointegración', 5, false, false),
((SELECT id FROM wf), 'Segunda fase o impresión', 6, false, false),
((SELECT id FROM wf), 'Escaneo para corona', 7, false, false),
((SELECT id FROM wf), 'Corona en laboratorio', 8, false, false),
((SELECT id FROM wf), 'Instalación de corona', 9, false, false),
((SELECT id FROM wf), 'Control post quirúrgico', 10, false, false),
((SELECT id FROM wf), 'Cierre del tratamiento', 11, false, true);

-- 5. Insert specific stages for "Diseño de Sonrisa"
WITH wf AS (SELECT id FROM clinical_workflows WHERE name = 'Diseño de Sonrisa')
INSERT INTO clinical_workflow_stages (workflow_id, name, order_index, is_initial, is_final) VALUES
((SELECT id FROM wf), 'Señado diseño de sonrisa', 1, true, false),
((SELECT id FROM wf), 'Fotos clínicas', 2, false, false),
((SELECT id FROM wf), 'Escaneo digital', 3, false, false),
((SELECT id FROM wf), 'Diseño digital de sonrisa', 4, false, false),
((SELECT id FROM wf), 'Mockup digital', 5, false, false),
((SELECT id FROM wf), 'Presentación al paciente', 6, false, false),
((SELECT id FROM wf), 'Aprobación del diseño', 7, false, false),
((SELECT id FROM wf), 'Encerado diagnóstico laboratorio', 8, false, false),
((SELECT id FROM wf), 'Mockup clínico', 9, false, false),
((SELECT id FROM wf), 'Prueba en boca', 10, false, false),
((SELECT id FROM wf), 'Preparación dental', 11, false, false),
((SELECT id FROM wf), 'Escaneo final', 12, false, false),
((SELECT id FROM wf), 'Fabricación de carillas', 13, false, false),
((SELECT id FROM wf), 'Cementado', 14, false, false),
((SELECT id FROM wf), 'Control posterior', 15, false, false),
((SELECT id FROM wf), 'Finalización del tratamiento', 16, false, true);

-- 6. Insert stages for Recurrent Workflows
WITH wf AS (SELECT id FROM clinical_workflows WHERE type = 'recurrent')
INSERT INTO clinical_workflow_stages (workflow_id, name, order_index, is_initial, is_final)
SELECT id, 'Pendiente de Control', 1, true, false FROM wf
UNION ALL
SELECT id, 'Turno Agendado', 2, false, false FROM wf
UNION ALL
SELECT id, 'Control Realizado', 3, false, true FROM wf;

COMMIT;
