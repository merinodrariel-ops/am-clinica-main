import test from 'node:test';
import assert from 'node:assert/strict';

import { getSmileExportPreset, getSupportedSmileVideoMimeType } from './smile-content-export';

test('defines content export presets for feed posts and stories', () => {
    assert.deepEqual(getSmileExportPreset('post'), {
        id: 'post',
        label: 'Post',
        width: 1080,
        height: 1350,
    });
    assert.deepEqual(getSmileExportPreset('story'), {
        id: 'story',
        label: 'Historia',
        width: 1080,
        height: 1920,
    });
});

test('prefers mp4 for smile videos when the browser supports it', () => {
    const mime = getSupportedSmileVideoMimeType((candidate) => candidate === 'video/mp4;codecs=h264');

    assert.equal(mime.mimeType, 'video/mp4;codecs=h264');
    assert.equal(mime.extension, 'mp4');
});

test('falls back to webm when mp4 is unavailable', () => {
    const mime = getSupportedSmileVideoMimeType((candidate) => candidate === 'video/webm;codecs=vp9');

    assert.equal(mime.mimeType, 'video/webm;codecs=vp9');
    assert.equal(mime.extension, 'webm');
});

