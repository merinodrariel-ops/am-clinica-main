-- Respaldo inmutable de la transición hacia la Caja física única.
-- No almacena pacientes, prestadores, comprobantes ni descripciones de movimientos.

CREATE TABLE IF NOT EXISTS public.caja_transicion_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sucursal_id UUID NOT NULL REFERENCES public.sucursales(id) ON DELETE RESTRICT,
    etiqueta TEXT NOT NULL,
    capturado_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    capturado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    fecha_corte DATE NOT NULL,
    saldo_unificado JSONB NOT NULL,
    cierre_recepcion JSONB NOT NULL,
    cierre_administracion JSONB NOT NULL,
    resumen_movimientos JSONB NOT NULL,
    checksum TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sucursal_id, etiqueta)
);

ALTER TABLE public.caja_transicion_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "caja_transicion_snapshots_select" ON public.caja_transicion_snapshots;
CREATE POLICY "caja_transicion_snapshots_select"
ON public.caja_transicion_snapshots FOR SELECT
USING (
    EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.categoria IN ('owner', 'admin', 'developer')
    )
);

REVOKE INSERT, UPDATE, DELETE ON public.caja_transicion_snapshots FROM authenticated;
GRANT SELECT ON public.caja_transicion_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.capturar_snapshot_transicion_caja(
    p_sucursal_id UUID,
    p_etiqueta TEXT,
    p_fecha_corte DATE
)
RETURNS public.caja_transicion_snapshots
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_categoria TEXT;
    v_recepcion JSONB := '{}'::jsonb;
    v_admin JSONB := '{}'::jsonb;
    v_resumen JSONB := '{}'::jsonb;
    v_saldo JSONB := '{}'::jsonb;
    v_payload TEXT;
    v_row caja_transicion_snapshots%ROWTYPE;
