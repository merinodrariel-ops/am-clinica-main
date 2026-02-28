CREATE TABLE IF NOT EXISTS public.staff_ui_preferences (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    view_mode text NOT NULL DEFAULT 'board' CHECK (view_mode IN ('board', 'table')),
    group_mode text NOT NULL DEFAULT 'role' CHECK (group_mode IN ('role', 'company', 'access', 'compliance')),
    only_active boolean NOT NULL DEFAULT false,
    dense_mode boolean NOT NULL DEFAULT false,
    role_order text[] NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_ui_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_ui_preferences_select_own" ON public.staff_ui_preferences;
CREATE POLICY "staff_ui_preferences_select_own"
    ON public.staff_ui_preferences
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_ui_preferences_upsert_own" ON public.staff_ui_preferences;
CREATE POLICY "staff_ui_preferences_upsert_own"
    ON public.staff_ui_preferences
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "staff_ui_preferences_update_own" ON public.staff_ui_preferences;
CREATE POLICY "staff_ui_preferences_update_own"
    ON public.staff_ui_preferences
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
