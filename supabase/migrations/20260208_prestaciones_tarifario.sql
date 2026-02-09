-- =============================================
-- Migration: Prestaciones y Tarifario
-- Created: 2026-02-08
-- Purpose: Catálogo de prestaciones y precios para liquidaciones
-- =============================================

-- 1. Tabla de Catálogo de Prestaciones
CREATE TABLE IF NOT EXISTS public.prestaciones_lista (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    area_id UUID REFERENCES public.personal_areas(id), -- Relación con el área (Cirugía, Ortodoncia, etc.)
    area_nombre TEXT, -- Redundancia útil si no se usa FK estricta o para busquedas rápidas: 'Cirugía', 'General', etc.
    precio_base NUMERIC(12,2) DEFAULT 0,
    moneda TEXT DEFAULT 'ARS' CHECK (moneda IN ('ARS', 'USD')),
    terminos TEXT, -- "Incluye control posoperatorio", etc.
    codigo_interno TEXT,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indice para búsqueda rápida
CREATE INDEX IF NOT EXISTS idx_prestaciones_area ON public.prestaciones_lista(area_nombre);

-- 2. Tabla para registrar prestaciones realizadas por profesionales (para liquidación)
CREATE TABLE IF NOT EXISTS public.prestaciones_realizadas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    profesional_id UUID REFERENCES public.personal(id) NOT NULL,
    paciente_nombre TEXT NOT NULL, -- O link a tabla pacientes si existiera
    prestacion_id UUID REFERENCES public.prestaciones_lista(id),
    prestacion_nombre TEXT NOT NULL, -- Guardamos copia por si cambia el catálogo
    fecha_realizacion DATE DEFAULT CURRENT_DATE,
    valor_cobrado NUMERIC(12,2) NOT NULL,
    moneda_cobro TEXT DEFAULT 'ARS',
    porcentaje_honorarios NUMERIC(5,2), -- % que le corresponde al profesional
    monto_honorarios NUMERIC(12,2), -- Monto final a liquidar al profesional
    estado_pago TEXT DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente', 'liquidado', 'pagado')),
    liquidacion_id UUID, -- Link a futura tabla de liquidaciones (opcional por ahora)
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. RLS Policies
ALTER TABLE public.prestaciones_lista ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prestaciones_realizadas ENABLE ROW LEVEL SECURITY;

-- Prestaciones Lista: Todos leen, solo admins editan
CREATE POLICY "prestaciones_lista_select" ON public.prestaciones_lista FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "prestaciones_lista_admin" ON public.prestaciones_lista FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Prestaciones Realizadas: Admins ven todo
CREATE POLICY "prestaciones_realizadas_admin" ON public.prestaciones_realizadas FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'admin'))
);

-- 4. Insertar Datos Iniciales (Populate)

-- Obtenemos IDs de áreas (simulado en inserción directa o usar nombres si no tenemos los UUIDs a mano)
-- Para simplificar y ser robusto, usaremos DO block para buscar los IDs de area.

DO $$
DECLARE
    v_area_cirugia UUID;
    v_area_general UUID; -- Usaremos este para General, DSD y Rehabilitación usando 'Odontología General'
    v_area_ortodoncia UUID;
    v_area_periodoncia UUID;
