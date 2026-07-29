import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/patients/drive/PhotoStudioModal.tsx', import.meta.url),
    'utf8',
);

test('edited photos in the bottom strip can be reordered horizontally and persisted', () => {
    assert.match(source, /event\.dataTransfer\.setData\('thumbnailReorderId', editedFile\.id\)/);
    assert.match(source, /event\.clientX < rect\.left \+ rect\.width \/ 2/);
    assert.match(source, /handleThumbnailReorder\(\s*draggedId,\s*editedFile\.id,/);
    assert.match(source, /saveFotosOrderAction\(patientId, folderId, nextOrder, coverFileId\)/);
    assert.match(source, /onSaved\(\{ silent: true \}\)/);
});

test('bottom-strip dragging still supports copying an edited photo into a canvas', () => {
    assert.match(source, /preparePhotoStudioCanvasDrag\(event\.dataTransfer, editedFile\.id\)/);
    assert.match(source, /event\.dataTransfer\.effectAllowed = 'copyMove'/);
});
