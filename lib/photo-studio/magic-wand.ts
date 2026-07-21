export type EditablePixelBuffer = {
    data: Uint8ClampedArray;
    width: number;
    height: number;
};

export const DEFAULT_BACKGROUND_BRUSH_MODE = 'erase' as const;

export function scaleMagicWandTolerance(percent: number): number {
    const bounded = Math.max(1, Math.min(100, percent));
    return 10 * Math.pow(bounded / 100, 2);
}

export function eraseContiguousColor(
    image: EditablePixelBuffer,
    startX: number,
    startY: number,
    tolerancePercent: number,
): Uint8Array | null {
    const { data, width, height } = image;
    const x0 = Math.round(startX);
    const y0 = Math.round(startY);
    if (x0 < 0 || x0 >= width || y0 < 0 || y0 >= height) return null;

    const tolerance = (tolerancePercent / 100) * 441.67;
    const startIdx = (y0 * width + x0) * 4;
    const targetR = data[startIdx];
    const targetG = data[startIdx + 1];
    const targetB = data[startIdx + 2];
    if (data[startIdx + 3] === 0) return null;

    const visited = new Uint8Array(width * height);
    const matches = (x: number, y: number) => {
        const idx = (y * width + x) * 4;
        if (data[idx + 3] === 0) return false;
        const distance = Math.sqrt(
            (data[idx] - targetR) ** 2
            + (data[idx + 1] - targetG) ** 2
            + (data[idx + 2] - targetB) ** 2,
        );
        return distance <= tolerance;
    };

    const queue: Array<[number, number]> = [[x0, y0]];
    while (queue.length > 0) {
        const [cx, cy] = queue.pop()!;
        if (visited[cy * width + cx] || !matches(cx, cy)) continue;

        let left = cx;
        while (left > 0 && !visited[cy * width + left - 1] && matches(left - 1, cy)) left--;
        let right = cx;
        while (right < width - 1 && !visited[cy * width + right + 1] && matches(right + 1, cy)) right++;

        for (let x = left; x <= right; x++) {
            const pixel = cy * width + x;
            visited[pixel] = 1;
            data[pixel * 4 + 3] = 0;
            if (cy > 0 && !visited[(cy - 1) * width + x] && matches(x, cy - 1)) queue.push([x, cy - 1]);
            if (cy < height - 1 && !visited[(cy + 1) * width + x] && matches(x, cy + 1)) queue.push([x, cy + 1]);
        }
    }

    return visited;
}

export function paintSelectionMask(
    image: EditablePixelBuffer,
    selection: Uint8Array,
): void {
    for (let index = 0; index < selection.length; index++) {
        if (selection[index] !== 1) continue;
        const pixel = index * 4;
        image.data[pixel] = 239;
        image.data[pixel + 1] = 68;
        image.data[pixel + 2] = 68;
        image.data[pixel + 3] = 160;
    }
}
