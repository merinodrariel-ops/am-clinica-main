import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createPhotoStudioImageLoadState,
    resolvePhotoStudioImageLoadFailure,
    resolvePhotoStudioImageLoadSuccess,
    shouldShowBlurPlaceholder,
} from './photo-studio-image-loading';

test('ignores stale load events from a previously selected photo', () => {
    const current = createPhotoStudioImageLoadState({
        fileId: 'copy-b',
        originalUrl: '/api/drive/file/copy-b?cors=1&v=2',
        thumbnailUrl: '/api/drive/thumbnail/copy-b?s=400&v=2',
    });

    const afterStaleOriginal = resolvePhotoStudioImageLoadSuccess(
        current,
        '/api/drive/file/original-a?cors=1&v=1',
    );

    assert.equal(afterStaleOriginal.status, 'loading');
    assert.equal(afterStaleOriginal.displayUrl, current.originalUrl);
});

test('returns to the original after saving a copy without accepting the copy stale event', () => {
    const original = createPhotoStudioImageLoadState({
        fileId: 'original-a',
        originalUrl: '/api/drive/file/original-a?cors=1&v=1',
        thumbnailUrl: '/api/drive/thumbnail/original-a?s=400&v=1',
    });

    const afterStaleCopy = resolvePhotoStudioImageLoadSuccess(
        original,
        '/api/drive/file/copy-b?cors=1&v=2',
    );
    const loadedOriginal = resolvePhotoStudioImageLoadSuccess(afterStaleCopy, original.originalUrl);

    assert.equal(afterStaleCopy.status, 'loading');
    assert.equal(loadedOriginal.status, 'loaded');
    assert.equal(shouldShowBlurPlaceholder(loadedOriginal), false);
});

test('falls back to a sharp thumbnail and removes the blurred placeholder when the original fails', () => {
    const state = createPhotoStudioImageLoadState({
        fileId: 'photo-b',
        originalUrl: '/api/drive/file/photo-b?cors=1',
        thumbnailUrl: '/api/drive/thumbnail/photo-b?s=400',
    });

    assert.equal(shouldShowBlurPlaceholder(state), true);
    const next = resolvePhotoStudioImageLoadFailure(state, state.originalUrl);

    assert.equal(next.status, 'fallback');
    assert.equal(next.displayUrl, state.thumbnailUrl);
    assert.equal(shouldShowBlurPlaceholder(next), false);
});
