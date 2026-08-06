import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    canOpenCajaFisica,
    normalizeSaldoCajaFisica,
    resolveSaldoCajaFisicaForDate,
} from './caja-fisica-model';

describe('caja física unificada', () => {
    it('normaliza a números el saldo devuelto por Postgres', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            fecha_activacion: '2026-08-01',
            estado: 'abierto',
            ars: '150000' as unknown as number,
            usd: '725.50' as unknown as number,
            movimientos_recepcion_ars: '50000' as unknown as number,
            movimientos_admin_ars: '-10000' as unknown as number,
        });

        assert.equal(saldo.activa, true);
        assert.equal(saldo.ars, 150000);
        assert.equal(saldo.usd, 725.5);
        assert.equal(saldo.movimientos_recepcion_ars, 50000);
        assert.equal(saldo.movimientos_admin_ars, -10000);
    });

    it('usa un saldo seguro cuando la RPC no devuelve valores', () => {
        const saldo = normalizeSaldoCajaFisica(null);

        assert.equal(saldo.activa, false);
        assert.equal(saldo.estado, 'no_configurada');
        assert.equal(saldo.ars, 0);
        assert.equal(saldo.usd, 0);
    });

    it('permite abrir un nuevo día después del cierre anterior', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'cerrado',
            arqueo_id: 'arqueo-viernes',
            ars: 93310,
            usd: 3810,
        });

        const resolved = resolveSaldoCajaFisicaForDate(
            saldo,
            '2026-07-31',
            '2026-08-03',
        );

        assert.equal(resolved.estado, 'sin_abrir');
        assert.equal(resolved.arqueo_id, null);
        assert.equal(resolved.arqueo_fecha, '2026-07-31');
        assert.equal(resolved.ars, 93310);
        assert.equal(resolved.usd, 3810);
    });

    it('mantiene cerrado cuando el cierre pertenece al mismo día', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'cerrado',
            arqueo_id: 'arqueo-lunes',
            ars: 93310,
            usd: 3810,
        });

        const resolved = resolveSaldoCajaFisicaForDate(
            saldo,
            '2026-08-03',
            '2026-08-03',
        );

        assert.equal(resolved.estado, 'cerrado');
        assert.equal(resolved.arqueo_id, 'arqueo-lunes');
        assert.equal(resolved.arqueo_fecha, '2026-08-03');
    });

    it('marca una apertura anterior como pendiente de cierre', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'abierto',
            arqueo_id: 'arqueo-martes',
            ars: 1008860,
            usd: 10460,
        });

        const resolved = resolveSaldoCajaFisicaForDate(
            saldo,
            '2026-08-05',
            '2026-08-06',
        );

        assert.equal(resolved.estado, 'abierto_anterior');
        assert.equal(resolved.arqueo_id, 'arqueo-martes');
        assert.equal(resolved.arqueo_fecha, '2026-08-05');
        assert.equal(canOpenCajaFisica(resolved, 'owner'), false);
    });

    it('permite a admin reabrir una caja cerrada durante el mismo día', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'cerrado',
            arqueo_id: 'arqueo-hoy',
            ars: 1000,
            usd: 100,
        });

        assert.equal(canOpenCajaFisica(saldo, 'admin'), true);
    });

    it('no permite abrir caja a perfiles sin permiso operativo', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'sin_abrir',
            ars: 1000,
            usd: 100,
        });

        assert.equal(canOpenCajaFisica(saldo, 'partner_viewer'), false);
        assert.equal(canOpenCajaFisica(saldo, null), false);
    });
});
