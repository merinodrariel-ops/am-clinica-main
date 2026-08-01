-- Activate Madero's single physical cash box on 2026-07-31.
-- Create the transition opening from the last pre-cutover physical closures,
-- so movements already recorded on 2026-07-31 are added exactly once.

BEGIN;

DO $$
DECLARE
    v_sucursal_id UUID := '49ac4ef0-f718-4e43-a75d-926c7064eb9a';
    v_cutover DATE := DATE '2026-07-31';
    v_recepcion_ars NUMERIC := 0;
    v_recepcion_usd NUMERIC := 0;
    v_admin_ars NUMERIC := 0;
    v_admin_usd NUMERIC := 0;
    v_owner_id UUID;
BEGIN
    UPDATE public.sucursales
    SET caja_unificada_desde = v_cutover
    WHERE id = v_sucursal_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'No se encontró la sucursal Buenos Aires/Madero.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.caja_arqueos
        WHERE sucursal_id = v_sucursal_id
          AND fecha = v_cutover
    ) THEN
        SELECT
            COALESCE(saldo_final_ars_billete, 0),
            COALESCE(saldo_final_usd_billete, 0)
        INTO v_recepcion_ars, v_recepcion_usd
        FROM public.caja_recepcion_arqueos
        WHERE estado = 'cerrado'
          AND fecha < v_cutover
        ORDER BY fecha DESC, hora_cierre DESC NULLS LAST
        LIMIT 1;

        SELECT
            COALESCE(SUM(
                CASE WHEN cf.moneda = 'ARS'
                    THEN COALESCE((a.saldos_finales ->> cf.id::text)::NUMERIC, 0)
                    ELSE 0 END
            ), 0),
            COALESCE(SUM(
                CASE WHEN cf.moneda = 'USD'
                    THEN COALESCE((a.saldos_finales ->> cf.id::text)::NUMERIC, 0)
                    ELSE 0 END
            ), 0)
        INTO v_admin_ars, v_admin_usd
        FROM (
            SELECT *
            FROM public.caja_admin_arqueos
            WHERE sucursal_id = v_sucursal_id
              AND UPPER(COALESCE(estado, '')) = 'CERRADO'
              AND fecha < v_cutover
            ORDER BY fecha DESC, hora_cierre DESC NULLS LAST
            LIMIT 1
        ) a
        JOIN public.cuentas_financieras cf
          ON cf.sucursal_id = v_sucursal_id
         AND cf.tipo_cuenta = 'EFECTIVO'
         AND cf.activa = TRUE;

        SELECT id INTO v_owner_id
        FROM public.profiles
        WHERE categoria = 'owner' AND is_active = TRUE
        ORDER BY created_at
        LIMIT 1;

        INSERT INTO public.caja_arqueos (
            sucursal_id,
            fecha,
            usuario_apertura,
            abierto_por,
            saldo_inicial_ars,
            saldo_inicial_usd,
            snapshot_datos
        ) VALUES (
            v_sucursal_id,
            v_cutover,
            'Activación automática de caja única',
            v_owner_id,
            COALESCE(v_recepcion_ars, 0) + COALESCE(v_admin_ars, 0),
            COALESCE(v_recepcion_usd, 0) + COALESCE(v_admin_usd, 0),
            jsonb_build_object(
                'origen', 'activacion_caja_unificada_2026_07_31',
                'recepcion_ars', COALESCE(v_recepcion_ars, 0),
                'recepcion_usd', COALESCE(v_recepcion_usd, 0),
                'admin_ars', COALESCE(v_admin_ars, 0),
                'admin_usd', COALESCE(v_admin_usd, 0),
                'evita_doble_conteo_movimientos_del_dia', TRUE
            )
        );
    END IF;
END;
$$;

COMMIT;
