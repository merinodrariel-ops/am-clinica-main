-- Update check constraint for tipo_movimiento in caja_admin_movimientos
ALTER TABLE caja_admin_movimientos 
DROP CONSTRAINT caja_admin_movimientos_tipo_movimiento_check;

ALTER TABLE caja_admin_movimientos 
ADD CONSTRAINT caja_admin_movimientos_tipo_movimiento_check 
CHECK (tipo_movimiento IN (
    'INGRESO_ADMIN', 
    'INGRESO_PACIENTE', 
    'EGRESO', 
    'CAMBIO_MONEDA', 
    'RETIRO', 
    'TRANSFERENCIA', 
    'AJUSTE_CAJA',
    'APORTE_CAPITAL'
));
