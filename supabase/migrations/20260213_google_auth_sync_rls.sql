-- Google OAuth profile sync + self-scoped RLS for google_user
-- Safe/idempotent migration.

BEGIN;

-- 1) Ensure role set supports a restricted Google role
UPDATE public.profiles
SET role = 'reception'
WHERE role IS NULL
   OR role = ''
   OR role NOT IN (
       'owner', 'admin', 'reception', 'developer',
       'pricing_manager', 'partner_viewer', 'laboratorio', 'google_user'
   );

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN (
    'owner', 'admin', 'reception', 'developer',
    'pricing_manager', 'partner_viewer', 'laboratorio', 'google_user'
));

-- 2) New function (does NOT modify existing functions)
CREATE OR REPLACE FUNCTION public.sync_google_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_google BOOLEAN := false;
    v_role TEXT;
    v_full_name TEXT;
BEGIN
    -- Detect Google provider robustly
    v_is_google := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'google'
        OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(NEW.raw_app_meta_data->'providers', '[]'::jsonb)) AS p(provider)
            WHERE p.provider = 'google'
        );

    IF NOT v_is_google THEN
        RETURN NEW;
    END IF;

    v_role := LOWER(COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'google_user'));
    IF v_role NOT IN (
        'owner', 'admin', 'reception', 'developer',
        'pricing_manager', 'partner_viewer', 'laboratorio', 'google_user'
    ) THEN
        v_role := 'google_user';
    END IF;

    v_full_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        NULLIF(TRIM(CONCAT_WS(' ', NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'family_name')), ''),
        NULLIF(NEW.email, '')
    );

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
        estado,
        is_active,
        ultimo_login,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_role,
        'activo',
        true,
        COALESCE(NEW.last_sign_in_at, now()),
        now()
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        ultimo_login = COALESCE(EXCLUDED.ultimo_login, public.profiles.ultimo_login),
        updated_at = now();

    RETURN NEW;
END;
$$;

-- 3) New trigger (coexists with current ones)
DROP TRIGGER IF EXISTS on_auth_user_google_sync ON auth.users;
CREATE TRIGGER on_auth_user_google_sync
AFTER INSERT OR UPDATE OF email, raw_user_meta_data, raw_app_meta_data, last_sign_in_at
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_google_user_profile();

-- 4) Profiles RLS: keep broad read for existing roles, restrict google_user to own profile
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable read access for all authenticated users" ON public.profiles;
CREATE POLICY "Enable read access for all authenticated users"
ON public.profiles
FOR SELECT
USING (
    auth.role() = 'authenticated'
    AND public.get_my_role() <> 'google_user'
);

DROP POLICY IF EXISTS "Google users read own profile" ON public.profiles;
CREATE POLICY "Google users read own profile"
ON public.profiles
FOR SELECT
USING (
    public.get_my_role() = 'google_user'
    AND auth.uid() = id
);

DROP POLICY IF EXISTS "Google users update own profile" ON public.profiles;
CREATE POLICY "Google users update own profile"
ON public.profiles
FOR UPDATE
USING (
    public.get_my_role() = 'google_user'
    AND auth.uid() = id
)
WITH CHECK (
    public.get_my_role() = 'google_user'
    AND auth.uid() = id
);

-- 5) Data RLS: google_user can only access own rows by auth.uid()
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT UNNEST(ARRAY[
        'pacientes',
        'caja_recepcion_movimientos',
        'caja_admin_movimientos',
        'products',
        'stock_movements',
        'inventario_items'
    ])
    LOOP
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = t
        )
        AND EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = t
              AND column_name = 'created_by'
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
            EXECUTE format('DROP POLICY IF EXISTS "Google users own rows" ON public.%I', t);
            EXECUTE format(
                'CREATE POLICY "Google users own rows" ON public.%I FOR ALL USING (public.get_my_role() = ''google_user'' AND auth.uid() = created_by) WITH CHECK (public.get_my_role() = ''google_user'' AND auth.uid() = created_by)',
                t
            );
        END IF;
    END LOOP;
END
$$;

COMMIT;
