# Smile Design v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrar Smile Design con IA dentro del PhotoStudioModal y en la grilla de fotos, con slider antes/después interactivo compartible con el paciente vía portal existente.

**Architecture:** El hook `useSmileDesign` extrae la lógica de las APIs (align + enhance). `SmileDesignPanel` provee los controles. `PhotoStudioModal` agrega un modo `smileDesign` que reemplaza el panel derecho. El resultado se guarda en Supabase Storage (`patient-portal-files`) y en la tabla `patient_files` — el mismo patrón que usa el SmileDesign.tsx existente. El link para el paciente es la URL existente del portal `/mi-clinica/[token]` (ya muestra smile designs automáticamente).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Gemini 2.0 Flash (`/api/smile-design/*`), Supabase Storage (`patient-portal-files` bucket), `patient_files` table, `patient_portal_tokens` table.

**Spec:** `docs/plans/2026-03-27-smile-design-v2-design.md`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `app/api/smile-design/align/route.ts` | Modify | Add smile line detection + return normalized 0-1 coords |
| `app/api/smile-design/enhance/route.ts` | Modify | Accept rich params (level, edges, texture, shape) → build richer Gemini prompt |
| `hooks/useSmileDesign.ts` | Create | Orchestration hook: align → enhance → save |
| `components/patients/drive/BeforeAfterSlider.tsx` | Create | Slider interactivo reutilizable (para modal canvas) |
| `components/patients/drive/SmileDesignPanel.tsx` | Create | Panel de controles del lado derecho del editor |
| `app/actions/smile-design.ts` | Create | Server actions: saveSmileDesignResult, getSmileShareUrl |
| `components/patients/drive/PhotoStudioModal.tsx` | Modify | Modo smileDesign + botón ✨ en toolbar + grid toggle |
| `components/patients/drive/DriveFileCard.tsx` | Modify | Botón ✨ quick-access |

**NO se crea tabla nueva** — se reutiliza `patient_files` (mismo patrón del SmileDesign.tsx existente que ya funciona en el portal).

---

## Task 1: Update `/api/smile-design/align` — smile line + normalized coords

**Files:**
- Modify: `app/api/smile-design/align/route.ts`

The current API asks Gemini for pupil pixel coordinates and returns them raw. We need to:
1. Also ask for the smile line (horizontal line through mouth corners)
2. Ask for the image dimensions used (or accept them in the request)
3. Return all coords normalized to 0–1 range

- [ ] **Step 1: Read the current align route**

```bash
cat app/api/smile-design/align/route.ts
```

- [ ] **Step 2: Update request type to accept image dimensions**

Change the request body to:
```typescript
const body = await req.json();
const { imageBase64, mimeType, imageWidth, imageHeight } = body;
// imageWidth, imageHeight are optional — used for normalization
// If not provided, coordinates remain as pixel values
```

- [ ] **Step 3: Update the Gemini prompt to request smile line**

Find the prompt string (currently asks for pupil positions). Replace with:

```typescript
const prompt = `Analyze this dental patient portrait photo and return JSON with the following coordinates (pixel positions from top-left corner 0,0):
{
  "leftPupil": { "x": number, "y": number },
  "rightPupil": { "x": number, "y": number },
  "smileLineY": number
}
Where:
- leftPupil and rightPupil are the center of each iris
- smileLineY is the Y coordinate of the horizontal line passing through the corners of the mouth (commissures)
If any landmark is not visible or not detectable, return null for that field.
Return ONLY valid JSON, no markdown.`;
```

- [ ] **Step 4: Update the response to normalize and include midline**

After parsing the Gemini response, normalize and compute midline:

