-- En Caja Administración, RETIRO significa exclusivamente salida de billetes físicos.
-- La interfaz limita las cuentas y este trigger mantiene la regla aunque otro cliente escriba directo.

CREATE OR REPLACE FUNCTION public.validar_linea_admin_caja_fisica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mov caja_admin_movimientos%ROWTYPE;
    v_cuenta cuentas_financieras%ROWTYPE;
    v_desde DATE;
    v_saldo JSONB;
    v_disponible NUMERIC;
    v_delta NUMERIC := 0;
BEGIN
    SELECT * INTO v_mov
    FROM caja_admin_movimientos
    WHERE id = NEW.admin_movimiento_id;

    SELECT * INTO v_cuenta
    FROM cuentas_financieras
    WHERE id = NEW.cuenta_id;

    IF v_mov.tipo_movimiento = 'RETIRO'
       AND (v_cuenta.tipo_cuenta <> 'EFECTIVO' OR v_cuenta.moneda NOT IN ('ARS', 'USD')) THEN
        RAISE EXCEPTION 'El retiro en efectivo solo puede utilizar cuentas Efectivo ARS o Efectivo USD.';
    END IF;

    IF v_cuenta.tipo_cuenta <> 'EFECTIVO' OR v_cuenta.moneda NOT IN ('ARS', 'USD') THEN
        RETURN NEW;
    END IF;

    SELECT caja_unificada_desde INTO v_desde
    FROM sucursales WHERE id = v_mov.sucursal_id;

    IF v_desde IS NULL OR v_mov.fecha_movimiento < v_desde THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM caja_arqueos
        WHERE sucursal_id = v_mov.sucursal_id
          AND estado = 'abierto'
          AND fecha = v_mov.fecha_movimiento
    ) THEN
        RAISE EXCEPTION 'La caja física no está abierta para esta fecha.';
    END IF;

    v_delta := CASE
        WHEN v_mov.tipo_movimiento IN ('EGRESO', 'RETIRO') THEN -ABS(NEW.importe)
        WHEN v_mov.tipo_movimiento IN ('INGRESO_ADMIN', 'INGRESO_PACIENTE', 'APORTE_CAPITAL') THEN ABS(NEW.importe)
        WHEN v_mov.tipo_movimiento IN ('CAMBIO_MONEDA', 'TRANSFERENCIA', 'AJUSTE_CAJA') THEN NEW.importe
        ELSE 0
    END;

    IF v_delta < 0 THEN
        v_saldo := public.caja_saldo_fisico(v_mov.sucursal_id, v_mov.fecha_movimiento);
        v_disponible := COALESCE((v_saldo ->> lower(v_cuenta.moneda))::NUMERIC, 0);
        IF v_disponible + v_delta < 0 THEN
            RAISE EXCEPTION 'No hay suficiente efectivo % en la caja. Disponible: %.',
                v_cuenta.moneda, v_disponible;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;
