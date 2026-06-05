import test from 'node:test';
import assert from 'node:assert/strict';

import { getPhotoAnnotationDisplayScale } from './text-scale';

test('uses untransformed layout width so canvas text matches textarea while zoomed', () => {
    assert.equal(
        getPhotoAnnotationDisplayScale({
            canvasWidthPx: 2400,
            layoutWidthPx: 800,
            transformedRectWidthPx: 1600,
        }),
        3,
    );
});