```typescript
// Normalize if dimensions provided
const w = imageWidth || 1;
const h = imageHeight || 1;
const normalize = imageWidth && imageHeight;

const leftPupil = parsed.leftPupil ? {
  x: normalize ? parsed.leftPupil.x / w : parsed.leftPupil.x,
  y: normalize ? parsed.leftPupil.y / h : parsed.leftPupil.y,
} : null;

const rightPupil = parsed.rightPupil ? {
  x: normalize ? parsed.rightPupil.x / w : parsed.rightPupil.x,
  y: normalize ? parsed.rightPupil.y / h : parsed.rightPupil.y,
} : null;

const smileLineY = parsed.smileLineY != null
  ? (normalize ? parsed.smileLineY / h : parsed.smileLineY)
  : null;

// Midline X = average of pupils
const midlineX = (leftPupil && rightPupil)
  ? (leftPupil.x + rightPupil.x) / 2
  : null;

// Bipupillar Y = average of pupils
const bipupilarY = (leftPupil && rightPupil)
  ? (leftPupil.y + rightPupil.y) / 2
  : null;

return NextResponse.json({
  leftPupil,
  rightPupil,
  bipupilarY,
  smileLineY,
  midlineX,
});
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors in align/route.ts

- [ ] **Step 6: Commit**

```bash
git add app/api/smile-design/align/route.ts
git commit -m "feat(smile): align API returns smile line + normalized coords"
```

---

## Task 2: Update `/api/smile-design/enhance` — rich parameters

**Files:**
- Modify: `app/api/smile-design/enhance/route.ts`

The current API only accepts `intensity: 1-10`. We need to accept the new UI parameters and build a richer Gemini prompt.

- [ ] **Step 1: Read the current enhance route**

```bash
cat app/api/smile-design/enhance/route.ts
```

- [ ] **Step 2: Update request type**

Add new optional parameters (backward compatible — `intensity` still works):

```typescript
const body = await req.json();
const {
  imageBase64,
  mimeType,
  // New rich params (optional, take precedence over intensity)
  level,           // 'Natural' | 'Natural White' | 'Natural Ultra White'
  edges,           // boolean
  edgesIntensity,  // 'Sutil' | 'Medio' | 'Marcado'
  texture,         // boolean
  textureIntensity,// 'Sutil' | 'Medio' | 'Detallado'
  shape,           // number -1 (fem) to 1 (masc), 0 = center
  // Legacy
  intensity,       // number 1-10 (used if level not provided)
} = body;
```

- [ ] **Step 3: Build the rich prompt**

Replace the simple intensity-based prompt lookup with:

```typescript
// Map level to whitening description
const LEVEL_PROMPTS: Record<string, string> = {
  'Natural':            'Keep whitening extremely subtle — healthy clean look, no artificial brightness. Preserve the original tooth shade, just clean.',
  'Natural White':      'Apply moderate natural whitening — brighter than the original but still looks completely natural and healthy, not artificial.',
  'Natural Ultra White':'Apply maximum whitening while maintaining a natural appearance — very bright but with realistic translucency and texture.',
};

// Incisal edge descriptions
const EDGES_PROMPTS: Record<string, string> = {
  'Sutil':   'Add very subtle incisal translucency — barely noticeable blue-white edge effect.',
  'Medio':   'Add natural incisal translucency — the typical blue-white edge seen in healthy young teeth.',
  'Marcado': 'Add prominent incisal translucency — clearly visible blue-white edge effect for dramatic aesthetic result.',
};

// Texture descriptions
const TEXTURE_PROMPTS: Record<string, string> = {
  'Sutil':    'Add very subtle surface micro-texture — smooth with just a hint of natural tooth structure.',
  'Medio':    'Add natural surface micro-texture — the typical horizontal perikymata and subtle lobes of healthy teeth.',
  'Detallado':'Add detailed realistic surface texture — prominent perikymata, lobes, and natural surface variations.',
};

// Build the full prompt
let baseWhitening: string;
if (level) {
  baseWhitening = LEVEL_PROMPTS[level] || LEVEL_PROMPTS['Natural White'];
} else {
  // Legacy intensity mapping
  const effectiveIntensity = Math.max(1, Math.min(10, intensity || 5));
  const intensityMap: Record<number, string> = {
    1: LEVEL_PROMPTS['Natural'],
    2: LEVEL_PROMPTS['Natural'],
    3: LEVEL_PROMPTS['Natural'],
    4: LEVEL_PROMPTS['Natural White'],
    5: LEVEL_PROMPTS['Natural White'],
    6: LEVEL_PROMPTS['Natural White'],
    7: LEVEL_PROMPTS['Natural Ultra White'],
    8: LEVEL_PROMPTS['Natural Ultra White'],
    9: LEVEL_PROMPTS['Natural Ultra White'],
    10: LEVEL_PROMPTS['Natural Ultra White'],
  };
  baseWhitening = intensityMap[effectiveIntensity];
}

const edgesInstruction = edges && edgesIntensity
  ? EDGES_PROMPTS[edgesIntensity]
  : '';

const textureInstruction = texture && textureIntensity
  ? TEXTURE_PROMPTS[textureIntensity]
  : '';

const shapeInstruction = shape && Math.abs(shape) > 0.1
  ? shape < 0
    ? 'Soften tooth shapes slightly — more rounded, feminine incisal edges and gentle curves.'
    : 'Slightly square the tooth shapes — more defined incisal line angles and masculine proportions.'
  : '';

const prompt = `You are an expert cosmetic dentist performing digital smile design. Enhance the teeth in this patient photo with the following specifications:

WHITENING: ${baseWhitening}
${edgesInstruction ? `INCISAL EDGES: ${edgesInstruction}` : ''}
${textureInstruction ? `SURFACE TEXTURE: ${textureInstruction}` : ''}
${shapeInstruction ? `TOOTH SHAPE: ${shapeInstruction}` : ''}

CRITICAL RULES:
- Only modify the teeth — preserve the face, skin, lips, gums exactly as they are
- Maintain exact facial proportions, lighting, and shadows
- Result must look like a real photograph, not CGI
- Close any diastemas (gaps between teeth) naturally
- Align teeth symmetrically while preserving the patient's natural anatomy
- Do not change the patient's smile arc or lip shape`;
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 5: Commit**

