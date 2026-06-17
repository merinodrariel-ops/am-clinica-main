export function shouldStartPhotoStudioInPresentation(input: {
    viewportWidth: number;
    imageCount: number;
    autoStartSmile?: boolean;
}): boolean {
    return input.viewportWidth < 768 && input.imageCount > 1 && !input.autoStartSmile;
}

