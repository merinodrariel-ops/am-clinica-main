import test from 'node:test';
import assert from 'node:assert/strict';
import { getExpenseCategoryComparisons } from './dashboard';

test('groups expenses and compares them with the previous period', () => {
        const result = getExpenseCategoryComparisons(
            [
                { subtipo: 'Liquidaciones', usd_equivalente_total: 800 },
                { subtipo: 'Liquidaciones', usd_equivalente_total: 200 },
                { subtipo: 'Materiales Dentales', usd_equivalente_total: 300 },
            ],
            [
                { subtipo: 'Liquidaciones', usd_equivalente_total: 750 },
                { subtipo: 'Materiales Dentales', usd_equivalente_total: 400 },
            ],
        );

        assert.deepEqual(result, [
            {
                categoria: 'Liquidaciones',
                actualUsd: 1000,
                anteriorUsd: 750,
                diferenciaUsd: 250,
                variacionPorcentaje: 33,
                esFijo: false,
            },
            {
                categoria: 'Materiales Dentales',
                actualUsd: 300,
                anteriorUsd: 400,
                diferenciaUsd: -100,
                variacionPorcentaje: -25,
                esFijo: false,
            },
        ]);
});

test('marks rent as fixed and groups categories outside the top limit as Otros', () => {
        const result = getExpenseCategoryComparisons(
            [
                { subtipo: 'Alquileres', usd_equivalente_total: 1000 },
                { subtipo: 'Expensas', usd_equivalente_total: 500 },
                { subtipo: 'Imprenta', usd_equivalente_total: 100 },
            ],
            [
                { subtipo: 'Alquileres', usd_equivalente_total: 1000 },
                { subtipo: 'Expensas', usd_equivalente_total: 400 },
                { subtipo: 'Imprenta', usd_equivalente_total: 80 },
            ],
            2,
        );

        assert.equal(result[0]?.esFijo, true);
        assert.deepEqual(result[2], {
            categoria: 'Otros',
            actualUsd: 100,
            anteriorUsd: 80,
            diferenciaUsd: 20,
            variacionPorcentaje: 25,
            esFijo: false,
        });
});
