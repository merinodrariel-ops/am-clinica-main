import test from 'node:test';
import assert from 'node:assert/strict';
import {
    calculateDailyAdminExpenseSummaryUsd,
    calculateMonthlyAdminExpensesUsd,
} from './expense-metrics';

const accounts = [
    { id: 'bank', tipo_cuenta: 'BANCO' },
    { id: 'cash', tipo_cuenta: 'EFECTIVO' },
];

const movements = [
    {
        tipo_movimiento: 'EGRESO', estado: 'Registrado', fecha_movimiento: '2026-08-07', usd_equivalente_total: 300,
        caja_admin_movimiento_lineas: [{ cuenta_id: 'bank', usd_equivalente: 300 }],
    },
    {
        tipo_movimiento: 'EGRESO', estado: 'Registrado', fecha_movimiento: '2026-08-07', usd_equivalente_total: 125,
        caja_admin_movimiento_lineas: [{ cuenta_id: 'cash', usd_equivalente: 125 }],
    },
    {
        tipo_movimiento: 'EGRESO', estado: 'Registrado', fecha_movimiento: '2026-08-06', usd_equivalente_total: 900,
        caja_admin_movimiento_lineas: [{ cuenta_id: 'cash', usd_equivalente: 900 }],
    },
    { tipo_movimiento: 'RETIRO', estado: 'Registrado', fecha_movimiento: '2026-08-07', usd_equivalente_total: 1000 },
    { tipo_movimiento: 'EGRESO', estado: 'Anulado', fecha_movimiento: '2026-08-07', usd_equivalente_total: 500 },
];

test('daily admin expenses use the operating date and split bank from physical cash', () => {
    assert.deepEqual(calculateDailyAdminExpenseSummaryUsd(movements, accounts, '2026-08-07'), {
        totalUsd: 425,
        bankUsd: 300,
        cashUsd: 125,
        otherUsd: 0,
    });
});

test('monthly admin expenses keep only active EGRESO movements', () => {
    assert.equal(calculateMonthlyAdminExpensesUsd(movements), 1325);
});
