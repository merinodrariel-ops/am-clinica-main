import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDriveImageInfoTitle, formatDriveImageSize } from './drive-image-info';

test('formats Drive byte sizes for clinical photo tooltips', () => {
    assert.equal(formatDriveImageSize('512'), '512 B');
    assert.equal(formatDriveImageSize(String(1536)), '1.5 KB');
    assert.equal(formatDriveImageSize(String(2.5 * 1024 ** 2)), '2.5 MB');
    assert.equal(formatDriveImageSize(undefined), 'Peso no disponible');
});

test('describes resolution, weight and full-quality drag source', () => {
    assert.equal(buildDriveImageInfoTitle({
        name: 'rostro_editada.png',
        size: String(3 * 1024 ** 2),
        imageWidth: 2400,
        imageHeight: 3000,
    }), [
        'rostro_editada.png',
        'Resolución: 2400 × 3000 px',
        'Peso: 3.0 MB',
        'Al arrastrar se usa el original de Drive',
    ].join('\n'));
});
