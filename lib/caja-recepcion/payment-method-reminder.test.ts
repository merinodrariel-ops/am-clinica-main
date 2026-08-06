import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../../components/caja/NuevoIngresoForm.tsx', import.meta.url),
    'utf8',
);

test('installment entry keeps cash as the default while warning staff to confirm the payment method', () => {
    assert.match(source, /metodo_pago: 'Efectivo'/);
    assert.match(source, /formData\.es_cuota && baseInstallmentAmount > 0/);
    assert.match(source, /Antes de informar el monto/);
    assert.match(source, /Efectivo está seleccionado por defecto y no lleva recargo/);
});

test('the reminder exposes automatic surcharges and the live amount to quote', () => {
    assert.match(source, /Transferencia y Mercado Pago suman 10%; tarjetas suman 15%/);
    assert.match(source, /getPaymentSurcharge\(formData\.metodo_pago as MetodoPagoCuota\)/);
    assert.match(source, /Monto a informar: \{formatPaymentAmount\(quotedAmount, formData\.moneda\)\}/);
    assert.match(source, /Recargo \$\{Math\.round\(surcharge \* 100\)\}% incluido/);
});
