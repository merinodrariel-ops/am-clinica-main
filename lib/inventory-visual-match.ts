'use client';

import type { VisualMatchCandidate } from '@/app/actions/inventory-stock';

export interface VisualMatchResult {
    product: VisualMatchCandidate;
    score: number;
    confidence: 'ALTO' | 'MEDIO' | 'BAJO';
}

interface RankVisualMatchesInput {
    file: File;
    candidates: VisualMatchCandidate[];
    maxCandidates?: number;
    topK?: number;
}

const signatureCache = new Map<string, number[]>();

function normalizeVector(values: number[]) {
    const length = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(length) || length === 0) return values;
    return values.map(value => value / length);
}

function cosineSimilarity(a: number[], b: number[]) {
    const size = Math.min(a.length, b.length);
    let dot = 0;
    for (let index = 0; index < size; index += 1) {
        dot += a[index] * b[index];
    }
    return Math.max(0, Math.min(1, dot));
}

function confidenceFromScore(score: number): 'ALTO' | 'MEDIO' | 'BAJO' {
    if (score >= 0.9) return 'ALTO';
    if (score >= 0.75) return 'MEDIO';
    return 'BAJO';
}

function buildHistogramSignature(source: CanvasImageSource) {
    const canvas = document.createElement('canvas');
    canvas.width = 48;
    canvas.height = 48;

    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
        throw new Error('No se pudo analizar imagen en este navegador.');
    }

    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const binsPerChannel = 8;
    const histogramSize = binsPerChannel * 3;
    const histogram = new Array<number>(histogramSize).fill(0);

    for (let i = 0; i < image.data.length; i += 4) {
        const alpha = image.data[i + 3];
        if (alpha < 20) continue;

        const rBin = Math.min(7, Math.floor(image.data[i] / 32));
        const gBin = Math.min(7, Math.floor(image.data[i + 1] / 32));
        const bBin = Math.min(7, Math.floor(image.data[i + 2] / 32));

        histogram[rBin] += 1;
        histogram[binsPerChannel + gBin] += 1;
        histogram[binsPerChannel * 2 + bBin] += 1;
    }

    return normalizeVector(histogram);
}

async function toBitmap(source: Blob | File | string) {
    if (typeof source === 'string') {
        const response = await fetch(source, { cache: 'force-cache' });
        if (!response.ok) {
            throw new Error(`No se pudo descargar imagen (${response.status})`);
        }
        const blob = await response.blob();
        return createImageBitmap(blob);
    }

    return createImageBitmap(source);
}

async function getSignatureFromUrl(url: string) {
    const cached = signatureCache.get(url);
    if (cached) {
        return cached;
    }

    const bitmap = await toBitmap(url);
    const signature = buildHistogramSignature(bitmap);
    bitmap.close();
    signatureCache.set(url, signature);
    return signature;
}

export async function rankInventoryVisualMatches({
    file,
    candidates,
    maxCandidates = 60,
    topK = 3,
}: RankVisualMatchesInput): Promise<VisualMatchResult[]> {
    const queryBitmap = await toBitmap(file);
    const querySignature = buildHistogramSignature(queryBitmap);
    queryBitmap.close();

    const limitedCandidates = candidates
        .filter(candidate => Boolean(candidate.image_thumb_url || candidate.image_full_url))
        .slice(0, Math.max(1, maxCandidates));

    const scored = await Promise.all(
        limitedCandidates.map(async candidate => {
            const imageUrl = candidate.image_thumb_url || candidate.image_full_url;
            if (!imageUrl) return null;

            try {
                const candidateSignature = await getSignatureFromUrl(imageUrl);
                const score = cosineSimilarity(querySignature, candidateSignature);
                return {
                    product: candidate,
                    score,
                    confidence: confidenceFromScore(score),
                } as VisualMatchResult;
            } catch {
                return null;
            }
        })
    );

    return scored
        .filter((row): row is VisualMatchResult => Boolean(row))
        .sort((a, b) => b.score - a.score)
        .slice(0, Math.max(1, topK));
}
