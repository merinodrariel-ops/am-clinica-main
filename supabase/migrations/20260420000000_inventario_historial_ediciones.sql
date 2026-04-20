-- Extend historial_ediciones to support inventario_items edits
-- and ensure laboratorio can insert into it via RLS.

-- 1. Allow inventario_items as a valid tabla_origen
ALTER TYPE IF EXISTS historial_tabla_origen ADD VALUE IF NOT EXISTS 'inventario_items';

-- If tabla_origen is a plain TEXT column (no enum), this migration is a no-op for that part.
-- The INSERT in the server action will work regardless.

-- 2. Ensure laboratorio can INSERT into historial_ediciones
-- (existing policy may only cover owner/admin/reception/developer)
DO $$
BEGIN
    -- Drop the old write policy if it doesn't include laboratorio
    DROP POLICY IF EXISTS "historial_write" ON public.historial_ediciones;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

CREATE POLICY IF NOT EXISTS "historial_write" ON public.historial_ediciones
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_my_role() IN ('owner', 'admin', 'developer', 'reception', 'asistente', 'laboratorio')
    );
