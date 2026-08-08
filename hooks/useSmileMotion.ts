'use client';

import { useCallback, useRef, useState } from 'react';

export type MotionState = 'idle' | 'generating' | 'ready' | 'error';

export interface MotionResult {
  afterVideoUrl: string;
}

export interface UseSmileMotionReturn {
  generate: (afterDataUrl: string, patientId: string, baseName: string) => Promise<void>;
  state: MotionState;
  result: MotionResult | null;
  error: string | null;
  reset: () => void;
}

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 42;

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
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No se pudo preparar la imagen')); return; }
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('No se pudo comprimir la imagen')); return; }
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1]);
          reader.onerror = () => reject(new Error('No se pudo leer la imagen comprimida'));
          reader.readAsDataURL(blob);
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => reject(new Error('No se pudo leer la imagen para generar video'));
    img.src = dataUrl;
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return response.json().catch(() => ({})) as Promise<Record<string, unknown>>;
}

function errorMessage(data: Record<string, unknown>, fallback: string): string {
  return typeof data.error === 'string' ? data.error : fallback;
}

export function useSmileMotion(): UseSmileMotionReturn {
  const [state, setState] = useState<MotionState>('idle');
  const [result, setResult] = useState<MotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generationIdRef = useRef(0);

  const generate = useCallback(async (afterDataUrl: string, patientId: string, baseName: string) => {
    const generationId = ++generationIdRef.current;
    setError(null);
    setResult(null);
    setState('generating');

    try {
      const afterBase64 = await compressForMotion(afterDataUrl);
      const startResponse = await fetch('/api/smile-design/motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ afterBase64, mimeType: 'image/jpeg', patientId, baseName }),
      });
      const startData = await responseJson(startResponse);
      if (!startResponse.ok) throw new Error(errorMessage(startData, `Error HTTP ${startResponse.status}`));

      const operationName = typeof startData.operationName === 'string' ? startData.operationName : '';
      const safeBaseName = typeof startData.baseName === 'string' ? startData.baseName : baseName;
      if (!operationName) throw new Error('Google no inició la generación del video');

      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        if (generationIdRef.current !== generationId) return;

        const pollResponse = await fetch('/api/smile-design/motion', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationName, patientId, baseName: safeBaseName }),
        });
        const pollData = await responseJson(pollResponse);
        if (!pollResponse.ok && pollResponse.status !== 202) {
          throw new Error(errorMessage(pollData, `Error HTTP ${pollResponse.status}`));
        }
        if (pollData.status === 'ready' && typeof pollData.afterVideoUrl === 'string') {
          setResult({ afterVideoUrl: pollData.afterVideoUrl });
          setState('ready');
          return;
        }
      }

      throw new Error('Google demoró más de 7 minutos. Intentá nuevamente en unos minutos.');
    } catch (err) {
      if (generationIdRef.current !== generationId) return;
      setError(err instanceof Error ? err.message : 'Error al generar video');
      setState('error');
    }
  }, []);

  const reset = useCallback(() => {
    generationIdRef.current += 1;
    setState('idle');
    setResult(null);
    setError(null);
  }, []);

  return { generate, state, result, error, reset };
}
