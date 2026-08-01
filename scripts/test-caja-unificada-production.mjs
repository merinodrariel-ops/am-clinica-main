#!/usr/bin/env node

/**
 * Simulación transaccional de Caja unificada.
 *
 * - Usa la base configurada en DATABASE_URL/SUPABASE_DB_PASSWORD.
 * - Toda la simulación corre dentro de BEGIN/ROLLBACK.
 * - No imprime pacientes, prestadores, usuarios ni secretos.
 * - No deja movimientos, arqueos, retiros ni snapshots de prueba.
 */

import fs from 'node:fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Client } = pg;
const activationDate = '2026-07-31';

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function closeEnough(actual, expected, tolerance = 0.01) {
    return Math.abs(Number(actual) - Number(expected)) <= tolerance;
}

async function expectDatabaseError(client, name, action, expectedText) {
    const savepoint = `expected_${name.replace(/[^a-z0-9_]/gi, '_').toLowerCase()}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
        await action();
        throw new Error(`${name}: la operación debía fallar`);
    } catch (error) {
        await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        if (error.message.includes('debía fallar')) throw error;
        assert(
            error.message.includes(expectedText),
            `${name}: error inesperado: ${error.message}`,
        );
    } finally {
        await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    }
}

function getPoolerUrl() {
    const raw = fs.readFileSync('supabase/.temp/pooler-url', 'utf8').trim();
    const url = new URL(raw);
    url.password = process.env.SUPABASE_DB_PASSWORD;
    return url.toString();
}

const client = new Client({
    connectionString: getPoolerUrl(),
    ssl: { rejectUnauthorized: false },
});

let rolledBack = false;
let currentStep = 'conexión';

try {
    await client.connect();
    await client.query('BEGIN');

    currentStep = 'contexto';
    const context = await client.query(`
        SELECT
            s.id AS sucursal_id,
            (SELECT id FROM profiles WHERE categoria = 'owner' AND is_active = TRUE LIMIT 1) AS owner_id,
            (SELECT id FROM profiles WHERE categoria = 'admin' AND is_active = TRUE LIMIT 1) AS admin_id,
            (SELECT id FROM profiles WHERE categoria = 'reception' AND is_active = TRUE LIMIT 1) AS reception_id,
            (SELECT id FROM cuentas_financieras
             WHERE sucursal_id = s.id AND tipo_cuenta = 'EFECTIVO'
               AND moneda = 'USD' AND activa = TRUE
             ORDER BY orden LIMIT 1) AS efectivo_usd_id
        FROM sucursales s
        WHERE s.activa = TRUE
          AND s.moneda_local = 'ARS'
          AND s.caja_unificada_desde IS NOT NULL
        ORDER BY s.nombre
        LIMIT 1
    `);

    const ctx = context.rows[0];
    assert(ctx?.sucursal_id, 'No se encontró la sucursal Madero');
    assert(ctx?.owner_id, 'No se encontró un owner activo');
    assert(ctx?.admin_id, 'No se encontró un admin activo');
    assert(ctx?.reception_id, 'No se encontró recepción activa');
    assert(ctx?.efectivo_usd_id, 'No se encontró cuenta Efectivo USD');

    async function impersonate(profileId) {
        await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', TRUE)`);
        await client.query(`SELECT set_config('request.jwt.claim.sub', $1, TRUE)`, [profileId]);
    }

    await impersonate(ctx.owner_id);

    currentStep = 'apertura';
    const opened = await client.query(
        `SELECT * FROM public.abrir_caja_fisica($1, $2, 'Prueba transaccional', NULL)`,
        [ctx.sucursal_id, activationDate],
    );
    assert(opened.rows[0]?.estado === 'abierto', 'La caja no quedó abierta');

    const initialResult = await client.query(
        `SELECT public.caja_saldo_fisico($1, $2) AS saldo`,
        [ctx.sucursal_id, activationDate],
    );
    const initial = initialResult.rows[0].saldo;

    currentStep = 'movimientos recepción';
    await impersonate(ctx.reception_id);
    await client.query(
        `INSERT INTO caja_recepcion_movimientos (
            concepto_nombre, categoria, monto, moneda, metodo_pago, estado,
            usuario, fecha_movimiento, origen
        ) VALUES (
            'PRUEBA TRANSACCIONAL - INGRESO', 'Ingreso extraordinario',
            1000, 'ARS', 'Efectivo', 'pagado',
            'Prueba transaccional', $1, 'manual'
        )`,
        [activationDate],
    );

    await client.query(
        `INSERT INTO caja_recepcion_movimientos (
            concepto_nombre, categoria, monto, moneda, metodo_pago, estado,
            usuario, fecha_movimiento, origen
        ) VALUES (
            'PRUEBA TRANSACCIONAL - GASTO', 'Egreso',
            -500, 'ARS', 'Efectivo', 'pagado',
            'Prueba transaccional', $1, 'manual'
        )`,
        [activationDate],
    );

    let result = await client.query(
        `SELECT public.caja_saldo_fisico($1, $2) AS saldo`,
        [ctx.sucursal_id, activationDate],
    );
    assert(
        closeEnough(result.rows[0].saldo.ars, Number(initial.ars) + 500),
        'Ingresos y gastos de Recepción no impactaron ARS correctamente',
    );

    await expectDatabaseError(
        client,
        'saldo_negativo_recepcion',
        () => client.query(
            `INSERT INTO caja_recepcion_movimientos (
                concepto_nombre, categoria, monto, moneda, metodo_pago, estado,
                usuario, fecha_movimiento, origen
            ) VALUES (
                'PRUEBA TRANSACCIONAL - NEGATIVO', 'Egreso',
                $1, 'ARS', 'Efectivo', 'pagado',
                'Prueba transaccional', $2, 'manual'
            )`,
            [-(Number(initial.ars) + 1000000), activationDate],
        ),
        'No hay suficiente efectivo ARS',
    );

    currentStep = 'liquidación administrativa';
    await impersonate(ctx.owner_id);
    const adminMovement = await client.query(
        `INSERT INTO caja_admin_movimientos (
            sucursal_id, fecha_movimiento, fecha_hora, usuario, descripcion,
            tipo_movimiento, subtipo, usd_equivalente_total, estado, origen
        ) VALUES (
            $1, $2, NOW(), 'Prueba transaccional',
            'PRUEBA TRANSACCIONAL - LIQUIDACION', 'EGRESO',
            'Liquidación de prestador', 100, 'Registrado', 'manual'
        ) RETURNING id`,
        [ctx.sucursal_id, activationDate],
    );

    await client.query(
        `INSERT INTO caja_admin_movimiento_lineas (
            admin_movimiento_id, cuenta_id, importe, moneda, usd_equivalente
        ) VALUES ($1, $2, 100, 'USD', 100)`,
        [adminMovement.rows[0].id, ctx.efectivo_usd_id],
    );

    result = await client.query(
        `SELECT public.caja_saldo_fisico($1, $2) AS saldo`,
        [ctx.sucursal_id, activationDate],
    );
    assert(
        closeEnough(result.rows[0].saldo.usd, Number(initial.usd) - 100),
        'La liquidación efectiva no descontó USD',
    );

    currentStep = 'permisos de retiro';
    await impersonate(ctx.reception_id);
    await client.query(
        `INSERT INTO transferencias_caja (
                usuario, moneda, monto, usd_equivalente, motivo, estado,
                tipo_transferencia, caja_origen, caja_destino, fecha_movimiento
            ) VALUES (
                'Prueba transaccional', 'USD', 10, 10, 'PRUEBA TRANSACCIONAL',
                'confirmada', 'RETIRO_EFECTIVO', 'RECEPCION', NULL, $1
            )`,
        [activationDate],
    );

    await impersonate(ctx.admin_id);
    await client.query(
        `INSERT INTO transferencias_caja (
            usuario, moneda, monto, usd_equivalente, motivo, estado,
            tipo_transferencia, caja_origen, caja_destino, fecha_movimiento
        ) VALUES (
            'Prueba transaccional', 'USD', 10, 10, 'PRUEBA TRANSACCIONAL',
            'confirmada', 'RETIRO_EFECTIVO', 'ADMIN', NULL, $1
        )`,
        [activationDate],
    );

    await impersonate(ctx.owner_id);
    await client.query(
        `INSERT INTO transferencias_caja (
            usuario, moneda, monto, usd_equivalente, motivo, estado,
            tipo_transferencia, caja_origen, caja_destino, fecha_movimiento
        ) VALUES (
            'Prueba transaccional', 'USD', 50, 50, 'PRUEBA TRANSACCIONAL',
            'confirmada', 'RETIRO_EFECTIVO', 'RECEPCION', NULL, $1
        )`,
        [activationDate],
    );

    await expectDatabaseError(
        client,
        'traspaso_interno',
        () => client.query(
            `INSERT INTO transferencias_caja (
                usuario, moneda, monto, usd_equivalente, motivo, estado,
                tipo_transferencia, caja_origen, caja_destino, fecha_movimiento
            ) VALUES (
                'Prueba transaccional', 'USD', 10, 10, 'PRUEBA',
                'confirmada', 'TRASPASO_INTERNO', 'RECEPCION', 'ADMIN', $1
            )`,
            [activationDate],
        ),
        'Ya no existen traspasos internos',
    );

    result = await client.query(
        `SELECT public.caja_saldo_fisico($1, $2) AS saldo`,
        [ctx.sucursal_id, activationDate],
    );
    const expected = result.rows[0].saldo;
    assert(
        closeEnough(expected.usd, Number(initial.usd) - 170),
        'Los retiros de Recepción, Administración y Owner no descontaron USD',
    );

    currentStep = 'cierre';
    const openBeforeClose = await client.query(
        `SELECT COUNT(*)::INT AS total
         FROM caja_arqueos
         WHERE sucursal_id = $1 AND fecha = $2 AND estado = 'abierto'`,
        [ctx.sucursal_id, activationDate],
    );
    assert(openBeforeClose.rows[0].total === 1, 'La apertura se perdió antes del cierre');
    const closed = await client.query(
        `SELECT * FROM public.cerrar_caja_fisica(
            $1, $2, 'Prueba transaccional',
            $3, $4, NULL, 'Cierre de prueba con rollback'
        )`,
        [ctx.sucursal_id, activationDate, expected.ars, expected.usd],
    );

    assert(closed.rows[0]?.estado === 'cerrado', 'La caja no quedó cerrada');
    assert(closeEnough(closed.rows[0].diferencia_ars, 0), 'Diferencia ARS inesperada');
    assert(closeEnough(closed.rows[0].diferencia_usd, 0), 'Diferencia USD inesperada');

    currentStep = 'vinculación y snapshot';
    const linked = await client.query(
        `SELECT
            (SELECT COUNT(*) FROM caja_recepcion_movimientos
             WHERE concepto_nombre LIKE 'PRUEBA TRANSACCIONAL%' AND caja_arqueo_id = $1) AS recepcion,
            (SELECT COUNT(*) FROM caja_admin_movimientos
             WHERE descripcion LIKE 'PRUEBA TRANSACCIONAL%' AND caja_arqueo_id = $1) AS administracion,
            (SELECT COUNT(*) FROM transferencias_caja
             WHERE motivo = 'PRUEBA TRANSACCIONAL' AND caja_arqueo_id = $1) AS retiros,
            (SELECT COUNT(*) FROM caja_transicion_snapshots
             WHERE sucursal_id = $2 AND etiqueta = 'primera-apertura-2026-07-31') AS snapshots`,
        [closed.rows[0].id, ctx.sucursal_id],
    );

    assert(Number(linked.rows[0].recepcion) === 2, 'No se vincularon movimientos de Recepción');
    assert(Number(linked.rows[0].administracion) === 1, 'No se vinculó el egreso administrativo');
    assert(Number(linked.rows[0].retiros) === 3, 'No se vincularon los tres retiros');
    assert(Number(linked.rows[0].snapshots) === 1, 'No se creó el snapshot de primera apertura');

    currentStep = 'bloqueo post-cierre';
    await impersonate(ctx.reception_id);
    await expectDatabaseError(
        client,
        'movimiento_despues_del_cierre',
        () => client.query(
            `INSERT INTO caja_recepcion_movimientos (
                concepto_nombre, categoria, monto, moneda, metodo_pago, estado,
                usuario, fecha_movimiento, origen
            ) VALUES (
                'PRUEBA TRANSACCIONAL - POST CIERRE', 'Ingreso extraordinario',
                1, 'ARS', 'Efectivo', 'pagado',
                'Prueba transaccional', $1, 'manual'
            )`,
            [activationDate],
        ),
        'La caja física no está abierta',
    );

    await client.query('ROLLBACK');
    rolledBack = true;

    console.log(JSON.stringify({
        success: true,
        rollback: true,
        checks: [
            'owner abre',
            'recepcion ingresa',
            'recepcion gasta',
            'saldo negativo bloqueado',
            'liquidacion efectiva descuenta',
            'retiro recepcion descuenta',
            'retiro administracion descuenta',
            'retiro owner descuenta',
            'traspaso interno bloqueado',
            'cierre sin diferencia',
            'movimientos vinculados',
            'snapshot automatico',
            'post-cierre bloqueado',
        ],
    }, null, 2));
} catch (error) {
    if (!rolledBack) {
        try {
            await client.query('ROLLBACK');
            rolledBack = true;
        } catch {
            // La conexión puede haber terminado; no imprimir secretos.
        }
    }
    console.error(JSON.stringify({
        success: false,
        rollback: rolledBack,
        step: currentStep,
        error: error instanceof Error ? error.message : String(error),
        databaseContext: error?.where ?? null,
    }, null, 2));
    process.exitCode = 1;
} finally {
    await client.end();
}
