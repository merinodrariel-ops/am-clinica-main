-- Allow manual initial balance for first closing (Update cerrar_caja_admin signature)
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
   p_saldos_iniciales JSONB DEFAULT NULL -- New parameter
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
   v_new_id UUID;
   v_saldos_iniciales JSONB;
BEGIN
   -- 1. Check if already closed
   IF EXISTS (SELECT 1 FROM caja_admin_arqueos WHERE fecha = p_fecha AND sucursal_id = p_sucursal_id AND estado = 'Cerrado') THEN
      RAISE EXCEPTION 'La caja de esta fecha ya está cerrada.';
   END IF;

   -- 2. Get last closure for initial balances
   SELECT saldos_finales INTO v_saldos_iniciales
   FROM caja_admin_arqueos
   WHERE sucursal_id = p_sucursal_id AND estado = 'Cerrado' AND fecha < p_fecha
   ORDER BY fecha DESC
   LIMIT 1;

   -- Default to 0 values if no prior closure, UNLESS manual initial balances provided
   IF v_saldos_iniciales IS NULL THEN
       IF p_saldos_iniciales IS NOT NULL THEN
           v_saldos_iniciales := p_saldos_iniciales;
       ELSE
           v_saldos_iniciales := '{}'::jsonb;
       END IF;
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
       'Cerrado',
       p_snapshot
   ) RETURNING id INTO v_new_id;

   -- 4. Update movements
   UPDATE caja_admin_movimientos
   SET cierre_id = v_new_id
   WHERE sucursal_id = p_sucursal_id 
     AND fecha_hora::date <= p_fecha 
     AND cierre_id IS NULL;
     
   RETURN jsonb_build_object('id', v_new_id, 'status', 'success');
END;
$$;
