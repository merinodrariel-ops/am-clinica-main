export const PHOTO_STUDIO_CANVAS_DRAG_TYPE = 'application/x-am-photo-studio-drive-file-id';

type PhotoStudioDataTransfer = Pick<DataTransfer, 'clearData' | 'getData' | 'setData' | 'types'>;

function includesDragType(types: ArrayLike<string>, expected: string): boolean {
    return Array.from(types).some(type => type.toLowerCase() === expected.toLowerCase());
}

export function preparePhotoStudioCanvasDrag(
    dataTransfer: PhotoStudioDataTransfer,
    fileId: string,
): void {
    // Remove native string payloads and add an explicit editor-only type. Some
    // browsers may still advertise Files; the router gives this type priority.
    dataTransfer.clearData();
    dataTransfer.setData(PHOTO_STUDIO_CANVAS_DRAG_TYPE, fileId);
}

export function getPhotoStudioCanvasDragId(dataTransfer: PhotoStudioDataTransfer): string {
    return dataTransfer.getData(PHOTO_STUDIO_CANVAS_DRAG_TYPE)
        || dataTransfer.getData('driveFileId');
}

export function hasPhotoStudioCanvasDragType(types: ArrayLike<string>): boolean {
    return includesDragType(types, PHOTO_STUDIO_CANVAS_DRAG_TYPE)
        || includesDragType(types, 'driveFileId');
}

export function shouldHandleGlobalPatientDriveFileDrag(input: {
    canUpload: boolean;
    previewOpen: boolean;
    isFileDrag: boolean;
    isPhotoStudioCanvasDrag: boolean;
}): boolean {
    return input.canUpload
        && !input.previewOpen
        && !input.isPhotoStudioCanvasDrag
        && input.isFileDrag;
}
