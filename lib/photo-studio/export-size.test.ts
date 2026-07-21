import assert from 'node:assert/strict';
import test from 'node:test';
import {
    computeScaleForLimit,
    supportsAlpha,
    pickFallbackMime,
    isOverLimit,
    formatBytes,
    MAX_UPLOAD_BYTES,
} from './export-size';

const MB = 1024 * 1024;

test('no scaling when already under the limit', () => {
    assert.equal(computeScaleForLimit(5 * MB), 1);
    assert.equal(computeScaleForLimit(MAX_UPLOAD_BYTES), 1);
});

test('scales down a 30 MB export enough to fit', () => {
    const scale = computeScaleForLimit(30 * MB);
    assert.ok(scale < 1, 'debe reducir');
    // area shrinks by scale^2 → estimated size should land under the limit
    const estimated = 30 * MB * scale * scale;
    assert.ok(estimated < MAX_UPLOAD_BYTES, `estimado ${estimated} debe entrar en ${MAX_UPLOAD_BYTES}`);
});

test('scale never collapses the image below 10%', () => {
    assert.equal(computeScaleForLimit(100000 * MB), 0.1);
});

test('handles invalid sizes safely', () => {
    assert.equal(computeScaleForLimit(0), 1);
    assert.equal(computeScaleForLimit(NaN), 1);
    assert.equal(computeScaleForLimit(-5), 1);
});

test('alpha support by mime', () => {
    assert.equal(supportsAlpha('image/png'), true);
    assert.equal(supportsAlpha('image/webp'), true);
    assert.equal(supportsAlpha('image/jpeg'), false);
});

test('transparent exports fall back to webp (keeps alpha, much smaller)', () => {
    assert.equal(pickFallbackMime('image/png', true), 'image/webp');
});

test('opaque exports fall back to jpeg', () => {
    assert.equal(pickFallbackMime('image/png', false), 'image/jpeg');
});

test('isOverLimit uses the safe threshold', () => {
    assert.equal(isOverLimit(19 * MB), true);
    assert.equal(isOverLimit(1 * MB), false);
});

test('formatBytes is human readable', () => {
    assert.equal(formatBytes(25 * MB), '25.0 MB');
    assert.equal(formatBytes(500), '500 B');
});