BEGIN
    -- Intentamos buscar las areas creadas anteriormente, o defaults.
    -- Ajustar nombres según migration anterior:
    -- 'Cirugía', 'Odontología General', 'Ortodoncia', 'Periodoncia'
    
    SELECT id INTO v_area_cirugia FROM public.personal_areas WHERE nombre = 'Cirugía' LIMIT 1;
    SELECT id INTO v_area_general FROM public.personal_areas WHERE nombre = 'Odontología General' LIMIT 1;
    SELECT id INTO v_area_ortodoncia FROM public.personal_areas WHERE nombre = 'Ortodoncia' LIMIT 1;
    SELECT id INTO v_area_periodoncia FROM public.personal_areas WHERE nombre = 'Periodoncia' LIMIT 1;

    -- Si no existen, las creamos (safety check, aunque deberían estar)
    IF v_area_cirugia IS NULL THEN 
       INSERT INTO public.personal_areas (nombre, tipo_personal) VALUES ('Cirugía', 'profesional') RETURNING id INTO v_area_cirugia; 
    END IF;
    -- (Repetir para otros si fuera necesario, asumimos que existen por migration anterior)


    -- 1. Área: Cirugía & Implantes (Mayormente USD)
    INSERT INTO public.prestaciones_lista (area_id, area_nombre, nombre, precio_base, moneda, terminos) VALUES
    (v_area_cirugia, 'Cirugía', 'Consultas Cirugía Presenciales', 30.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Exodoncia simple', 70.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Exodoncia simple + Preservación Alveolar', 150.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Exodoncia Terceros molares semiretenidos', 100.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Exodoncia Terceros molares retenidos', 150.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Liberación de caninos', 100.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Apicectomía', 200.00, 'USD', 'Incluye control posoperatorio y retiro de puntos.'),
    (v_area_cirugia, 'Cirugía', 'Injerto de tejido conectivo x zona', 300.00, 'USD', 'Incluye control posoperatorio y retiro de puntos.'),
    (v_area_cirugia, 'Cirugía', 'Regeneración ósea guiada (ROG) x zona', 400.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Seno Maxilar', 400.00, 'USD', 'Incluye control posoperatorio presencial. Clínica cubre material.'),
    (v_area_cirugia, 'Cirugía', 'Implante', 250.00, 'USD', 'Incluye control posoperatorio.'),
    (v_area_cirugia, 'Cirugía', 'Implante + relleno óseo', 300.00, 'USD', 'Incluye control posoperatorio.'),
    (v_area_cirugia, 'Cirugía', 'Corona sobre implante', 120.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Provisorio unitario o puente', 30.00, 'USD', 'Incluye rebaso de bisacrílico.'),
    (v_area_cirugia, 'Cirugía', 'Diseño de guía Quirúrgica', 100.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Diseño de guía Quirúrgica + Impresión 3D', 150.00, 'USD', NULL),
    (v_area_cirugia, 'Cirugía', 'Destape implantes + Prueba de BS + Cicatrizal', 40.00, 'USD', 'O 50.000 ARS'),
    (v_area_cirugia, 'Cirugía', 'Destape implantes + Prueba de BS + Cicatrizal + Provisional', 45.00, 'USD', 'O 60.000 ARS'),
    (v_area_cirugia, 'Cirugía', 'Destape implante + Pilar metálico + Provisional', 55.00, 'USD', 'O 70.000 ARS');

    -- 2. Área: General, DSD y Rehabilitación (ARS)
    INSERT INTO public.prestaciones_lista (area_id, area_nombre, nombre, precio_base, moneda, terminos) VALUES
    (v_area_general, 'General', 'Consultas 1era vez, Controles, Urgencias', 50000.00, 'ARS', 'Ptes Pre-DSD o Rehab. Incluye ajustes.'),
    (v_area_general, 'General', 'Resinas Caries Pequeñas/Medianas', 50000.00, 'ARS', 'Sector post general. Recambio amalgamas.'),
    (v_area_general, 'General', 'Resinas Caries Grandes', 60000.00, 'ARS', 'Con base/protección.'),
    (v_area_general, 'General', 'Resina Estética (Carilla, Fractura, Cuellos)', 70000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Cerámicas (Carillas, Coronas, Inlay, Onlay)', 100000.00, 'ARS', 'Desde tallado al cementado.'),
    (v_area_general, 'General', 'Cerámica Central Único Personalizado', 210000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Cerámica Puente', 210000.00, 'ARS', 'Desde tallado al cementado & Provisionales.'),
    (v_area_general, 'General', 'Cerámica Sobre implante', 150000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Prótesis Completa por Maxilar', 210000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Recambio Perno Metálico por Fibra Vidrio', 70000.00, 'ARS', 'Extra al DSD o Rehab.'),
    (v_area_general, 'General', 'Build Up Resina Dual + Provisional', 60000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Build Up Resina Dual + Fibra + Provisional', 70000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Remoción Corona + Build Up + Provisional', 60000.00, 'ARS', 'Prep para otro profesional.'),
    (v_area_general, 'General', 'Remoción Corona + Poste FV + Provisional', 70000.00, 'ARS', 'Prep para otro profesional.'),
    (v_area_general, 'General', 'Remoción Corona + Remoción PM + Poste FV', 80000.00, 'ARS', 'Incluye provisional.'),
    (v_area_general, 'General', 'Remoción Corona + Pilar implante + Provisional', 90000.00, 'ARS', 'Prep para otro profesional.'),
    (v_area_general, 'General', 'Cementado provisorio', 50000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Cementado definitivo', 70000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Limpieza por sesión', 50000.00, 'ARS', 'Ultrasonido, brocha y pasta.'),
    (v_area_general, 'General', 'Limpieza + Terapia Láser', 60000.00, 'ARS', 'Reducir carga bacteriana.'),
    (v_area_general, 'General', 'Limpieza + Gingivectomía Láser', 70000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Gingivectomía Láser por sesión', 50000.00, 'ARS', NULL),
    (v_area_general, 'General', 'Placa Miorrelajante', 80000.00, 'ARS', 'Entrega y ajuste en ORC.'),
    (v_area_general, 'General', 'Contención con fibra Interlig', 50000.00, 'ARS', 'Por maxilar o zona.'),
    (v_area_general, 'General', 'Remoción de contenciones', 50000.00, 'ARS', 'Por sesión.'),
    (v_area_general, 'General', 'Exodoncia simple (Lista General)', 80000.00, 'ARS', 'Ptes Pre-DSD o Rehab.'),
    (v_area_general, 'General', 'Exodoncia 3eros molares retenidos', 160000.00, 'ARS', 'Ptes Pre-DSD o Rehab.');

    -- 3. Área: Ortodoncia (ARS)
    INSERT INTO public.prestaciones_lista (area_id, area_nombre, nombre, precio_base, moneda, terminos) VALUES
    (v_area_ortodoncia, 'Ortodoncia', 'Consultas, Controles Ortodoncia Alineadores', 60000.00, 'ARS', NULL),
    (v_area_ortodoncia, 'Ortodoncia', 'Control Ortodoncia Alineadores con Láser', 70000.00, 'ARS', 'Protocolo por control presencial.'),
    (v_area_ortodoncia, 'Ortodoncia', 'Diseño de caso simple (hasta 10 Alineadores)', 100000.00, 'ARS', NULL),
    (v_area_ortodoncia, 'Ortodoncia', 'Diseño de + de 10 alineadores invisibles', 120000.00, 'ARS', NULL),
    (v_area_ortodoncia, 'Ortodoncia', 'Remoción contención metálica/brackets', 50000.00, 'ARS', 'Por maxilar.'),
    (v_area_ortodoncia, 'Ortodoncia', 'Exodoncia simple (En Ortodoncia)', 80000.00, 'ARS', NULL);
    -- Items compartidos ya están en General, se pueden duplicar si se quiere estricta separación o referenciar.

    -- 4. Área: Periodoncia (Mix ARS/USD) 
    -- (Nota: Insertamos valores en ARS por defecto según lista, aclarando USD en terminos si aplica o poniendo solo ARS por ahora)
    INSERT INTO public.prestaciones_lista (area_id, area_nombre, nombre, precio_base, moneda, terminos) VALUES
    (v_area_periodoncia, 'Periodoncia', 'Limpieza por sesión (Perio)', 50000.00, 'ARS', 'aprox 33 USD'),
    (v_area_periodoncia, 'Periodoncia', 'Gingivectomía Láser por sesión (Perio)', 50000.00, 'ARS', 'aprox 41 USD'),
    (v_area_periodoncia, 'Periodoncia', 'Gingivectomía + Limpieza', 70000.00, 'ARS', NULL),
    (v_area_periodoncia, 'Periodoncia', 'Remoción contención (Perio)', 50000.00, 'ARS', 'aprox 41 USD'),
    (v_area_periodoncia, 'Periodoncia', 'Cerámicas (Carillas/Coronas) - Lista Perio', 70000.00, 'ARS', 'Precio especial menor a Rehab.');

END $$;
