import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('components/patients/drive/PhotoStudioModal.tsx', 'utf8');

test('clicking outside the artboard is handled in canvas and crop modes', () => {
    assert.match(source, /const artboard = canvasActive \? canvasLayersRef\.current : drawCanvasRef\.current;/);
    assert.match(source, /onClick=\{handleCanvasContainerClick\}/);
    assert.doesNotMatch(source, /onClick=\{canvasActive \|\| cropActive \? undefined : handleCanvasContainerClick\}/);
});

test('outside click clears canvas, drawing, and text selections', () => {
    assert.match(source, /setCanvasSelectedId\(null\)/);
    assert.match(source, /setSelectedShapeId\(null\)/);
    assert.match(source, /setSelectedTextId\(null\)/);
    assert.match(source, /void handleConfirmCanvasLayerCrop\(\)/);
});
