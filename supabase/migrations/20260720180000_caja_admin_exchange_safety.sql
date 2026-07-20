-- Safe, traceable currency exchanges in Caja Administracion.
-- BNA remains a reference; tc_operacion is the rate agreed with the exchange house.

ALTER TABLE public.caja_admin_movimientos
    ADD COLUMN IF NOT EXISTS tc_operacion NUMERIC,
    ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_caja_admin_movimientos_idempotency_key
    ON public.caja_admin_movimientos(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.caja_admin_movimientos.tc_operacion IS
    'Cotizacion efectivamente pactada para la operacion; independiente de la referencia BNA.';

COMMENT ON COLUMN public.caja_admin_movimientos.idempotency_key IS
    'Clave por intento de alta para impedir inserciones duplicadas por reintentos.';

CREATE OR REPLACE FUNCTION public.create_caja_admin_exchange(
    p_sucursal_id UUID,
    p_fecha_movimiento DATE,
    p_descripcion TEXT,
    p_nota TEXT,
    p_adjuntos JSONB,
    p_usd_amount NUMERIC,
    p_exchange_rate NUMERIC,
    p_bna_reference NUMERIC,
    p_usd_account_id UUID,
    p_ars_account_id UUID,
    p_idempotency_key UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_user_name TEXT;
    v_ars_amount NUMERIC;
    v_movement_id UUID;
    v_existing_id UUID;
BEGIN
    v_role := public.get_my_role();

    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'Permiso denegado: solo Admin/Dueno puede registrar cambios de moneda.';
    END IF;

    IF p_usd_amount IS NULL OR p_usd_amount <= 0 THEN
        RAISE EXCEPTION 'El monto en USD debe ser mayor a cero.';
    END IF;

    IF p_exchange_rate IS NULL OR p_exchange_rate <= 0 THEN
        RAISE EXCEPTION 'La cotizacion pactada debe ser mayor a cero.';
    END IF;

    IF NULLIF(BTRIM(COALESCE(p_descripcion, '')), '') IS NULL THEN
        RAISE EXCEPTION 'La descripcion es requerida.';
    END IF;

    IF p_idempotency_key IS NULL THEN
        RAISE EXCEPTION 'Falta la clave idempotente del movimiento.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.caja_admin_arqueos
        WHERE sucursal_id = p_sucursal_id
          AND fecha = p_fecha_movimiento
          AND UPPER(COALESCE(estado, '')) = 'ABIERTO'
    ) THEN
        RAISE EXCEPTION 'La caja administrativa no esta abierta para esta fecha.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.cuentas_financieras
        WHERE id = p_usd_account_id
          AND sucursal_id = p_sucursal_id
          AND moneda = 'USD'
          AND tipo_cuenta = 'EFECTIVO'
          AND activa = TRUE
    ) THEN
        RAISE EXCEPTION 'La cuenta de origen USD no es valida para esta sucursal.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.cuentas_financieras
        WHERE id = p_ars_account_id
          AND sucursal_id = p_sucursal_id
          AND moneda = 'ARS'
          AND tipo_cuenta = 'EFECTIVO'
          AND activa = TRUE
    ) THEN
        RAISE EXCEPTION 'La cuenta de destino ARS no es valida para esta sucursal.';
    END IF;

    v_ars_amount := ROUND(p_usd_amount * p_exchange_rate, 2);

    -- A second manual submission with a new key is still rejected for five minutes.
    SELECT m.id
    INTO v_existing_id
    FROM public.caja_admin_movimientos m
    WHERE m.sucursal_id = p_sucursal_id
      AND m.tipo_movimiento = 'CAMBIO_MONEDA'
      AND m.estado = 'Registrado'
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND m.created_by = auth.uid()::TEXT
      AND m.created_at >= NOW() - INTERVAL '5 minutes'
      AND EXISTS (
          SELECT 1 FROM public.caja_admin_movimiento_lineas l
          WHERE l.admin_movimiento_id = m.id
            AND l.cuenta_id = p_usd_account_id
            AND l.moneda = 'USD'
            AND l.importe = -p_usd_amount
      )
      AND EXISTS (
          SELECT 1 FROM public.caja_admin_movimiento_lineas l
          WHERE l.admin_movimiento_id = m.id
            AND l.cuenta_id = p_ars_account_id
            AND l.moneda = 'ARS'
            AND l.importe = v_ars_amount
      )
    ORDER BY m.created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'id', v_existing_id,
            'duplicate', TRUE,
            'duplicate_reason', 'recent_match'
        );
    END IF;

    SELECT full_name
    INTO v_user_name
    FROM public.profiles
    WHERE id = auth.uid();

    INSERT INTO public.caja_admin_movimientos (
        sucursal_id,
        fecha_movimiento,
        tipo_movimiento,
        descripcion,
        nota,
        adjuntos,
        tc_bna_venta,
        tc_operacion,
        tc_fuente,
        tc_fecha_hora,
        usd_equivalente_total,
        estado,
        created_by,
        usuario,
        origen,
        idempotency_key
    ) VALUES (
        p_sucursal_id,
        p_fecha_movimiento,
        'CAMBIO_MONEDA',
        BTRIM(p_descripcion),
        NULLIF(BTRIM(COALESCE(p_nota, '')), ''),
        COALESCE(p_adjuntos, '[]'::JSONB),
        p_bna_reference,
        p_exchange_rate,
        'MANUAL',
        NOW(),
        0,
        'Registrado',
        auth.uid()::TEXT,
        v_user_name,
        'manual',
        p_idempotency_key
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL
    DO NOTHING
    RETURNING id INTO v_movement_id;

    IF v_movement_id IS NULL THEN
        SELECT id INTO v_existing_id
        FROM public.caja_admin_movimientos
        WHERE idempotency_key = p_idempotency_key;

        RETURN jsonb_build_object(
            'id', v_existing_id,
            'duplicate', TRUE,
            'duplicate_reason', 'idempotency'
        );
    END IF;

    INSERT INTO public.caja_admin_movimiento_lineas (
        admin_movimiento_id,
        cuenta_id,
        importe,
        moneda,
        usd_equivalente
    ) VALUES
        (v_movement_id, p_usd_account_id, -p_usd_amount, 'USD', -p_usd_amount),
        (v_movement_id, p_ars_account_id, v_ars_amount, 'ARS', p_usd_amount);

    RETURN jsonb_build_object(
        'id', v_movement_id,
        'duplicate', FALSE,
        'ars_amount', v_ars_amount,
        'exchange_rate', p_exchange_rate
    );
END;
$$;

REVOKE ALL ON FUNCTION public.create_caja_admin_exchange(
    UUID, DATE, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, UUID, UUID, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_caja_admin_exchange(
    UUID, DATE, TEXT, TEXT, JSONB, NUMERIC, NUMERIC, NUMERIC, UUID, UUID, UUID
) TO authenticated;
