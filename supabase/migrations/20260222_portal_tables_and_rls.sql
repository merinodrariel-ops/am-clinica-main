-- ============================================================
-- Portal tables: registro_horas, liquidaciones_mensuales,
-- provider_goals, personal_goal_progress
-- Fix: achievements (add xp_reward, rarity),
--      worker_achievements (personal_id instead of worker_id)
-- RLS on personal table
-- Seed: starter achievements + goals
-- ============================================================

-- ── 1. Fix achievements table ────────────────────────────────
ALTER TABLE public.achievements
    ADD COLUMN IF NOT EXISTS xp_reward  INT  NOT NULL DEFAULT 50,
    ADD COLUMN IF NOT EXISTS rarity     TEXT NOT NULL DEFAULT 'common'
        CHECK (rarity IN ('common','rare','epic','legendary'));

-- ── 2. Fix worker_achievements: swap worker_id → personal_id ─
-- Only run if the old column exists (idempotent)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name   = 'worker_achievements'
          AND column_name  = 'worker_id'
    ) THEN
        -- Drop old FK + unique constraint first
        ALTER TABLE public.worker_achievements
            DROP CONSTRAINT IF EXISTS worker_achievements_worker_id_fkey,
            DROP CONSTRAINT IF EXISTS worker_achievements_worker_id_achievement_id_key;

        -- Rename column
        ALTER TABLE public.worker_achievements
            RENAME COLUMN worker_id TO personal_id;

        -- Add correct FK to personal
        ALTER TABLE public.worker_achievements
            ADD CONSTRAINT worker_achievements_personal_id_fkey
                FOREIGN KEY (personal_id) REFERENCES public.personal(id) ON DELETE CASCADE,
            ADD CONSTRAINT worker_achievements_personal_id_achievement_id_key
                UNIQUE (personal_id, achievement_id);
    END IF;

    -- If the table doesn't exist at all, create it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'worker_achievements'
    ) THEN
        CREATE TABLE public.worker_achievements (
            id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            personal_id    UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
            achievement_id UUID NOT NULL REFERENCES public.achievements(id),
            awarded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (personal_id, achievement_id)
        );
    END IF;
END $$;

-- ── 3. registro_horas ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.registro_horas (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personal_id   UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    fecha         DATE NOT NULL DEFAULT CURRENT_DATE,
    horas         NUMERIC(5,2) NOT NULL DEFAULT 0,
    type          TEXT DEFAULT 'shift'
                    CHECK (type IN ('shift','procedure','task','bonus','deduction')),
    observaciones TEXT,
    estado        TEXT NOT NULL DEFAULT 'pending'
                    CHECK (estado IN ('pending','approved','paid','rejected','observado')),
    hora_ingreso  TEXT, -- HH:MM string
    hora_egreso   TEXT,
    evidencia_url TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. liquidaciones_mensuales ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.liquidaciones_mensuales (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personal_id          UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    mes                  DATE NOT NULL,                   -- First day of the month YYYY-MM-01
    total_horas          NUMERIC(8,2),
    valor_hora_snapshot  NUMERIC(10,2),
    total_ars            NUMERIC(12,2),
    tc_liquidacion       NUMERIC(10,4),                  -- Exchange rate used
    total_usd            NUMERIC(12,2),
    estado               TEXT NOT NULL DEFAULT 'pending'
                            CHECK (estado IN ('pending','approved','paid','rejected')),
    fecha_pago           DATE,
    observaciones        TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (personal_id, mes)
);

-- ── 5. provider_goals ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.provider_goals (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code         TEXT UNIQUE NOT NULL,
    title        TEXT NOT NULL,
    description  TEXT,
    category     TEXT NOT NULL DEFAULT 'general'
                    CHECK (category IN ('compliance','attendance','performance','growth','financial','loyalty','general')),
    role_target  TEXT,           -- NULL = all roles; else specific rol value
    target_value NUMERIC NOT NULL DEFAULT 1,
    unit         TEXT NOT NULL DEFAULT 'count',  -- 'count','hours','pesos','%'
    xp_reward    INT  NOT NULL DEFAULT 100,
    icon         TEXT NOT NULL DEFAULT '🎯',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 6. personal_goal_progress ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.personal_goal_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    personal_id   UUID NOT NULL REFERENCES public.personal(id) ON DELETE CASCADE,
    goal_id       UUID NOT NULL REFERENCES public.provider_goals(id),
    current_value NUMERIC NOT NULL DEFAULT 0,
    completed     BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (personal_id, goal_id)
);

-- ── 7. Indexes ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_registro_horas_personal ON public.registro_horas(personal_id);
CREATE INDEX IF NOT EXISTS idx_registro_horas_fecha    ON public.registro_horas(fecha);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_personal  ON public.liquidaciones_mensuales(personal_id);
CREATE INDEX IF NOT EXISTS idx_liquidaciones_mes       ON public.liquidaciones_mensuales(mes);
CREATE INDEX IF NOT EXISTS idx_goal_progress_personal  ON public.personal_goal_progress(personal_id);
CREATE INDEX IF NOT EXISTS idx_worker_achievements_personal ON public.worker_achievements(personal_id);

-- ── 8. RLS on personal ───────────────────────────────────────
ALTER TABLE public.personal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on personal"  ON public.personal;
DROP POLICY IF EXISTS "Worker read own personal"       ON public.personal;
DROP POLICY IF EXISTS "Worker update own personal"     ON public.personal;

-- Admin/owner: full access to all records
CREATE POLICY "Admin full access on personal"
ON public.personal FOR ALL
USING (public.get_my_role() IN ('owner','admin'))
WITH CHECK (public.get_my_role() IN ('owner','admin'));

-- Prestador: read their own row
CREATE POLICY "Worker read own personal"
ON public.personal FOR SELECT
USING (user_id = auth.uid());

-- Prestador: update their own row (app-layer enforces locked fields)
CREATE POLICY "Worker update own personal"
ON public.personal FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- ── 9. RLS on registro_horas ─────────────────────────────────
ALTER TABLE public.registro_horas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on registro_horas" ON public.registro_horas;
DROP POLICY IF EXISTS "Worker read own horas"               ON public.registro_horas;

CREATE POLICY "Admin full access on registro_horas"
ON public.registro_horas FOR ALL
USING (public.get_my_role() IN ('owner','admin'));

CREATE POLICY "Worker read own horas"
ON public.registro_horas FOR SELECT
USING (personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid()));

