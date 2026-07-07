import assert from 'node:assert/strict';
import test from 'node:test';

import {
    assertAllowedOperator,
    buildCashSummary,
    buildCommandHelp,
    buildMonthWindow,
    buildPatientSearchPreview,
    buildProviderServiceSummary,
    matchesProviderServiceQuery,
    parseAdminAgentCommand,
    redactEmail,
    redactPhone,
} from './core';

test('allows only internal administrative categories to use the admin agent', () => {
    assert.doesNotThrow(() => assertAllowedOperator({ email: 'owner@clinica.com', categoria: 'owner' }));
    assert.doesNotThrow(() => assertAllowedOperator({ email: 'admin@clinica.com', categoria: 'admin' }));
    assert.doesNotThrow(() => assertAllowedOperator({ email: 'dev@clinica.com', categoria: 'developer' }));

    assert.throws(
        () => assertAllowedOperator({ email: 'recepcion@clinica.com', categoria: 'reception' }),
        /not allowed to use AM Admin Agent/
    );
});

test('parses the supported read-only admin agent commands', () => {
    assert.deepEqual(parseAdminAgentCommand([]), { kind: 'overview' });
    assert.deepEqual(parseAdminAgentCommand(['overview']), { kind: 'overview' });
    assert.deepEqual(parseAdminAgentCommand(['patient', '  Gustavo Oro  ']), { kind: 'patient', query: 'Gustavo Oro' });
    assert.deepEqual(parseAdminAgentCommand(['agenda', 'week']), { kind: 'agenda', range: 'week' });
    assert.deepEqual(parseAdminAgentCommand(['cash', '2026-07']), { kind: 'cash', month: '2026-07' });
    assert.deepEqual(parseAdminAgentCommand(['provider-services', 'Julian', '2026-06', '--paid-month', '2026-07', 'definitivas']), {
        kind: 'provider_services',
        providerQuery: 'Julian',
        serviceMonth: '2026-06',
        paymentMonth: '2026-07',
        serviceQuery: 'definitivas',
    });
    assert.deepEqual(parseAdminAgentCommand(['emails', '14']), { kind: 'emails', days: 14 });

    assert.throws(() => parseAdminAgentCommand(['sql', 'select * from pacientes']), /Unsupported admin agent command/);
    assert.throws(() => parseAdminAgentCommand(['patient']), /patient command requires a search query/);
    assert.throws(() => parseAdminAgentCommand(['provider-services', 'Julian', '2026-06', '--paid-month', 'julio']), /paid month must use YYYY-MM/);
});

test('summarizes provider services by validation and service name', () => {
    const summary = buildProviderServiceSummary([
        {
            prestacion_nombre: 'Pieza dentaria definitiva',
            monto_honorarios: 100,
            slides_url: 'https://drive.google.com/slides/1',
        },
        {
            prestacion_nombre: 'Pieza dentaria definitiva',
            monto_honorarios: '120',
            slides_validado: true,
        },
        {
            prestacion_nombre: 'Provisorio',
            monto_honorarios: 50,
            slides_url: null,
            slides_validado: false,
        },
    ]);

    assert.deepEqual(summary, {
        total: 3,
        validated: 2,
        pendingEvidence: 1,
        totalHonorarios: 270,
        byService: [
            { service: 'Pieza dentaria definitiva', count: 2 },
            { service: 'Provisorio', count: 1 },
        ],
    });
});

test('matches provider service filters despite plural clinical wording', () => {
    assert.equal(matchesProviderServiceQuery('Encerado Definitivo', 'piezas dentarias definitivas'), true);
    assert.equal(matchesProviderServiceQuery('Encerado x pieza dental', 'piezas dentarias definitivas'), false);
});

test('builds Argentina month windows with an exclusive next-month end', () => {
    assert.deepEqual(buildMonthWindow('2026-07'), {
        month: '2026-07',
        startIso: '2026-07-01T03:00:00.000Z',
        endIso: '2026-08-01T03:00:00.000Z',
    });
});

test('summarizes cash movements without dumping rows', () => {
    const summary = buildCashSummary('2026-07', [
        { source: 'reception', estado: 'pagado', tipo_movimiento: 'ingreso', usd_equivalente: 100 },
        { source: 'reception', estado: 'anulado', tipo_movimiento: 'ingreso', usd_equivalente: 999 },
        { source: 'admin', estado: 'pagado', tipo_movimiento: 'egreso', usd_equivalente: 45.5 },
        { source: 'admin', estado: 'pagado', tipo_movimiento: 'ingreso', usd_equivalente: 12.25 },
    ]);

    assert.deepEqual(summary, {
        month: '2026-07',
        receptionIncomeUsd: 100,
        adminIncomeUsd: 12.25,
        adminExpenseUsd: 45.5,
        netUsd: 66.75,
        movementCount: 3,
    });
});

test('redacts direct contact details in patient previews', () => {
    assert.equal(redactEmail('persona@example.com'), 'p*****a@example.com');
    assert.equal(redactPhone('+54 9 11 1234-5678'), '+54 9 11 **** 5678');

    const preview = buildPatientSearchPreview([
        {
            id_paciente: 'p1',
            nombre: 'Gustavo',
            apellido: 'Oro',
            email: 'gustavo@example.com',
            whatsapp: '+54 9 11 1234-5678',
            estado_paciente: 'activo',
            financ_estado: 'activo',
        },
    ]);

    assert.deepEqual(preview, [
        {
            id: 'p1',
            nombre: 'Gustavo Oro',
            email: 'g*****o@example.com',
            whatsapp: '+54 9 11 **** 5678',
            estado: 'activo',
            financEstado: 'activo',
        },
    ]);
});

test('help text advertises supported commands and not direct SQL', () => {
    const help = buildCommandHelp();
    assert.match(help, /overview/);
    assert.match(help, /patient <busqueda>/);
    assert.doesNotMatch(help.toLowerCase(), /select \*/);
});
