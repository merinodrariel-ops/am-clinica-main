import assert from 'node:assert/strict';
import test from 'node:test';
import {
    shouldDeleteOrphanObservedImportRegistro,
    shouldOverwriteExistingRegistro,
} from './prosoft-reimport-policy';

test('reimport policy preserves human-corrected records', () => {
    assert.equal(
        shouldOverwriteExistingRegistro({
            id: 'manual',
            fecha: '2026-05-29',
            horas: 0,
            estado: 'Registrado',
            observaciones: '[CORREGIDO] Camaras',
        }, false),
        false
    );
});

test('reimport policy preserves valid registered records with hours', () => {
    assert.equal(
        shouldOverwriteExistingRegistro({
            id: 'valid',
            fecha: '2026-05-14',
            horas: 13.83,
            estado: 'Registrado',
            observaciones: 'Importado desde archivo local (2026-05)',
        }, false),
        false
    );
});

test('reimport policy does not downgrade valid records when incoming row is observed', () => {
    assert.equal(
        shouldOverwriteExistingRegistro({
            id: 'valid',
            fecha: '2026-05-14',
            horas: 13.83,
            estado: 'Registrado',
            observaciones: 'Importado desde archivo local (2026-05)',
        }, true),
        false
    );
});

test('reimport policy allows replacing import-generated observed records', () => {
    assert.equal(
        shouldOverwriteExistingRegistro({
            id: 'observed',
            fecha: '2026-05-29',
            horas: 0,
            estado: 'Observado',
            motivo_observado: 'FaltaEgreso',
            observaciones: 'Registro observado por control automático (FaltaEgreso) — Local 2026-05',
        }, false),
        true
    );
});

test('reimport policy deletes only orphaned import-generated zero-hour observations', () => {
    const previewDates = new Set(['2026-05-29']);

    assert.equal(
        shouldDeleteOrphanObservedImportRegistro({
            previewDates,
            source: 'Local',
            mes: '2026-05',
            row: {
                id: 'orphan',
                fecha: '2026-05-30',
                horas: 0,
                estado: 'Observado',
                motivo_observado: 'FaltaEgreso',
                observaciones: 'Registro observado por control automático (FaltaEgreso) — Local 2026-05',
            },
        }),
        true
    );

    assert.equal(
        shouldDeleteOrphanObservedImportRegistro({
            previewDates,
            source: 'Local',
            mes: '2026-05',
            row: {
                id: 'manual',
                fecha: '2026-05-30',
                horas: 0,
                estado: 'Observado',
                motivo_observado: 'FaltaEgreso',
                observaciones: '[CORREGIDO] revisar con camaras',
            },
        }),
        false
    );
});
