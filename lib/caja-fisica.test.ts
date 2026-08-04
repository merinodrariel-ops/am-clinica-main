import { describe, expect, it } from 'vitest';
import {
    canOpenCajaFisica,
    normalizeSaldoCajaFisica,
    resolveSaldoCajaFisicaForDate,
} from './caja-fisica-model';

describe('caja física unificada', () => {
    it('normaliza a números el saldo devuelto por Postgres', () => {
        expect(normalizeSaldoCajaFisica({
            activa: true,
            fecha_activacion: '2026-08-01',
            estado: 'abierto',
            ars: '150000' as unknown as number,
            usd: '725.50' as unknown as number,
            movimientos_recepcion_ars: '50000' as unknown as number,
            movimientos_admin_ars: '-10000' as unknown as number,
        })).toMatchObject({
            activa: true,
            ars: 150000,
            usd: 725.5,
            movimientos_recepcion_ars: 50000,
            movimientos_admin_ars: -10000,
        });
    });

    it('usa un saldo seguro cuando la RPC no devuelve valores', () => {
        expect(normalizeSaldoCajaFisica(null)).toEqual(expect.objectContaining({
            activa: false,
            estado: 'no_configurada',
            ars: 0,
            usd: 0,
        }));
    });

    it('permite abrir un nuevo día después del cierre anterior', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'cerrado',
            arqueo_id: 'arqueo-viernes',
            ars: 93310,
            usd: 3810,
        });

        expect(resolveSaldoCajaFisicaForDate(
            saldo,
            '2026-07-31',
            '2026-08-03',
        )).toMatchObject({
            estado: 'sin_abrir',
            arqueo_id: null,
            ars: 93310,
            usd: 3810,
        });
    });

    it('mantiene cerrado cuando el cierre pertenece al mismo día', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'cerrado',
            arqueo_id: 'arqueo-lunes',
            ars: 93310,
            usd: 3810,
        });

        expect(resolveSaldoCajaFisicaForDate(
            saldo,
            '2026-08-03',
            '2026-08-03',
        )).toMatchObject({
            estado: 'cerrado',
            arqueo_id: 'arqueo-lunes',
        });
    });

    it('permite a admin reabrir una caja cerrada durante el mismo día', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'cerrado',
            arqueo_id: 'arqueo-hoy',
            ars: 1000,
            usd: 100,
        });

        expect(canOpenCajaFisica(saldo, 'admin')).toBe(true);
    });

    it('no permite abrir caja a perfiles sin permiso operativo', () => {
        const saldo = normalizeSaldoCajaFisica({
            activa: true,
            estado: 'sin_abrir',
            ars: 1000,
            usd: 100,
        });

        expect(canOpenCajaFisica(saldo, 'partner_viewer')).toBe(false);
        expect(canOpenCajaFisica(saldo, null)).toBe(false);
    });
});
