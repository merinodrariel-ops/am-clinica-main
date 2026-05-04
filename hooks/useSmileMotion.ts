'use client';

import { useState, useCallback } from 'react';

export type MotionState = 'idle' | 'generating' | 'ready' | 'error';

export interface MotionResult {
  beforeVideoUrl: string;
  afterVideoUrl: string;
}

export interface UseSmileMotionReturn {
  generate: (
    beforeDataUrl: string,
    afterDataUrl: string,
    patientId: string,
    baseName: string
  ) => Promise<void>;
  state: MotionState;
  result: MotionResult | null;
  error: string | null;
  reset: () => void;
}

async function compressForMotion(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX_W = 1024;
      const scale = Math.min(1, MAX_W / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (b) => {
          if (!b) { reject(new Error('compression failed')); return; }
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            resolve(dataUrl.split(',')[1]); // raw base64, no prefix
          };
          reader.onerror = reject;
          reader.readAsDataURL(b);
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen para generar video'));
    img.src = dataUrl;
  });
}

export function useSmileMotion(): UseSmileMotionReturn {
  const [state, setState] = useState<MotionState>('idle');
  const [result, setResult] = useState<MotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    beforeDataUrl: string,
    afterDataUrl: string,
    patientId: string,
    baseName: string
  ) => {
    setError(null);
    setState('generating');

    try {
      // Compress both images to ≤1024px before sending
      const [compBefore, compAfter] = await Promise.all([
        compressForMotion(beforeDataUrl),
        compressForMotion(afterDataUrl),
      ]);

      const res = await fetch('/api/smile-design/motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeBase64: compBefore,
          afterBase64: compAfter,
          mimeType: 'image/jpeg',
          patientId,
          baseName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Error HTTP ${res.status}`);
      if (data.error) throw new Error(data.error);

      setResult({ beforeVideoUrl: data.beforeVideoUrl, afterVideoUrl: data.afterVideoUrl });
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al generar video');
      setState('error');
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setResult(null);
    setError(null);
  }, []);

  return { generate, state, result, error, reset };
}
