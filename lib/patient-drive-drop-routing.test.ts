import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { shouldHandleGlobalPatientDriveFileDrag } from './patient-drive-drop-routing';

test('routes desktop files to the patient Drive uploader when no preview is open', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: false,
        isFileDrag: true,
    }), true);
});

test('does not intercept desktop files while Photo Studio is open', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: true,
        isFileDrag: true,
    }), false);
});

test('does not treat internal thumbnail drags as Drive uploads', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: false,
        isFileDrag: false,
    }), false);
});

test('wires the preview guard and stops canvas drops from bubbling to Drive upload', () => {
    const patientDriveSource = readFileSync(
        'components/patients/drive/PatientDriveTab.tsx',
        'utf8',
    );
    const photoStudioSource = readFileSync(
        'components/patients/drive/PhotoStudioModal.tsx',
        'utf8',
    );
    const fabricStageSource = readFileSync(
        'components/patients/drive/FabricCanvasStage.tsx',
        'utf8',
    );

    assert.match(patientDriveSource, /previewOpen: Boolean\(previewFile\)/);
    assert.match(patientDriveSource, /canUpload && !previewFile && isGlobalDragging/);
    assert.match(photoStudioSource, /e\.preventDefault\(\);\s+e\.stopPropagation\(\);\s+const fileId/);
    assert.match(fabricStageSource, /onDrop=\{event => \{\s+event\.preventDefault\(\);\s+event\.stopPropagation\(\);/);
});
