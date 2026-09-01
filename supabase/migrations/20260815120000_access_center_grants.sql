-- Centro de acceso y seguridad: permisos temporales y auditables.
-- Los grants solo pueden elevar el acceso heredado; un override explícito
-- de perfil (por ejemplo, none) sigue siendo un bloqueo deliberado.

CREATE TABLE IF NOT EXISTS public.access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    module_key TEXT NOT NULL,
    access_level TEXT NOT NULL CHECK (access_level IN ('read', 'edit')),
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) BETWEEN 3 AND 500),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revoked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT access_grants_valid_window CHECK (expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS access_grants_target_active_idx
    ON public.access_grants (target_user_id, expires_at)
    WHERE revoked_at IS NULL;

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_grants_owner_read_active" ON public.access_grants;
CREATE POLICY "access_grants_owner_read_active"
ON public.access_grants FOR SELECT TO authenticated
USING (
    target_user_id = auth.uid()
    AND revoked_at IS NULL
    AND starts_at <= now()
    AND expires_at > now()
);

REVOKE INSERT, UPDATE, DELETE ON public.access_grants FROM authenticated, anon;
GRANT SELECT ON public.access_grants TO authenticated;

COMMENT ON TABLE public.access_grants IS
    'Accesos temporales, con motivo, vigencia y revocación. Se administran únicamente desde server actions con service role.';