```bash
git add app/api/smile-design/enhance/route.ts
git commit -m "feat(smile): enhance API accepts level/edges/texture/shape params"
```

---

## Task 3: Create `hooks/useSmileDesign.ts`

**Files:**
- Create: `hooks/useSmileDesign.ts`

This hook orchestrates the full smile design flow and exposes composable state for use in PhotoStudioModal. It extracts the core logic from `SmileDesign.tsx` (compress → align → enhance) without the UI.

- [ ] **Step 1: Create the file**

```typescript
// hooks/useSmileDesign.ts
'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';

export type SmileLevel = 'Natural' | 'Natural White' | 'Natural Ultra White';
export type SmileIntensity3 = 'Sutil' | 'Medio' | 'Marcado';

export interface SmileSettings {
  level: SmileLevel;
  edges: boolean;
  edgesIntensity: SmileIntensity3;
  texture: boolean;
  textureIntensity: 'Sutil' | 'Medio' | 'Detallado';
  shape: number; // -1 (femenino) a 1 (masculino), 0 = centro
}

export const DEFAULT_SMILE_SETTINGS: SmileSettings = {
  level: 'Natural White',
  edges: true,
  edgesIntensity: 'Medio',
  texture: true,
  textureIntensity: 'Medio',
  shape: 0,
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
  error: string | null;
  reset: () => void;
}

/** Compress image Blob, returns base64 (no data: prefix) + dataUrl */
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

/** Rotate an image dataUrl by angleDeg, returns new dataUrl */
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

  // Store the aligned base64 so regenerate can reuse it without re-aligning
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
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const afterDataUrl = `data:${data.mimeType};base64,${data.imageBase64}`;
    return { afterDataUrl, afterBase64: data.imageBase64, afterMime: data.mimeType };
  }, []);

  const process = useCallback(async (imageBlob: Blob, mimeType = 'image/jpeg') => {
    setError(null);
    setResult(null);
    setGridData(null);

    try {
      // 1. Compress
      setSmileState('aligning');
      const compressed = await compressBlob(imageBlob);

      // 2. Align (non-fatal if fails)
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

        // Compute rotation angle from pupils
        if (alignData.leftPupil && alignData.rightPupil) {
          const dx = (alignData.rightPupil.x - alignData.leftPupil.x) * compressed.width;
          const dy = (alignData.rightPupil.y - alignData.leftPupil.y) * compressed.height;
          const angleDeg = -(Math.atan2(dy, dx) * 180) / Math.PI;

          if (Math.abs(angleDeg) > 0.5) {
            const rotated = await rotateDataUrl(compressed.dataUrl, angleDeg);
            processedBase64 = rotated.split(',')[1];
            processedMime = 'image/jpeg';
          }
        }

        grid = {
          bipupilarY: alignData.bipupilarY ?? null,
          smileLineY: alignData.smileLineY ?? null,
          midlineX: alignData.midlineX ?? null,
        };
      } catch {
        console.warn('[useSmileDesign] align skipped, proceeding with original');
      }

      setGridData(grid);
      setAlignedBase64(processedBase64);
      setAlignedMime(processedMime);

      // Build beforeDataUrl from processed base64
      const beforeDataUrl = `data:${processedMime};base64,${processedBase64}`;

      // 3. Enhance
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

  const reset = useCallback(() => {
    setSmileState('idle');
    setResult(null);
    setGridData(null);
    setError(null);
    setAlignedBase64(null);
    setSettingsState(DEFAULT_SMILE_SETTINGS);
  }, []);

  return { process, regenerate, state: smileState, result, gridData, settings, setSettings, error, reset };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "useSmileDesign" | head -10
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add hooks/useSmileDesign.ts
git commit -m "feat(smile): add useSmileDesign hook with align+enhance orchestration"
```

---

## Task 4: Create `BeforeAfterSlider` component

**Files:**
- Create: `components/patients/drive/BeforeAfterSlider.tsx`

Slider interactivo reutilizable. Usa `input[type=range]` nativo — funciona con touch en mobile sin librerías extra.

- [ ] **Step 1: Create the file**

