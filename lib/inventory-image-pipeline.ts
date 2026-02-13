export interface InventoryImagePayload {
    thumbBase64: string;
    fullBase64: string;
    thumbMimeType: 'image/webp';
    fullMimeType: 'image/webp';
    thumbWidth: number;
    thumbHeight: number;
    fullWidth: number;
    fullHeight: number;
    thumbSizeKB: number;
    fullSizeKB: number;
}

interface BuildInventoryImagePayloadOptions {
    thumbSize?: number;
    fullMaxWidth?: number;
    thumbMaxKB?: number;
    fullMaxKB?: number;
}

const DEFAULT_OPTIONS: Required<BuildInventoryImagePayloadOptions> = {
    thumbSize: 384,
    fullMaxWidth: 1280,
    thumbMaxKB: 60,
    fullMaxKB: 320,
};

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('No se pudo cargar la imagen seleccionada'));
        img.src = URL.createObjectURL(file);
    });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    reject(new Error('No se pudo convertir la imagen'));
                    return;
                }
                resolve(blob);
            },
            'image/webp',
            quality
        );
    });
}

async function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const value = String(reader.result || '');
            const base64 = value.split(',')[1] || '';
            resolve(base64);
        };
        reader.onerror = () => reject(new Error('No se pudo procesar la imagen'));
        reader.readAsDataURL(blob);
    });
}

function makeSquareThumbCanvas(img: HTMLImageElement, size: number) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('No se pudo iniciar el canvas para miniatura');
    }

    const sourceSize = Math.min(img.width, img.height);
    const sourceX = Math.floor((img.width - sourceSize) / 2);
    const sourceY = Math.floor((img.height - sourceSize) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
    return canvas;
}

function makeFullCanvas(img: HTMLImageElement, maxWidth: number) {
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('No se pudo iniciar el canvas para imagen completa');
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);
    return canvas;
}

async function exportCanvasWithTargetKB(
    canvas: HTMLCanvasElement,
    maxKB: number,
    initialQuality: number
) {
    let quality = initialQuality;
    let blob = await canvasToBlob(canvas, quality);

    while (blob.size > maxKB * 1024 && quality > 0.35) {
        quality -= 0.07;
        blob = await canvasToBlob(canvas, quality);
    }

    return blob;
}

export async function buildInventoryImagePayload(
    file: File,
    options: BuildInventoryImagePayloadOptions = {}
): Promise<InventoryImagePayload> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    const image = await loadImage(file);
    const thumbCanvas = makeSquareThumbCanvas(image, opts.thumbSize);
    const fullCanvas = makeFullCanvas(image, opts.fullMaxWidth);

    const thumbBlob = await exportCanvasWithTargetKB(thumbCanvas, opts.thumbMaxKB, 0.72);
    const fullBlob = await exportCanvasWithTargetKB(fullCanvas, opts.fullMaxKB, 0.78);

    const [thumbBase64, fullBase64] = await Promise.all([
        blobToBase64(thumbBlob),
        blobToBase64(fullBlob),
    ]);

    return {
        thumbBase64,
        fullBase64,
        thumbMimeType: 'image/webp',
        fullMimeType: 'image/webp',
        thumbWidth: thumbCanvas.width,
        thumbHeight: thumbCanvas.height,
        fullWidth: fullCanvas.width,
        fullHeight: fullCanvas.height,
        thumbSizeKB: Math.round((thumbBlob.size / 1024) * 10) / 10,
        fullSizeKB: Math.round((fullBlob.size / 1024) * 10) / 10,
    };
}
