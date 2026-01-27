-- 1. cerrar_caja_admin
CREATE OR REPLACE FUNCTION cerrar_caja_admin(
   p_sucursal_id UUID,
   p_fecha DATE,
   p_usuario TEXT,
   p_saldo_final_usd_eq NUMERIC,
   p_saldos_finales JSONB,
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
   v_saldos_iniciales JSONB;
BEGIN
   -- 1. Check if already closed
   IF EXISTS (SELECT 1 FROM caja_admin_arqueos WHERE fecha = p_fecha AND sucursal_id = p_sucursal_id AND estado = 'cerrado') THEN
      RAISE EXCEPTION 'La caja de esta fecha ya está cerrada.';
   END IF;

   -- 2. Get last closure for initial balances
   SELECT saldos_finales INTO v_saldos_iniciales
   FROM caja_admin_arqueos
   WHERE sucursal_id = p_sucursal_id AND estado = 'cerrado' AND fecha < p_fecha
   ORDER BY fecha DESC
   LIMIT 1;

   -- Default to 0 values if no prior closure
   IF v_saldos_iniciales IS NULL THEN
      v_saldos_iniciales := '{}'::jsonb;
   END IF;

   -- 3. Insert new closure
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
       'cerrado',
       p_snapshot
   ) RETURNING id INTO v_new_id;

   -- 4. Update movements
   UPDATE caja_admin_movimientos
   SET cierre_id = v_new_id
   WHERE sucursal_id = p_sucursal_id 
     AND fecha_hora::date <= p_fecha 
     AND cierre_id IS NULL;

   RETURN v_new_id;
END;
$$;

-- 2. get_dias_sin_cierre_recepcion
CREATE OR REPLACE FUNCTION get_dias_sin_cierre_recepcion()
RETURNS TABLE (
    fecha DATE,
    cantidad BIGINT,
    ultimo_usuario TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
       m.fecha_hora::date as fecha,
       COUNT(*) as cantidad,
       (array_agg(m.usuario ORDER BY m.fecha_hora DESC))[1] as ultimo_usuario
    FROM caja_recepcion_movimientos m
    LEFT JOIN caja_recepcion_arqueos a ON a.fecha = m.fecha_hora::date AND a.estado = 'cerrado'
    WHERE m.fecha_hora::date < CURRENT_DATE
       AND m.cierre_id IS NULL
       AND m.estado != 'anulado'
       AND a.id IS NULL -- Ensure no closure exists for that date (double check logic)
       -- Actually, checking cierre_id IS NULL handles movements not yet linked.
       -- But if a day has closure but somehow movements were added late...
       -- The requirement "Si un día calendario finaliza sin cierre".
       -- If closure exists, it's closed. Pending movements on closed day = drift?
       -- Assuming we only care about days with NO closure record.
    GROUP BY m.fecha_hora::date
    ORDER BY m.fecha_hora::date DESC;
END;
$$;

-- 3. get_dias_sin_cierre_admin
CREATE OR REPLACE FUNCTION get_dias_sin_cierre_admin(p_sucursal_id UUID)
RETURNS TABLE (
    fecha DATE,
    cantidad BIGINT,
    ultimo_usuario TEXT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
       m.fecha_hora::date as fecha,
       COUNT(*) as cantidad,
       (array_agg(m.usuario ORDER BY m.fecha_hora DESC))[1] as ultimo_usuario
    FROM caja_admin_movimientos m
    LEFT JOIN caja_admin_arqueos a ON a.fecha = m.fecha_hora::date AND a.estado = 'cerrado' AND a.sucursal_id = p_sucursal_id
    WHERE m.sucursal_id = p_sucursal_id
       AND m.fecha_hora::date < CURRENT_DATE
       AND m.cierre_id IS NULL
       AND m.estado != 'anulado' -- Assuming 'anulado' lowercase? usually 'Anulado'. Check schema.
       -- In Admin table it's 'Anulado' (Title Case) or 'Registrado'.
       -- In Reception it's 'anulado' (lower).
       -- I will use ILIKE or specific check.
       AND m.estado NOT ILIKE 'anulado'
       AND a.id IS NULL
    GROUP BY m.fecha_hora::date
    ORDER BY m.fecha_hora::date DESC;
END;
$$;
