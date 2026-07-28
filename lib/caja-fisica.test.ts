import { describe, expect, it } from 'vitest';
import { normalizeSaldoCajaFisica } from './caja-fisica-model';

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
});
