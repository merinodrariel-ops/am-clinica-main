-- Re-create get_my_role() to fix "column role does not exist" error.
-- The function in the live DB may be stale or corrupted.
-- Updated to use 'categoria' after the global rename.

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT categoria FROM public.profiles WHERE id = auth.uid();
$$;