-- ── 10. RLS on liquidaciones_mensuales ──────────────────────
ALTER TABLE public.liquidaciones_mensuales ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on liquidaciones"  ON public.liquidaciones_mensuales;
DROP POLICY IF EXISTS "Worker read own liquidaciones"       ON public.liquidaciones_mensuales;

CREATE POLICY "Admin full access on liquidaciones"
ON public.liquidaciones_mensuales FOR ALL
USING (public.get_my_role() IN ('owner','admin'));

CREATE POLICY "Worker read own liquidaciones"
ON public.liquidaciones_mensuales FOR SELECT
USING (personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid()));

-- ── 11. RLS on worker_achievements ──────────────────────────
ALTER TABLE public.worker_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on worker_achievements" ON public.worker_achievements;
DROP POLICY IF EXISTS "Worker read own achievements"             ON public.worker_achievements;

CREATE POLICY "Admin full access on worker_achievements"
ON public.worker_achievements FOR ALL
USING (public.get_my_role() IN ('owner','admin'));

CREATE POLICY "Worker read own achievements"
ON public.worker_achievements FOR SELECT
USING (personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid()));

-- ── 12. RLS on provider_goals ───────────────────────────────
ALTER TABLE public.provider_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Everyone reads provider_goals" ON public.provider_goals;
CREATE POLICY "Everyone reads provider_goals"
ON public.provider_goals FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admin manage provider_goals"
ON public.provider_goals FOR ALL
USING (public.get_my_role() IN ('owner','admin'));

-- ── 13. RLS on personal_goal_progress ───────────────────────
ALTER TABLE public.personal_goal_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access on goal_progress"  ON public.personal_goal_progress;
DROP POLICY IF EXISTS "Worker read own goal_progress"       ON public.personal_goal_progress;
DROP POLICY IF EXISTS "Worker upsert own goal_progress"     ON public.personal_goal_progress;

CREATE POLICY "Admin full access on goal_progress"
ON public.personal_goal_progress FOR ALL
USING (public.get_my_role() IN ('owner','admin'));

CREATE POLICY "Worker read own goal_progress"
ON public.personal_goal_progress FOR SELECT
USING (personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid()));

CREATE POLICY "Worker upsert own goal_progress"
ON public.personal_goal_progress FOR INSERT
WITH CHECK (personal_id IN (SELECT id FROM public.personal WHERE user_id = auth.uid()));

-- ── 14. Seed: starter achievements ──────────────────────────
INSERT INTO public.achievements (code, name, description, category, xp_reward, rarity) VALUES
    ('bienvenido',        'Bienvenido al equipo',    'Completaste tu perfil por primera vez',         'general',    50,  'common'),
    ('upload_dni',        'Identidad verificada',    'Subiste ambos lados de tu DNI',                 'compliance', 100, 'common'),
    ('compliance_master', 'Documentación completa',  'Todos tus documentos están cargados',           'compliance', 200, 'rare'),
    ('primer_hora',       'Primera hora registrada', 'Registraste tu primera hora de trabajo',        'attendance',  75, 'common'),
    ('primer_mes',        'Primer mes completo',     'Completaste un mes de trabajo en la clínica',   'loyalty',    300, 'epic')
ON CONFLICT (code) DO UPDATE SET
    xp_reward   = EXCLUDED.xp_reward,
    rarity      = EXCLUDED.rarity,
    description = EXCLUDED.description;

-- ── 15. Seed: starter provider_goals ────────────────────────
INSERT INTO public.provider_goals (code, title, description, category, role_target, target_value, unit, xp_reward, icon) VALUES
    ('upload_dni',         'Subir DNI',                'Cargá el frente y dorso de tu DNI',           'compliance', NULL, 1,   'count',  100, '🪪'),
    ('complete_profile',   'Completar perfil',         'Completá todos los campos de tu ficha',       'compliance', NULL, 8,   'count',  150, '👤'),
    ('first_hours',        'Primeras 10 horas',        'Registrá tus primeras 10 horas de trabajo',   'attendance', NULL, 10,  'hours',  200, '⏱️'),
    ('monthly_40h',        '40 horas en el mes',       'Alcanzá 40 horas trabajadas en un mes',       'attendance', NULL, 40,  'hours',  300, '📅'),
    ('six_months',         '6 meses en el equipo',     'Cumplí 6 meses desde tu fecha de ingreso',    'loyalty',    NULL, 180, 'days',   500, '⭐')
ON CONFLICT (code) DO NOTHING;
