-- ============================================================
-- AM Clínica · Prestaciones HC — Registro en app (reemplaza HC en Sheets)
-- ============================================================

-- 1. Soporte de múltiples áreas por profesional
ALTER TABLE public.personal
    ADD COLUMN IF NOT EXISTS areas_asignadas TEXT[] DEFAULT '{}';

-- Poblar areas_asignadas desde el campo `area` existente (primera carga)
UPDATE public.personal
SET areas_asignadas = ARRAY[area]
WHERE area IS NOT NULL
  AND areas_asignadas = '{}'
  AND tipo = 'profesional';

-- 2. Extender prestaciones_realizadas con FKs útiles
ALTER TABLE public.prestaciones_realizadas
    ADD COLUMN IF NOT EXISTS tarifario_id UUID REFERENCES public.prestaciones_lista(id),
    ADD COLUMN IF NOT EXISTS paciente_id  UUID REFERENCES public.pacientes(id_paciente);

-- 3. RLS: profesionales pueden ver y cargar sus propias prestaciones
DROP POLICY IF EXISTS "prestaciones_realizadas_doctor" ON public.prestaciones_realizadas;
CREATE POLICY "prestaciones_realizadas_doctor"
    ON public.prestaciones_realizadas
    FOR ALL
    USING (
        profesional_id IN (
            SELECT id FROM public.personal WHERE user_id = auth.uid()
        )
    );

-- 4. RLS: profesionales pueden leer el tarifario completo
DROP POLICY IF EXISTS "prestaciones_lista_odontologo" ON public.prestaciones_lista;
CREATE POLICY "prestaciones_lista_odontologo"
    ON public.prestaciones_lista
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

