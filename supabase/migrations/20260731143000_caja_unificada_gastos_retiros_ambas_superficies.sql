-- Una caja física, dos superficies operativas. Recepción y Administración
-- pueden registrar gastos y retiros; el rol real queda auditado por auth.uid().

ALTER TABLE public.transferencias_caja
    ADD COLUMN IF NOT EXISTS comprobante_url TEXT;

DROP POLICY IF EXISTS "reception_income_only_guard" ON public.caja_recepcion_movimientos;

CREATE POLICY "reception_cash_operations_guard"
ON public.caja_recepcion_movimientos
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer'))
WITH CHECK (public.get_my_role() IN ('owner', 'admin', 'reception', 'developer'));

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
    SELECT id, caja_unificada_desde INTO v_sucursal_id, v_desde
    FROM sucursales
    WHERE caja_unificada_desde IS NOT NULL
    ORDER BY nombre LIMIT 1;

    IF v_desde IS NULL OR NEW.fecha_movimiento < v_desde THEN RETURN NEW; END IF;

    IF NEW.tipo_transferencia = 'TRASPASO_INTERNO' THEN
        RAISE EXCEPTION 'Ya no existen traspasos internos: Madero usa una sola caja física.';
    END IF;

    IF NEW.tipo_transferencia = 'RETIRO_EFECTIVO' THEN
        v_categoria := public.caja_usuario_categoria();
        IF v_categoria NOT IN ('owner', 'admin', 'reception', 'developer') THEN
            RAISE EXCEPTION 'No tenés permiso para retirar efectivo.';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM caja_arqueos
            WHERE sucursal_id = v_sucursal_id AND estado = 'abierto'
              AND fecha = NEW.fecha_movimiento
        ) THEN
            RAISE EXCEPTION 'La caja física no está abierta para esta fecha.';
        END IF;
        v_saldo := public.caja_saldo_fisico(v_sucursal_id, NEW.fecha_movimiento);
        v_disponible := COALESCE((v_saldo ->> lower(NEW.moneda))::NUMERIC, 0);
        IF NEW.monto <= 0 THEN RAISE EXCEPTION 'El retiro debe ser mayor a cero.'; END IF;
        IF v_disponible - NEW.monto < 0 THEN
            RAISE EXCEPTION 'No hay suficiente efectivo % en la caja. Disponible: %.', NEW.moneda, v_disponible;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
