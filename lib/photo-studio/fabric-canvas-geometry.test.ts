import test from 'node:test';
import assert from 'node:assert/strict';

import {
    canvasLayerToFabricGeometry,
    fabricGeometryToCanvasLayer,
} from './fabric-canvas-geometry';

test('converts an existing normalized layer to Fabric coordinates', () => {
    assert.deepEqual(
        canvasLayerToFabricGeometry(
            { x: 0.5, y: 0.25, w: 0.4, h: 0.3, rotation: 12 },
            800,
            1000,
            1600,
            1200,
        ),
        {
            left: 400,
            top: 250,
            width: 1600,
            height: 1200,
            scaleX: 0.2,
            scaleY: 0.25,
            angle: 12,
        },
    );
});

test('round-trips Fabric transforms back to the persisted canvas format', () => {
    const persisted = { x: 0.42, y: 0.61, w: 0.36, h: 0.28, rotation: -7.5 };
    const fabricGeometry = canvasLayerToFabricGeometry(persisted, 900, 1200, 1800, 1400);

    assert.deepEqual(
        fabricGeometryToCanvasLayer(fabricGeometry, 900, 1200),
        persisted,
    );
});

test('normalizes negative Fabric scale values without persisting invalid sizes', () => {
    assert.deepEqual(
        fabricGeometryToCanvasLayer(
            { left: 100, top: 200, width: 400, height: 300, scaleX: -0.5, scaleY: -0.25, angle: 45 },
            1000,
            800,
        ),
        { x: 0.1, y: 0.25, w: 0.2, h: 0.09375, rotation: 45 },
    );
});