-- 5. Actualizar / completar prestaciones_lista con precios actuales del tarifario
-- Usamos upsert por nombre+area para no duplicar
INSERT INTO public.prestaciones_lista (area_nombre, nombre, precio_base, moneda, terminos, activo)
VALUES
    -- Periodoncia (USD)
    ('Periodoncia', 'Limpieza por sesión', 33.00, 'USD', 'Por sesión', true),
    ('Periodoncia', 'Gingivectomía Láser por sesión', 41.00, 'USD', 'Por sesión. Puede abarcar 1 diente o ambos maxilares', true),
    ('Periodoncia', 'Remoción contención', 41.00, 'USD', 'Por sesión', true),
    -- Cirugía (USD)
    ('Cirugía', 'Consulta Cirugía Presencial', 30.00, 'USD', NULL, true),
    ('Cirugía', 'Exodoncia simple', 70.00, 'USD', NULL, true),
    ('Cirugía', 'Exodoncia simple + Preservación Alveolar', 150.00, 'USD', NULL, true),
    ('Cirugía', 'Exodoncia Terceros molares semiretenidos', 100.00, 'USD', NULL, true),
    ('Cirugía', 'Exodoncia Terceros molares retenidos', 150.00, 'USD', NULL, true),
    ('Cirugía', 'Liberación de caninos', 100.00, 'USD', NULL, true),
    ('Cirugía', 'Apicectomía', 200.00, 'USD', 'Incluye control posoperatorio y retiro de puntos', true),
    ('Cirugía', 'Injerto de tejido conectivo x zona', 300.00, 'USD', 'Incluye control posoperatorio y retiro de puntos', true),
    ('Cirugía', 'Regeneración ósea guiada (ROG) x zona', 400.00, 'USD', NULL, true),
    ('Cirugía', 'Seno Maxilar', 400.00, 'USD', 'Incluye control posoperatorio. Clínica cubre material', true),
    ('Cirugía', 'Implante', 250.00, 'USD', 'Incluye control posoperatorio', true),
    ('Cirugía', 'Implante + relleno óseo', 300.00, 'USD', 'Incluye control posoperatorio', true),
    ('Cirugía', 'Corona sobre implante', 120.00, 'USD', NULL, true),
    ('Cirugía', 'Provisorio unitario o puente', 30.00, 'USD', 'Incluye rebaso de bisacrílico', true),
    ('Cirugía', 'Diseño de guía Quirúrgica', 100.00, 'USD', NULL, true),
    ('Cirugía', 'Diseño de guía Quirúrgica + Impresión 3D', 150.00, 'USD', NULL, true),
    ('Cirugía', 'Destape implantes + BS + Cicatrizal', 40.00, 'USD', NULL, true),
    ('Cirugía', 'Destape implantes + BS + Cicatrizal + Provisional', 45.00, 'USD', NULL, true),
    ('Cirugía', 'Destape implante + Pilar metálico + Provisional', 55.00, 'USD', NULL, true),
    -- Endodoncia (ARS)
    ('Endodoncia', 'Consulta Endodoncia Especialista', 35000.00, 'ARS', NULL, true),
    ('Endodoncia', 'Endodoncia uni-birradicular', 130000.00, 'ARS', NULL, true),
    ('Endodoncia', 'Endodoncia multiradicular', 165000.00, 'ARS', NULL, true),
    ('Endodoncia', 'Retratamiento uniradicular', 185000.00, 'ARS', NULL, true),
    ('Endodoncia', 'Retratamiento multiradicular', 220000.00, 'ARS', NULL, true),
    ('Endodoncia', 'RTC (Retratamiento conducto complejo)', 185000.00, 'ARS', NULL, true),
    -- Ortodoncia (ARS)
    ('Ortodoncia', 'Control Ortodoncia Alineadores', 60000.00, 'ARS', 'Por control presencial', true),
    ('Ortodoncia', 'Control Ortodoncia Alineadores + Láser', 70000.00, 'ARS', 'Por control presencial', true),
    ('Ortodoncia', 'Diseño de caso simple (hasta 10 alineadores)', 100000.00, 'ARS', NULL, true),
    ('Ortodoncia', 'Diseño de caso + de 10 alineadores', 120000.00, 'ARS', NULL, true),
    -- General / Rehabilitación (ARS)
    ('General', 'Consulta, Control, Urgencia, Ajuste', 50000.00, 'ARS', 'Pacientes Pre-DSD o Rehab', true),
    ('General', 'Resinas caries pequeñas/medianas', 50000.00, 'ARS', 'Sector posterior sin compromiso estético', true),
    ('General', 'Resinas caries grandes con base cavitaria', 60000.00, 'ARS', 'Con compromiso estructural sin incrustación', true),
    ('General', 'Resina estética (carilla, fractura, cuello)', 70000.00, 'ARS', NULL, true),
    ('General', 'Cerámicas (carillas, coronas, inlay, onlay)', 100000.00, 'ARS', 'Desde tallado al cementado', true),
    ('General', 'Cerámica central único personalizado', 210000.00, 'ARS', NULL, true),
    ('General', 'Cerámica sobre implante', 150000.00, 'ARS', NULL, true),
    ('General', 'Cerámica puente (tallado al cementado)', 210000.00, 'ARS', 'Incluye provisionales', true),
    ('General', 'Prótesis completa por maxilar', 210000.00, 'ARS', NULL, true),
    ('General', 'Recambio perno metálico por fibra de vidrio', 70000.00, 'ARS', 'Extra al DSD o Rehab', true),
    ('General', 'Remoción corona + Build Up + Provisional', 60000.00, 'ARS', NULL, true),
    ('General', 'Limpieza por sesión', 50000.00, 'ARS', NULL, true),
    ('General', 'Limpieza + Terapia Láser', 60000.00, 'ARS', NULL, true),
    ('General', 'Limpieza + Gingivectomía Láser', 70000.00, 'ARS', NULL, true)
ON CONFLICT DO NOTHING;

-- 6. Índice para búsquedas por profesional y fecha
CREATE INDEX IF NOT EXISTS idx_prestaciones_profesional_fecha
    ON public.prestaciones_realizadas (profesional_id, fecha_realizacion);

-- 7. Vista útil: prestaciones del mes con info de profesional
CREATE OR REPLACE VIEW public.prestaciones_mes_actual AS
SELECT
    pr.id,
    pr.profesional_id,
    p.nombre                        AS prof_nombre,
    p.apellido                      AS prof_apellido,
    pr.prestacion_nombre,
    pr.fecha_realizacion,
    pr.monto_honorarios,
    pr.moneda_cobro,
    pr.slides_url,
    pr.slides_validado,
    pr.paciente_nombre,
    pr.notas,
    pr.estado_pago,
    pr.tarifario_id,
    pr.paciente_id
FROM public.prestaciones_realizadas pr
JOIN public.personal p ON p.id = pr.profesional_id
WHERE EXTRACT(MONTH FROM pr.fecha_realizacion) = EXTRACT(MONTH FROM NOW())
  AND EXTRACT(YEAR  FROM pr.fecha_realizacion) = EXTRACT(YEAR  FROM NOW());

GRANT SELECT ON public.prestaciones_mes_actual TO authenticated;
