
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Load env
dotenv.config({ path: join(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function fixSql() {
    console.log('--- Fixing Caja Admin SQL logic ---');

    const query = `
-- Update abrir_caja_admin to accept optional saldos_iniciales and improve logic
DROP FUNCTION IF EXISTS abrir_caja_admin(UUID, DATE, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS abrir_caja_admin(UUID, DATE, TEXT, NUMERIC, JSONB);

CREATE OR REPLACE FUNCTION abrir_caja_admin(
    p_sucursal_id UUID,
    p_fecha DATE,
    p_usuario TEXT,
    p_tc_bna NUMERIC DEFAULT NULL,
    p_saldos_iniciales JSONB DEFAULT NULL
)
RETURNS caja_admin_arqueos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_open_row caja_admin_arqueos%ROWTYPE;
    v_saldos_iniciales JSONB;
    v_saldo_inicial_usd_eq NUMERIC;
BEGIN
    -- Check if already closed for this date
    IF EXISTS (
        SELECT 1
        FROM caja_admin_arqueos
        WHERE fecha = p_fecha
          AND sucursal_id = p_sucursal_id
          AND UPPER(COALESCE(estado, '')) = 'CERRADO'
    ) THEN
        RAISE EXCEPTION 'La caja de esta fecha ya está cerrada.';
    END IF;

    -- Check if already open
    SELECT *
    INTO v_open_row
    FROM caja_admin_arqueos
    WHERE sucursal_id = p_sucursal_id
      AND fecha = p_fecha
      AND UPPER(COALESCE(estado, '')) = 'ABIERTO'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_open_row.id IS NOT NULL THEN
        RETURN v_open_row;
    END IF;

    -- If saldos explicitly provided, use them
    IF p_saldos_iniciales IS NOT NULL AND p_saldos_iniciales != '{}'::jsonb THEN
        v_saldos_iniciales := p_saldos_iniciales;
        v_saldo_inicial_usd_eq := 0; 
    ELSE
        -- Inherit from absolutely latest closure
        SELECT
            COALESCE(saldos_finales, '{}'::jsonb),
            COALESCE(saldo_final_usd_equivalente, 0)
        INTO v_saldos_iniciales, v_saldo_inicial_usd_eq
        FROM caja_admin_arqueos
        WHERE sucursal_id = p_sucursal_id
          AND UPPER(COALESCE(estado, '')) = 'CERRADO'
          AND fecha <= p_fecha 
        ORDER BY fecha DESC, hora_cierre DESC, created_at DESC
        LIMIT 1;
    END IF;

    v_saldos_iniciales := COALESCE(v_saldos_iniciales, '{}'::jsonb);
    v_saldo_inicial_usd_eq := COALESCE(v_saldo_inicial_usd_eq, 0);

    INSERT INTO caja_admin_arqueos (
        sucursal_id,
        fecha,
        usuario,
        hora_inicio,
        saldos_iniciales,
        saldos_finales, 
        saldo_final_usd_equivalente,
        tc_bna_venta_dia,
        estado,
        observaciones,
        snapshot_datos
    ) VALUES (
        p_sucursal_id,
        p_fecha,
        p_usuario,
        NOW(),
        v_saldos_iniciales,
        v_saldos_iniciales,
        v_saldo_inicial_usd_eq,
        p_tc_bna,
        'Abierto',
        'Apertura de caja',
        jsonb_build_object('apertura_automatica', true, 'origen', 'rpc')
    ) RETURNING * INTO v_open_row;

    RETURN v_open_row;
END;
$$;

GRANT EXECUTE ON FUNCTION abrir_caja_admin(UUID, DATE, TEXT, NUMERIC, JSONB) TO authenticated;
    `;

    // Note: This only works if restricted SQL execution is allowed via RPC or if we use the internal API
    // Since we don't know if 'exec_sql' exists, let's try a direct RPC update if we find one, or just report we need help.
    // Actually, I'll try to use the REST API to update the DB if I can.

    console.log('Sending SQL migration to Supabase...');

    // Most Supabase projects have a way to run raw SQL if you have the key, but it's often hidden.
    // Let's try the /rest/v1/rpc/exec_sql if it exists.
    try {
        const { data, error } = await supabase.rpc('exec_sql', { sql: query });
        if (error) throw error;
        console.log('Migration successful!');
    } catch (err: any) {
        console.error('Migration failed:', err.message);
        console.log('\n--- MANUAL ACTION REQUIRED ---');
        console.log('Please copy/paste the SQL above into the Supabase SQL Editor.');
    }
}

fixSql();
