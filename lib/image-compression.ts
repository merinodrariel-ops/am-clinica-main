/**
 * Image compression utility for client-side image optimization
 * Reduces image file size before uploading to save storage space
 */

export interface CompressionOptions {
    maxWidth?: number;      // Max width in pixels (default: 1920)
    maxHeight?: number;     // Max height in pixels (default: 1080)
    quality?: number;       // JPEG quality 0-1 (default: 0.8)
    maxSizeKB?: number;     // Target max size in KB (default: 500)
}

export interface CompressionResult {
    blob: Blob;
    base64: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
    width: number;
    height: number;
}

const DEFAULT_OPTIONS: Required<CompressionOptions> = {
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 0.8,
    maxSizeKB: 500,
};

/**
 * Compress an image file
 * @param file - The image file to compress
 * @param options - Compression options
 * @returns Promise with compression result
 */
export async function compressImage(
    file: File,
    options: CompressionOptions = {}
): Promise<CompressionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const originalSize = file.size;

    // Load image
    const img = await loadImage(file);

    // Calculate new dimensions
    const { width, height } = calculateDimensions(
        img.width,
        img.height,
        opts.maxWidth,
        opts.maxHeight
    );

    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get canvas context');
    }

    // Use high-quality image smoothing
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // Compress with quality adjustment if needed
    let blob = await canvasToBlob(canvas, opts.quality);
    let quality = opts.quality;

    // If still too large, reduce quality progressively
    while (blob.size > opts.maxSizeKB * 1024 && quality > 0.3) {
        quality -= 0.1;
        blob = await canvasToBlob(canvas, quality);
    }

    // Convert to base64
    const base64 = await blobToBase64(blob);

    return {
        blob,
        base64,
        originalSize,
        compressedSize: blob.size,
        compressionRatio: Math.round((1 - blob.size / originalSize) * 100),
        width,
        height,
    };
}

/**
 * Compress multiple images
 */
export async function compressImages(
    files: File[],
    options: CompressionOptions = {}
): Promise<CompressionResult[]> {
    return Promise.all(files.map(file => compressImage(file, options)));
}

/**
 * Load image from file
 */
function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Calculate dimensions maintaining aspect ratio
 */
function calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
): { width: number; height: number } {
    let width = originalWidth;
    let height = originalHeight;

    // Scale down if needed
    if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
    }

    if (height > maxHeight) {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
    }

    return { width, height };
}

/**
 * Convert canvas to blob
 */
function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            },
            'image/jpeg',
            quality
        );
    });
}

/**
 * Convert blob to base64
 */
function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const result = reader.result as string;
            // Remove data URL prefix to get pure base64
            const base64 = result.split(',')[1];
            resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Check if file is an image
 */
export function isImageFile(file: File): boolean {
    return file.type.startsWith('image/');
}
