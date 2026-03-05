-- ============================================================
-- FIX LOGIN ERROR: "Database error granting user"
-- Ensure profiles.role is fully migrated to profiles.categoria
-- Update all auth sync triggers to use the correct column name.
-- ============================================================

BEGIN;

-- 1. Ensure the column is correctly named (Safety check)
DO $$ 
BEGIN
  -- If 'role' exists and 'categoria' does not, rename it.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') 
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'categoria') THEN
    ALTER TABLE public.profiles RENAME COLUMN role TO categoria;
  END IF;

  -- If both exist (which shouldn't happen but let's be safe), merge and drop role.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role') 
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'categoria') THEN
    UPDATE public.profiles SET categoria = role WHERE categoria IS NULL OR categoria = '';
    ALTER TABLE public.profiles DROP COLUMN role;
  END IF;
END $$;

-- 2. Fix sync_auth_user_profile_metadata (Google/Meta sync)
CREATE OR REPLACE FUNCTION public.sync_auth_user_profile_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_full_name TEXT;
    v_avatar_url TEXT;
    v_provider TEXT;
    v_categoria TEXT;
BEGIN
    v_full_name := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
        NULLIF(NEW.raw_user_meta_data->>'name', ''),
        NULLIF(TRIM(CONCAT_WS(' ', NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'family_name')), ''),
        NULLIF(NEW.email, '')
    );

    v_avatar_url := COALESCE(
        NULLIF(NEW.raw_user_meta_data->>'avatar_url', ''),
        NULLIF(NEW.raw_user_meta_data->>'picture', '')
    );

    v_provider := COALESCE(
        NULLIF(NEW.raw_app_meta_data->>'provider', ''),
        CASE
            WHEN EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(COALESCE(NEW.raw_app_meta_data->'providers', '[]'::jsonb)) AS p(provider)
                WHERE p.provider = 'google'
            ) THEN 'google'
            ELSE 'email'
        END
    );

    -- Get existing categoria if available
    SELECT categoria INTO v_categoria
    FROM public.profiles
    WHERE id = NEW.id;

    v_categoria := COALESCE(v_categoria, 'reception');

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        categoria,
        estado,
        is_active,
        ultimo_login,
        avatar_url,
        auth_provider,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_categoria,
        'activo',
        true,
        COALESCE(NEW.last_sign_in_at, now()),
        v_avatar_url,
        v_provider,
        now()
    )
    ON CONFLICT (id)
    DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
        auth_provider = COALESCE(EXCLUDED.auth_provider, public.profiles.auth_provider),
        ultimo_login = COALESCE(EXCLUDED.ultimo_login, public.profiles.ultimo_login),
        updated_at = now();

    RETURN NEW;
END;
$$;

-- 3. Fix sync_google_user_profile (Specific Google Logic)
CREATE OR REPLACE FUNCTION public.sync_google_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_google BOOLEAN := false;
    v_categoria TEXT;
    v_full_name TEXT;
BEGIN
    -- Detect Google provider
    v_is_google := COALESCE(NEW.raw_app_meta_data->>'provider', '') = 'google'
        OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(NEW.raw_app_meta_data->'providers', '[]'::jsonb)) AS p(provider)
            WHERE p.provider = 'google'
        );

    IF NOT v_is_google THEN
        RETURN NEW;
    END IF;

    -- Use metadata role if provided, otherwise default. Note metadata field is still 'role' usually.
    v_categoria := LOWER(COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', NULLIF(NEW.raw_user_meta_data->>'categoria', '')), 'google_user'));
    
    IF v_categoria NOT IN (
        'owner', 'admin', 'reception', 'developer',
        'pricing_manager', 'partner_viewer', 'laboratorio', 'google_user', 'recaptacion', 'odontologo', 'asistente'
    ) THEN
        v_categoria := 'google_user';
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
        categoria,
        estado,
        is_active,
        ultimo_login,
        updated_at
    )
    VALUES (
        NEW.id,
        NEW.email,
        v_full_name,
        v_categoria,
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

COMMIT;
