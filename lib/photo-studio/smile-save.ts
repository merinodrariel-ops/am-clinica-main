/**
 * Generates a side-by-side (before/after) base64 string for saving.
 */
async function generateComparisonBase64(
    beforeUrl: string,
    afterDataUrl: string,
    maxSide = 1600,
    quality = 0.86
): Promise<string | null> {
    return new Promise((resolve) => {
        const imgBefore = new Image();
        const imgAfter = new Image();
        let loadedCount = 0;

        const onBothLoaded = () => {
            loadedCount++;
            if (loadedCount === 2) {
                try {
                    const canvas = document.createElement('canvas');
                    const w = imgBefore.naturalWidth || imgBefore.width;
                    const h = imgBefore.naturalHeight || imgBefore.height;

                    // Constrain for performance/safety
                    let scale = 1;
                    if (w > maxSide || h > maxSide) {
                        scale = maxSide / Math.max(w, h);
                    }

                    const sw = Math.round(w * scale);
                    const sh = Math.round(h * scale);

                    canvas.width = sw * 2;
                    canvas.height = sh;
                    const ctx = canvas.getContext('2d', { alpha: false })!;

                    ctx.drawImage(imgBefore, 0, 0, sw, sh);
                    ctx.drawImage(imgAfter, sw, 0, sw, sh);

                    // Separator line
                    ctx.fillStyle = '#ffffff44';
                    ctx.fillRect(sw - 1, 0, 2, sh);

                    const result = canvas.toDataURL('image/jpeg', quality);
                    resolve(result.split(',')[1]);
                } catch (e) {
                    console.error('Comparison generation failed:', e);
                    resolve(null);
                }
            }
        };

        imgBefore.onload = onBothLoaded;
        imgAfter.onload = onBothLoaded;
        imgBefore.onerror = () => resolve(null);
        imgAfter.onerror = () => resolve(null);

        if (beforeUrl && !beforeUrl.startsWith('blob:') && !beforeUrl.startsWith('data:')) {
            imgBefore.crossOrigin = "anonymous";
        }
        if (afterDataUrl && !afterDataUrl.startsWith('blob:') && !afterDataUrl.startsWith('data:')) {
            imgAfter.crossOrigin = "anonymous";
        }
        imgBefore.src = beforeUrl;
        imgAfter.src = afterDataUrl;
    });
}

/**
 * Generates a before/after slice image at a given divider position (0-100%).
 * The left portion draws "before" and the right portion draws "after".
 */
async function generateSliceBase64(
    beforeUrl: string,
    afterDataUrl: string,
    pos: number,
    maxSide = 1600,
    quality = 0.86
): Promise<string | null> {
    return new Promise((resolve) => {
        const imgBefore = new Image();
        const imgAfter = new Image();
        let loadedCount = 0;

        const onBothLoaded = () => {
            loadedCount++;
            if (loadedCount === 2) {
                try {
                    const canvas = document.createElement('canvas');
                    const w = imgBefore.naturalWidth || imgBefore.width;
                    const h = imgBefore.naturalHeight || imgBefore.height;
                    const scale = Math.min(1, maxSide / Math.max(w, h));
                    const sw = Math.round(w * scale);
                    const sh = Math.round(h * scale);
                    canvas.width = sw;
                    canvas.height = sh;
                    const ctx = canvas.getContext('2d', { alpha: false })!;

                    // Draw full "after" image as background
                    ctx.drawImage(imgAfter, 0, 0, sw, sh);

                    // Clip left portion and draw "before"
                    const splitX = Math.round(sw * (pos / 100));
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, splitX, sh);
                    ctx.clip();
                    ctx.drawImage(imgBefore, 0, 0, sw, sh);
                    ctx.restore();

                    // Minimal white divider that matches the on-screen comparator.
                    ctx.save();
                    ctx.shadowColor = 'rgba(0,0,0,0.35)';
                    ctx.shadowBlur = Math.max(2, Math.round(sw * 0.003));
                    ctx.fillStyle = 'rgba(255,255,255,0.88)';
                    ctx.fillRect(splitX, 0, Math.max(1, Math.round(sw * 0.001)), sh);
                    ctx.restore();

                    // Labels
                    const fontSize = Math.max(14, Math.round(sw * 0.018));
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.fillText('ANTES', 12, sh - 12);
                    ctx.textAlign = 'right';
                    ctx.fillText('DESPUÉS', sw - 12, sh - 12);

                    const result = canvas.toDataURL('image/jpeg', quality);
                    resolve(result.split(',')[1]);
                } catch (e) {
                    console.error('Slice generation failed:', e);
                    resolve(null);
                }
            }
        };

        imgBefore.onload = onBothLoaded;
        imgAfter.onload = onBothLoaded;
        imgBefore.onerror = () => resolve(null);
        imgAfter.onerror = () => resolve(null);
        if (beforeUrl && !beforeUrl.startsWith('blob:') && !beforeUrl.startsWith('data:')) {
            imgBefore.crossOrigin = 'anonymous';
        }
        if (afterDataUrl && !afterDataUrl.startsWith('blob:') && !afterDataUrl.startsWith('data:')) {
            imgAfter.crossOrigin = 'anonymous';
        }
        imgBefore.src = beforeUrl;
        imgAfter.src = afterDataUrl;
    });
}

const MAX_SMILE_SAVE_PAYLOAD_CHARS = 3_600_000;

async function encodeSmileSaveJpeg(
    dataUrl: string,
    maxSide: number,
    quality: number
): Promise<{ dataUrl: string; base64: string }> {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error('No se pudo preparar una de las imágenes del Smile Design'));
        candidate.src = dataUrl;
    });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('No se pudo preparar el guardado del Smile Design');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const output = canvas.toDataURL('image/jpeg', quality);
    return { dataUrl: output, base64: output.split(',')[1] };
}

export async function prepareSmileDesignSavePayload(beforeDataUrl: string, afterDataUrl: string, slicePos: number) {
    const presets = [
        { maxSide: 1600, quality: 0.86 },
        { maxSide: 1200, quality: 0.80 },
        { maxSide: 900, quality: 0.74 },
    ];

    for (const preset of presets) {
        const [before, after] = await Promise.all([
            encodeSmileSaveJpeg(beforeDataUrl, preset.maxSide, preset.quality),
            encodeSmileSaveJpeg(afterDataUrl, preset.maxSide, preset.quality),
        ]);
        const [comparisonBase64, sliceBase64] = await Promise.all([
            generateComparisonBase64(before.dataUrl, after.dataUrl, preset.maxSide, preset.quality),
            generateSliceBase64(before.dataUrl, after.dataUrl, slicePos, preset.maxSide, preset.quality),
        ]);
        if (!comparisonBase64 || !sliceBase64) continue;

        const payloadChars = before.dataUrl.length + after.base64.length + comparisonBase64.length + sliceBase64.length;
        if (payloadChars <= MAX_SMILE_SAVE_PAYLOAD_CHARS) {
            return {
                beforeDataUrl: before.dataUrl,
                afterBase64: after.base64,
                afterMime: 'image/jpeg',
                comparisonBase64,
                sliceBase64,
                slicePos,
            };
        }
    }

    throw new Error('Las imágenes siguen siendo demasiado pesadas para guardar. Se conservaron sin cambios; volvé a intentar.');
}
