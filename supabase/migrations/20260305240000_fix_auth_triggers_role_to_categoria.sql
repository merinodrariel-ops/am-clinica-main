-- ============================================================
-- EMERGENCY FIX: Auth triggers using profiles.role (doesn't exist)
-- Column was renamed to profiles.categoria.
--
-- Broken functions/triggers:
--   1. handle_new_user()           → trigger on_auth_user_created
--   2. sync_auth_user_profile_metadata() → trigger on_auth_user_metadata_sync
--
-- Fix: replace both with handle_auth_user_sync() (already created in
--      20260305230000) and drop the broken triggers.
-- ============================================================

BEGIN;

-- ── 1. Fix handle_new_user (fires on INSERT into auth.users) ─────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
BEGIN
  v_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(TRIM(CONCAT_WS(' ', NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'family_name')), ''),
    NULLIF(NEW.email, '')
  );

  INSERT INTO public.profiles (id, email, full_name, categoria)
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'categoria', ''), NULLIF(NEW.raw_user_meta_data->>'role', ''), 'reception')
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── 2. Fix sync_auth_user_profile_metadata (fires on every login) ───────────

CREATE OR REPLACE FUNCTION public.sync_auth_user_profile_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name  TEXT;
  v_avatar_url TEXT;
  v_provider   TEXT;
  v_categoria  TEXT;
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

  -- Read existing categoria — NEVER downgrade an existing user's role
  SELECT categoria INTO v_categoria FROM public.profiles WHERE id = NEW.id;
  v_categoria := COALESCE(v_categoria, 'reception');

  INSERT INTO public.profiles (
    id, email, full_name, categoria, estado, is_active,
    ultimo_login, avatar_url, auth_provider, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_full_name, v_categoria, 'activo', true,
    COALESCE(NEW.last_sign_in_at, now()), v_avatar_url, v_provider, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email        = EXCLUDED.email,
    full_name    = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url   = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    auth_provider = COALESCE(EXCLUDED.auth_provider, public.profiles.auth_provider),
    ultimo_login = COALESCE(EXCLUDED.ultimo_login, public.profiles.ultimo_login),
    updated_at   = now();
    -- NOTE: categoria deliberately NOT updated on conflict → preserves owner/admin roles

  RETURN NEW;
END;
$$;

-- ── 3. Re-attach triggers (unchanged names, same events) ─────────────────────

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

DROP TRIGGER IF EXISTS on_auth_user_metadata_sync ON auth.users;
CREATE TRIGGER on_auth_user_metadata_sync
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data, raw_app_meta_data, last_sign_in_at
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_profile_metadata();

COMMIT;
