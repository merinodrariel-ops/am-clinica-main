-- Add fecha_movimiento and closure ID columns to transferencias_caja table
ALTER TABLE public.transferencias_caja
    ADD COLUMN IF NOT EXISTS fecha_movimiento DATE DEFAULT CURRENT_DATE,
    ADD COLUMN IF NOT EXISTS cierre_id_recepcion UUID REFERENCES public.caja_recepcion_arqueos(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS cierre_id_admin UUID REFERENCES public.caja_admin_arqueos(id) ON DELETE SET NULL;

-- Backfill legacy rows with DATE(fecha_hora)
UPDATE public.transferencias_caja
SET fecha_movimiento = COALESCE(fecha_movimiento, DATE(fecha_hora));

ALTER TABLE public.transferencias_caja
    ALTER COLUMN fecha_movimiento SET NOT NULL;


-- =========================================================================
-- UPDATE cerrar_caja_recepcion FUNCTION
-- =========================================================================
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

    -- 5) Link all pending transfers up to that operational date affecting RECEPCION.
    UPDATE transferencias_caja
    SET cierre_id_recepcion = v_new_id
    WHERE fecha_movimiento <= p_fecha
      AND cierre_id_recepcion IS NULL
      AND (caja_origen = 'RECEPCION' OR caja_destino = 'RECEPCION');

    RETURN v_new_id;
END;
$$;


-- =========================================================================
-- UPDATE cerrar_caja_admin FUNCTION
-- =========================================================================
CREATE OR REPLACE FUNCTION cerrar_caja_admin(
   p_sucursal_id UUID,
   p_fecha DATE,
   p_usuario TEXT,
   p_saldo_final_usd_eq NUMERIC,
   p_saldos_finales JSONB,
   p_diferencia_usd NUMERIC,
   p_tc_bna NUMERIC,
   p_observaciones TEXT,
   p_snapshot JSONB,
   p_saldos_iniciales JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
   v_new_id UUID;
   v_open_id UUID;
   v_saldos_iniciales JSONB;
BEGIN
   IF EXISTS (
      SELECT 1
      FROM caja_admin_arqueos
      WHERE fecha = p_fecha
        AND sucursal_id = p_sucursal_id
        AND UPPER(COALESCE(estado, '')) = 'CERRADO'
   ) THEN
      RAISE EXCEPTION 'La caja de esta fecha ya está cerrada.';
   END IF;

   SELECT
      id,
      COALESCE(saldos_iniciales, '{}'::jsonb)
   INTO v_open_id, v_saldos_iniciales
   FROM caja_admin_arqueos
   WHERE sucursal_id = p_sucursal_id
     AND fecha = p_fecha
     AND UPPER(COALESCE(estado, '')) = 'ABIERTO'
   ORDER BY created_at DESC
   LIMIT 1;

   IF v_open_id IS NOT NULL THEN
      UPDATE caja_admin_arqueos
      SET usuario = p_usuario,
          hora_cierre = NOW(),
          saldos_iniciales = CASE
              WHEN (v_saldos_iniciales = '{}'::jsonb OR v_saldos_iniciales IS NULL)
                   AND p_saldos_iniciales IS NOT NULL
                  THEN p_saldos_iniciales
              ELSE COALESCE(v_saldos_iniciales, '{}'::jsonb)
          END,
          saldos_finales = p_saldos_finales,
          saldo_final_usd_equivalente = p_saldo_final_usd_eq,
          diferencia_usd = p_diferencia_usd,
          tc_bna_venta_dia = p_tc_bna,
          observaciones = p_observaciones,
          estado = 'Cerrado',
          snapshot_datos = COALESCE(snapshot_datos, '{}'::jsonb) || COALESCE(p_snapshot, '{}'::jsonb)
      WHERE id = v_open_id
      RETURNING id INTO v_new_id;
   ELSE
      SELECT saldos_finales
      INTO v_saldos_iniciales
      FROM caja_admin_arqueos
      WHERE sucursal_id = p_sucursal_id
        AND UPPER(COALESCE(estado, '')) = 'CERRADO'
        AND fecha < p_fecha
      ORDER BY fecha DESC
      LIMIT 1;

      IF v_saldos_iniciales IS NULL THEN
         IF p_saldos_iniciales IS NOT NULL THEN
            v_saldos_iniciales := p_saldos_iniciales;
         ELSE
            v_saldos_iniciales := '{}'::jsonb;
         END IF;
      END IF;

      INSERT INTO caja_admin_arqueos (
         sucursal_id,
         fecha,
         usuario,
         hora_cierre,
         saldos_iniciales,
         saldos_finales,
         saldo_final_usd_equivalente,
         diferencia_usd,
         tc_bna_venta_dia,
         observaciones,
         estado,
         snapshot_datos
      ) VALUES (
         p_sucursal_id,
         p_fecha,
         p_usuario,
         NOW(),
         v_saldos_iniciales,
         p_saldos_finales,
         p_saldo_final_usd_eq,
         p_diferencia_usd,
         p_tc_bna,
         p_observaciones,
         'Cerrado',
         p_snapshot
      ) RETURNING id INTO v_new_id;
   END IF;

   -- 4) Link pending movements
   UPDATE caja_admin_movimientos
   SET cierre_id = v_new_id
   WHERE sucursal_id = p_sucursal_id
     AND fecha_movimiento <= p_fecha
     AND cierre_id IS NULL;

   -- 5) Link pending transfers
   UPDATE transferencias_caja
   SET cierre_id_admin = v_new_id
   WHERE fecha_movimiento <= p_fecha
     AND cierre_id_admin IS NULL
     AND (caja_origen = 'ADMIN' OR caja_destino = 'ADMIN');

   RETURN jsonb_build_object('id', v_new_id, 'status', 'success');
END;
$$;
