-- Insert "Pago Giro Activo" as an EGRESO category for all existing branches.
-- This is the category that must be selected when paying off a giro activo debt.
-- The service identifies giro payments via: tipo_movimiento='EGRESO' AND subtipo='Pago Giro Activo'

DO $$
DECLARE
    sucursal RECORD;
BEGIN
    FOR sucursal IN SELECT id FROM public.sucursales LOOP
        INSERT INTO public.caja_admin_categorias (
            sucursal_id, nombre, tipo_movimiento, requiere_adjunto, activo, orden
        )
        VALUES (
            sucursal.id,
            'Pago Giro Activo',
            'EGRESO',
            false,
            true,
            5  -- Show near the top
        ) ON CONFLICT (sucursal_id, nombre, tipo_movimiento) DO NOTHING;
    END LOOP;
END $$;
