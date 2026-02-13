-- Keep auth.users and public.profiles metadata aligned (Google-friendly)
-- Additive migration: does not overwrite existing triggers/functions.

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS auth_provider TEXT,
    ADD COLUMN IF NOT EXISTS welcome_email_sent BOOLEAN NOT NULL DEFAULT false;

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
    v_role TEXT;
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

    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = NEW.id;

    v_role := COALESCE(v_role, 'reception');

    INSERT INTO public.profiles (
        id,
        email,
        full_name,
        role,
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
        v_role,
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

DROP TRIGGER IF EXISTS on_auth_user_metadata_sync ON auth.users;
CREATE TRIGGER on_auth_user_metadata_sync
AFTER INSERT OR UPDATE OF email, raw_user_meta_data, raw_app_meta_data, last_sign_in_at
ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.sync_auth_user_profile_metadata();

COMMIT;
