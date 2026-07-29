import assert from 'node:assert/strict';
import test from 'node:test';

import {
    getPhotoStudioPresentationPhotoIds,
    getPhotoStudioPresentationScope,
} from './presentation-scope';

const files = [
    { id: 'library-1', parentName: 'Biblioteca' },
    { id: 'selection-1', parentName: '[Selección] Rosana' },
    { id: 'selection-2', parentName: 'Seleccion' },
];

test('starting from Selection restricts presentation photos to Selection', () => {
    const scope = getPhotoStudioPresentationScope({ activeParentName: '[Selección] Rosana' });
    assert.equal(scope, 'selection');
    assert.deepEqual(
        getPhotoStudioPresentationPhotoIds(files, scope),
        ['selection-1', 'selection-2'],
    );
});

test('starting from a canvas uses Selection scope', () => {
    assert.equal(
        getPhotoStudioPresentationScope({ activeParentName: 'Biblioteca', canvasActive: true }),
        'selection',
    );
});

test('starting from Library keeps every photo available', () => {
    const scope = getPhotoStudioPresentationScope({ activeParentName: 'Biblioteca' });
    assert.equal(scope, 'library');
    assert.deepEqual(
        getPhotoStudioPresentationPhotoIds(files, scope),
        ['library-1', 'selection-1', 'selection-2'],
    );
});
