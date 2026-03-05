-- Normalize admin aliases (e.g. "administradora") to canonical category "admin"
-- and make get_my_role resilient to those aliases.

UPDATE public.profiles
SET categoria = 'admin'
WHERE lower(translate(coalesce(categoria, ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) IN (
    'administradora',
    'administrador',
    'administracion',
    'admin'
);

UPDATE auth.users
SET raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('categoria', 'admin')
WHERE lower(translate(coalesce(raw_user_meta_data->>'categoria', ''), 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou')) IN (
    'administradora',
    'administrador',
    'administracion',
    'admin'
);

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text;
  v_normalized text;
BEGIN
  SELECT categoria
  INTO v_categoria
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_categoria IS NULL THEN
    RETURN NULL;
  END IF;

  v_normalized := lower(translate(v_categoria, 'ÁÉÍÓÚáéíóú', 'AEIOUaeiou'));

  IF v_normalized IN ('administradora', 'administrador', 'administracion', 'admin') THEN
    RETURN 'admin';
  END IF;

  RETURN v_normalized;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;
