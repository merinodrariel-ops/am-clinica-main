import assert from 'node:assert/strict';
import test from 'node:test';
import {
    canManagePatientDrive,
    canUploadPatientDrive,
    canUploadPatientDriveMimeType,
    isMarketingMediaMimeType,
} from './patient-drive-access';

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

test('marketing media filter only accepts images and videos', () => {
    assert.equal(isMarketingMediaMimeType('image/jpeg'), true);
    assert.equal(isMarketingMediaMimeType('video/mp4'), true);
    assert.equal(isMarketingMediaMimeType('application/pdf'), false);
    assert.equal(isMarketingMediaMimeType('application/zip'), false);
});

test('marketing can upload videos but cannot upload or manage other patient files', () => {
    assert.equal(canUploadPatientDrive('marketing'), true);
    assert.equal(canUploadPatientDriveMimeType('marketing', 'video/mp4'), true);
    assert.equal(canUploadPatientDriveMimeType('marketing', 'video/quicktime'), true);
    assert.equal(canUploadPatientDriveMimeType('marketing', 'image/jpeg'), false);
    assert.equal(canUploadPatientDriveMimeType('marketing', 'application/pdf'), false);
    assert.equal(canManagePatientDrive('marketing'), false);
});
