BEGIN;

-- Replace handle_auth_user_sync to use categoria instead of role
CREATE OR REPLACE FUNCTION public.handle_auth_user_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_provider TEXT;
  v_existing_categoria TEXT;
  v_full_name TEXT;
  v_avatar_url TEXT;
  v_target_categoria TEXT;
  v_meta_categoria TEXT;
BEGIN
  -- Identify Provider
  v_provider := COALESCE(
    NULLIF(NEW.raw_app_meta_data->>'provider', ''),
    CASE
      WHEN EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(NEW.raw_app_meta_data->'providers','[]'::jsonb)) AS p(provider)
        WHERE p.provider = 'google'
      ) THEN 'google'
      ELSE 'email'
    END
  );

  -- Identify Metadata
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

  -- Identify Categoria
  SELECT categoria INTO v_existing_categoria FROM public.profiles WHERE id = NEW.id;
  v_meta_categoria := LOWER(COALESCE(NULLIF(NEW.raw_user_meta_data->>'categoria', ''), NULLIF(NEW.raw_user_meta_data->>'role', '')));

  IF v_provider = 'google' THEN
    IF v_existing_categoria IN ('owner','admin','reception','developer','laboratorio','odontologo','asistente','recaptacion','pricing_manager','partner_viewer') THEN
      v_target_categoria := v_existing_categoria;
    ELSIF v_meta_categoria IN ('owner','admin','reception','developer','laboratorio','odontologo','asistente','recaptacion','pricing_manager','partner_viewer') THEN
      v_target_categoria := v_meta_categoria;
    ELSE
      v_target_categoria := 'google_user';
    END IF;
  ELSE
    v_target_categoria := COALESCE(v_existing_categoria, v_meta_categoria, 'reception');
  END IF;

  -- Safety check for categoria constraint
  IF v_target_categoria NOT IN ('owner','admin','reception','developer','laboratorio','google_user','pricing_manager','partner_viewer','odontologo','asistente','recaptacion') THEN
     v_target_categoria := 'reception';
  END IF;

  -- Upsert into profiles
  INSERT INTO public.profiles (
    id, email, full_name, categoria, estado, is_active,
    ultimo_login, avatar_url, auth_provider, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    v_full_name,
    v_target_categoria,
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
    categoria = v_target_categoria,
    updated_at = now();

  RETURN NEW;
END;
$$;

COMMIT;
