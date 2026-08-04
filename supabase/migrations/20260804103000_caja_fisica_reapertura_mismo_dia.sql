-- Allow reopening the unified physical cashbox after an intra-day close.
-- The invariant remains: only one cashbox can be open per branch at a time.

DROP INDEX IF EXISTS public.caja_arqueos_un_cierre_diario;

CREATE OR REPLACE FUNCTION public.abrir_caja_fisica(
    p_sucursal_id UUID,
    p_fecha DATE,
    p_usuario TEXT,
    p_tc_bna NUMERIC DEFAULT NULL
)
RETURNS public.caja_arqueos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_categoria TEXT;
    v_desde DATE;
    v_saldo JSONB;
    v_row caja_arqueos%ROWTYPE;
BEGIN
    v_categoria := public.caja_usuario_categoria();
    IF v_categoria NOT IN ('owner', 'admin', 'reception', 'developer') THEN
        RAISE EXCEPTION 'No tenés permiso para abrir la caja.';
    END IF;

    SELECT caja_unificada_desde INTO v_desde
    FROM sucursales WHERE id = p_sucursal_id;

    IF v_desde IS NULL OR p_fecha < v_desde THEN
        RAISE EXCEPTION 'La caja unificada se habilita el %.', v_desde;
    END IF;

    SELECT * INTO v_row
    FROM caja_arqueos
    WHERE sucursal_id = p_sucursal_id AND estado = 'abierto'
    LIMIT 1;

    IF v_row.id IS NOT NULL THEN
        RETURN v_row;
    END IF;

    v_saldo := public.caja_saldo_fisico(p_sucursal_id, p_fecha);

    INSERT INTO caja_arqueos (
        sucursal_id, fecha, usuario_apertura, abierto_por,
        saldo_inicial_ars, saldo_inicial_usd, tc_bna_venta,
        snapshot_datos
    ) VALUES (
        p_sucursal_id, p_fecha, p_usuario, auth.uid(),
        COALESCE((v_saldo ->> 'ars')::NUMERIC, 0),
        COALESCE((v_saldo ->> 'usd')::NUMERIC, 0),
        p_tc_bna,
        jsonb_build_object(
            'origen', 'caja_fisica_unificada',
            'saldo_preapertura', v_saldo
        )
    )
    RETURNING * INTO v_row;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.abrir_caja_fisica(UUID, DATE, TEXT, NUMERIC) TO authenticated;
