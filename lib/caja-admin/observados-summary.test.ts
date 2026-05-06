import test from 'node:test';
import assert from 'node:assert/strict';

import { summarizeCriticalObservedLeaders } from './observados-summary';

test('summarizeCriticalObservedLeaders groups only records older than 48 hours', () => {
    const nowMs = new Date('2026-05-06T12:00:00.000Z').getTime();

    const result = summarizeCriticalObservedLeaders([
        {
            personal_id: 'p1',
            created_at: '2026-05-03T11:59:00.000Z',
            fecha: '2026-05-03',
            personal: { nombre: 'Ana', apellido: 'Diaz' },
        },
        {
            personal_id: 'p1',
            created_at: '2026-05-01T09:00:00.000Z',
            fecha: '2026-05-01',
            personal: { nombre: 'Ana', apellido: 'Diaz' },
        },
        {
            personal_id: 'p2',
            created_at: '2026-05-05T12:00:00.000Z',
            fecha: '2026-05-05',
            personal: { nombre: 'Bruno', apellido: 'Ruiz' },
        },
    ], { nowMs, limit: 3 });

    assert.deepEqual(result, [
        {
            personal_id: 'p1',
            nombre: 'Ana',
            apellido: 'Diaz',
            critical_count: 2,
        },
    ]);
});
