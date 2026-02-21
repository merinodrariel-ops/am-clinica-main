-- Add GIRO_ACTIVO to tipo_movimiento allowed values
-- Purpose: Track external agent transfers (Giro Activo) without affecting cash balances.
-- These movements accumulate in their own counter (ARS or USD) for end-of-period reconciliation.

ALTER TABLE caja_admin_movimientos
DROP CONSTRAINT IF EXISTS caja_admin_movimientos_tipo_movimiento_check;

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
    'APORTE_CAPITAL',
    'GIRO_ACTIVO'
));
