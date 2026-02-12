-- Reception cashbox open/close workflow
-- 1) Ensure close RPC can close an existing "abierto" record
-- 2) Keep movement linkage based on fecha_movimiento

DROP FUNCTION IF EXISTS cerrar_caja_recepcion(
    DATE,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TEXT,
    JSONB
);

DROP FUNCTION IF EXISTS cerrar_caja_recepcion(
    DATE,
    TEXT,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    NUMERIC,
    TEXT,
    JSONB
);

CREATE OR REPLACE FUNCTION cerrar_caja_recepcion(
    p_fecha DATE,
    p_usuario TEXT,
    p_saldo_final_usd NUMERIC,
    p_saldo_final_ars NUMERIC,
    p_saldo_final_usd_eq NUMERIC,
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
    v_open_id UUID;
    v_saldo_inicial_usd NUMERIC;
    v_saldo_inicial_ars NUMERIC;
    v_saldo_inicial_usd_eq NUMERIC;
BEGIN
    -- 1) If a closed row already exists for this date, abort.
    IF EXISTS (
        SELECT 1
        FROM caja_recepcion_arqueos
        WHERE fecha = p_fecha
          AND estado = 'cerrado'
    ) THEN
        RAISE EXCEPTION 'La caja de esta fecha ya esta cerrada.';
    END IF;

    -- 2) Try to close an existing open row for this date.
    SELECT id,
           COALESCE(saldo_inicial_usd_billete, 0),
           COALESCE(saldo_inicial_ars_billete, 0),
           COALESCE(saldo_inicial_usd_equivalente, 0)
      INTO v_open_id, v_saldo_inicial_usd, v_saldo_inicial_ars, v_saldo_inicial_usd_eq
    FROM caja_recepcion_arqueos
    WHERE fecha = p_fecha
      AND estado = 'abierto'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_open_id IS NOT NULL THEN
        UPDATE caja_recepcion_arqueos
        SET usuario = p_usuario,
            hora_cierre = NOW(),
            saldo_final_usd_billete = p_saldo_final_usd,
            saldo_final_ars_billete = p_saldo_final_ars,
            saldo_final_usd_equivalente = p_saldo_final_usd_eq,
            total_ingresos_dia_usd = p_total_ingresos_usd,
            total_transferencias_admin_usd = p_total_transferencias_usd,
            diferencia_usd = p_diferencia_usd,
            tc_bna_venta_dia = p_tc_bna,
            observaciones = p_observaciones,
            estado = 'cerrado',
            snapshot_datos = COALESCE(snapshot_datos, '{}'::jsonb) || COALESCE(p_snapshot, '{}'::jsonb)
        WHERE id = v_open_id
        RETURNING id INTO v_new_id;
    ELSE
        -- 3) Legacy flow: if no open row, close directly (backward compatible).
        SELECT saldo_final_usd_billete,
               saldo_final_ars_billete,
               saldo_final_usd_equivalente
          INTO v_saldo_inicial_usd, v_saldo_inicial_ars, v_saldo_inicial_usd_eq
        FROM caja_recepcion_arqueos
        WHERE estado = 'cerrado'
          AND fecha < p_fecha
        ORDER BY fecha DESC
        LIMIT 1;

        v_saldo_inicial_usd := COALESCE(v_saldo_inicial_usd, 0);
        v_saldo_inicial_ars := COALESCE(v_saldo_inicial_ars, 0);
        v_saldo_inicial_usd_eq := COALESCE(v_saldo_inicial_usd_eq, 0);

        INSERT INTO caja_recepcion_arqueos (
            fecha,
            usuario,
            hora_cierre,
            saldo_inicial_usd_billete,
            saldo_inicial_ars_billete,
            saldo_inicial_usd_equivalente,
            saldo_final_usd_billete,
            saldo_final_ars_billete,
            saldo_final_usd_equivalente,
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
            p_saldo_final_usd_eq,
            p_total_ingresos_usd,
            p_total_transferencias_usd,
            p_diferencia_usd,
            p_tc_bna,
            p_observaciones,
            'cerrado',
            p_snapshot
        ) RETURNING id INTO v_new_id;
    END IF;

    -- 4) Link all pending movements up to that operational date.
    UPDATE caja_recepcion_movimientos
    SET cierre_id = v_new_id
    WHERE fecha_movimiento <= p_fecha
      AND cierre_id IS NULL;

    RETURN v_new_id;
END;
$$;
