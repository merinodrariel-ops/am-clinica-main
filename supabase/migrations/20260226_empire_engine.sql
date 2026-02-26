-- ============================================================
-- AM Clínica · Empire Engine — Liquidación Dual + Gamificación
-- ============================================================

-- 1. Ampliar liquidaciones_mensuales
ALTER TABLE public.liquidaciones_mensuales
    ADD COLUMN IF NOT EXISTS tc_bna_venta    NUMERIC(12,4),
    ADD COLUMN IF NOT EXISTS modelo_pago     TEXT DEFAULT 'hora_ars'
        CHECK (modelo_pago IN ('hora_ars', 'prestacion_usd')),
    ADD COLUMN IF NOT EXISTS breakdown       JSONB DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS prestaciones_validadas   INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS prestaciones_pendientes  INTEGER DEFAULT 0;

-- 2. Ampliar prestaciones_realizadas con slides_url
ALTER TABLE public.prestaciones_realizadas
    ADD COLUMN IF NOT EXISTS slides_url TEXT,
    ADD COLUMN IF NOT EXISTS slides_validado BOOLEAN DEFAULT false;

-- 3. Ampliar registro_horas con evidencia tipada
ALTER TABLE public.registro_horas
    ADD COLUMN IF NOT EXISTS evidencia_slides_url TEXT;

-- 4. Nuevos Achievements (badges gamificación)
INSERT INTO public.achievements (code, name, description, category, xp_reward, rarity)
VALUES
    ('master_evidencia',
     'Master de la Evidencia',
     'Cargaste 10 o más evoluciones clínicas en Google Slides. ¡Tus registros son impecables!',
     'performance',
     300,
     'epic'),
    ('reloj_suizo',
     'Reloj Suizo',
     'Registraste presencia 20 o más días en un mismo mes. Puntualidad de élite.',
     'attendance',
     200,
     'rare'),
    ('ninja_recepcion',
     'Ninja de Recepción',
     'Procesaste 100 o más turnos. La recepción corre porque vos estás.',
     'performance',
     250,
     'rare')
ON CONFLICT (code) DO UPDATE SET
    name        = EXCLUDED.name,
    description = EXCLUDED.description,
    xp_reward   = EXCLUDED.xp_reward,
    rarity      = EXCLUDED.rarity;

-- 5. Goals vinculados a los badges nuevos
INSERT INTO public.provider_goals
    (code, title, description, category, role_target, target_value, unit, xp_reward, icon)
VALUES
    ('slides_10',
     '10 Evoluciones en Slides',
     'Cargá 10 evoluciones clínicas con link de Google Slides para desbloquear Master de la Evidencia',
     'performance',
     'dentist',
     10,
     'count',
     300,
     'FileVideo'),
    ('presencia_20',
     '20 Días de Presencia',
     'Registrá asistencia 20 días en el mes para desbloquear Reloj Suizo',
     'attendance',
     NULL,
     20,
     'count',
     200,
     'Clock'),
    ('turnos_100',
     '100 Turnos Gestionados',
     'Gestioná 100 turnos como recepcionista para desbloquear Ninja de Recepción',
     'performance',
     'reception',
     100,
     'count',
     250,
     'CalendarCheck')
ON CONFLICT (code) DO UPDATE SET
    title       = EXCLUDED.title,
    description = EXCLUDED.description,
    target_value = EXCLUDED.target_value,
    xp_reward   = EXCLUDED.xp_reward;

-- 6. Vista de Leaderboard Mensual
-- Muestra el ranking de XP acumulado por prestador en el mes actual
CREATE OR REPLACE VIEW public.leaderboard_mensual AS
SELECT
    p.id                                    AS personal_id,
    p.nombre,
    p.apellido,
    p.foto_url,
    p.area,
    p.rol,
    COALESCE(SUM(a.xp_reward), 0)           AS xp_total,
    COUNT(wa.id)                            AS badges_count,
    EXTRACT(MONTH FROM NOW())               AS mes,
    EXTRACT(YEAR  FROM NOW())               AS anio,
    ROW_NUMBER() OVER (
        ORDER BY COALESCE(SUM(a.xp_reward), 0) DESC
    )                                       AS ranking
FROM public.personal p
LEFT JOIN public.worker_achievements wa ON wa.personal_id = p.id
LEFT JOIN public.achievements         a  ON a.id = wa.achievement_id
WHERE p.activo = true
GROUP BY p.id, p.nombre, p.apellido, p.foto_url, p.area, p.rol
ORDER BY xp_total DESC;

-- 7. Índice para consultas de registro_horas por mes
CREATE INDEX IF NOT EXISTS idx_registro_horas_personal_fecha
    ON public.registro_horas (personal_id, fecha);

-- 8. RLS para nuevas columnas — no requiere cambios (hereda políticas existentes)
-- Las vistas heredan las políticas de las tablas base.
GRANT SELECT ON public.leaderboard_mensual TO authenticated;