```typescript
// components/patients/drive/BeforeAfterSlider.tsx
'use client';

import { useState, useRef } from 'react';

interface BeforeAfterSliderProps {
  beforeSrc: string;  // data URL or remote URL
  afterSrc: string;
  className?: string;
}

export default function BeforeAfterSlider({ beforeSrc, afterSrc, className = '' }: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(50); // 0-100

  return (
    <div
      className={`relative select-none overflow-hidden rounded-lg ${className}`}
      style={{ userSelect: 'none' }}
    >
      {/* After image (full, behind) */}
      <img
        src={afterSrc}
        alt="Después"
        className="block w-full h-full object-cover"
        draggable={false}
      />

      {/* Before image (clipped on left) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
      >
        <img
          src={beforeSrc}
          alt="Antes"
          className="block w-full h-full object-cover"
          draggable={false}
        />
      </div>

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10 pointer-events-none"
        style={{ left: `${pos}%`, transform: 'translateX(-50%)' }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-xl flex items-center justify-content-center">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-gray-600 mx-auto" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M8 12h8M15 9l3 3-3 3M9 9l-3 3 3 3" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute bottom-2 left-2 text-xs text-white/70 font-medium z-10 pointer-events-none">ANTES</span>
      <span className="absolute bottom-2 right-2 text-xs text-white/70 font-medium z-10 pointer-events-none">DESPUÉS</span>

      {/* Range input (invisible, full-size, on top) */}
      <input
        type="range"
        min={5}
        max={95}
        value={pos}
        onChange={e => setPos(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-col-resize z-20"
        style={{ WebkitAppearance: 'none' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "BeforeAfterSlider" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add components/patients/drive/BeforeAfterSlider.tsx
git commit -m "feat(smile): add BeforeAfterSlider component"
```

---

## Task 5: Create `SmileDesignPanel` component

**Files:**
- Create: `components/patients/drive/SmileDesignPanel.tsx`

Panel de controles del lado derecho del PhotoStudioModal cuando está en modo Smile Design.

- [ ] **Step 1: Create the file**

```typescript
// components/patients/drive/SmileDesignPanel.tsx
'use client';

import { SmileSettings, SmileState, DEFAULT_SMILE_SETTINGS, SmileLevel, SmileIntensity3 } from '@/hooks/useSmileDesign';

interface SmileDesignPanelProps {
  state: SmileState;
  settings: SmileSettings;
  onSettingsChange: (patch: Partial<SmileSettings>) => void;
  onRegenerate: () => void;
  onSave: () => void;
  onShareLink: () => void;
  onExit: () => void;
  canSave: boolean;
  isSaving: boolean;
  processingTime?: number; // seconds
  gridVisible: boolean;
  onToggleGrid: () => void;
  error: string | null;
}

const LEVELS: SmileLevel[] = ['Natural', 'Natural White', 'Natural Ultra White'];
const INTENSITIES_3: SmileIntensity3[] = ['Sutil', 'Medio', 'Marcado'];
const TEXTURE_INTENSITIES = ['Sutil', 'Medio', 'Detallado'] as const;

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative w-8 h-4 rounded-full transition-colors ${on ? 'bg-violet-600' : 'bg-slate-600'}`}
    >
      <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-4' : 'translate-x-0.5'}`} />
    </button>
  );
}

