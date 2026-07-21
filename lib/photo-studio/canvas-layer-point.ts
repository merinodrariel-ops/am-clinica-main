export type CanvasLayerPointInput = {
    layerX: number;
    layerY: number;
    layerWidth: number;
    layerHeight: number;
    rotation: number;
    pointX: number;
    pointY: number;
    canvasWidth: number;
    canvasHeight: number;
    imageWidth: number;
    imageHeight: number;
    brushSizeCss: number;
};

export type CanvasLayerPixelPoint = {
    x: number;
    y: number;
    radius: number;
};

export function mapCanvasLayerPointToPixel(input: CanvasLayerPointInput): CanvasLayerPixelPoint | null {
    const {
        layerX,
        layerY,
        layerWidth,
        layerHeight,
        rotation,
        pointX,
        pointY,
        canvasWidth,
        canvasHeight,
        imageWidth,
        imageHeight,
        brushSizeCss,
    } = input;
    if (
        ![layerX, layerY, layerWidth, layerHeight, rotation, pointX, pointY, canvasWidth, canvasHeight, imageWidth, imageHeight, brushSizeCss]
            .every(Number.isFinite)
        || canvasWidth <= 0
        || canvasHeight <= 0
        || layerWidth <= 0
        || layerHeight <= 0
        || imageWidth <= 0
        || imageHeight <= 0
    ) return null;

    const cx = layerX * canvasWidth;
    const cy = layerY * canvasHeight;
    const px = pointX * canvasWidth - cx;
    const py = pointY * canvasHeight - cy;
    const radians = -rotation * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const localX = px * cos - py * sin;
    const localY = px * sin + py * cos;
    const renderedWidth = layerWidth * canvasWidth;
    const renderedHeight = layerHeight * canvasHeight;
    const u = (localX + renderedWidth / 2) / renderedWidth;
    const v = (localY + renderedHeight / 2) / renderedHeight;
    if (u < 0 || u > 1 || v < 0 || v > 1) return null;

    const scaleX = imageWidth / renderedWidth;
    const scaleY = imageHeight / renderedHeight;
    return {
        x: u * imageWidth,
        y: v * imageHeight,
        radius: Math.max(4, brushSizeCss * ((scaleX + scaleY) / 2)),
    };
}
