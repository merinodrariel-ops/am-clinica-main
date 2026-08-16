import test from 'node:test';
import assert from 'node:assert/strict';

import { getCategoryDefault, resolveModuleAccess } from './access-overrides';

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

test('marketing only inherits read access to patients', () => {
    assert.equal(getCategoryDefault('marketing', 'patients'), 'read');
    assert.equal(getCategoryDefault('marketing', 'agenda'), 'none');
    assert.equal(getCategoryDefault('marketing', 'caja_admin'), 'none');
    assert.equal(getCategoryDefault('marketing', 'portal'), 'none');
});

test('temporary grants elevate inherited access but do not bypass explicit denies', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    assert.equal(resolveModuleAccess('odontologo', 'caja_recepcion', null, [
        { module_key: 'caja_recepcion', access_level: 'read', expires_at: future },
    ]), 'read');
    assert.equal(resolveModuleAccess('odontologo', 'caja_recepcion', { caja_recepcion: 'none' }, [
        { module_key: 'caja_recepcion', access_level: 'edit', expires_at: future },
    ]), 'none');
});
