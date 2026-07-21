import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_BACKGROUND_BRUSH_MODE, eraseContiguousColor, paintSelectionMask, scaleMagicWandTolerance } from './magic-wand';

function pixels(colors: Array<[number, number, number, number]>) {
    return new Uint8ClampedArray(colors.flat());
}

test('eraseContiguousColor only erases the connected matching region', () => {
    const data = pixels([
        [0, 0, 0, 255], [0, 0, 0, 255], [255, 255, 255, 255],
        [0, 0, 0, 255], [255, 255, 255, 255], [0, 0, 0, 255],
    ]);
    const selection = eraseContiguousColor({ data, width: 3, height: 2 }, 0, 0, 0);

    assert.deepEqual(Array.from(selection ?? []), [1, 1, 0, 1, 0, 0]);
    assert.equal(data[3], 0);
    assert.equal(data[7], 0);
    assert.equal(data[23], 255);
});

test('eraseContiguousColor ignores already transparent and out-of-range pixels', () => {
    const data = pixels([[0, 0, 0, 0]]);
    assert.equal(eraseContiguousColor({ data, width: 1, height: 1 }, 0, 0, 10), null);
    assert.equal(eraseContiguousColor({ data, width: 1, height: 1 }, 3, 3, 10), null);
});

test('paintSelectionMask paints only selected pixels in visible red', () => {
    const data = pixels([[1, 2, 3, 255], [4, 5, 6, 255]]);
    paintSelectionMask({ data, width: 2, height: 1 }, new Uint8Array([0, 1]));
    assert.deepEqual(Array.from(data), [1, 2, 3, 255, 239, 68, 68, 160]);
});

test('scaleMagicWandTolerance clamps the UI range and favors precision', () => {
    assert.equal(scaleMagicWandTolerance(0), scaleMagicWandTolerance(1));
    assert.equal(scaleMagicWandTolerance(100), 10);
    assert.ok(scaleMagicWandTolerance(50) < 3);
});

test('manual background editing starts in erase mode', () => {
    assert.equal(DEFAULT_BACKGROUND_BRUSH_MODE, 'erase');
});
