'use client';

export interface DetectedInventoryColor {
    label: string;
    confidence: number;
    hex: string;
}

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

function rgbToHsv(r: number, g: number, b: number) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;

    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;

    let h = 0;
    if (delta !== 0) {
        if (max === rn) h = ((gn - bn) / delta) % 6;
        else if (max === gn) h = (bn - rn) / delta + 2;
        else h = (rn - gn) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }

    const s = max === 0 ? 0 : delta / max;
    const v = max;
    return { h, s, v };
}

function rgbToHex(r: number, g: number, b: number) {
    const toHex = (value: number) => Math.round(clamp(value, 0, 255)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function classifyColor(h: number, s: number, v: number) {
    if (s < 0.08 && v > 0.9) return 'Blanco';
    if (s < 0.08 && v < 0.16) return 'Negro';

    if (s < 0.12) {
        if (v > 0.74) return 'Plateado';
        return 'Gris';
    }

    if (h >= 20 && h <= 55 && s <= 0.36 && v >= 0.62) {
        if (s < 0.23) return 'Nude';
        return 'Dorado';
    }

    if (h < 15 || h >= 345) return 'Rojo';
    if (h < 35) return 'Naranja';
    if (h < 63) return 'Amarillo';
    if (h < 165) return 'Verde';
    if (h < 255) return 'Azul';
    if (h < 305) return 'Violeta';
    return 'Rosa';
}

function classifyDentalShade(input: {
    h: number;
    s: number;
    v: number;
    label: string;
}) {
    const { h, s, v, label } = input;

    if (label === 'Blanco' && v > 0.9) {
        return 'BL1';
    }

    if (label === 'Plateado' || label === 'Gris') {
        return v > 0.7 ? 'C1' : 'C2';
    }

    if (label === 'Nude' || label === 'Dorado' || label === 'Amarillo' || (h >= 25 && h <= 58)) {
        if (v > 0.86 && s < 0.22) return 'B1';
        if (v > 0.78) return 'B2';
        return 'B3';
    }

    if (label === 'Rojo' || label === 'Naranja' || label === 'Rosa' || (h < 28 || h >= 330)) {
        if (v > 0.88 && s < 0.24) return 'A1';
        if (v > 0.8 && s < 0.3) return 'A2';
        if (v > 0.7) return 'A3';
        if (v > 0.58) return 'A3.5';
        return 'A4';
    }

    if (label === 'Azul' || label === 'Violeta' || label === 'Verde') {
        if (v > 0.78) return 'D2';
        return 'D3';
    }

    if (v > 0.9) return 'BL2';
    if (v > 0.82) return 'A2';
    if (v > 0.72) return 'A3';
    return 'A3.5';
}

async function loadImageFromFile(file: File) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);
        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('No se pudo leer imagen para detectar color'));
        };
        image.src = url;
    });
}

export async function detectInventoryColorFromFile(file: File): Promise<DetectedInventoryColor | null> {
    const image = await loadImageFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return null;

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

    const bins = new Map<string, number>();
    let totalWeight = 0;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;

    for (let index = 0; index < data.length; index += 4) {
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const a = data[index + 3];
        if (a < 28) continue;

        const { h, s, v } = rgbToHsv(r, g, b);
        const label = classifyColor(h, s, v);
        const weight = clamp(0.25 + s * 0.85 + v * 0.2, 0.2, 1.2);

        bins.set(label, (bins.get(label) || 0) + weight);
        totalWeight += weight;
        sumR += r * weight;
        sumG += g * weight;
        sumB += b * weight;
    }

    if (totalWeight <= 0 || bins.size === 0) return null;

    const ordered = Array.from(bins.entries()).sort((a, b) => b[1] - a[1]);
    const [label, bestWeight] = ordered[0];
    const confidence = clamp(bestWeight / totalWeight, 0.42, 0.96);

    const avgR = sumR / totalWeight;
    const avgG = sumG / totalWeight;
    const avgB = sumB / totalWeight;
    const avgHsv = rgbToHsv(avgR, avgG, avgB);

    return {
        label: classifyDentalShade({
            h: avgHsv.h,
            s: avgHsv.s,
            v: avgHsv.v,
            label,
        }),
        confidence: Math.round(confidence * 100) / 100,
        hex: rgbToHex(avgR, avgG, avgB),
    };
}