BEGIN
    v_categoria := public.caja_usuario_categoria();
    IF COALESCE(current_setting('request.jwt.claim.role', TRUE), '') <> 'service_role'
       AND v_categoria NOT IN ('owner', 'admin', 'developer') THEN
        RAISE EXCEPTION 'No tenés permiso para respaldar la transición de Caja.';
    END IF;

    IF COALESCE(TRIM(p_etiqueta), '') = '' THEN
        RAISE EXCEPTION 'La etiqueta del respaldo es obligatoria.';
    END IF;

    SELECT jsonb_build_object(
        'id', r.id,
        'fecha', r.fecha,
        'hora_cierre', r.hora_cierre,
        'saldo_final_ars_billete', COALESCE(r.saldo_final_ars_billete, 0),
        'saldo_final_usd_billete', COALESCE(r.saldo_final_usd_billete, 0),
        'saldo_final_usd_equivalente', COALESCE(r.saldo_final_usd_equivalente, 0),
        'diferencia_usd', COALESCE(r.diferencia_usd, 0),
        'estado', r.estado
    )
    INTO v_recepcion
    FROM caja_recepcion_arqueos r
    WHERE LOWER(COALESCE(r.estado, '')) = 'cerrado'
      AND r.fecha <= p_fecha_corte
    ORDER BY r.fecha DESC, r.hora_cierre DESC NULLS LAST
    LIMIT 1;

    SELECT jsonb_build_object(
        'id', a.id,
        'fecha', a.fecha,
        'hora_cierre', a.hora_cierre,
        'saldos_finales', COALESCE(a.saldos_finales, '{}'::jsonb),
        'saldo_final_usd_equivalente', COALESCE(a.saldo_final_usd_equivalente, 0),
        'diferencia_usd', COALESCE(a.diferencia_usd, 0),
        'estado', a.estado
    )
    INTO v_admin
    FROM caja_admin_arqueos a
    WHERE a.sucursal_id = p_sucursal_id
      AND UPPER(COALESCE(a.estado, '')) = 'CERRADO'
      AND a.fecha <= p_fecha_corte
    ORDER BY a.fecha DESC, a.hora_cierre DESC NULLS LAST
    LIMIT 1;

    v_recepcion := COALESCE(v_recepcion, '{}'::jsonb);
    v_admin := COALESCE(v_admin, '{}'::jsonb);
    v_saldo := public.caja_saldo_fisico(p_sucursal_id, p_fecha_corte);

    SELECT jsonb_build_object(
        'recepcion', jsonb_build_object(
            'cantidad', COUNT(*),
            'efectivo_ars', COALESCE(SUM(CASE
                WHEN moneda = 'ARS' AND metodo_pago = 'Efectivo'
                     AND COALESCE(LOWER(estado), '') NOT IN ('anulado', 'pendiente')
                THEN monto ELSE 0 END), 0),
            'efectivo_usd', COALESCE(SUM(CASE
                WHEN moneda = 'USD' AND metodo_pago = 'Efectivo'
                     AND COALESCE(LOWER(estado), '') NOT IN ('anulado', 'pendiente')
                THEN monto ELSE 0 END), 0)
        )
    )
    INTO v_resumen
    FROM caja_recepcion_movimientos
    WHERE fecha_movimiento <= p_fecha_corte;

    v_resumen := v_resumen || jsonb_build_object(
        'administracion', (
            SELECT jsonb_build_object(
                'cantidad', COUNT(DISTINCT m.id),
                'ingresos_usd_equivalentes', COALESCE(SUM(CASE
                    WHEN m.tipo_movimiento IN ('INGRESO_ADMIN', 'INGRESO_PACIENTE', 'APORTE_CAPITAL')
                    THEN m.usd_equivalente_total ELSE 0 END), 0),
                'egresos_usd_equivalentes', COALESCE(SUM(CASE
                    WHEN m.tipo_movimiento = 'EGRESO'
                    THEN m.usd_equivalente_total ELSE 0 END), 0)
            )
            FROM caja_admin_movimientos m
            WHERE m.sucursal_id = p_sucursal_id
              AND m.fecha_movimiento <= p_fecha_corte
              AND m.estado <> 'Anulado'
              AND COALESCE(m.is_deleted, FALSE) = FALSE
        ),
        'retiros', (
            SELECT jsonb_build_object(
                'cantidad', COUNT(*),
                'ars', COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN monto ELSE 0 END), 0),
                'usd', COALESCE(SUM(CASE WHEN moneda = 'USD' THEN monto ELSE 0 END), 0)
            )
            FROM transferencias_caja
            WHERE fecha_movimiento <= p_fecha_corte
              AND tipo_transferencia = 'RETIRO_EFECTIVO'
              AND estado = 'confirmada'
        )
    );

    v_payload := p_sucursal_id::TEXT
        || p_etiqueta
        || p_fecha_corte::TEXT
        || v_saldo::TEXT
        || v_recepcion::TEXT
        || v_admin::TEXT
        || v_resumen::TEXT;

    INSERT INTO caja_transicion_snapshots (
        sucursal_id,
        etiqueta,
        capturado_por,
        fecha_corte,
        saldo_unificado,
        cierre_recepcion,
        cierre_administracion,
        resumen_movimientos,
        checksum
    ) VALUES (
        p_sucursal_id,
        TRIM(p_etiqueta),
        auth.uid(),
        p_fecha_corte,
        v_saldo,
        v_recepcion,
        v_admin,
        v_resumen,
        md5(v_payload)
    )
    ON CONFLICT (sucursal_id, etiqueta) DO NOTHING
    RETURNING * INTO v_row;

    IF v_row.id IS NULL THEN
        SELECT * INTO v_row
        FROM caja_transicion_snapshots
        WHERE sucursal_id = p_sucursal_id
          AND etiqueta = TRIM(p_etiqueta);
    END IF;

    RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.capturar_snapshot_transicion_caja(UUID, TEXT, DATE)
TO authenticated;

CREATE OR REPLACE FUNCTION public.capturar_snapshot_primera_apertura_caja()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM caja_arqueos
        WHERE sucursal_id = NEW.sucursal_id
    ) THEN
        PERFORM public.capturar_snapshot_transicion_caja(
            NEW.sucursal_id,
            'primera-apertura-' || NEW.fecha::TEXT,
            NEW.fecha - 1
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS capturar_snapshot_primera_apertura_caja_trigger
ON public.caja_arqueos;
CREATE TRIGGER capturar_snapshot_primera_apertura_caja_trigger
BEFORE INSERT ON public.caja_arqueos
FOR EACH ROW EXECUTE FUNCTION public.capturar_snapshot_primera_apertura_caja();
