-- An open cashbox from a previous day must never masquerade as today's box.
-- It remains open and auditable until an operator closes that exact date.

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
    WHERE sucursal_id = p_sucursal_id
      AND estado = 'abierto'
    ORDER BY fecha DESC, hora_apertura DESC
    LIMIT 1
    FOR UPDATE;

    IF v_row.id IS NOT NULL AND v_row.fecha = p_fecha THEN
        RETURN v_row;
    END IF;

    IF v_row.id IS NOT NULL THEN
        RAISE EXCEPTION 'Hay una caja anterior abierta del %. Cerrala antes de abrir la caja del %.',
            v_row.fecha, p_fecha;
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

REVOKE ALL ON FUNCTION public.abrir_caja_fisica(UUID, DATE, TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.abrir_caja_fisica(UUID, DATE, TEXT, NUMERIC) TO authenticated;
