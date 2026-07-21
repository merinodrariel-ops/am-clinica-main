import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    PHOTO_STUDIO_CANVAS_DRAG_TYPE,
    getPhotoStudioCanvasDragId,
    hasPhotoStudioCanvasDragType,
    preparePhotoStudioCanvasDrag,
    shouldHandleGlobalPatientDriveFileDrag,
} from './patient-drive-drop-routing';

test('routes desktop files to the patient Drive uploader when no preview is open', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: false,
        isFileDrag: true,
        isPhotoStudioCanvasDrag: false,
    }), true);
});

test('does not intercept desktop files while Photo Studio is open', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: true,
        isFileDrag: true,
        isPhotoStudioCanvasDrag: false,
    }), false);
});

test('does not treat internal thumbnail drags as Drive uploads', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: false,
        isFileDrag: false,
        isPhotoStudioCanvasDrag: true,
    }), false);
});

test('internal canvas drag wins even when the browser also reports Files', () => {
    assert.equal(shouldHandleGlobalPatientDriveFileDrag({
        canUpload: true,
        previewOpen: false,
        isFileDrag: true,
        isPhotoStudioCanvasDrag: true,
    }), false);
});

test('keeps the Photo Studio id recognizable when a native Files payload survives', () => {
    const values = new Map<string, string>([
        ['text/uri-list', 'https://example.test/photo.jpg'],
    ]);
    const dataTransfer = {
        get types() { return ['Files', ...values.keys()]; },
        clearData() { values.clear(); },
        setData(type: string, value: string) { values.set(type, value); },
        getData(type: string) { return values.get(type) ?? ''; },
    };

    preparePhotoStudioCanvasDrag(dataTransfer, 'drive-photo-123');

    assert.deepEqual(dataTransfer.types, ['Files', PHOTO_STUDIO_CANVAS_DRAG_TYPE]);
    assert.equal(hasPhotoStudioCanvasDragType(dataTransfer.types), true);
    assert.equal(getPhotoStudioCanvasDragId(dataTransfer), 'drive-photo-123');
});

test('keeps native Files payloads isolated over 100 consecutive canvas drags', () => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const values = new Map<string, string>();
        const dataTransfer = {
            get types() { return ['Files', ...values.keys()]; },
            clearData() { values.clear(); },
            setData(type: string, value: string) { values.set(type, value); },
            getData(type: string) { return values.get(type) ?? ''; },
        };

        preparePhotoStudioCanvasDrag(dataTransfer, `photo-${attempt}`);

        assert.equal(dataTransfer.types.includes('Files'), true);
        assert.equal(getPhotoStudioCanvasDragId(dataTransfer), `photo-${attempt}`);
        assert.equal(shouldHandleGlobalPatientDriveFileDrag({
            canUpload: true,
            previewOpen: false,
            isFileDrag: dataTransfer.types.includes('Files'),
            isPhotoStudioCanvasDrag: hasPhotoStudioCanvasDragType(dataTransfer.types),
        }), false);
    }
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
    assert.match(photoStudioSource, /preparePhotoStudioCanvasDrag\(e\.dataTransfer, f\.id\)/);
    assert.match(photoStudioSource, /pointer-events-none w-full h-full object-cover/);
    assert.match(photoStudioSource, /e\.preventDefault\(\);\s+e\.stopPropagation\(\);\s+const fileId/);
    assert.match(fabricStageSource, /onDrop=\{event => \{\s+event\.preventDefault\(\);\s+event\.stopPropagation\(\);/);
});
