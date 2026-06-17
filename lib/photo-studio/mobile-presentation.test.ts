import test from 'node:test';
import assert from 'node:assert/strict';

import { shouldStartPhotoStudioInPresentation } from './mobile-presentation';

test('starts the photo studio in presentation mode on mobile-sized screens with multiple photos', () => {
    assert.equal(shouldStartPhotoStudioInPresentation({ viewportWidth: 390, imageCount: 5, autoStartSmile: false }), true);
});

test('keeps editor mode on desktop and when Smile Design is auto-starting', () => {
    assert.equal(shouldStartPhotoStudioInPresentation({ viewportWidth: 1280, imageCount: 5, autoStartSmile: false }), false);
    assert.equal(shouldStartPhotoStudioInPresentation({ viewportWidth: 390, imageCount: 5, autoStartSmile: true }), false);
});

test('keeps editor mode when there is only one photo', () => {
    assert.equal(shouldStartPhotoStudioInPresentation({ viewportWidth: 390, imageCount: 1, autoStartSmile: false }), false);
});

