-- Caja física unificada para la sede Madero.
-- La historia anterior al corte permanece en los arqueos de recepción/admin.
-- Desde 2026-08-01, un único arqueo reúne todo movimiento físico ARS/USD.

ALTER TABLE public.sucursales
    ADD COLUMN IF NOT EXISTS caja_unificada_desde DATE;

UPDATE public.sucursales
SET caja_unificada_desde = DATE '2026-08-01'
WHERE activa = TRUE
  AND moneda_local = 'ARS'
  AND (
      lower(nombre) LIKE '%buenos aires%'
      OR lower(nombre) LIKE '%madero%'
  );

CREATE TABLE IF NOT EXISTS public.caja_arqueos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
    fecha DATE NOT NULL,
    estado TEXT NOT NULL DEFAULT 'abierto'
        CHECK (estado IN ('abierto', 'cerrado')),
    usuario_apertura TEXT NOT NULL,
    usuario_cierre TEXT,
    abierto_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cerrado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    hora_apertura TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hora_cierre TIMESTAMPTZ,
    saldo_inicial_ars NUMERIC NOT NULL DEFAULT 0,
    saldo_inicial_usd NUMERIC NOT NULL DEFAULT 0,
    saldo_esperado_ars NUMERIC,
    saldo_esperado_usd NUMERIC,
    saldo_contado_ars NUMERIC,
    saldo_contado_usd NUMERIC,
    diferencia_ars NUMERIC,
    diferencia_usd NUMERIC,
    tc_bna_venta NUMERIC,
    observaciones TEXT,
    snapshot_datos JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS caja_arqueos_una_apertura_por_sucursal
    ON public.caja_arqueos (sucursal_id)
    WHERE estado = 'abierto';

CREATE UNIQUE INDEX IF NOT EXISTS caja_arqueos_un_cierre_diario
    ON public.caja_arqueos (sucursal_id, fecha)
    WHERE estado = 'cerrado';

CREATE INDEX IF NOT EXISTS caja_arqueos_sucursal_fecha_idx
    ON public.caja_arqueos (sucursal_id, fecha DESC);

ALTER TABLE public.caja_recepcion_movimientos
    ADD COLUMN IF NOT EXISTS caja_arqueo_id UUID
        REFERENCES public.caja_arqueos(id) ON DELETE SET NULL;

ALTER TABLE public.caja_admin_movimientos
    ADD COLUMN IF NOT EXISTS caja_arqueo_id UUID
        REFERENCES public.caja_arqueos(id) ON DELETE SET NULL;

ALTER TABLE public.transferencias_caja
    ADD COLUMN IF NOT EXISTS caja_arqueo_id UUID
        REFERENCES public.caja_arqueos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS caja_recepcion_movimientos_caja_arqueo_idx
    ON public.caja_recepcion_movimientos(caja_arqueo_id);

CREATE INDEX IF NOT EXISTS caja_admin_movimientos_caja_arqueo_idx
    ON public.caja_admin_movimientos(caja_arqueo_id);

CREATE INDEX IF NOT EXISTS transferencias_caja_arqueo_idx
    ON public.transferencias_caja(caja_arqueo_id);

ALTER TABLE public.caja_arqueos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caja_arqueos_select_operativos" ON public.caja_arqueos;
CREATE POLICY "caja_arqueos_select_operativos"
ON public.caja_arqueos FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.categoria IN ('owner', 'admin', 'reception', 'partner_viewer', 'developer')
    )
);

REVOKE INSERT, UPDATE, DELETE ON public.caja_arqueos FROM authenticated;
GRANT SELECT ON public.caja_arqueos TO authenticated;

