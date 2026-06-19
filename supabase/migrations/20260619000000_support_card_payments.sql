DO $$
DECLARE
    rec_constraint_name text;
    adm_constraint_name text;
BEGIN
    SELECT con.conname
    INTO rec_constraint_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'caja_recepcion_movimientos'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%metodo_pago%'
    LIMIT 1;

    IF rec_constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE public.caja_recepcion_movimientos DROP CONSTRAINT %I',
            rec_constraint_name
        );
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'caja_admin_movimientos'
          AND column_name = 'metodo_pago'
    ) THEN
        SELECT con.conname
        INTO adm_constraint_name
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
        WHERE nsp.nspname = 'public'
          AND rel.relname = 'caja_admin_movimientos'
          AND con.contype = 'c'
          AND pg_get_constraintdef(con.oid) ILIKE '%metodo_pago%'
        LIMIT 1;

        IF adm_constraint_name IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE public.caja_admin_movimientos DROP CONSTRAINT %I',
                adm_constraint_name
            );
        END IF;
    END IF;
END
$$;

ALTER TABLE public.caja_recepcion_movimientos
    ADD CONSTRAINT caja_recepcion_movimientos_metodo_pago_check
    CHECK (metodo_pago IN (
        'Efectivo',
        'Transferencia',
        'MercadoPago',
        'Cripto',
        'Tarjeta_Credito',
        'Tarjeta_Debito'
    ));

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'caja_admin_movimientos'
          AND column_name = 'metodo_pago'
    ) THEN
        ALTER TABLE public.caja_admin_movimientos
            ADD CONSTRAINT caja_admin_movimientos_metodo_pago_check
            CHECK (metodo_pago IN (
                'Efectivo',
                'Transferencia',
                'MercadoPago',
                'Cripto',
                'Tarjeta_Credito',
                'Tarjeta_Debito'
            ));
    END IF;
END
$$;
