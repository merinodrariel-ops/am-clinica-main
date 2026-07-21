export type PhotoStudioImageLoadStatus = 'loading' | 'loaded' | 'fallback';

export interface PhotoStudioImageLoadState {
    fileId: string;
    originalUrl: string;
    displayUrl: string;
    thumbnailUrl: string | null;
    status: PhotoStudioImageLoadStatus;
}

export function createPhotoStudioImageLoadState(input: {
    fileId: string;
    originalUrl: string;
    thumbnailUrl?: string | null;
}): PhotoStudioImageLoadState {
    return {
        fileId: input.fileId,
        originalUrl: input.originalUrl,
        displayUrl: input.originalUrl,
        thumbnailUrl: input.thumbnailUrl ?? null,
        status: 'loading',
    };
}

export function resolvePhotoStudioImageLoadSuccess(
    state: PhotoStudioImageLoadState,
    loadedUrl: string,
): PhotoStudioImageLoadState {
    if (loadedUrl !== state.displayUrl) return state;
    return { ...state, status: 'loaded' };
}

export function resolvePhotoStudioImageLoadFailure(
    state: PhotoStudioImageLoadState,
    failedUrl: string,
): PhotoStudioImageLoadState {
    if (failedUrl !== state.displayUrl) return state;
    if (state.thumbnailUrl && state.displayUrl !== state.thumbnailUrl) {
        return {
            ...state,
            displayUrl: state.thumbnailUrl,
            status: 'fallback',
        };
    }
    return { ...state, status: 'fallback' };
}

export function shouldShowBlurPlaceholder(state: PhotoStudioImageLoadState): boolean {
    return Boolean(
        state.thumbnailUrl &&
        state.status === 'loading' &&
        state.displayUrl === state.originalUrl
    );
}
