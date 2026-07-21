import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getCanvasCopyName,
    getCanvasDocumentContextTargets,
    updateCanvasDocumentSelection,
} from './canvas-selection';

const orderedIds = ['canvas-1', 'canvas-2', 'canvas-3', 'canvas-4'];

test('plain click replaces the canvas document selection', () => {
    assert.deepEqual(updateCanvasDocumentSelection({
        selectedIds: ['canvas-1', 'canvas-2'],
        orderedIds,
        clickedId: 'canvas-3',
        anchorId: 'canvas-1',
        additive: false,
        range: false,
    }), ['canvas-3']);
});

test('command or control click toggles one canvas without losing the rest', () => {
    assert.deepEqual(updateCanvasDocumentSelection({
        selectedIds: ['canvas-1'],
        orderedIds,
        clickedId: 'canvas-3',
        anchorId: 'canvas-1',
        additive: true,
        range: false,
    }), ['canvas-1', 'canvas-3']);

    assert.deepEqual(updateCanvasDocumentSelection({
        selectedIds: ['canvas-1', 'canvas-3'],
        orderedIds,
        clickedId: 'canvas-1',
        anchorId: 'canvas-3',
        additive: true,
        range: false,
    }), ['canvas-3']);
});

test('shift click adds the range from the selection anchor', () => {
    assert.deepEqual(updateCanvasDocumentSelection({
        selectedIds: ['canvas-1'],
        orderedIds,
        clickedId: 'canvas-4',
        anchorId: 'canvas-2',
        additive: false,
        range: true,
    }), ['canvas-1', 'canvas-2', 'canvas-3', 'canvas-4']);
});

test('right click keeps a multi-selection only when the clicked canvas belongs to it', () => {
    assert.deepEqual(getCanvasDocumentContextTargets(['canvas-1', 'canvas-3'], 'canvas-3'), ['canvas-1', 'canvas-3']);
    assert.deepEqual(getCanvasDocumentContextTargets(['canvas-1', 'canvas-3'], 'canvas-2'), ['canvas-2']);
});

test('copy name remains understandable for named and blank canvases', () => {
    assert.equal(getCanvasCopyName('Antes y después'), 'Antes y después copia');
    assert.equal(getCanvasCopyName('  '), 'Lienzo copia');
});
