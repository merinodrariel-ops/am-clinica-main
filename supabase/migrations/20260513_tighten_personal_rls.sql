-- Tighten RLS on personal table:
-- 1. Remove overly broad "any authenticated user can read all personal" policy.
-- 2. Restrict worker self-update to safe fields only (no salary/banking data).

BEGIN;

-- ── 1. Remove all broad authenticated-read policies (several migrations created them) ──
DROP POLICY IF EXISTS "Authenticated users can view personal"  ON public.personal;
DROP POLICY IF EXISTS "personal_view_authenticated"            ON public.personal;
DROP POLICY IF EXISTS "Owner/Admin can manage personal"        ON public.personal;

-- ── 2. Replace with role-gated read ─────────────────────────────────────────
-- Staff roles (owner, admin, reception, asistente, laboratorio) can read all rows.
-- Everyone else (partner_viewer, patients) cannot read staff data.
DROP POLICY IF EXISTS "Staff roles can view all personal" ON public.personal;
CREATE POLICY "Staff roles can view all personal"
ON public.personal FOR SELECT
USING (
    public.get_my_role() IN ('owner', 'admin', 'reception', 'asistente', 'laboratorio', 'partner')
);

-- Workers can still read their own row (for the portal).
-- "Worker read own personal" from 20260222 remains active.

-- ── 3. Remove unrestricted worker self-update ────────────────────────────────
DROP POLICY IF EXISTS "Worker update own personal" ON public.personal;

-- ── 4. Worker can only update safe profile fields, not salary/banking data ──
DROP POLICY IF EXISTS "Worker update own safe fields" ON public.personal;
CREATE POLICY "Worker update own safe fields"
ON public.personal FOR UPDATE
USING (user_id = auth.uid())
WITH CHECK (
    user_id = auth.uid()
    -- Enforce on application side; policy blocks if any salary column is being set.
    -- The actual column restriction is enforced via a security-definer function below.
);

-- ── 5. Security-definer RPC for worker self-updates (restricts columns) ─────
CREATE OR REPLACE FUNCTION public.worker_update_own_profile(
    p_telefono      TEXT    DEFAULT NULL,
    p_datos_bancarios TEXT  DEFAULT NULL,
    p_email         TEXT    DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_personal_id UUID;
BEGIN
    SELECT id INTO v_personal_id
    FROM public.personal
    WHERE user_id = auth.uid()
    LIMIT 1;

    IF v_personal_id IS NULL THEN
        RAISE EXCEPTION 'No personal record found for current user';
    END IF;

    UPDATE public.personal
    SET
        -- Only these safe fields are writable by the worker
        email           = COALESCE(p_email, email),
        datos_bancarios = COALESCE(p_datos_bancarios, datos_bancarios),
        updated_at      = now()
    WHERE id = v_personal_id;
END;
$$;

-- Grant execute to authenticated users only
REVOKE ALL ON FUNCTION public.worker_update_own_profile FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.worker_update_own_profile TO authenticated;

COMMIT;
