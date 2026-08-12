-- Caja Administración: categoría operativa para egresos pagados por transferencia.
-- No toca Caja Recepción ni cambia el tipo técnico TRANSFERENCIA, que sigue reservado
-- para traspasos internos/saldos firmados.

INSERT INTO public.caja_admin_categorias (
    sucursal_id,
    nombre,
    tipo_movimiento,
    requiere_adjunto,
    orden
)
SELECT
    s.id,
    'Transferencias',
    'EGRESO',
    true,
    95
FROM public.sucursales s
WHERE s.activa = true
ON CONFLICT (sucursal_id, nombre, tipo_movimiento)
DO UPDATE SET
    activo = true,
    requiere_adjunto = EXCLUDED.requiere_adjunto,
    updated_at = timezone('utc'::text, now());
