import test from 'node:test';
import assert from 'node:assert/strict';

import {
    canManagePatients,
    canViewPatientContactData,
    canViewPatientFinancialData,
    canViewPatientRecords,
} from './patient-access';

test('laboratorio can view patient records but not financial data', () => {
    assert.equal(canViewPatientRecords('laboratorio'), true);
    assert.equal(canManagePatients('laboratorio'), false);
    assert.equal(canViewPatientFinancialData('laboratorio'), false);
    assert.equal(canViewPatientContactData('laboratorio'), false);
});

test('admin can manage patients and view patient financial data', () => {
    assert.equal(canViewPatientRecords('admin'), true);
    assert.equal(canManagePatients('admin'), true);
    assert.equal(canViewPatientFinancialData('admin'), true);
    assert.equal(canViewPatientContactData('admin'), true);
});

test('unknown roles do not get patient access by default', () => {
    assert.equal(canViewPatientRecords('google_user'), false);
    assert.equal(canManagePatients('google_user'), false);
    assert.equal(canViewPatientFinancialData('google_user'), false);
});
