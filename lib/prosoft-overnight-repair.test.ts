import assert from 'node:assert/strict';
import test from 'node:test';
import { repairOvernightExitMarks } from './prosoft-overnight-repair';

test('uses a single early next-day mark as the missing overnight exit', () => {
    const repaired = repairOvernightExitMarks([
        {
            fecha: '2026-05-29',
            entrada: '12:08',
            salida: '00:00',
            horas: 0,
            incompleto: true,
            requiereRevision: true,
            motivoObservado: 'FaltaEgreso',
            marcaciones: ['12:08'],
        },
        {
            fecha: '2026-05-30',
            entrada: '00:49',
            salida: '00:00',
            horas: 0,
            incompleto: true,
            requiereRevision: true,
            motivoObservado: 'FaltaEgreso',
            marcaciones: ['00:49'],
        },
    ]);

    assert.equal(repaired.length, 1);
    assert.equal(repaired[0].fecha, '2026-05-29');
    assert.equal(repaired[0].salida, '00:49');
    assert.equal(repaired[0].salidaDiaSiguiente, true);
    assert.equal(repaired[0].horas, 12.68);
    assert.equal(repaired[0].requiereRevision, false);
    assert.equal(repaired[0].motivoObservado, undefined);
});

test('repairs the May 2026 overnight import cases for Claudia, Georgi and Mika', () => {
    const cases = [
        ['Claudia', '2026-05-29', '12:08', '2026-05-30', '00:49', 12.68],
        ['Georgi', '2026-05-14', '10:45', '2026-05-15', '02:42', 15.95],
        ['Georgi', '2026-05-22', '15:02', '2026-05-23', '00:17', 9.25],
        ['Mika', '2026-05-21', '14:18', '2026-05-22', '00:09', 9.85],
        ['Mika', '2026-05-29', '13:25', '2026-05-30', '00:22', 10.95],
    ] as const;

    for (const [name, startDate, entry, nextDate, earlyExit, expectedHours] of cases) {
        const repaired = repairOvernightExitMarks([
            {
                fecha: startDate,
                entrada: entry,
                salida: '00:00',
                horas: 0,
                incompleto: true,
                requiereRevision: true,
                motivoObservado: 'FaltaEgreso',
                marcaciones: [entry],
            },
            {
                fecha: nextDate,
                entrada: earlyExit,
                salida: '00:00',
                horas: 0,
                incompleto: true,
                requiereRevision: true,
                motivoObservado: 'FaltaEgreso',
                marcaciones: [earlyExit],
            },
        ]);

        assert.equal(repaired.length, 1, name);
        assert.equal(repaired[0].fecha, startDate, name);
        assert.equal(repaired[0].salida, earlyExit, name);
        assert.equal(repaired[0].salidaDiaSiguiente, true, name);
        assert.equal(repaired[0].horas, expectedHours, name);
        assert.equal(repaired[0].motivoObservado, undefined, name);
    }
});