function IntensityPicker<T extends string>({
  options, value, onChange
}: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1.5 mt-1.5">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`flex-1 text-center text-[10px] py-1 rounded transition-colors ${
            value === opt
              ? 'bg-violet-700 text-violet-100 font-semibold'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export default function SmileDesignPanel({
  state, settings, onSettingsChange, onRegenerate, onSave, onShareLink, onExit,
  canSave, isSaving, processingTime, gridVisible, onToggleGrid, error,
}: SmileDesignPanelProps) {
  const isProcessing = state === 'aligning' || state === 'enhancing';
  const isReady = state === 'ready';

  return (
    <div className="flex flex-col gap-3 p-3 text-sm overflow-y-auto">

      {/* Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-slate-800">
        <span className="text-base">✨</span>
        <span className="font-bold text-white text-xs">Smile Design</span>
        <span className="ml-auto text-[9px] bg-emerald-700 text-emerald-100 px-1.5 py-0.5 rounded">IA</span>
      </div>

      {/* Processing indicator */}
      {isProcessing && (
        <div className="text-center py-4 text-slate-400 text-xs">
          <div className="animate-pulse mb-1">
            {state === 'aligning' ? '🔍 Detectando alineado...' : '✨ Generando smile...'}
          </div>
          <div className="text-slate-600 text-[10px]">Esto toma 3-6 segundos</div>
        </div>
      )}

      {/* Error */}
      {state === 'error' && error && (
        <div className="bg-red-900/30 border border-red-800 rounded p-2 text-xs text-red-300">
          {error}
          <button onClick={onRegenerate} className="block mt-1 text-red-400 underline">Reintentar</button>
        </div>
      )}

      {/* Controls (visible when ready or idle) */}
      {!isProcessing && (
        <>
          {/* Whitening level */}
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Nivel de blanco</div>
            <div className="flex flex-col gap-1">
              {LEVELS.map(lvl => (
                <button
                  key={lvl}
                  onClick={() => onSettingsChange({ level: lvl })}
                  className={`text-left px-2.5 py-2 rounded-md text-xs transition-colors ${
                    settings.level === lvl
                      ? 'bg-violet-900/60 border border-violet-600 text-violet-200 font-semibold'
                      : 'bg-slate-800 text-slate-400 border border-transparent hover:bg-slate-700'
                  }`}
                >
                  {lvl}
                  {lvl === DEFAULT_SMILE_SETTINGS.level && settings.level === lvl && (
                    <span className="ml-1 text-[9px] text-violet-400">default</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Incisal edges */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Bordes incisales</span>
              <Toggle on={settings.edges} onChange={v => onSettingsChange({ edges: v })} />
            </div>
            {settings.edges && (
              <IntensityPicker
                options={INTENSITIES_3}
                value={settings.edgesIntensity}
                onChange={v => onSettingsChange({ edgesIntensity: v })}
              />
            )}
          </div>

          {/* Texture */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Textura dental</span>
              <Toggle on={settings.texture} onChange={v => onSettingsChange({ texture: v })} />
            </div>
            {settings.texture && (
              <IntensityPicker
                options={TEXTURE_INTENSITIES}
                value={settings.textureIntensity}
                onChange={v => onSettingsChange({ textureIntensity: v })}
              />
            )}
          </div>

          {/* Shape: femenino / masculino */}
          <div>
            <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Forma dental</div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-pink-300">Fem</span>
              <input
                type="range"
                min={-10}
                max={10}
                step={1}
                value={Math.round(settings.shape * 10)}
                onChange={e => onSettingsChange({ shape: Number(e.target.value) / 10 })}
                className="flex-1 accent-violet-500"
              />
              <span className="text-[9px] text-blue-300">Masc</span>
            </div>
            {Math.abs(settings.shape) < 0.15 && (
              <div className="text-center text-[9px] text-violet-400 mt-0.5">Centro (default)</div>
            )}
          </div>

          {/* Grid reference toggle */}
          <div className="flex items-center gap-2 py-1.5 border-t border-slate-800">
            <span className="text-[10px] text-slate-500 flex-1">Grilla de referencia</span>
            <Toggle on={gridVisible} onChange={onToggleGrid} />
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-2 pt-1">
            {isReady && (
              <button
                onClick={onRegenerate}
                className="w-full bg-violet-700 hover:bg-violet-600 text-white text-xs py-2 rounded-lg font-semibold transition-colors"
              >
                🔄 Regenerar
              </button>
            )}
            {canSave && isReady && (
              <button
                onClick={onSave}
                disabled={isSaving}
                className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs py-2 rounded-lg font-semibold transition-colors"
              >
                {isSaving ? 'Guardando...' : '💾 Guardar en Drive'}
              </button>
            )}
            {isReady && (
              <button
                onClick={onShareLink}
                className="w-full bg-transparent border border-slate-600 hover:border-slate-400 text-slate-300 text-xs py-2 rounded-lg transition-colors"
              >
                🔗 Link para paciente
              </button>
            )}
          </div>

          {/* Status line */}
          {isReady && processingTime && (
            <div className="text-center text-[10px] text-emerald-500 bg-slate-900/50 rounded py-1">
              ✓ Procesado en {processingTime.toFixed(1)}s · {settings.level}
            </div>
          )}
        </>
      )}

      {/* Exit button */}
      <button
        onClick={onExit}
        className="mt-auto w-full text-slate-500 hover:text-slate-300 text-xs py-1.5 border-t border-slate-800 transition-colors"
      >
        ✕ Salir de Smile Design
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "SmileDesignPanel" | head -5
```

- [ ] **Step 3: Commit**

```bash
git add components/patients/drive/SmileDesignPanel.tsx
git commit -m "feat(smile): add SmileDesignPanel controls component"
```

---

## Task 6: Create `app/actions/smile-design.ts`

**Files:**
- Create: `app/actions/smile-design.ts`

Server actions para guardar resultados y generar el link compartible.

- [ ] **Step 1: Create the file**

```typescript
// app/actions/smile-design.ts
'use server';

import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

interface SaveSmileParams {
  patientId: string;
  beforeUrl: string;     // URL in Supabase Storage (already uploaded client-side)
  afterUrl: string;      // URL in Supabase Storage (already uploaded client-side)
  settings: {
    level: string;
    edges: boolean;
    edgesIntensity: string;
    texture: boolean;
    textureIntensity: string;
    shape: number;
  };
}

/** Save smile design before/after pair to patient_files table */
export async function saveSmileDesignResult(params: SaveSmileParams): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { success: false, error: 'No autenticado' };

    const admin = createAdminClient();
    const ts = new Date().toISOString().replace(/[:.]/g, '-');

    const records = [
      {
        patient_id: Number(params.patientId),
        file_type: 'photo_before',
        label: `Smile Design – Antes ${ts}`,
        file_url: params.beforeUrl,
        thumbnail_url: params.beforeUrl,
        is_visible_to_patient: true,
        created_by: user.id,
      },
      {
        patient_id: Number(params.patientId),
        file_type: 'photo_after',
        label: `Smile Design – Después ${ts}`,
        file_url: params.afterUrl,
        thumbnail_url: params.afterUrl,
        is_visible_to_patient: true,
        created_by: user.id,
        metadata: params.settings,
      },
    ];

    const { error } = await admin.from('patient_files').insert(records);
    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}

/** Get or create a patient portal token, return share URL */
export async function getSmileShareUrl(patientId: string): Promise<{
  url?: string;
  error?: string;
}> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return { error: 'No autenticado' };

    const admin = createAdminClient();

    // Look for existing token
    const { data: existing } = await admin
      .from('patient_portal_tokens')
      .select('token')
      .eq('patient_id', patientId)
      .single();

    if (existing?.token) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
      return { url: `${baseUrl}/mi-clinica/${existing.token}` };
    }

    // Create new token (365 days for smile design sharing)
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    const { error: insertError } = await admin
      .from('patient_portal_tokens')
      .insert({
        patient_id: patientId,
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (insertError) return { error: insertError.message };

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || '';
    return { url: `${baseUrl}/mi-clinica/${token}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Error desconocido' };
  }
}
```

- [ ] **Step 2: Check that `patient_files` table has a `metadata` column (for settings)**

Run in Supabase SQL Editor:
```sql
ALTER TABLE patient_files
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;
```

If the column already exists, skip this step.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | grep "smile-design" | head -5
```

- [ ] **Step 4: Commit**

```bash
git add app/actions/smile-design.ts
git commit -m "feat(smile): add saveSmileDesignResult + getSmileShareUrl server actions"
```

---

## Task 7: Integrate into `PhotoStudioModal`

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

This is the most complex task. Read the file first to understand the current tool-switching pattern, then add Smile Design mode.

- [ ] **Step 1: Read the relevant sections of PhotoStudioModal**

```bash
# Find the toolbar section where tool buttons are rendered
grep -n "setCropActive\|setBrushMode\|setDrawActive\|tools\|toolbar\|panel" components/patients/drive/PhotoStudioModal.tsx | head -40
```

- [ ] **Step 2: Add imports at top of PhotoStudioModal**

Find the existing imports section and add:
```typescript
import BeforeAfterSlider from './BeforeAfterSlider';
import SmileDesignPanel from './SmileDesignPanel';
import { useSmileDesign } from '@/hooks/useSmileDesign';
import { saveSmileDesignResult, getSmileShareUrl } from '@/app/actions/smile-design';
import { createClient } from '@/utils/supabase/client';
```

- [ ] **Step 3: Add smile design state variables**

After the existing state declarations (near line 340+), add:
```typescript
// Smile Design mode
const [smileMode, setSmileMode] = useState(false);
const [smileGridVisible, setSmileGridVisible] = useState(false);
const [smileIsSaving, setSmileIsSaving] = useState(false);
const [smileProcessingStart, setSmileProcessingStart] = useState<number | null>(null);
const smileDesign = useSmileDesign();
```

- [ ] **Step 4: Add `enterSmileMode` function**

Find the function that handles tool switching (like `setCropActive(false)` etc.) and add:
```typescript
const enterSmileMode = useCallback(async () => {
  // Deactivate other tools (same pattern as crop/brush deactivation)
  setCropActive(false);
  setBrushMode(null);
  // if drawActive exists: setDrawActive(false);

  setSmileMode(true);
  setSmileProcessingStart(Date.now());

  // Get current image as Blob
  const blob = await exportToBlob();
  await smileDesign.process(blob, 'image/jpeg');
}, [exportToBlob, smileDesign]);

const exitSmileMode = useCallback(() => {
  setSmileMode(false);
  setSmileGridVisible(false);
  smileDesign.reset();
}, [smileDesign]);
```

- [ ] **Step 5: Add the ✨ button to the toolbar**

In the right panel where the other tool buttons are (Rotar, Crop, Pincel, etc.), add the Smile Design button. Find the pattern and insert:
```tsx
{/* Smile Design button — shows only for image files */}
{!smileMode && (
  <button
    onClick={enterSmileMode}
    title="Smile Design"
    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-violet-900/40 hover:text-violet-300 transition-colors"
  >
    <span>✨</span>
    <span>Smile Design</span>
  </button>
)}
```

- [ ] **Step 6: Add smile save handler**

```typescript
const handleSmileSave = useCallback(async () => {
  if (!smileDesign.result || !patientId) return;
  setSmileIsSaving(true);

  try {
    const supabase = createClient();
    const ts = Date.now();

    // Upload before image to Supabase Storage
    const beforeBlob = await fetch(smileDesign.result.beforeDataUrl).then(r => r.blob());
    const { data: beforeUpload, error: beforeErr } = await supabase.storage
      .from('patient-portal-files')
      .upload(`portal/${patientId}/smile_before_${ts}.jpg`, beforeBlob, {
        contentType: 'image/jpeg', upsert: false
      });
    if (beforeErr) throw beforeErr;

    // Upload after image
    const afterBlob = await fetch(smileDesign.result.afterDataUrl).then(r => r.blob());
    const { data: afterUpload, error: afterErr } = await supabase.storage
      .from('patient-portal-files')
      .upload(`portal/${patientId}/smile_after_${ts}.jpg`, afterBlob, {
        contentType: `image/${smileDesign.result.afterMime.split('/')[1] || 'jpeg'}`,
        upsert: false
      });
    if (afterErr) throw afterErr;

    const { data: { publicUrl: beforeUrl } } = supabase.storage
      .from('patient-portal-files').getPublicUrl(beforeUpload.path);
    const { data: { publicUrl: afterUrl } } = supabase.storage
      .from('patient-portal-files').getPublicUrl(afterUpload.path);

    // Save to patient_files
    const result = await saveSmileDesignResult({
      patientId,
      beforeUrl,
      afterUrl,
      settings: smileDesign.settings,
    });

    if (result.error) throw new Error(result.error);
    onSaved?.();
    // toast success if toast is imported
  } catch (err) {
    console.error('[SmileDesign] save error:', err);
  } finally {
    setSmileIsSaving(false);
  }
}, [smileDesign.result, smileDesign.settings, patientId, onSaved]);
```

- [ ] **Step 7: Add smile share handler**

```typescript
const handleSmileShare = useCallback(async () => {
  if (!patientId) return;
  const result = await getSmileShareUrl(patientId);
  if (result.url) {
    await navigator.clipboard.writeText(result.url);
    // Show toast: "Link copiado. El paciente verá sus fotos en el portal."
  }
}, [patientId]);
```

- [ ] **Step 8: Replace the canvas area and right panel when smileMode is active**

In the JSX where the canvas and right panel are rendered, wrap with a conditional:

```tsx
{smileMode ? (
  // Smile Design mode layout
  <div className="flex flex-1 overflow-hidden">
    {/* Canvas area: BeforeAfterSlider */}
    <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 gap-3 p-4">
      {smileDesign.state === 'aligning' || smileDesign.state === 'enhancing' ? (
        <div className="text-slate-400 text-sm animate-pulse text-center">
          {smileDesign.state === 'aligning' ? '🔍 Detectando alineado...' : '✨ Generando smile design...'}
        </div>
      ) : smileDesign.result ? (
        <div className="relative w-full max-w-md">
          <BeforeAfterSlider
            beforeSrc={smileDesign.result.beforeDataUrl}
            afterSrc={smileDesign.result.afterDataUrl}
            className="w-full aspect-[3/4]"
          />
          {/* Grid overlay */}
          {smileGridVisible && smileDesign.gridData && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {smileDesign.gridData.bipupilarY != null && (
                <line
                  x1="0" y1={smileDesign.gridData.bipupilarY * 100}
                  x2="100" y2={smileDesign.gridData.bipupilarY * 100}
                  stroke="#fbbf24" strokeWidth="0.3" strokeDasharray="2,1" opacity="0.7"
                />
              )}
              {smileDesign.gridData.smileLineY != null && (
                <line
                  x1="0" y1={smileDesign.gridData.smileLineY * 100}
                  x2="100" y2={smileDesign.gridData.smileLineY * 100}
                  stroke="#34d399" strokeWidth="0.3" strokeDasharray="2,1" opacity="0.7"
                />
              )}
              {smileDesign.gridData.midlineX != null && (
                <line
                  x1={smileDesign.gridData.midlineX * 100} y1="0"
                  x2={smileDesign.gridData.midlineX * 100} y2="100"
                  stroke="#60a5fa" strokeWidth="0.3" strokeDasharray="2,1" opacity="0.6"
                />
              )}
            </svg>
          )}
        </div>
      ) : smileDesign.state === 'error' ? (
        <div className="text-red-400 text-sm text-center">{smileDesign.error}</div>
      ) : null}
    </div>

    {/* Right panel: SmileDesignPanel */}
    <div className="w-48 border-l border-slate-800 flex flex-col">
      <SmileDesignPanel
        state={smileDesign.state}
        settings={smileDesign.settings}
        onSettingsChange={smileDesign.setSettings}
        onRegenerate={smileDesign.regenerate}
        onSave={handleSmileSave}
        onShareLink={handleSmileShare}
        onExit={exitSmileMode}
        canSave={canSave}
        isSaving={smileIsSaving}
        processingTime={smileProcessingStart ? (Date.now() - smileProcessingStart) / 1000 : undefined}
        gridVisible={smileGridVisible}
        onToggleGrid={() => setSmileGridVisible(v => !v)}
        error={smileDesign.error}
      />
    </div>
  </div>
) : (
  // Existing normal editor JSX (unchanged)
  /* ... existing content ... */
)}
```

- [ ] **Step 9: Run build to catch TypeScript errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any type errors found. Common ones:
- `patientId` might be `string | undefined` — add a `!patientId` guard
- `canSave` might not be in scope inside the handler — check existing prop usage

- [ ] **Step 10: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(smile): integrate SmileDesign mode into PhotoStudioModal"
```

---

## Task 8: Add ✨ quick-access button to `DriveFileCard`

**Files:**
- Modify: `components/patients/drive/DriveFileCard.tsx`

Quick-access button on image cards so the user doesn't have to open the full editor first.

- [ ] **Step 1: Read the current button area in DriveFileCard**

```bash
grep -n "onPreview\|onShare\|button\|action" components/patients/drive/DriveFileCard.tsx | head -25
```

- [ ] **Step 2: Add `onSmileDesign` prop**

Find the `DriveFileCardProps` interface and add:
```typescript
onSmileDesign?: (file: DriveFile) => void;
```

- [ ] **Step 3: Add the button in the actions area**

Find where the action buttons are rendered (alongside preview/delete/share buttons). Add, but only for image files:
```tsx
{onSmileDesign && getFileCategory(file) === 'image' && (
  <button
    onClick={e => { e.stopPropagation(); onSmileDesign(file); }}
    title="Smile Design"
    className="p-1.5 rounded hover:bg-violet-900/40 text-slate-500 hover:text-violet-400 transition-colors"
  >
    ✨
  </button>
)}
```

- [ ] **Step 4: Wire up in `PatientDriveTab`**

In `PatientDriveTab.tsx`, find where `DriveFileCard` is rendered and add the `onSmileDesign` prop:
```tsx
onSmileDesign={(file) => {
  // Open PhotoStudioModal with smileMode=true
  // This requires passing a flag — simplest: just open preview normally
  // PhotoStudioModal detects and auto-activates (or user clicks ✨ button)
  setPreviewFile(file);
  // Optionally: setOpenInSmileMode(true); if you add that prop
}}
```

For the initial implementation, the ✨ button on the card just opens PhotoStudioModal (same as clicking the photo). The user then clicks ✨ inside the editor. This is the simplest correct implementation.

- [ ] **Step 5: Run build**

```bash
npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 6: Final build verification**

```bash
npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully`

- [ ] **Step 7: Commit**

```bash
git add components/patients/drive/DriveFileCard.tsx components/patients/drive/PatientDriveTab.tsx
git commit -m "feat(smile): add quick-access smile design button to photo cards"
```

---

## Verification Checklist

After all tasks complete, verify these flows manually:

1. **Basic flow:** Open a patient photo → click ✨ Smile Design → wait for result → slider works
2. **Grid toggle:** Click grid toggle → three reference lines appear on the image
3. **Regenerate:** Change level to "Natural Ultra White" → click Regenerar → new result in <8s
4. **Save:** Click "Guardar en Drive" → success → check patient_files in Supabase → two records (photo_before, photo_after)
5. **Share link:** Click "Link para paciente" → clipboard contains `/mi-clinica/[token]` URL → open URL → SmileSlider appears in portal
6. **Build:** `npm run build` passes without TypeScript errors

---

## Notes for implementor

- **`patient_files.metadata` column:** Run the ALTER TABLE in Task 6 Step 2 in Supabase SQL Editor if the column doesn't exist yet.
- **`NEXT_PUBLIC_SITE_URL` env var:** Required for `getSmileShareUrl` to build correct URLs. Should already be set in `.env.local`.
- **Supabase Storage bucket:** The `patient-portal-files` bucket already exists (used by existing SmileDesign.tsx). No new bucket needed.
- **The `patient_files` table vs Drive:** For smile designs, files are saved to Supabase Storage (not Google Drive). This is consistent with how the existing SmileDesign.tsx works. The patient portal reads from `patient_files`, not from Drive.
- **`exportToBlob()` in PhotoStudioModal:** This function already applies rotation/brightness/crop before exporting. When entering Smile Design mode, we call `exportToBlob()` to get the current edited state — so any prior rotation the user did is baked in before Smile Design alignment runs.
