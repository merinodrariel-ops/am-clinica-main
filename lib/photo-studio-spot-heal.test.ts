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

test('preserves a gum-tooth boundary instead of creating a flat pink blur', () => {
    const width = 140;
    const height = 90;
    const boundaryY = 42;
    const pixels = new Uint8ClampedArray(width * height * 4);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4;
            const texture = ((x % 9) - 4) * 2;
            const gum = y < boundaryY;
            pixels[offset] = (gum ? 220 : 238) + texture;
            pixels[offset + 1] = (gum ? 132 : 231) + texture;
            pixels[offset + 2] = (gum ? 142 : 214) + texture;
            pixels[offset + 3] = 255;
        }
    }

    // Clinical defect centered exactly across the pink/white transition.
    for (let y = boundaryY - 3; y <= boundaryY + 3; y += 1) {
        for (let x = 67; x <= 73; x += 1) {
            if (Math.hypot(x - 70, y - boundaryY) > 3.5) continue;
            const offset = (y * width + x) * 4;
            pixels[offset] = 12;
            pixels[offset + 1] = 12;
            pixels[offset + 2] = 12;
        }
    }

    const healed = healSpotPixels(pixels, width, height, 70, boundaryY, 7);
    const gumPixel = pixelAt(healed, width, 70, boundaryY - 2);
    const toothPixel = pixelAt(healed, width, 70, boundaryY + 2);

    assert.ok(gumPixel[1] < 170, `gum texture became too white: ${gumPixel}`);
    assert.ok(toothPixel[1] > 205, `tooth texture became pink/blurred: ${toothPixel}`);
    assert.ok(Math.abs(gumPixel[1] - toothPixel[1]) > 45, 'the anatomical color boundary was flattened');
});