CREATE OR REPLACE FUNCTION public.caja_usuario_categoria()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT categoria
    FROM public.profiles
    WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.caja_saldo_fisico(
    p_sucursal_id UUID,
    p_hasta_fecha DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_desde DATE;
    v_arqueo caja_arqueos%ROWTYPE;
    v_base_ars NUMERIC := 0;
    v_base_usd NUMERIC := 0;
    v_recepcion_ars NUMERIC := 0;
    v_recepcion_usd NUMERIC := 0;
    v_admin_ars NUMERIC := 0;
    v_admin_usd NUMERIC := 0;
    v_retiros_ars NUMERIC := 0;
    v_retiros_usd NUMERIC := 0;
    v_inicio DATE;
BEGIN
    IF COALESCE(current_setting('request.jwt.claim.role', TRUE), '') <> 'service_role'
       AND public.caja_usuario_categoria() NOT IN ('owner', 'admin', 'reception', 'partner_viewer', 'developer') THEN
        RAISE EXCEPTION 'No tenés acceso a la caja.';
    END IF;

    SELECT caja_unificada_desde
      INTO v_desde
    FROM sucursales
    WHERE id = p_sucursal_id;

    IF v_desde IS NULL THEN
        RETURN jsonb_build_object(
            'activa', false,
            'fecha_activacion', NULL,
            'estado', 'no_configurada',
            'ars', 0,
            'usd', 0
        );
    END IF;

    SELECT *
      INTO v_arqueo
    FROM caja_arqueos
    WHERE sucursal_id = p_sucursal_id
      AND fecha <= p_hasta_fecha
    ORDER BY
      CASE WHEN estado = 'abierto' THEN 0 ELSE 1 END,
      fecha DESC,
      created_at DESC
    LIMIT 1;

    IF v_arqueo.id IS NOT NULL AND v_arqueo.estado = 'abierto' THEN
        v_base_ars := v_arqueo.saldo_inicial_ars;
        v_base_usd := v_arqueo.saldo_inicial_usd;
        v_inicio := v_arqueo.fecha;
    ELSIF v_arqueo.id IS NOT NULL THEN
        v_base_ars := COALESCE(v_arqueo.saldo_contado_ars, 0);
        v_base_usd := COALESCE(v_arqueo.saldo_contado_usd, 0);
        v_inicio := v_arqueo.fecha + 1;
    ELSE
        -- Primera apertura: sumar los últimos cierres físicos heredados.
        SELECT
            COALESCE(saldo_final_ars_billete, 0),
            COALESCE(saldo_final_usd_billete, 0)
          INTO v_recepcion_ars, v_recepcion_usd
        FROM caja_recepcion_arqueos
        WHERE estado = 'cerrado'
          AND fecha < v_desde
        ORDER BY fecha DESC, hora_cierre DESC NULLS LAST
        LIMIT 1;

        SELECT
            COALESCE(SUM(
                CASE WHEN cf.moneda = 'ARS'
                    THEN COALESCE((a.saldos_finales ->> cf.id::text)::NUMERIC, 0)
                    ELSE 0 END
            ), 0),
            COALESCE(SUM(
                CASE WHEN cf.moneda = 'USD'
                    THEN COALESCE((a.saldos_finales ->> cf.id::text)::NUMERIC, 0)
                    ELSE 0 END
            ), 0)
          INTO v_admin_ars, v_admin_usd
        FROM (
            SELECT *
            FROM caja_admin_arqueos
            WHERE sucursal_id = p_sucursal_id
              AND UPPER(COALESCE(estado, '')) = 'CERRADO'
              AND fecha < v_desde
            ORDER BY fecha DESC, hora_cierre DESC NULLS LAST
            LIMIT 1
        ) a
        JOIN cuentas_financieras cf
          ON cf.sucursal_id = p_sucursal_id
         AND cf.tipo_cuenta = 'EFECTIVO'
         AND cf.activa = TRUE;

        v_base_ars := COALESCE(v_recepcion_ars, 0) + COALESCE(v_admin_ars, 0);
        v_base_usd := COALESCE(v_recepcion_usd, 0) + COALESCE(v_admin_usd, 0);
        v_inicio := v_desde;
    END IF;

    -- Recepción guarda entradas positivas y gastos físicos negativos.
    SELECT
        COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN monto ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN monto ELSE 0 END), 0)
      INTO v_recepcion_ars, v_recepcion_usd
    FROM caja_recepcion_movimientos
    WHERE metodo_pago = 'Efectivo'
      AND COALESCE(LOWER(estado), '') NOT IN ('anulado', 'pendiente')
      AND fecha_movimiento >= v_inicio
      AND fecha_movimiento <= p_hasta_fecha
      AND caja_arqueo_id IS NULL;

    -- Administración impacta únicamente líneas de cuentas EFECTIVO.
    SELECT
        COALESCE(SUM(
            CASE WHEN cf.moneda = 'ARS' THEN
                CASE
                    WHEN m.tipo_movimiento IN ('EGRESO', 'RETIRO') THEN -ABS(l.importe)
                    WHEN m.tipo_movimiento IN ('INGRESO_ADMIN', 'INGRESO_PACIENTE', 'APORTE_CAPITAL') THEN ABS(l.importe)
                    WHEN m.tipo_movimiento IN ('CAMBIO_MONEDA', 'TRANSFERENCIA', 'AJUSTE_CAJA') THEN l.importe
                    ELSE 0
                END
            ELSE 0 END
        ), 0),
        COALESCE(SUM(
            CASE WHEN cf.moneda = 'USD' THEN
                CASE
                    WHEN m.tipo_movimiento IN ('EGRESO', 'RETIRO') THEN -ABS(l.importe)
                    WHEN m.tipo_movimiento IN ('INGRESO_ADMIN', 'INGRESO_PACIENTE', 'APORTE_CAPITAL') THEN ABS(l.importe)
                    WHEN m.tipo_movimiento IN ('CAMBIO_MONEDA', 'TRANSFERENCIA', 'AJUSTE_CAJA') THEN l.importe
                    ELSE 0
                END
            ELSE 0 END
        ), 0)
      INTO v_admin_ars, v_admin_usd
    FROM caja_admin_movimientos m
    JOIN caja_admin_movimiento_lineas l ON l.admin_movimiento_id = m.id
    JOIN cuentas_financieras cf ON cf.id = l.cuenta_id
    WHERE m.sucursal_id = p_sucursal_id
      AND cf.tipo_cuenta = 'EFECTIVO'
      AND m.fecha_movimiento >= v_inicio
      AND m.fecha_movimiento <= p_hasta_fecha
      AND m.caja_arqueo_id IS NULL
      AND m.estado <> 'Anulado'
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND m.tipo_movimiento <> 'GIRO_ACTIVO';

    SELECT
        COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN monto ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN moneda = 'USD' THEN monto ELSE 0 END), 0)
      INTO v_retiros_ars, v_retiros_usd
    FROM transferencias_caja
    WHERE tipo_transferencia = 'RETIRO_EFECTIVO'
      AND estado = 'confirmada'
      AND fecha_movimiento >= v_inicio
      AND fecha_movimiento <= p_hasta_fecha
      AND caja_arqueo_id IS NULL;

    RETURN jsonb_build_object(
        'activa', p_hasta_fecha >= v_desde,
        'fecha_activacion', v_desde,
        'estado', CASE
            WHEN v_arqueo.id IS NULL THEN 'sin_abrir'
            ELSE v_arqueo.estado
        END,
        'arqueo_id', v_arqueo.id,
        'ars', ROUND(v_base_ars + v_recepcion_ars + v_admin_ars - v_retiros_ars, 2),
        'usd', ROUND(v_base_usd + v_recepcion_usd + v_admin_usd - v_retiros_usd, 2),
        'saldo_inicial_ars', ROUND(v_base_ars, 2),
        'saldo_inicial_usd', ROUND(v_base_usd, 2),
        'movimientos_recepcion_ars', ROUND(v_recepcion_ars, 2),
        'movimientos_recepcion_usd', ROUND(v_recepcion_usd, 2),
        'movimientos_admin_ars', ROUND(v_admin_ars, 2),
        'movimientos_admin_usd', ROUND(v_admin_usd, 2),
        'retiros_ars', ROUND(v_retiros_ars, 2),
        'retiros_usd', ROUND(v_retiros_usd, 2)
    );
