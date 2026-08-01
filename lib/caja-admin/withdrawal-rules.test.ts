import assert from 'node:assert/strict';
import test from 'node:test';
import type { CuentaFinanciera } from './types';
import {
    cashWithdrawalLinesAreValid,
    getAccountsForMovement,
} from './withdrawal-rules';

const accounts: CuentaFinanciera[] = [
    {
        id: 'cash-usd',
        sucursal_id: 'madero',
        nombre_cuenta: 'Efectivo USD',
        tipo_cuenta: 'EFECTIVO',
        moneda: 'USD',
        activa: true,
        orden: 1,
    },
    {
        id: 'bank-usd',
        sucursal_id: 'madero',
        nombre_cuenta: 'Banco USD',
        tipo_cuenta: 'BANCO',
        moneda: 'USD',
        activa: true,
        orden: 2,
    },
];

test('retiro solo ofrece cuentas de efectivo', () => {
    assert.deepEqual(
        getAccountsForMovement(accounts, 'RETIRO').map((account) => account.id),
        ['cash-usd'],
    );
    assert.equal(getAccountsForMovement(accounts, 'EGRESO').length, 2);
});

test('retiro rechaza lineas bancarias y acepta efectivo', () => {
    assert.equal(cashWithdrawalLinesAreValid('RETIRO', [{ cuenta_id: 'bank-usd' }], accounts), false);
    assert.equal(cashWithdrawalLinesAreValid('RETIRO', [{ cuenta_id: 'cash-usd' }], accounts), true);
    assert.equal(cashWithdrawalLinesAreValid('RETIRO', [], accounts), false);
});
