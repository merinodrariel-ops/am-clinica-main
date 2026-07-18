import { describe, expect, it } from 'vitest';
import { calculateMonthlyAdminExpensesUsd } from './expense-metrics';

describe('calculateMonthlyAdminExpensesUsd', () => {
    it('counts only real expenses and excludes withdrawals and transfers', () => {
        expect(calculateMonthlyAdminExpensesUsd([
            { tipo_movimiento: 'EGRESO', estado: 'Registrado', usd_equivalente_total: 1250 },
            { tipo_movimiento: 'RETIRO', estado: 'Registrado', usd_equivalente_total: 4000 },
            { tipo_movimiento: 'TRANSFERENCIA', estado: 'Registrado', usd_equivalente_total: 6000 },
            { tipo_movimiento: 'CAMBIO_MONEDA', estado: 'Registrado', usd_equivalente_total: 3000 },
        ])).toBe(1250);
    });

    it('excludes annulled expenses regardless of capitalization', () => {
        expect(calculateMonthlyAdminExpensesUsd([
            { tipo_movimiento: 'EGRESO', estado: 'Anulado', usd_equivalente_total: 500 },
            { tipo_movimiento: 'EGRESO', estado: 'anulado', usd_equivalente_total: 700 },
            { tipo_movimiento: 'EGRESO', estado: 'Registrado', usd_equivalente_total: 300 },
        ])).toBe(300);
    });
});
