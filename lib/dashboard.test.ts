import test from 'node:test';
import assert from 'node:assert/strict';

import {
    getCobroMensualFinanciacionUsd,
    getFinanciacionMensualResumen,
    type PlanFinanciacionDashboard,
} from './dashboard';

function plan(overrides: Partial<PlanFinanciacionDashboard>): PlanFinanciacionDashboard {
    return {
        id: 'plan-1',
        paciente_nombre: 'Paciente',
        tratamiento: 'Tratamiento',
        cuotas_total: 12,
        cuotas_pagadas: 0,
        monto_cuota_usd: 0,
        saldo_restante_usd: 0,
        fecha_inicio: '2026-05-01',
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

test('keeps programmed financing as the main monthly asset and separates collected from pending installments', () => {
    const resumen = getFinanciacionMensualResumen(
        [
            plan({ id: 'a', fecha_inicio: '2026-05-01', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 1000 }),
            plan({ id: 'b', fecha_inicio: '2026-05-01', cuotas_pagadas: 2, cuotas_total: 12, monto_cuota_usd: 900 }),
            plan({ id: 'c', fecha_inicio: '2026-04-01', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 500 }),
            plan({ id: 'd', fecha_inicio: '2026-05-01', cuotas_pagadas: 12, cuotas_total: 12, monto_cuota_usd: 700 }),
        ],
        new Date(2026, 5, 1),
    );

    assert.deepEqual(resumen, {
        programadoUsd: 2400,
        cobradoUsd: 900,
        pendienteUsd: 1500,
    });
});
