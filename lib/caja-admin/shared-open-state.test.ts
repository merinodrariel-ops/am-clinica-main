import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
    new URL('../../components/caja/CajaFisicaPanel.tsx', import.meta.url),
    'utf8',
);
const movementsSource = readFileSync(
    new URL('../../components/caja-admin/MovimientosTab.tsx', import.meta.url),
    'utf8',
);
const receptionSource = readFileSync(
    new URL('../../app/caja-recepcion/CajaRecepcionClient.tsx', import.meta.url),
    'utf8',
);

test('Caja Administración derives availability from the shared physical cashbox status', () => {
    assert.match(panelSource, /onSaldoChange\?\.\(current\)/);
    assert.match(movementsSource, /onSaldoChange=\{\(saldo\) => setIsCajaAbierta\(saldo\.estado === "abierto"\)\}/);
    assert.doesNotMatch(movementsSource, /getAperturaAdminDelDia/);
});

test('Caja Recepción audits today against the unified physical cashbox after activation', () => {
    assert.match(receptionSource, /cajaFisicaActiva && sucursalCaja/);
    assert.match(receptionSource, /\.from\('caja_arqueos'\)/);
    assert.match(receptionSource, /usuario:usuario_apertura, hora_inicio:hora_apertura/);
});
