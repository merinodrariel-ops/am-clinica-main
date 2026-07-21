export type FabricCanvasGeometry = {
    left: number;
    top: number;
    width: number;
    height: number;
    scaleX: number;
    scaleY: number;
    angle: number;
};

export type PersistedCanvasLayerGeometry = {
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
};

type FabricObjectGeometry = {
    left?: number;
    top?: number;
    width?: number;
    height?: number;
    scaleX?: number;
    scaleY?: number;
    angle?: number;
};

export function canvasLayerToFabricGeometry(
    layer: PersistedCanvasLayerGeometry,
    canvasWidth: number,
    canvasHeight: number,
    imageWidth: number,
    imageHeight: number,
): FabricCanvasGeometry {
    return {
        left: layer.x * canvasWidth,
        top: layer.y * canvasHeight,
        width: imageWidth,
        height: imageHeight,
        scaleX: (layer.w * canvasWidth) / Math.max(imageWidth, 1),
        scaleY: (layer.h * canvasHeight) / Math.max(imageHeight, 1),
        angle: layer.rotation,
    };
}

export function fabricGeometryToCanvasLayer(
    object: FabricObjectGeometry,
    canvasWidth: number,
    canvasHeight: number,
): PersistedCanvasLayerGeometry {
    const width = Math.max(object.width ?? 0, 1);
    const height = Math.max(object.height ?? 0, 1);
    const scaleX = Math.abs(object.scaleX ?? 1);
    const scaleY = Math.abs(object.scaleY ?? 1);

    return {
        x: (object.left ?? 0) / Math.max(canvasWidth, 1),
        y: (object.top ?? 0) / Math.max(canvasHeight, 1),
        w: (width * scaleX) / Math.max(canvasWidth, 1),
        h: (height * scaleY) / Math.max(canvasHeight, 1),
        rotation: object.angle ?? 0,
    };
}
