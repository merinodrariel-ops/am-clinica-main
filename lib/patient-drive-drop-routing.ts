export function shouldHandleGlobalPatientDriveFileDrag(input: {
    canUpload: boolean;
    previewOpen: boolean;
    isFileDrag: boolean;
}): boolean {
    return input.canUpload && !input.previewOpen && input.isFileDrag;
}
