import test from 'node:test';
import assert from 'node:assert/strict';

import { getCobroMensualFinanciacionUsd, type PlanFinanciacionDashboard } from './dashboard';

function plan(overrides: Partial<PlanFinanciacionDashboard>): PlanFinanciacionDashboard {
    return {
        id: 'plan-1',
        paciente_nombre: 'Paciente',
        tratamiento: 'Tratamiento',
        cuotas_total: 12,
        cuotas_pagadas: 0,
        monto_cuota_usd: 0,
        saldo_restante_usd: 0,
        estado: 'En curso',
        ...overrides,
    };
}

test('sums expected monthly financing charges for active plans with remaining installments', () => {
    const total = getCobroMensualFinanciacionUsd([
        plan({ id: 'a', cuotas_pagadas: 7, cuotas_total: 12, monto_cuota_usd: 280 }),
        plan({ id: 'b', cuotas_pagadas: 5, cuotas_total: 6, monto_cuota_usd: 833.33 }),
        plan({ id: 'c', cuotas_pagadas: 12, cuotas_total: 12, monto_cuota_usd: 1000 }),
        plan({ id: 'd', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 2613.34 }),
    ]);

    assert.equal(total, 3726.67);
});
