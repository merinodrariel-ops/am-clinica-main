-- Permite que cerrar_caja_fisica vincule retiros al arqueo ya cerrado.
-- La validación sigue ejecutándose cuando cambia cualquier dato operativo;
-- caja_arqueo_id es solamente una referencia de auditoría.

DROP TRIGGER IF EXISTS validar_operacion_caja_fisica_trigger
ON public.transferencias_caja;

CREATE TRIGGER validar_operacion_caja_fisica_trigger
BEFORE INSERT OR UPDATE OF
    moneda,
    monto,
    estado,
    tipo_transferencia,
    caja_origen,
    caja_destino,
    fecha_movimiento
ON public.transferencias_caja
FOR EACH ROW
EXECUTE FUNCTION public.validar_operacion_caja_fisica();
