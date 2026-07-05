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
        cobradoUsd: 1900,
        pendienteUsd: 500,
    });
});

test('includes future first-due plans in the stable monthly programmed total', () => {
    const resumen = getFinanciacionMensualResumen(
        [
            plan({ id: 'first', fecha_inicio: '2026-07-07', cuotas_pagadas: 0, cuotas_total: 12, monto_cuota_usd: 578 }),
        ],
        new Date(2026, 6, 1),
    );

    assert.deepEqual(resumen, {
        programadoUsd: 578,
        cobradoUsd: 0,
        pendienteUsd: 0,
    });
});

test('excludes plans whose first due month is after the dashboard month', () => {
    const resumen = getFinanciacionMensualResumen(
        [
            plan({ id: 'july', fecha_inicio: '2026-07-07', cuotas_pagadas: 0, cuotas_total: 12, monto_cuota_usd: 578 }),
            plan({ id: 'august', fecha_inicio: '2026-08-07', cuotas_pagadas: 0, cuotas_total: 12, monto_cuota_usd: 1540 }),
        ],
        new Date(2026, 6, 1),
    );

    assert.deepEqual(resumen, {
        programadoUsd: 578,
        cobradoUsd: 0,
        pendienteUsd: 0,
    });
});

test('includes all July financing installments when first due dates fall in July', () => {
    const resumen = getFinanciacionMensualResumen(
        [
            plan({ id: 'a', fecha_inicio: '2025-09-12', cuotas_pagadas: 9, cuotas_total: 12, monto_cuota_usd: 653.33 }),
            plan({ id: 'b', fecha_inicio: '2025-10-16', cuotas_pagadas: 8, cuotas_total: 12, monto_cuota_usd: 56 }),
            plan({ id: 'c', fecha_inicio: '2025-10-17', cuotas_pagadas: 8, cuotas_total: 12, monto_cuota_usd: 233.33 }),
            plan({ id: 'd', fecha_inicio: '2025-12-26', cuotas_pagadas: 6, cuotas_total: 12, monto_cuota_usd: 373.33 }),
            plan({ id: 'e', fecha_inicio: '2026-06-07', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 917 }),
            plan({ id: 'f', fecha_inicio: '2026-06-07', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 1100 }),
            plan({ id: 'g', fecha_inicio: '2026-07-07', cuotas_pagadas: 0, cuotas_total: 12, monto_cuota_usd: 578 }),
            plan({ id: 'h', fecha_inicio: '2026-07-08', cuotas_pagadas: 0, cuotas_total: 3, monto_cuota_usd: 858 }),
        ],
        new Date(2026, 6, 1),
    );

    assert.deepEqual(resumen, {
        programadoUsd: 4768.99,
        cobradoUsd: 2017,
        pendienteUsd: 1315.9899999999998,
    });
});

test('uses real cashbox quota payments for monthly collected and does not create false current debt', () => {
    const resumen = getFinanciacionMensualResumen(
        [
            plan({ id: 'a', fecha_inicio: '2025-09-12', cuotas_pagadas: 9, cuotas_total: 12, monto_cuota_usd: 653.33 }),
            plan({ id: 'b', fecha_inicio: '2025-10-16', cuotas_pagadas: 8, cuotas_total: 12, monto_cuota_usd: 56 }),
            plan({ id: 'c', fecha_inicio: '2025-10-17', cuotas_pagadas: 8, cuotas_total: 12, monto_cuota_usd: 233.33 }),
            plan({ id: 'd', fecha_inicio: '2025-12-26', cuotas_pagadas: 6, cuotas_total: 12, monto_cuota_usd: 373.33 }),
            plan({ id: 'e', fecha_inicio: '2026-06-07', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 917 }),
            plan({ id: 'f', fecha_inicio: '2026-06-07', cuotas_pagadas: 1, cuotas_total: 12, monto_cuota_usd: 1100 }),
            plan({ id: 'g', fecha_inicio: '2026-07-07', cuotas_pagadas: 0, cuotas_total: 12, monto_cuota_usd: 578 }),
            plan({ id: 'h', fecha_inicio: '2026-07-08', cuotas_pagadas: 0, cuotas_total: 3, monto_cuota_usd: 858 }),
        ],
        new Date(2026, 6, 1),
        3332.99,
    );

    assert.deepEqual(resumen, {
        programadoUsd: 4768.99,
        cobradoUsd: 3332.99,
        pendienteUsd: 0,
    });
});
