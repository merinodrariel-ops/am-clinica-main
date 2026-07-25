export function healSpotPixels(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radius: number
): Uint8ClampedArray {
    if (width <= 0 || height <= 0 || pixels.length !== width * height * 4 || radius <= 0) {
        return new Uint8ClampedArray(pixels);
    }

    const output = new Uint8ClampedArray(pixels);
    const source = new Uint8ClampedArray(pixels);
    const sampleRadius = Math.max(radius + 2, radius * 1.22);
    const sampleCount = 24;

    for (let py = Math.max(0, Math.floor(centerY - radius)); py <= Math.min(height - 1, Math.ceil(centerY + radius)); py += 1) {
        for (let px = Math.max(0, Math.floor(centerX - radius)); px <= Math.min(width - 1, Math.ceil(centerX + radius)); px += 1) {
            const distance = Math.hypot(px - centerX, py - centerY);
            if (distance > radius) continue;

            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            let samples = 0;
            for (let index = 0; index < sampleCount; index += 1) {
                const angle = (index / sampleCount) * Math.PI * 2;
                const sampleX = Math.round(centerX + Math.cos(angle) * sampleRadius);
                const sampleY = Math.round(centerY + Math.sin(angle) * sampleRadius);
                if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;
                const sampleOffset = (sampleY * width + sampleX) * 4;
                red += source[sampleOffset];
                green += source[sampleOffset + 1];
                blue += source[sampleOffset + 2];
                alpha += source[sampleOffset + 3];
                samples += 1;
            }
            if (samples === 0) continue;

            const offset = (py * width + px) * 4;
            const normalizedDistance = distance / Math.max(1, radius);
            const blend = Math.max(0, Math.min(1, (1 - normalizedDistance) / 0.28));
            const smoothBlend = blend * blend * (3 - 2 * blend);
            output[offset] = source[offset] * (1 - smoothBlend) + (red / samples) * smoothBlend;
            output[offset + 1] = source[offset + 1] * (1 - smoothBlend) + (green / samples) * smoothBlend;
            output[offset + 2] = source[offset + 2] * (1 - smoothBlend) + (blue / samples) * smoothBlend;
            output[offset + 3] = source[offset + 3] * (1 - smoothBlend) + (alpha / samples) * smoothBlend;
        }
    }

    return output;
}
