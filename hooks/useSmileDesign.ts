'use client';

import { useState, useCallback } from 'react';

export type SmileLevel = 'Natural' | 'Natural White' | 'Natural Ultra White';
export type SmileIntensity3 = 'Sutil' | 'Medio' | 'Marcado';
export type CentralLength = 'Cortos' | 'Natural' | 'Largos';

export interface SmileSettings {
  level: SmileLevel;
  edges: boolean;
  edgesIntensity: SmileIntensity3;
  texture: boolean;
  textureIntensity: 'Sutil' | 'Medio' | 'Detallado';
  shape: number; // -1 (femenino) a 1 (masculino), 0 = centro
  centralLength: CentralLength;
}

export const DEFAULT_SMILE_SETTINGS: SmileSettings = {
  level: 'Natural',
  edges: true,
  edgesIntensity: 'Medio',
  texture: true,
  textureIntensity: 'Medio',
  shape: 0,
  centralLength: 'Natural',
};

export interface SmileGridData {
  bipupilarY: number | null;   // 0-1 normalized
  smileLineY: number | null;   // 0-1 normalized
  midlineX: number | null;     // 0-1 normalized
}

export type SmileState = 'idle' | 'aligning' | 'enhancing' | 'ready' | 'error';

export interface SmileResult {
  beforeDataUrl: string;
  afterDataUrl: string;
  afterBase64: string;
  afterMime: string;
}

export interface UseSmileDesignReturn {
  process: (imageBlob: Blob, mimeType?: string) => Promise<void>;
  regenerate: () => Promise<void>;
  state: SmileState;
  result: SmileResult | null;
  gridData: SmileGridData | null;
  settings: SmileSettings;
  setSettings: (s: Partial<SmileSettings>) => void;
  setWarpedAfter: (dataUrl: string, base64: string) => void;
  error: string | null;
  reset: () => void;
}

async function compressBlob(
  blob: Blob,
  maxW = 1800,
  quality = 0.92
): Promise<{ base64: string; mimeType: string; dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((b) => {
        if (!b) { reject(new Error('compression failed')); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.split(',')[1];
          resolve({ base64, mimeType: 'image/jpeg', dataUrl, width: w, height: h });
        };
        reader.readAsDataURL(b);
      }, 'image/jpeg', quality);
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function rotateDataUrl(dataUrl: string, angleDeg: number): Promise<string> {
  if (Math.abs(angleDeg) < 0.1) return dataUrl;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const rad = (angleDeg * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const w = Math.round(img.width * cos + img.height * sin);
      const h = Math.round(img.width * sin + img.height * cos);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d')!;
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.src = dataUrl;
  });
}

export function useSmileDesign(): UseSmileDesignReturn {
  const [smileState, setSmileState] = useState<SmileState>('idle');
  const [result, setResult] = useState<SmileResult | null>(null);
  const [gridData, setGridData] = useState<SmileGridData | null>(null);
  const [settings, setSettingsState] = useState<SmileSettings>(DEFAULT_SMILE_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [alignedBase64, setAlignedBase64] = useState<string | null>(null);
  const [alignedMime, setAlignedMime] = useState<string>('image/jpeg');

  const setSettings = useCallback((patch: Partial<SmileSettings>) => {
    setSettingsState(prev => ({ ...prev, ...patch }));
  }, []);

  const callEnhance = useCallback(async (
    base64: string,
    mime: string,
    currentSettings: SmileSettings
  ): Promise<{ afterDataUrl: string; afterBase64: string; afterMime: string }> => {
    const res = await fetch('/api/smile-design/enhance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: mime,
        level: currentSettings.level,
        edges: currentSettings.edges,
        edgesIntensity: currentSettings.edgesIntensity,
        texture: currentSettings.texture,
        textureIntensity: currentSettings.textureIntensity,
        shape: currentSettings.shape,
        centralLength: currentSettings.centralLength,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const afterDataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
    return { afterDataUrl, afterBase64: data.imageBase64, afterMime: data.mimeType };
  }, []);

  const process = useCallback(async (imageBlob: Blob, _mimeType = 'image/jpeg') => {
    setError(null);
    setResult(null);
    setGridData(null);

    try {
      setSmileState('aligning');
      const compressed = await compressBlob(imageBlob, 3840, 0.98);

      let processedBase64 = compressed.base64;
      let processedMime = compressed.mimeType;
      let grid: SmileGridData = { bipupilarY: null, smileLineY: null, midlineX: null };

      try {
        const alignRes = await fetch('/api/smile-design/align', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: compressed.base64,
            mimeType: compressed.mimeType,
            imageWidth: compressed.width,
            imageHeight: compressed.height,
          }),
        });
        const alignData = await alignRes.json();

        // Start with original grid coordinates
        grid = {
          bipupilarY: alignData.bipupilarY ?? null,
          smileLineY: alignData.smileLineY ?? null,
          midlineX: alignData.midlineX ?? null,
        };

        if (alignData.leftPupil && alignData.rightPupil) {
          const dx = (alignData.rightPupil.x - alignData.leftPupil.x) * compressed.width;
          const dy = (alignData.rightPupil.y - alignData.leftPupil.y) * compressed.height;
          const angleDeg = -(Math.atan2(dy, dx) * 180) / Math.PI;

          // Note: Automatic rotation based on pupils is disabled based on user feedback 
          // ("siento que todo el lado derecho de la cara del paciente está como más levantado").
          // We respect the manual alignment from the Photo Studio instead.
          /*
          if (Math.abs(angleDeg) > 0.5) {
            const rotated = await rotateDataUrl(compressed.dataUrl, angleDeg);
            processedBase64 = rotated.split(',')[1];
            processedMime = 'image/jpeg';
            ...
          }
          */
        }
      } catch {
        console.warn('[useSmileDesign] align skipped, proceeding with original');
      }

      setGridData(grid);
      setAlignedBase64(processedBase64);
      setAlignedMime(processedMime);

      const beforeDataUrl = `data:${processedMime};base64,${processedBase64}`;

      setSmileState('enhancing');
      const { afterDataUrl, afterBase64, afterMime } = await callEnhance(
        processedBase64,
        processedMime,
        settings
      );

      setResult({ beforeDataUrl, afterDataUrl, afterBase64, afterMime });
      setSmileState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar la imagen');
      setSmileState('error');
    }
  }, [settings, callEnhance]);

  const regenerate = useCallback(async () => {
    if (!alignedBase64) return;
    setError(null);
    setSmileState('enhancing');
    try {
      const beforeDataUrl = `data:${alignedMime};base64,${alignedBase64}`;
      const { afterDataUrl, afterBase64, afterMime } = await callEnhance(
        alignedBase64,
        alignedMime,
        settings
      );
      setResult(prev => prev ? { ...prev, afterDataUrl, afterBase64, afterMime } : {
        beforeDataUrl,
        afterDataUrl,
        afterBase64,
        afterMime,
      });
      setSmileState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al regenerar');
      setSmileState('error');
    }
  }, [alignedBase64, alignedMime, settings, callEnhance]);

  const setWarpedAfter = useCallback((dataUrl: string, base64: string) => {
    setResult(prev => prev ? { ...prev, afterDataUrl: dataUrl, afterBase64: base64 } : prev);
  }, []);

  const reset = useCallback(() => {
    setSmileState('idle');
    setResult(null);
    setGridData(null);
    setError(null);
    setAlignedBase64(null);
    setSettingsState(DEFAULT_SMILE_SETTINGS);
  }, []);

  return { process, regenerate, state: smileState, result, gridData, settings, setSettings, setWarpedAfter, error, reset };
}
