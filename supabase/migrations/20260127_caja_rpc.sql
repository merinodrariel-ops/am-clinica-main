-- RPC for Closing Reception Box
CREATE OR REPLACE FUNCTION cerrar_caja_recepcion(
    p_fecha DATE,
    p_usuario TEXT,
    p_saldo_final_usd NUMERIC,
    p_saldo_final_ars NUMERIC,
    p_total_ingresos_usd NUMERIC,
    p_total_transferencias_usd NUMERIC,
    p_diferencia_usd NUMERIC,
    p_tc_bna NUMERIC,
    p_observaciones TEXT,
    p_snapshot JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_id UUID;
    v_saldo_inicial_usd NUMERIC;
    v_saldo_inicial_ars NUMERIC;
    v_saldo_inicial_usd_eq NUMERIC;
BEGIN
    -- 1. Check if already closed
    IF EXISTS (SELECT 1 FROM caja_recepcion_arqueos WHERE fecha = p_fecha AND estado = 'cerrado') THEN
        RAISE EXCEPTION 'La caja de esta fecha ya está cerrada.';
    END IF;

    -- 2. Get last closure for initial balances
    SELECT saldo_final_usd_billete, saldo_final_ars_billete, saldo_final_usd_equivalente
    INTO v_saldo_inicial_usd, v_saldo_inicial_ars, v_saldo_inicial_usd_eq
    FROM caja_recepcion_arqueos
    WHERE estado = 'cerrado' AND fecha < p_fecha
    ORDER BY fecha DESC
    LIMIT 1;

    -- Default to 0 if no prior closure
    v_saldo_inicial_usd := COALESCE(v_saldo_inicial_usd, 0);
    v_saldo_inicial_ars := COALESCE(v_saldo_inicial_ars, 0);
    v_saldo_inicial_usd_eq := COALESCE(v_saldo_inicial_usd_eq, 0);

    -- 3. Insert new closure
    INSERT INTO caja_recepcion_arqueos (
        fecha,
        usuario,
        hora_cierre,
        saldo_inicial_usd_billete,
        saldo_inicial_ars_billete,
        saldo_inicial_usd_equivalente,
        saldo_final_usd_billete,
        saldo_final_ars_billete,
        total_ingresos_dia_usd,
        total_transferencias_admin_usd,
        diferencia_usd,
        tc_bna_venta_dia,
        observaciones,
        estado,
        snapshot_datos
    ) VALUES (
        p_fecha,
        p_usuario,
        NOW(),
        v_saldo_inicial_usd,
        v_saldo_inicial_ars,
        v_saldo_inicial_usd_eq,
        p_saldo_final_usd,
        p_saldo_final_ars,
        p_total_ingresos_usd,
        p_total_transferencias_usd,
        p_diferencia_usd,
        p_tc_bna,
        p_observaciones,
        'cerrado',
        p_snapshot
    ) RETURNING id INTO v_new_id;

    -- 4. Update movements
    -- Catch all movements up to this date that are not closed
    UPDATE caja_recepcion_movimientos
    SET cierre_id = v_new_id
    WHERE fecha_hora::date <= p_fecha 
      AND cierre_id IS NULL;

    RETURN v_new_id;
END;
$$;

-- RPC for Closing Admin Box
CREATE OR REPLACE FUNCTION cerrar_caja_admin(
    p_fecha DATE,
    p_sucursal_id UUID,
    p_usuario TEXT,
    p_saldos_finales JSONB,
    p_tc_bna NUMERIC,
    p_diferencia_usd NUMERIC,
    p_observaciones TEXT,
    p_snapshot JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
    v_new_id UUID;
    v_saldos_iniciales JSONB;
BEGIN
    -- 1. Check if already closed
    IF EXISTS (SELECT 1 FROM caja_admin_arqueos WHERE fecha = p_fecha AND sucursal_id = p_sucursal_id AND estado = 'cerrado') THEN
        RAISE EXCEPTION 'La caja administrativa de esta fecha y sucursal ya está cerrada.';
    END IF;

    -- 2. Get last closure for initial balances
    SELECT saldos_finales
    INTO v_saldos_iniciales
    FROM caja_admin_arqueos
    WHERE estado = 'cerrado' 
      AND sucursal_id = p_sucursal_id 
      AND fecha < p_fecha
    ORDER BY fecha DESC
    LIMIT 1;

    -- Default to empty if no prior closure
    v_saldos_iniciales := COALESCE(v_saldos_iniciales, '{}'::jsonb);

    -- 3. Insert new closure
    INSERT INTO caja_admin_arqueos (
        fecha,
        sucursal_id,
        usuario,
        hora_cierre,
        saldos_iniciales,
        saldos_finales,
        tc_bna_venta_dia,
        diferencia_usd,
        observaciones,
        estado,
        snapshot_datos
    ) VALUES (
        p_fecha,
        p_sucursal_id,
        p_usuario,
        NOW(),
        v_saldos_iniciales,
        p_saldos_finales,
        p_tc_bna,
        p_diferencia_usd,
        p_observaciones,
        'cerrado',
        p_snapshot
    ) RETURNING id INTO v_new_id;

    -- 4. Update movements
    -- Catch all movements up to this date that are not closed
    UPDATE caja_admin_movimientos
    SET cierre_id = v_new_id
    WHERE sucursal_id = p_sucursal_id
      AND fecha_hora::date <= p_fecha 
      AND cierre_id IS NULL;

    RETURN v_new_id;
END;
$$;
