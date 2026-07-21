import assert from 'node:assert/strict';
import test from 'node:test';
import { mapCanvasLayerPointToPixel } from './canvas-layer-point';

const base = {
    layerX: 0.5,
    layerY: 0.5,
    layerWidth: 0.5,
    layerHeight: 0.25,
    rotation: 0,
    canvasWidth: 1000,
    canvasHeight: 1000,
    imageWidth: 2000,
    imageHeight: 1000,
    brushSizeCss: 40,
};

test('maps a selected canvas layer center to its source-image center', () => {
    const point = mapCanvasLayerPointToPixel({ ...base, pointX: 0.5, pointY: 0.5 });
    assert.deepEqual(point, { x: 1000, y: 500, radius: 160 });
});

test('maps the pointer after the selected layer is rotated', () => {
    const point = mapCanvasLayerPointToPixel({
        ...base,
        rotation: 90,
        pointX: 0.5,
        pointY: 0.25,
    });
    assert.ok(point);
    assert.ok(Math.abs(point.x) < 0.000001);
    assert.ok(Math.abs(point.y - 500) < 0.000001);
});

test('rejects clicks on another canvas layer or outside the selected layer', () => {
    assert.equal(mapCanvasLayerPointToPixel({ ...base, pointX: 0.05, pointY: 0.05 }), null);
});

test('keeps mapping stable across repeated second and third-layer sessions', () => {
    for (let index = 0; index < 100; index += 1) {
        const point = mapCanvasLayerPointToPixel({
            ...base,
            layerX: index % 2 === 0 ? 0.35 : 0.65,
            layerY: index % 3 === 0 ? 0.4 : 0.6,
            rotation: (index % 25) - 12,
            pointX: index % 2 === 0 ? 0.35 : 0.65,
            pointY: index % 3 === 0 ? 0.4 : 0.6,
        });
        assert.ok(point, `session ${index + 1} should map the selected layer`);
        assert.ok(Math.abs(point.x - 1000) < 0.000001);
        assert.ok(Math.abs(point.y - 500) < 0.000001);
    }
});
