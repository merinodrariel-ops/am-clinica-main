-- Aislar el alta de prestadores del módulo general de Gestión de Usuarios.
-- Esta función solo sincroniza perfiles ya vinculados a `personal` y evita crear
-- nuevos registros automáticamente desde invites de usuarios generales.

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

    -- Solo sincroniza si ya existe ficha en personal asociada al usuario.
    -- No crea nuevas fichas automáticamente.
    SELECT id
      INTO v_pid
      FROM public.personal
     WHERE user_id = NEW.id
     LIMIT 1;

    IF v_pid IS NOT NULL THEN
        UPDATE public.personal
           SET nombre = COALESCE(NULLIF(v_nombre, ''), nombre),
               apellido = COALESCE(v_apellido, apellido),
               email = COALESCE(NEW.email, email),
               updated_at = now()
         WHERE id = v_pid;
    END IF;

    RETURN NEW;
END;
$$;
