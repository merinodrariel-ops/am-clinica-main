-- Seed correct historical hourly rates for Buenos Aires sucursal
-- January 2025: Staff $6,847 / Limpieza $4,500  (paid in early February)
-- February 2026: Staff $7,160 / Limpieza $4,800  (paid in early March onward)

DO $$
DECLARE
    v_sucursal_id uuid;
BEGIN
    SELECT id INTO v_sucursal_id
    FROM public.sucursales
    WHERE nombre ILIKE '%buenos%'
       OR nombre ILIKE '%argentina%'
       OR activa = true
    ORDER BY nombre
    LIMIT 1;

    IF v_sucursal_id IS NULL THEN
        RAISE NOTICE 'No se encontró sucursal activa, abortando seed.';
        RETURN;
    END IF;

    -- Enero 2025: valores históricos correctos
    INSERT INTO public.sucursal_valores_hora_historia
        (sucursal_id, fecha_desde, valor_hora_staff_ars, valor_hora_limpieza_ars, notas)
    VALUES
        (v_sucursal_id, '2025-01-01', 6847.00, 4500.00, 'Valores enero 2025 — pagados en febrero 2025')
    ON CONFLICT (sucursal_id, fecha_desde)
    DO UPDATE SET
        valor_hora_staff_ars    = EXCLUDED.valor_hora_staff_ars,
        valor_hora_limpieza_ars = EXCLUDED.valor_hora_limpieza_ars,
        notas                   = EXCLUDED.notas;

    -- Febrero 2026: aumento vigente desde marzo en adelante
    INSERT INTO public.sucursal_valores_hora_historia
        (sucursal_id, fecha_desde, valor_hora_staff_ars, valor_hora_limpieza_ars, notas)
    VALUES
        (v_sucursal_id, '2026-02-01', 7160.00, 4800.00, 'Aumento febrero 2026 — pagados en marzo 2026 en adelante')
    ON CONFLICT (sucursal_id, fecha_desde)
    DO UPDATE SET
        valor_hora_staff_ars    = EXCLUDED.valor_hora_staff_ars,
        valor_hora_limpieza_ars = EXCLUDED.valor_hora_limpieza_ars,
        notas                   = EXCLUDED.notas;

    RAISE NOTICE 'Valores hora históricos seeded para sucursal %', v_sucursal_id;
END;
$$;
