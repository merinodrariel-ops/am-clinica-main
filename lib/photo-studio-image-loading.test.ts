import test from 'node:test';
import assert from 'node:assert/strict';
import {
    createPhotoStudioImageLoadState,
    resolvePhotoStudioImageLoadFailure,
    resolvePhotoStudioImageLoadSuccess,
    shouldShowBlurPlaceholder,
} from './photo-studio-image-loading';

test('ignores stale image load events from a previously selected photo', () => {
    const state = createPhotoStudioImageLoadState({
        fileId: 'foto-b',
        originalUrl: '/api/drive/file/foto-b?cors=1',
        thumbnailUrl: '/api/drive/thumbnail/foto-b?s=400',
    });

    const next = resolvePhotoStudioImageLoadSuccess(state, '/api/drive/file/foto-a?cors=1');

    assert.equal(next.status, 'loading');
    assert.equal(next.displayUrl, '/api/drive/file/foto-b?cors=1');
});

test('falls back to a sharp thumbnail and stops showing the blur placeholder when the original image fails', () => {
    const state = createPhotoStudioImageLoadState({
        fileId: 'foto-b',
        originalUrl: '/api/drive/file/foto-b?cors=1',
        thumbnailUrl: '/api/drive/thumbnail/foto-b?s=400',
    });

    assert.equal(shouldShowBlurPlaceholder(state), true);

    const next = resolvePhotoStudioImageLoadFailure(state, '/api/drive/file/foto-b?cors=1');

    assert.equal(next.status, 'fallback');
    assert.equal(next.displayUrl, '/api/drive/thumbnail/foto-b?s=400');
    assert.equal(shouldShowBlurPlaceholder(next), false);
});
