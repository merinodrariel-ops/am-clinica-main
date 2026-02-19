-- Admin cashbox open/close workflow
-- 1) Allow opening the day (estado abierto)
-- 2) Close existing open row when closing
-- 3) Link movements by fecha_movimiento

ALTER TABLE public.caja_admin_arqueos
    ALTER COLUMN hora_inicio DROP NOT NULL,
    ALTER COLUMN hora_cierre DROP NOT NULL,
    ALTER COLUMN saldo_final_usd_equivalente DROP NOT NULL;

DO $$
DECLARE
    v_estado_constraint TEXT;
BEGIN
    SELECT con.conname
    INTO v_estado_constraint
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'caja_admin_arqueos'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%estado%';

    IF v_estado_constraint IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.caja_admin_arqueos DROP CONSTRAINT %I', v_estado_constraint);
    END IF;
END
$$;

ALTER TABLE public.caja_admin_arqueos DROP CONSTRAINT IF EXISTS caja_admin_arqueos_estado_check;
ALTER TABLE public.caja_admin_arqueos
    ADD CONSTRAINT caja_admin_arqueos_estado_check
    CHECK (UPPER(COALESCE(estado, '')) IN ('ABIERTO', 'CERRADO'));

DROP FUNCTION IF EXISTS abrir_caja_admin(
    UUID,
    DATE,
    TEXT,
    NUMERIC
);

CREATE OR REPLACE FUNCTION abrir_caja_admin(
    p_sucursal_id UUID,
    p_fecha DATE,
    p_usuario TEXT,
    p_tc_bna NUMERIC DEFAULT NULL
)
RETURNS caja_admin_arqueos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_open_row caja_admin_arqueos%ROWTYPE;
    v_saldos_iniciales JSONB;
    v_saldo_inicial_usd_eq NUMERIC;
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

    SELECT *
    INTO v_open_row
    FROM caja_admin_arqueos
    WHERE sucursal_id = p_sucursal_id
      AND fecha = p_fecha
      AND UPPER(COALESCE(estado, '')) = 'ABIERTO'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_open_row.id IS NOT NULL THEN
        RETURN v_open_row;
    END IF;

    SELECT
        COALESCE(saldos_finales, '{}'::jsonb),
        COALESCE(saldo_final_usd_equivalente, 0)
    INTO v_saldos_iniciales, v_saldo_inicial_usd_eq
    FROM caja_admin_arqueos
    WHERE sucursal_id = p_sucursal_id
      AND UPPER(COALESCE(estado, '')) = 'CERRADO'
      AND fecha < p_fecha
    ORDER BY fecha DESC
    LIMIT 1;

    v_saldos_iniciales := COALESCE(v_saldos_iniciales, '{}'::jsonb);
    v_saldo_inicial_usd_eq := COALESCE(v_saldo_inicial_usd_eq, 0);

    INSERT INTO caja_admin_arqueos (
        sucursal_id,
        fecha,
        usuario,
        hora_inicio,
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
        NULL,
        v_saldos_iniciales,
        v_saldos_iniciales,
        v_saldo_inicial_usd_eq,
        0,
        p_tc_bna,
        'Apertura automatica',
        'Abierto',
        jsonb_build_object('apertura_automatica', true, 'origen', 'sistema')
    )
    RETURNING * INTO v_open_row;

    RETURN v_open_row;
END;
$$;

DROP FUNCTION IF EXISTS cerrar_caja_admin(
    UUID,
    DATE,
    TEXT,
    NUMERIC,
    JSONB,
    NUMERIC,
    NUMERIC,
    TEXT,
    JSONB
);

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

   UPDATE caja_admin_movimientos
   SET cierre_id = v_new_id
   WHERE sucursal_id = p_sucursal_id
     AND fecha_movimiento <= p_fecha
     AND cierre_id IS NULL;

   RETURN jsonb_build_object('id', v_new_id, 'status', 'success');
END;
$$;

GRANT EXECUTE ON FUNCTION abrir_caja_admin(UUID, DATE, TEXT, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION cerrar_caja_admin(UUID, DATE, TEXT, NUMERIC, JSONB, NUMERIC, NUMERIC, TEXT, JSONB, JSONB) TO authenticated;
