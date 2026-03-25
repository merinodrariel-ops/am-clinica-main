import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldRegenerateReceiptAfterEdit } from './receipt-regeneration';

test('regenerates receipt when paid movement changes amount or currency', () => {
    const result = shouldRegenerateReceiptAfterEdit(
        {
            monto: 100000,
            moneda: 'USD',
            metodo_pago: 'Transferencia',
            concepto_nombre: 'Seña',
            estado: 'pagado',
            fecha_hora: '2026-03-25T14:00:00.000Z',
            fecha_movimiento: '2026-03-25',
        },
        {
            monto: 100000,
            moneda: 'ARS',
            metodo_pago: 'Transferencia',
            concepto_nombre: 'Seña',
            estado: 'pagado',
            fecha_movimiento: '2026-03-25',
        }
    );

    assert.equal(result, true);
});

test('does not regenerate receipt when non-receipt fields are unchanged', () => {
    const result = shouldRegenerateReceiptAfterEdit(
        {
            monto: 100000,
            moneda: 'ARS',
            metodo_pago: 'Transferencia',
            concepto_nombre: 'Seña',
            estado: 'pagado',
            fecha_hora: '2026-03-25T14:00:00.000Z',
            fecha_movimiento: '2026-03-25',
        },
        {
            monto: 100000,
            moneda: 'ARS',
            metodo_pago: 'Transferencia',
            concepto_nombre: 'Seña',
            estado: 'pagado',
            fecha_movimiento: '2026-03-25',
        }
    );

    assert.equal(result, false);
});

test('does not regenerate receipt for non-paid movements', () => {
    const result = shouldRegenerateReceiptAfterEdit(
        {
            monto: 100000,
            moneda: 'USD',
            metodo_pago: 'Transferencia',
            concepto_nombre: 'Seña',
            estado: 'pendiente',
            fecha_hora: '2026-03-25T14:00:00.000Z',
            fecha_movimiento: '2026-03-25',
        },
        {
            monto: 100000,
            moneda: 'ARS',
            metodo_pago: 'Transferencia',
            concepto_nombre: 'Seña',
            estado: 'pendiente',
            fecha_movimiento: '2026-03-25',
        }
    );

    assert.equal(result, false);
});