END;
$$;

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

    IF EXISTS (
        SELECT 1 FROM caja_arqueos
        WHERE sucursal_id = p_sucursal_id
          AND fecha = p_fecha
          AND estado = 'cerrado'
    ) THEN
        RAISE EXCEPTION 'La caja de hoy ya fue cerrada.';
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

CREATE OR REPLACE FUNCTION public.cerrar_caja_fisica(
    p_sucursal_id UUID,
    p_fecha DATE,
    p_usuario TEXT,
    p_contado_ars NUMERIC,
    p_contado_usd NUMERIC,
    p_tc_bna NUMERIC DEFAULT NULL,
    p_observaciones TEXT DEFAULT NULL
)
RETURNS public.caja_arqueos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_categoria TEXT;
    v_saldo JSONB;
    v_row caja_arqueos%ROWTYPE;
BEGIN
    v_categoria := public.caja_usuario_categoria();
    IF v_categoria NOT IN ('owner', 'admin', 'reception', 'developer') THEN
        RAISE EXCEPTION 'No tenés permiso para cerrar la caja.';
    END IF;

    IF p_contado_ars < 0 OR p_contado_usd < 0 THEN
        RAISE EXCEPTION 'El conteo físico no puede ser negativo.';
    END IF;

    SELECT * INTO v_row
    FROM caja_arqueos
    WHERE sucursal_id = p_sucursal_id
      AND fecha = p_fecha
      AND estado = 'abierto'
    FOR UPDATE;

    IF v_row.id IS NULL THEN
        RAISE EXCEPTION 'No hay una caja abierta para esta fecha.';
    END IF;

    v_saldo := public.caja_saldo_fisico(p_sucursal_id, p_fecha);

    UPDATE caja_arqueos
    SET estado = 'cerrado',
        usuario_cierre = p_usuario,
        cerrado_por = auth.uid(),
        hora_cierre = NOW(),
        saldo_esperado_ars = (v_saldo ->> 'ars')::NUMERIC,
        saldo_esperado_usd = (v_saldo ->> 'usd')::NUMERIC,
        saldo_contado_ars = p_contado_ars,
        saldo_contado_usd = p_contado_usd,
        diferencia_ars = p_contado_ars - (v_saldo ->> 'ars')::NUMERIC,
        diferencia_usd = p_contado_usd - (v_saldo ->> 'usd')::NUMERIC,
        tc_bna_venta = p_tc_bna,
        observaciones = p_observaciones,
        snapshot_datos = snapshot_datos || jsonb_build_object('saldo_cierre', v_saldo),
        updated_at = NOW()
    WHERE id = v_row.id
    RETURNING * INTO v_row;

    UPDATE caja_recepcion_movimientos
    SET caja_arqueo_id = v_row.id
    WHERE fecha_movimiento <= p_fecha
      AND fecha_movimiento >= v_row.fecha
      AND metodo_pago = 'Efectivo'
      AND COALESCE(LOWER(estado), '') NOT IN ('anulado', 'pendiente')
      AND caja_arqueo_id IS NULL;

    UPDATE caja_admin_movimientos m
    SET caja_arqueo_id = v_row.id
    WHERE m.sucursal_id = p_sucursal_id
      AND m.fecha_movimiento <= p_fecha
      AND m.fecha_movimiento >= v_row.fecha
      AND m.estado <> 'Anulado'
      AND COALESCE(m.is_deleted, FALSE) = FALSE
      AND EXISTS (
          SELECT 1
          FROM caja_admin_movimiento_lineas l
          JOIN cuentas_financieras cf ON cf.id = l.cuenta_id
          WHERE l.admin_movimiento_id = m.id
            AND cf.tipo_cuenta = 'EFECTIVO'
      )
      AND m.caja_arqueo_id IS NULL;

    UPDATE transferencias_caja
    SET caja_arqueo_id = v_row.id
    WHERE fecha_movimiento <= p_fecha
      AND fecha_movimiento >= v_row.fecha
      AND tipo_transferencia = 'RETIRO_EFECTIVO'
      AND estado = 'confirmada'
      AND caja_arqueo_id IS NULL;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.caja_saldo_fisico(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_caja_fisica(UUID, DATE, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cerrar_caja_fisica(UUID, DATE, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- Desde el corte no existen traspasos entre cajas. Los retiros son solo del owner.
CREATE OR REPLACE FUNCTION public.validar_operacion_caja_fisica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_desde DATE;
    v_categoria TEXT;
    v_sucursal_id UUID;
    v_saldo JSONB;
    v_disponible NUMERIC;
BEGIN
    SELECT id, caja_unificada_desde
      INTO v_sucursal_id, v_desde
    FROM sucursales
    WHERE caja_unificada_desde IS NOT NULL
    ORDER BY nombre
    LIMIT 1;

    IF NEW.fecha_movimiento < v_desde THEN
        RETURN NEW;
    END IF;

    IF NEW.tipo_transferencia = 'TRASPASO_INTERNO' THEN
        RAISE EXCEPTION 'Ya no existen traspasos internos: Madero usa una sola caja física.';
    END IF;

    IF NEW.tipo_transferencia = 'RETIRO_EFECTIVO' THEN
        v_categoria := public.caja_usuario_categoria();
        IF v_categoria NOT IN ('owner', 'developer') THEN
            RAISE EXCEPTION 'Los retiros de efectivo solo pueden ser realizados por owner.';
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM caja_arqueos
            WHERE sucursal_id = v_sucursal_id
              AND estado = 'abierto'
              AND fecha = NEW.fecha_movimiento
        ) THEN
            RAISE EXCEPTION 'La caja física no está abierta para esta fecha.';
        END IF;

        v_saldo := public.caja_saldo_fisico(v_sucursal_id, NEW.fecha_movimiento);
        v_disponible := COALESCE((v_saldo ->> lower(NEW.moneda))::NUMERIC, 0);
        IF v_disponible - NEW.monto < 0 THEN
            RAISE EXCEPTION 'No hay suficiente efectivo % en la caja. Disponible: %.',
                NEW.moneda, v_disponible;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_operacion_caja_fisica_trigger ON public.transferencias_caja;
CREATE TRIGGER validar_operacion_caja_fisica_trigger
BEFORE INSERT OR UPDATE ON public.transferencias_caja
FOR EACH ROW EXECUTE FUNCTION public.validar_operacion_caja_fisica();

CREATE OR REPLACE FUNCTION public.validar_movimiento_recepcion_caja_fisica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sucursal_id UUID;
    v_desde DATE;
    v_saldo JSONB;
    v_disponible NUMERIC;
BEGIN
    IF NEW.metodo_pago <> 'Efectivo'
       OR COALESCE(LOWER(NEW.estado), '') IN ('anulado', 'pendiente') THEN
        RETURN NEW;
    END IF;

    SELECT id, caja_unificada_desde
      INTO v_sucursal_id, v_desde
    FROM sucursales
    WHERE activa = TRUE
      AND moneda_local = 'ARS'
      AND caja_unificada_desde IS NOT NULL
    ORDER BY nombre
    LIMIT 1;

    IF v_desde IS NULL OR NEW.fecha_movimiento < v_desde THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM caja_arqueos
        WHERE sucursal_id = v_sucursal_id
          AND estado = 'abierto'
          AND fecha = NEW.fecha_movimiento
    ) THEN
        RAISE EXCEPTION 'La caja física no está abierta para esta fecha.';
    END IF;

    IF NEW.monto < 0 AND NEW.moneda IN ('ARS', 'USD') THEN
        v_saldo := public.caja_saldo_fisico(v_sucursal_id, NEW.fecha_movimiento);
        v_disponible := COALESCE((v_saldo ->> lower(NEW.moneda))::NUMERIC, 0);
        IF v_disponible + NEW.monto < 0 THEN
            RAISE EXCEPTION 'No hay suficiente efectivo % en la caja. Disponible: %.',
                NEW.moneda, v_disponible;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_movimiento_recepcion_caja_fisica_trigger
ON public.caja_recepcion_movimientos;
CREATE TRIGGER validar_movimiento_recepcion_caja_fisica_trigger
BEFORE INSERT OR UPDATE OF monto, moneda, metodo_pago, estado, fecha_movimiento
ON public.caja_recepcion_movimientos
FOR EACH ROW EXECUTE FUNCTION public.validar_movimiento_recepcion_caja_fisica();

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

DROP TRIGGER IF EXISTS validar_linea_admin_caja_fisica_trigger
ON public.caja_admin_movimiento_lineas;
CREATE TRIGGER validar_linea_admin_caja_fisica_trigger
BEFORE INSERT OR UPDATE OF importe, cuenta_id
ON public.caja_admin_movimiento_lineas
FOR EACH ROW EXECUTE FUNCTION public.validar_linea_admin_caja_fisica();
