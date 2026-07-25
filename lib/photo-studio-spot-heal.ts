type Point = { x: number; y: number };

function colorDistance(
    pixels: Uint8ClampedArray,
    firstOffset: number,
    secondOffset: number,
) {
    const red = pixels[firstOffset] - pixels[secondOffset];
    const green = pixels[firstOffset + 1] - pixels[secondOffset + 1];
    const blue = pixels[firstOffset + 2] - pixels[secondOffset + 2];
    return red * red * 0.25 + green * green * 0.55 + blue * blue * 0.2;
}

function findTextureSource(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radius: number,
): Point | null {
    const boundarySamples = 32;
    const comparisonRadii = [radius * 1.04, radius * 1.28];
    const searchRadius = Math.max(radius * 5, radius + 12);
    const searchStep = Math.max(2, Math.round(radius / 3));
    let best: Point | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let candidateY = Math.max(radius, centerY - searchRadius); candidateY <= Math.min(height - radius - 1, centerY + searchRadius); candidateY += searchStep) {
        for (let candidateX = Math.max(radius, centerX - searchRadius); candidateX <= Math.min(width - radius - 1, centerX + searchRadius); candidateX += searchStep) {
            const displacement = Math.hypot(candidateX - centerX, candidateY - centerY);
            if (displacement < radius * 2.15 || displacement > searchRadius) continue;

            let score = 0;
            let compared = 0;
            for (const comparisonRadius of comparisonRadii) {
                for (let index = 0; index < boundarySamples; index += 1) {
                    const angle = (index / boundarySamples) * Math.PI * 2;
                    const dx = Math.cos(angle) * comparisonRadius;
                    const dy = Math.sin(angle) * comparisonRadius;
                    const targetX = Math.round(centerX + dx);
                    const targetY = Math.round(centerY + dy);
                    const sourceX = Math.round(candidateX + dx);
                    const sourceY = Math.round(candidateY + dy);
                    if (
                        targetX < 0 || targetX >= width || targetY < 0 || targetY >= height ||
                        sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height
                    ) continue;
                    score += colorDistance(
                        pixels,
                        (targetY * width + targetX) * 4,
                        (sourceY * width + sourceX) * 4,
                    );
                    compared += 1;
                }
            }

            if (compared === 0) continue;
            // Prefer a nearby matching patch when two candidates have similar borders.
            const normalizedScore = score / compared + displacement * 0.08;
            if (normalizedScore < bestScore) {
                bestScore = normalizedScore;
                best = { x: candidateX, y: candidateY };
            }
        }
    }

    return best;
}

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
    const textureSource = findTextureSource(source, width, height, centerX, centerY, radius);
    if (!textureSource) return output;

    const sourceDeltaX = textureSource.x - centerX;
    const sourceDeltaY = textureSource.y - centerY;
    const featherStart = radius * 0.68;

    for (let py = Math.max(0, Math.floor(centerY - radius)); py <= Math.min(height - 1, Math.ceil(centerY + radius)); py += 1) {
        for (let px = Math.max(0, Math.floor(centerX - radius)); px <= Math.min(width - 1, Math.ceil(centerX + radius)); px += 1) {
            const distance = Math.hypot(px - centerX, py - centerY);
            if (distance > radius) continue;

            const sampleX = Math.round(px + sourceDeltaX);
            const sampleY = Math.round(py + sourceDeltaY);
            if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) continue;

            const offset = (py * width + px) * 4;
            const sampleOffset = (sampleY * width + sampleX) * 4;
            const feather = distance <= featherStart
                ? 1
                : Math.max(0, Math.min(1, (radius - distance) / Math.max(1, radius - featherStart)));
            const blend = feather * feather * (3 - 2 * feather);

            output[offset] = source[offset] * (1 - blend) + source[sampleOffset] * blend;
            output[offset + 1] = source[offset + 1] * (1 - blend) + source[sampleOffset + 1] * blend;
            output[offset + 2] = source[offset + 2] * (1 - blend) + source[sampleOffset + 2] * blend;
            output[offset + 3] = source[offset + 3] * (1 - blend) + source[sampleOffset + 3] * blend;
        }
    }

    return output;
}
