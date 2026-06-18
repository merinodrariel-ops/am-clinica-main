import test from 'node:test';
import assert from 'node:assert/strict';

import { getCategoryDefault } from './access-overrides';

test('odontologo never gets access to financial modules by default', () => {
    assert.equal(getCategoryDefault('odontologo', 'caja_recepcion'), 'none');
    assert.equal(getCategoryDefault('odontologo', 'caja_admin'), 'none');
    assert.equal(getCategoryDefault('odontologo', 'liquidaciones'), 'none');
});

test('portal remains available for clinical roles and financial modules stay locked to admin', () => {
    assert.equal(getCategoryDefault('odontologo', 'portal'), 'full');
    assert.equal(getCategoryDefault('admin', 'caja_recepcion'), 'full');
    assert.equal(getCategoryDefault('reception', 'caja_admin'), 'none');
});
