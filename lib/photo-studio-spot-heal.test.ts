import test from 'node:test';
import assert from 'node:assert/strict';
import { healSpotPixels } from './photo-studio-spot-heal';

function uniformImage(width: number, height: number, value = 210) {
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let offset = 0; offset < pixels.length; offset += 4) {
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 255;
    }
    return pixels;
}

function pixelAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
    const offset = (y * width + x) * 4;
    return [...pixels.slice(offset, offset + 4)];
}

test('removes a dark spot using the clean surrounding ring', () => {
    const width = 80;
    const height = 80;
    const pixels = uniformImage(width, height);
    const centerOffset = (40 * width + 40) * 4;
    pixels[centerOffset] = 15;
    pixels[centerOffset + 1] = 15;
    pixels[centerOffset + 2] = 15;

    const healed = healSpotPixels(pixels, width, height, 40, 40, 8);

    assert.deepEqual(pixelAt(healed, width, 40, 40), [210, 210, 210, 255]);
    assert.deepEqual(pixelAt(healed, width, 5, 5), [210, 210, 210, 255]);
});

test('supports repeated strokes without changing pixels outside each brush', () => {
    const width = 100;
    const height = 60;
    const pixels = uniformImage(width, height, 190);
    const first = healSpotPixels(pixels, width, height, 25, 30, 6);
    const second = healSpotPixels(first, width, height, 75, 30, 6);

    assert.deepEqual(pixelAt(second, width, 25, 30), [190, 190, 190, 255]);
    assert.deepEqual(pixelAt(second, width, 75, 30), [190, 190, 190, 255]);
    assert.deepEqual(pixelAt(second, width, 50, 5), [190, 190, 190, 255]);
});

test('is safe at image edges and with invalid dimensions', () => {
    const pixels = uniformImage(32, 32, 175);
    assert.doesNotThrow(() => healSpotPixels(pixels, 32, 32, 1, 1, 9));
    assert.deepEqual(
        healSpotPixels(pixels, 0, 0, 0, 0, 4),
        pixels
    );
});

