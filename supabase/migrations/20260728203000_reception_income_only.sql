-- Caja Recepción is an income-only operational surface.
-- Owner/admin/developer access remains unchanged; Recepción cannot read or
-- mutate expense rows even if it bypasses the client UI.

DROP POLICY IF EXISTS "reception_income_only_guard" ON public.caja_recepcion_movimientos;

CREATE POLICY "reception_income_only_guard"
ON public.caja_recepcion_movimientos
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
    public.get_my_role() <> 'reception'
    OR (
        categoria IS DISTINCT FROM 'Egreso'
        AND COALESCE(monto, 0) >= 0
    )
)
WITH CHECK (
    public.get_my_role() <> 'reception'
    OR (
        categoria IS DISTINCT FROM 'Egreso'
        AND COALESCE(monto, 0) >= 0
    )
);
