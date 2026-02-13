-- Inventory visual search rate limit log

CREATE TABLE IF NOT EXISTS public.inventory_visual_search_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_visual_search_log_user_date
ON public.inventory_visual_search_log(user_id, created_at DESC);

ALTER TABLE public.inventory_visual_search_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_visual_search_log_select_own" ON public.inventory_visual_search_log;
CREATE POLICY "inventory_visual_search_log_select_own"
ON public.inventory_visual_search_log
FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "inventory_visual_search_log_insert_own" ON public.inventory_visual_search_log;
CREATE POLICY "inventory_visual_search_log_insert_own"
ON public.inventory_visual_search_log
FOR INSERT
WITH CHECK (
    user_id = auth.uid()
    AND public.get_my_role() IN ('owner', 'admin', 'reception', 'laboratorio', 'developer')
);

-- Append-only table: no UPDATE/DELETE policies
