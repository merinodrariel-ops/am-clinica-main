type SamplePair = {
    firstOffset: number;
    secondOffset: number;
    firstDistance: number;
    secondDistance: number;
    score: number;
};

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

function findDirectionalPair(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    px: number,
    py: number,
    radius: number,
): SamplePair | null {
    const directions = [
        [1, 0],
        [0, 1],
        [Math.SQRT1_2, Math.SQRT1_2],
        [Math.SQRT1_2, -Math.SQRT1_2],
    ] as const;
    const maxSteps = Math.ceil(radius * 2.2) + 3;
    let best: SamplePair | null = null;

    for (const [dx, dy] of directions) {
        let first: { x: number; y: number; distance: number } | null = null;
        let second: { x: number; y: number; distance: number } | null = null;

        for (let step = 1; step <= maxSteps && (!first || !second); step += 1) {
            if (!first) {
                const x = Math.round(px + dx * step);
                const y = Math.round(py + dy * step);
                if (x < 0 || x >= width || y < 0 || y >= height) break;
                if (Math.hypot(x - centerX, y - centerY) > radius + 0.75) {
                    first = { x, y, distance: step };
                }
            }
            if (!second) {
                const x = Math.round(px - dx * step);
                const y = Math.round(py - dy * step);
                if (x < 0 || x >= width || y < 0 || y >= height) break;
                if (Math.hypot(x - centerX, y - centerY) > radius + 0.75) {
                    second = { x, y, distance: step };
                }
            }
        }

        if (!first || !second) continue;
        const firstOffset = (first.y * width + first.x) * 4;
        const secondOffset = (second.y * width + second.x) * 4;
        const pair: SamplePair = {
            firstOffset,
            secondOffset,
            firstDistance: first.distance,
            secondDistance: second.distance,
            score: colorDistance(pixels, firstOffset, secondOffset),
        };
        if (!best || pair.score < best.score) best = pair;
    }

    return best;
}

export function getHealingBrushMetrics(size: number, imageScale = 1) {
    const diameterCss = Math.max(1, size);
    return {
        diameterCss,
        radiusPixels: Math.max(1, diameterCss * Math.max(0, imageScale) / 2),
    };
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
    const featherStart = radius * 0.82;

    for (let py = Math.max(0, Math.floor(centerY - radius)); py <= Math.min(height - 1, Math.ceil(centerY + radius)); py += 1) {
        for (let px = Math.max(0, Math.floor(centerX - radius)); px <= Math.min(width - 1, Math.ceil(centerX + radius)); px += 1) {
            const distance = Math.hypot(px - centerX, py - centerY);
            if (distance > radius) continue;

            const pair = findDirectionalPair(source, width, height, centerX, centerY, px, py, radius);
            if (!pair) continue;

            const offset = (py * width + px) * 4;
            const totalDistance = pair.firstDistance + pair.secondDistance;
            const firstWeight = pair.secondDistance / totalDistance;
            const secondWeight = pair.firstDistance / totalDistance;
            const feather = distance <= featherStart
                ? 1
                : Math.max(0, Math.min(1, (radius - distance) / Math.max(1, radius - featherStart)));
            const blend = feather * feather * (3 - 2 * feather);

            for (let channel = 0; channel < 4; channel += 1) {
                const reconstructed =
                    source[pair.firstOffset + channel] * firstWeight +
                    source[pair.secondOffset + channel] * secondWeight;
                output[offset + channel] = source[offset + channel] * (1 - blend) + reconstructed * blend;
            }
        }
    }

    return output;
}
