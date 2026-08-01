import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/patients/drive/PhotoStudioModal.tsx', import.meta.url),
    'utf8',
);

test('edited photos reorder live across the whole bottom strip and persist once at the end', () => {
    assert.match(source, /event\.dataTransfer\.setData\('thumbnailReorderId', selectionFile\.id\)/);
    assert.match(source, /querySelectorAll<HTMLElement>\('\[data-reorder-thumbnail-id\]'\)/);
    assert.match(source, /previewThumbnailReorder\(thumbnailDragId, targetId, edge\)/);
    assert.match(source, /onDragEnd=\{finishThumbnailReorder\}/);
    assert.match(source, /saveFotosOrderAction\(patientId, folderId, orderToSave, coverFileId\)/);
    assert.match(source, /onSaved\(\{ silent: true \}\)/);
});

test('bottom-strip dragging still supports copying an edited photo into a canvas', () => {
    assert.match(source, /preparePhotoStudioCanvasDrag\(event\.dataTransfer, selectionFile\.id\)/);
    assert.match(source, /event\.dataTransfer\.effectAllowed = 'copyMove'/);
});

test('a library photo can be dropped onto the bottom Selección rail without replacing reorder behavior', () => {
    assert.match(source, /e\.dataTransfer\.setData\('selectionLibraryFileId', f\.id\)/);
    assert.match(source, /handleLibraryPhotoDropToSelection\(libraryFileId\)/);
    assert.match(source, /movePhotosToSelectionAction\(folderId, \[fileId\]\)/);
    assert.match(source, /isPhotoStudioSelectionFolder\(item\.parentName\)/);
    assert.match(source, /finishThumbnailReorder\(\)/);
    assert.match(source, /Arrastrá fotos aquí/);
});
