import assert from 'node:assert/strict';
import test from 'node:test';
import { canManagePatientDrive, canUploadPatientDrive } from './patient-drive-access';

test('laboratorio can upload and manage patient Drive files', () => {
    assert.equal(canUploadPatientDrive('laboratorio'), true);
    assert.equal(canManagePatientDrive('laboratorio'), true);
    assert.equal(canManagePatientDrive('lab'), true);
    assert.equal(canManagePatientDrive('technician'), true);
});

test('financial and viewer roles do not gain patient Drive management', () => {
    assert.equal(canManagePatientDrive('partner_viewer'), false);
    assert.equal(canManagePatientDrive('pricing_manager'), false);
    assert.equal(canManagePatientDrive(null), false);
});
