export function getPhotoAnnotationDisplayScale(params: {
    canvasWidthPx: number;
    layoutWidthPx: number;
    transformedRectWidthPx?: number;
}): number {
    const layoutWidth = params.layoutWidthPx || params.transformedRectWidthPx || 0;
    return layoutWidth > 0 ? params.canvasWidthPx / layoutWidth : 1;
}

