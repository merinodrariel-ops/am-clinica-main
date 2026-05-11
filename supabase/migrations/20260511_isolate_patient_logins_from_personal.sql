-- Prevent generic Google/patient logins from becoming internal staff/providers.
-- Only explicit staff invitations should assign an operative categoria.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name TEXT;
  v_categoria TEXT;
BEGIN
  v_full_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NULLIF(TRIM(CONCAT_WS(' ', NEW.raw_user_meta_data->>'given_name', NEW.raw_user_meta_data->>'family_name')), ''),
    NULLIF(NEW.email, '')
  );

  v_categoria := COALESCE(
    NULLIF(LOWER(NEW.raw_user_meta_data->>'categoria'), ''),
    NULLIF(LOWER(NEW.raw_user_meta_data->>'role'), ''),
    'partner_viewer'
  );

  INSERT INTO public.profiles (id, email, full_name, categoria)
  VALUES (NEW.id, NEW.email, v_full_name, v_categoria)
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

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

  SELECT categoria INTO v_categoria FROM public.profiles WHERE id = NEW.id;
  v_categoria := COALESCE(
    v_categoria,
    NULLIF(LOWER(NEW.raw_user_meta_data->>'categoria'), ''),
    NULLIF(LOWER(NEW.raw_user_meta_data->>'role'), ''),
    'partner_viewer'
  );

  INSERT INTO public.profiles (
    id, email, full_name, categoria, estado, is_active,
    ultimo_login, avatar_url, auth_provider, updated_at
  )
  VALUES (
    NEW.id, NEW.email, v_full_name, v_categoria, 'activo', true,
    COALESCE(NEW.last_sign_in_at, now()), v_avatar_url, v_provider, now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.profiles.avatar_url),
    auth_provider = COALESCE(EXCLUDED.auth_provider, public.profiles.auth_provider),
    ultimo_login = COALESCE(EXCLUDED.ultimo_login, public.profiles.ultimo_login),
    updated_at = now();

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_profile_to_personal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nombre TEXT;
  v_apellido TEXT;
  v_pid UUID;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_nombre := split_part(COALESCE(NEW.full_name, NEW.email), ' ', 1);
  v_apellido := CASE
    WHEN position(' ' IN COALESCE(NEW.full_name, '')) > 0
    THEN substring(COALESCE(NEW.full_name, '') FROM position(' ' IN COALESCE(NEW.full_name, '')) + 1)
    ELSE NULL
  END;

  SELECT id INTO v_pid
  FROM public.personal
  WHERE user_id = NEW.id
  LIMIT 1;

  IF v_pid IS NOT NULL THEN
    UPDATE public.personal
    SET
      nombre = COALESCE(NULLIF(v_nombre, ''), nombre),
      apellido = COALESCE(v_apellido, apellido),
      email = COALESCE(NEW.email, email),
      updated_at = now()
    WHERE id = v_pid;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
