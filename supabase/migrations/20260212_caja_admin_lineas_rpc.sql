-- RPC helper to upsert caja admin lines with SECURITY DEFINER.
-- This avoids RLS friction when admin/owner edits payment method/accounts.

CREATE OR REPLACE FUNCTION public.upsert_caja_admin_movimiento_lineas(
    p_movimiento_id UUID,
    p_lineas JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    _role TEXT;
    _linea JSONB;
BEGIN
    SELECT public.get_my_role() INTO _role;
    IF _role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Permiso denegado para editar lineas de caja admin';
    END IF;

    DELETE FROM public.caja_admin_movimiento_lineas
    WHERE admin_movimiento_id = p_movimiento_id;

    FOR _linea IN
        SELECT * FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb))
    LOOP
        INSERT INTO public.caja_admin_movimiento_lineas (
            admin_movimiento_id,
            cuenta_id,
            importe,
            moneda,
            usd_equivalente
        ) VALUES (
            p_movimiento_id,
            (_linea->>'cuenta_id')::uuid,
            COALESCE((_linea->>'importe')::numeric, 0),
            UPPER(COALESCE(_linea->>'moneda', 'USD')),
            COALESCE((_linea->>'usd_equivalente')::numeric, 0)
        );
    END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_caja_admin_movimiento_lineas(UUID, JSONB) TO authenticated;
