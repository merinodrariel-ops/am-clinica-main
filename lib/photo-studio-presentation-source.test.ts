import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
    new URL('../components/patients/drive/PhotoStudioModal.tsx', import.meta.url),
    'utf8',
);

test('presentation derives its photo set from the starting folder scope', () => {
    assert.match(source, /getPhotoStudioPresentationScope\(\{/);
    assert.match(source, /getPhotoStudioPresentationPhotoIds\(imageFiles, presentationScope\)/);
    assert.match(source, /getPhotoStudioPresentationPhotoIds\(imageFiles, scope\)/);
});

test('presentation includes editable canvases as slides', () => {
    assert.match(source, /\.\.\.canvases\.map\(canvasDocument => \(\{/);
    assert.match(source, /<CanvasPresentationPreview/);
    assert.match(source, /presentationItems\[presentationIdx\]\?\.kind === 'canvas'/);
});

const previewSource = readFileSync(new URL('../components/patients/drive/CanvasPreviews.tsx', import.meta.url), 'utf8');

test('presentation canvases preserve their aspect ratio within the viewport', () => {
    assert.match(previewSource, /calc\(\(100vh - 96px\) \* \$\{canvasRatio\.w \/ canvasRatio\.h\}\)/);
    assert.doesNotMatch(previewSource, /width: canvasRatio\.w >= canvasRatio\.h/);
    assert.doesNotMatch(previewSource, /height: canvasRatio\.h > canvasRatio\.w/);
});
