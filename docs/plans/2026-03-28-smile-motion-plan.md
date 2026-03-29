# Smile Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the existing Smile Design before/after photos and generate two synchronized 5-second portrait animation MP4 clips (via fal.ai Kling v2.1), displayed side-by-side in the consultation UI and saved to the patient portal.

**Architecture:** Client calls `useSmileMotion` hook → hook compresses images client-side → POSTs to `/api/smile-design/motion` route → route uploads images to fal.ai storage, submits two parallel Kling jobs, downloads the resulting MP4s, and uploads them to Supabase Storage → hook receives permanent Supabase URLs → `SmileMotionPlayer` shows side-by-side synchronized videos.

**Tech Stack:** Next.js 15 App Router, `@fal-ai/client@^1.0.0`, Supabase Storage (admin client), React `useRef` for video sync, Tailwind CSS, Vercel (maxDuration=180 requires Pro plan).

**Spec:** `docs/plans/2026-03-28-smile-motion-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `hooks/useSmileDesign.ts` | Add `beforeBase64` to `SmileResult` |
| Create | `app/api/smile-design/motion/route.ts` | fal.ai calls + Supabase upload (server-only) |
| Create | `hooks/useSmileMotion.ts` | State machine + orchestration (client) |
| Create | `components/patients/drive/SmileMotionPlayer.tsx` | Dual synchronized video player |
| Modify | `components/patients/drive/SmileDesignPanel.tsx` | Add "Generar Smile Motion" button + status section |
| Modify | `components/patients/drive/PhotoStudioModal.tsx` | Integrate `useSmileMotion` + tab toggle |
| Modify | `app/actions/smile-design.ts` | Add `saveSmileMotionVideos()` server action |
| Modify | `app/mi-clinica/[token]/page.tsx` | Add `smile_motion` file type renderer |

---

## Task 1: Install dependency + add `beforeBase64` to SmileResult

**Files:**
- Modify: `hooks/useSmileDesign.ts:37-42` (SmileResult interface)
- Modify: `hooks/useSmileDesign.ts:220` (setResult call in process())
- Modify: `hooks/useSmileDesign.ts:239` (setResult call in regenerate())

- [ ] **Step 1: Install @fal-ai/client**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npm install @fal-ai/client@^1.0.0
```

Expected: package added to `package.json` and `node_modules/@fal-ai/client` exists.

- [ ] **Step 2: Add `beforeBase64` to SmileResult interface**

In `hooks/useSmileDesign.ts`, change:
```typescript
export interface SmileResult {
  beforeDataUrl: string;
  afterDataUrl: string;
  afterBase64: string;
  afterMime: string;
}
```
To:
```typescript
export interface SmileResult {
  beforeDataUrl: string;
  beforeBase64: string;   // raw base64, no data: prefix
  afterDataUrl: string;
  afterBase64: string;
  afterMime: string;
}
```

- [ ] **Step 3: Update `setResult` in `process()` (line ~220)**

Change:
```typescript
setResult({ beforeDataUrl, afterDataUrl, afterBase64, afterMime });
```
To:
```typescript
setResult({ beforeDataUrl, beforeBase64: processedBase64, afterDataUrl, afterBase64, afterMime });
```

- [ ] **Step 4: Update `setResult` in `regenerate()` (line ~239)**

`alignedBase64` is declared as `useState<string | null>(null)` at line 120 and is narrowed to `string` by the early `if (!alignedBase64) return;` guard at the start of `regenerate()`. Use it for the `beforeBase64` field in the null-prev fallback:

```typescript
setResult(prev => prev ? { ...prev, afterDataUrl, afterBase64, afterMime } : {
  beforeDataUrl,
  beforeBase64: alignedBase64 as string,   // narrowed by early return guard above
  afterDataUrl,
  afterBase64,
  afterMime,
});
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors related to `SmileResult` or `beforeBase64`.

- [ ] **Step 6: Commit**

```bash
git add hooks/useSmileDesign.ts package.json package-lock.json
git commit -m "feat(smile-motion): install @fal-ai/client + add beforeBase64 to SmileResult"
```

---

## Task 2: Create API route `/api/smile-design/motion`

**Files:**
- Create: `app/api/smile-design/motion/route.ts`

- [ ] **Step 1: Create the file**

```typescript
// app/api/smile-design/motion/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fal from '@fal-ai/client';
import { createAdminClient } from '@/utils/supabase/admin';

export const maxDuration = 180; // Requires Vercel Pro

fal.config({ credentials: process.env.FAL_KEY });

const MOTION_PROMPT =
  'Portrait photo, person with natural gentle smile expression, ' +
  'subtle head movement, soft blinking, photorealistic, ' +
  'smooth motion, face centered, no sudden movements';

function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}

export async function POST(req: NextRequest) {
  try {
    const { beforeBase64, afterBase64, mimeType, patientId, baseName } = await req.json();

    if (!beforeBase64 || !afterBase64 || !mimeType || !patientId || !baseName) {
      return NextResponse.json({ error: 'Faltan parámetros requeridos' }, { status: 400 });
    }

    // Step 1: Convert base64 → Blob → upload to fal storage (parallel)
    const beforeBlob = base64ToBlob(beforeBase64, mimeType);
    const afterBlob  = base64ToBlob(afterBase64, mimeType);

    console.log('[smile-design/motion] uploading images to fal storage...');
    const [beforeFalUrl, afterFalUrl] = await Promise.all([
      fal.storage.upload(beforeBlob),
      fal.storage.upload(afterBlob),
    ]);
    console.log('[smile-design/motion] fal uploads done, submitting video jobs...');

    // Step 2: Submit both video jobs in parallel
    const [beforeResult, afterResult] = await Promise.all([
      fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
        input: { image_url: beforeFalUrl, prompt: MOTION_PROMPT, duration: 5 },
      }),
      fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
        input: { image_url: afterFalUrl, prompt: MOTION_PROMPT, duration: 5 },
      }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const beforeFalVideoUrl = (beforeResult as any).data?.video?.url;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const afterFalVideoUrl  = (afterResult as any).data?.video?.url;

    if (!beforeFalVideoUrl || !afterFalVideoUrl) {
      return NextResponse.json({ error: 'El modelo no devolvió video. Intentá de nuevo.' }, { status: 502 });
    }

    console.log('[smile-design/motion] video jobs done, downloading MP4s...');

    // Step 3: Download MP4s from fal CDN and upload to Supabase Storage
    const [beforeBuffer, afterBuffer] = await Promise.all([
      fetch(beforeFalVideoUrl).then(r => r.arrayBuffer()),
      fetch(afterFalVideoUrl).then(r => r.arrayBuffer()),
    ]);

    const supabase = createAdminClient();
    const beforePath = `portal/${patientId}/${baseName}_Antes_Motion.mp4`;
    const afterPath  = `portal/${patientId}/${baseName}_Despues_Motion.mp4`;

    const [uploadBefore, uploadAfter] = await Promise.all([
      supabase.storage.from('patient-portal-files').upload(beforePath, beforeBuffer, { contentType: 'video/mp4', upsert: true }),
      supabase.storage.from('patient-portal-files').upload(afterPath,  afterBuffer,  { contentType: 'video/mp4', upsert: true }),
    ]);

    if (uploadBefore.error || uploadAfter.error) {
      console.error('[smile-design/motion] supabase upload error:', uploadBefore.error ?? uploadAfter.error);
      return NextResponse.json({ error: 'Error al guardar el video. Intentá de nuevo.' }, { status: 500 });
    }

    const beforeVideoUrl = supabase.storage.from('patient-portal-files').getPublicUrl(beforePath).data.publicUrl;
    const afterVideoUrl  = supabase.storage.from('patient-portal-files').getPublicUrl(afterPath).data.publicUrl;

    console.log(`[smile-design/motion] done — before=${beforeVideoUrl.slice(0, 60)}...`);
    return NextResponse.json({ beforeVideoUrl, afterVideoUrl });

  } catch (err: unknown) {
    console.error('[smile-design/motion] ERROR:', err);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      return NextResponse.json({ error: 'Cuota de video agotada. Contactar soporte.' }, { status: 429 });
    }
    if (msg.includes('content policy') || msg.includes('rejected')) {
      return NextResponse.json({ error: 'La imagen fue rechazada por el modelo. Intentá con otra foto.' }, { status: 422 });
    }
    return NextResponse.json({ error: 'Error al generar video. Intentá de nuevo.' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npx tsc --noEmit 2>&1 | grep -i "motion" | head -20
```

Expected: no errors in `app/api/smile-design/motion/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/smile-design/motion/route.ts
git commit -m "feat(smile-motion): add /api/smile-design/motion route (fal.ai + Supabase upload)"
```

---

## Task 3: Create `hooks/useSmileMotion.ts`

**Files:**
- Create: `hooks/useSmileMotion.ts`

- [ ] **Step 1: Create the hook**

```typescript
// hooks/useSmileMotion.ts
'use client';

import { useState, useCallback } from 'react';

export type MotionState = 'idle' | 'generating' | 'ready' | 'error';

export interface MotionResult {
  beforeVideoUrl: string;
  afterVideoUrl: string;
}

export interface UseSmileMotionReturn {
  generate: (
    beforeBase64: string,
    afterBase64: string,
    mimeType: string,
    patientId: string,
    baseName: string
  ) => Promise<void>;
  state: MotionState;
  result: MotionResult | null;
  error: string | null;
  reset: () => void;
}

async function compressForMotion(base64: string, mimeType: string): Promise<string> {
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
        mimeType,
        0.85
      );
    };
    img.onerror = reject;
    img.src = `data:${mimeType};base64,${base64}`;
  });
}

export function useSmileMotion(): UseSmileMotionReturn {
  const [state, setState] = useState<MotionState>('idle');
  const [result, setResult] = useState<MotionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async (
    beforeBase64: string,
    afterBase64: string,
    mimeType: string,
    patientId: string,
    baseName: string
  ) => {
    setError(null);
    setState('generating');

    try {
      // Compress both images to ≤1024px before sending
      const [compBefore, compAfter] = await Promise.all([
        compressForMotion(beforeBase64, mimeType),
        compressForMotion(afterBase64, mimeType),
      ]);

      const res = await fetch('/api/smile-design/motion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          beforeBase64: compBefore,
          afterBase64: compAfter,
          mimeType,
          patientId,
          baseName,
        }),
      });

      const data = await res.json();
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npx tsc --noEmit 2>&1 | grep -i "smilemotion\|useSmileMotion" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useSmileMotion.ts
git commit -m "feat(smile-motion): add useSmileMotion hook (compress + POST + state machine)"
```

---

## Task 4: Create `SmileMotionPlayer` component

**Files:**
- Create: `components/patients/drive/SmileMotionPlayer.tsx`

- [ ] **Step 1: Create the component**

```typescript
// components/patients/drive/SmileMotionPlayer.tsx
'use client';

import { useRef, useEffect, useState } from 'react';
import { Play, Pause, Maximize2, ArrowLeft } from 'lucide-react';

interface SmileMotionPlayerProps {
  beforeVideoUrl: string;
  afterVideoUrl: string;
  onClose: () => void;
}

export default function SmileMotionPlayer({ beforeVideoUrl, afterVideoUrl, onClose }: SmileMotionPlayerProps) {
  const beforeRef = useRef<HTMLVideoElement>(null);
  const afterRef  = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const isRestartingRef = useRef(false);

  // Auto-play once both videos are ready
  useEffect(() => {
    const before = beforeRef.current;
    const after  = afterRef.current;
    if (!before || !after) return;

    let readyCount = 0;
    const tryPlay = () => {
      readyCount++;
      if (readyCount >= 2) {
        before.play().catch(() => undefined);
        after.play().catch(() => undefined);
        setPlaying(true);
      }
    };

    before.addEventListener('canplaythrough', tryPlay, { once: true });
    after.addEventListener('canplaythrough', tryPlay, { once: true });
    return () => {
      before.removeEventListener('canplaythrough', tryPlay);
      after.removeEventListener('canplaythrough', tryPlay);
    };
  }, []);

  // Synchronized loop: restart both on ended, prevent double-restart
  useEffect(() => {
    const handleEnded = () => {
      if (isRestartingRef.current) return;
      isRestartingRef.current = true;
      const before = beforeRef.current;
      const after  = afterRef.current;
      if (before) { before.currentTime = 0; before.play().catch(() => undefined); }
      if (after)  { after.currentTime  = 0; after.play().catch(() => undefined); }
      requestAnimationFrame(() => { isRestartingRef.current = false; });
    };

    const before = beforeRef.current;
    const after  = afterRef.current;
    before?.addEventListener('ended', handleEnded);
    after?.addEventListener('ended', handleEnded);
    return () => {
      before?.removeEventListener('ended', handleEnded);
      after?.removeEventListener('ended', handleEnded);
    };
  }, []);

  function togglePlay() {
    const before = beforeRef.current;
    const after  = afterRef.current;
    if (!before || !after) return;
    if (playing) {
      before.pause();
      after.pause();
      setPlaying(false);
    } else {
      before.play().catch(() => undefined);
      after.play().catch(() => undefined);
      setPlaying(true);
    }
  }

  function handleFullscreen() {
    if (containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => undefined);
    }
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3 bg-zinc-950 rounded-xl overflow-hidden">
      {/* Videos */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="relative">
          <span className="absolute top-2 left-2 z-10 text-xs font-bold text-amber-400 bg-black/60 px-2 py-0.5 rounded">
            ANTES
          </span>
          <video
            ref={beforeRef}
            src={beforeVideoUrl}
            className="w-full h-full object-cover rounded-lg"
            muted
            playsInline
            preload="auto"
          />
        </div>
        <div className="relative">
          <span className="absolute top-2 left-2 z-10 text-xs font-bold text-emerald-400 bg-black/60 px-2 py-0.5 rounded">
            DESPUÉS
          </span>
          <video
            ref={afterRef}
            src={afterVideoUrl}
            className="w-full h-full object-cover rounded-lg"
            muted
            playsInline
            preload="auto"
          />
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between px-4 pb-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Ver fotos
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={handleFullscreen}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npx tsc --noEmit 2>&1 | grep -i "SmileMotionPlayer" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/patients/drive/SmileMotionPlayer.tsx
git commit -m "feat(smile-motion): add SmileMotionPlayer component (dual sync video)"
```

---

## Task 5: Integrate into `SmileDesignPanel` and `PhotoStudioModal`

**Files:**
- Modify: `components/patients/drive/SmileDesignPanel.tsx`
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

### 5a — SmileDesignPanel changes

- [ ] **Step 1: Add motion props to SmileDesignPanel**

Read the current `SmileDesignPanelProps` interface (lines 13-29) and add:

```typescript
import type { MotionState } from '@/hooks/useSmileMotion';

// In SmileDesignPanelProps, add:
onGenerateMotion: () => void;
onSaveMotion: () => void;       // triggers saveSmileMotionVideos
motionState: MotionState;
motionError: string | null;
```

And add them to the destructured props in the component function.

- [ ] **Step 2: Add the Smile Motion section after the existing action buttons**

Find the section where `onSave` / `onShareLink` buttons are rendered. After that section (before the closing `</div>` of the panel), add:

```tsx
{/* ── Smile Motion ─────────────────────────────────────────── */}
{state === 'ready' && (
  <div className="mt-4 border-t border-white/10 pt-4 flex flex-col gap-3">
    {(motionState === 'idle' || motionState === 'error') && (
      <button
        onClick={onGenerateMotion}
        className="w-full py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-sm font-medium transition-all flex items-center justify-center gap-2"
      >
        🎬 Generar Smile Motion
      </button>
    )}
    {motionState === 'error' && motionError && (
      <p className="text-xs text-red-400 text-center">{motionError}</p>
    )}
    {motionState === 'generating' && (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-slate-400 text-center">⟳ Generando video... (~60s)</p>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-purple-500 rounded-full animate-pulse" style={{ width: '60%' }} />
        </div>
      </div>
    )}
    {motionState === 'ready' && (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-emerald-400 text-center">✓ Video listo</p>
        <button
          onClick={onSaveMotion}
          className="w-full py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 text-sm font-medium transition-all flex items-center justify-center gap-2"
        >
          💾 Guardar videos en Drive
        </button>
        {/* Reuse the existing onShareLink prop — videos are already visible to patient after save */}
        <button
          onClick={onShareLink}
          className="w-full py-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/30 text-sky-300 text-sm font-medium transition-all flex items-center justify-center gap-2"
        >
          📲 Incluir en link del paciente
        </button>
      </div>
    )}
  </div>
)}
```

Note: `state` is the prop name for the smile design state (not `smileState`).

- [ ] **Step 3: Verify SmileDesignPanel compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "SmileDesignPanel" | head -20
```

Expected: no errors.

### 5b — PhotoStudioModal changes

- [ ] **Step 4: Read PhotoStudioModal to find Smile Design section AND `baseName` variable**

```bash
grep -n "useSmileDesign\|SmileDesignPanel\|smileDesign\.\|baseName\|patientId\|DisenoSonrisa\|storage.*path\|portal/" "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main/components/patients/drive/PhotoStudioModal.tsx" | head -40
```

Identify: (a) the exact variable name for the patient ID passed to save functions, (b) whether `baseName` exists or must be derived (e.g. from patient name + date), (c) where `SmileDesignPanel` is rendered.

If `baseName` does not exist as a variable, derive it as:
```typescript
const baseName = `DisenoSonrisa_${patientName ?? patientId}_${new Date().toISOString().slice(0, 10)}`;
```
Add this derivation near the `useSmileMotion()` instantiation.

- [ ] **Step 5: Add `useSmileMotion` import and hook instantiation**

Add to PhotoStudioModal's imports:
```typescript
import { useSmileMotion } from '@/hooks/useSmileMotion';
import SmileMotionPlayer from './SmileMotionPlayer';
```

Add inside the component body (near the `useSmileDesign` instantiation):
```typescript
const smileMotion = useSmileMotion();
const [smileView, setSmileView] = useState<'photos' | 'video'>('photos');
```

Reset `smileView` to `'photos'` when the Smile Design mode is exited (wherever `smileDesign.reset()` is called).

- [ ] **Step 6: Add view toggle tabs and wire up SmileMotionPlayer**

In the canvas/viewer area where `<SmileDesignPanel>` is rendered, wrap the content with:

```tsx
{/* Tab toggle — only visible when motion is ready */}
{smileDesign.state === 'ready' && smileMotion.state === 'ready' && (
  <div className="flex gap-1 mb-2">
    <button
      onClick={() => setSmileView('photos')}
      className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${smileView === 'photos' ? 'bg-white/15 text-white' : 'text-slate-400 hover:text-white'}`}
    >
      📷 Fotos
    </button>
    <button
      onClick={() => setSmileView('video')}
      className={`flex-1 py-1.5 text-xs rounded-lg transition-colors ${smileView === 'video' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-400 hover:text-white'}`}
    >
      🎬 Video
    </button>
  </div>
)}

{/* Content area */}
{smileView === 'video' && smileMotion.result ? (
  <SmileMotionPlayer
    beforeVideoUrl={smileMotion.result.beforeVideoUrl}
    afterVideoUrl={smileMotion.result.afterVideoUrl}
    onClose={() => setSmileView('photos')}
  />
) : (
  <SmileDesignPanel
    {/* ... existing props ... */}
    onGenerateMotion={() => smileMotion.generate(
      smileDesign.result!.beforeBase64,
      smileDesign.result!.afterBase64,
      smileDesign.result!.afterMime,
      patientId,    // confirmed in Step 4 above
      baseName      // confirmed/derived in Step 4 above
    )}
    onSaveMotion={async () => {
      if (!smileMotion.result) return;
      await saveSmileMotionVideos(
        patientId,
        smileMotion.result.beforeVideoUrl,
        smileMotion.result.afterVideoUrl,
        baseName,
        folderId    // optional Google Drive folder ID — pass undefined if not available
      );
    }}
    motionState={smileMotion.state}
    motionError={smileMotion.error}
  />
)}
```

Note: `saveSmileMotionVideos` must be imported from `@/app/actions/smile-design`. `folderId` is the Google Drive folder ID — find the existing variable name in PhotoStudioModal (it is passed to `saveSmileDesignResult` already).

- [ ] **Step 7: Verify PhotoStudioModal compiles**

```bash
npx tsc --noEmit 2>&1 | grep -i "PhotoStudioModal\|smileMotion\|SmileMotion" | head -20
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add components/patients/drive/SmileDesignPanel.tsx components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(smile-motion): wire SmileDesignPanel + PhotoStudioModal with motion UI + save button"
```

---

## Task 6: Server action + patient portal renderer

**Files:**
- Modify: `app/actions/smile-design.ts`
- Modify: `app/mi-clinica/[token]/page.tsx`

### 6a — saveSmileMotionVideos server action

- [ ] **Step 1: Read the end of `app/actions/smile-design.ts` to find the last export**

```bash
tail -30 "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main/app/actions/smile-design.ts"
```

- [ ] **Step 2: Append `saveSmileMotionVideos` to the file**

Add after the last function in `app/actions/smile-design.ts`:

```typescript
export interface SaveSmileMotionResult {
  success: boolean;
  error?: string;
}

export async function saveSmileMotionVideos(
  patientId: string,
  beforeVideoUrl: string,
  afterVideoUrl: string,
  baseName: string,
  folderId?: string
): Promise<SaveSmileMotionResult> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'No autenticado' };

    const adminSupabase = createAdminClient();

    const { error: insertError } = await adminSupabase.from('patient_files').insert([
      {
        patient_id: patientId,
        file_url: beforeVideoUrl,
        file_type: 'smile_motion',
        file_name: `${baseName}_Antes_Motion.mp4`,
        metadata: { role: 'before' },
        is_visible_to_patient: true,
        uploaded_by: user.id,
      },
      {
        patient_id: patientId,
        file_url: afterVideoUrl,
        file_type: 'smile_motion',
        file_name: `${baseName}_Despues_Motion.mp4`,
        metadata: { role: 'after' },
        is_visible_to_patient: true,
        uploaded_by: user.id,
      },
    ]);

    if (insertError) {
      console.error('[saveSmileMotionVideos] insert error:', insertError);
      return { success: false, error: 'Error al guardar en base de datos' };
    }

    // Optional: upload to Google Drive if folderId provided
    if (folderId) {
      try {
        const [beforeBuf, afterBuf] = await Promise.all([
          fetch(beforeVideoUrl).then(r => r.arrayBuffer()),
          fetch(afterVideoUrl).then(r => r.arrayBuffer()),
        ]);
        await Promise.all([
          uploadFileToFolder(folderId, `${baseName}_Antes_Motion.mp4`, Buffer.from(beforeBuf), 'video/mp4'),
          uploadFileToFolder(folderId, `${baseName}_Despues_Motion.mp4`, Buffer.from(afterBuf), 'video/mp4'),
        ]);
      } catch (driveErr) {
        console.warn('[saveSmileMotionVideos] Google Drive upload failed (non-fatal):', driveErr);
      }
    }

    return { success: true };
  } catch (err) {
    console.error('[saveSmileMotionVideos] ERROR:', err);
    return { success: false, error: 'Error inesperado al guardar' };
  }
}
```

### 6b — Patient portal renderer

- [ ] **Step 3: Read the file-type rendering section in `app/mi-clinica/[token]/page.tsx`**

```bash
grep -n "smile_design\|stl\|photo_before\|file_type\|comprobante" "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main/app/mi-clinica/[token]/page.tsx" | head -30
```

- [ ] **Step 4: Add `smile_motion` handler in the portal file-type switch**

Locate the section where `file_type` values are handled for rendering. Add a `smile_motion` case that:
1. Finds all `smile_motion` files for the patient (they are in the same `files` array)
2. Groups them in pairs by `metadata.role` (`'before'` + `'after'`)
3. Renders each pair side by side

The minimum viable implementation (renders the current file if it's `smile_motion`):

```tsx
// Inside the file rendering loop, add a case for smile_motion:
{file.file_type === 'smile_motion' && (
  // Skip — rendered as pairs below (handled in the grouped section)
  null
)}
```

Then add a grouped renderer after the main file list:

```tsx
{/* Smile Motion pairs */}
{(() => {
  const motionFiles = files.filter(f => f.file_type === 'smile_motion' && f.is_visible_to_patient);
  const beforeFiles = motionFiles.filter(f => f.metadata?.role === 'before');
  return beforeFiles.map((beforeFile) => {
    const afterFile = motionFiles.find(f =>
      f.metadata?.role === 'after' &&
      f.file_name?.replace('_Despues_', '_Antes_') === beforeFile.file_name
    );
    if (!afterFile) return null;
    return (
      <div key={beforeFile.id} className="rounded-xl overflow-hidden bg-black/40 border border-white/10">
        <p className="text-xs font-medium text-purple-300 px-3 pt-3 pb-1">🎬 Smile Motion</p>
        <div className="grid grid-cols-2 gap-1 p-2">
          <div>
            <p className="text-[10px] text-amber-400 font-bold mb-1 ml-1">ANTES</p>
            <video src={beforeFile.file_url} controls autoPlay muted playsInline className="w-full rounded-lg" />
          </div>
          <div>
            <p className="text-[10px] text-emerald-400 font-bold mb-1 ml-1">DESPUÉS</p>
            <video src={afterFile.file_url} controls autoPlay muted playsInline className="w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  });
})()}
```

Note: Read the exact structure of `app/mi-clinica/[token]/page.tsx` to determine where to insert this. The `files` variable name, the file object shape (`file_url`, `file_name`, `metadata`, `is_visible_to_patient`), and the rendering context all need to match what's already in the file.

- [ ] **Step 5: Verify full TypeScript build passes**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npx tsc --noEmit 2>&1 | head -30
```

Expected: 0 errors.

- [ ] **Step 6: Run build**

```bash
cd "/Users/ariel/Documents/Proyectos Antigravity/am-clinica-main"
npm run build 2>&1 | tail -30
```

Expected: build completes with no errors (warnings OK).

- [ ] **Step 7: Commit**

```bash
git add app/actions/smile-design.ts app/mi-clinica/\[token\]/page.tsx
git commit -m "feat(smile-motion): saveSmileMotionVideos action + portal renderer"
```

---

## Environment Variable Checklist

Before testing end-to-end, verify `.env.local` contains:

```bash
FAL_KEY=fal_...    # fal.ai API key — server-side only, never expose to client
```

The `FAL_KEY` must also be set in Vercel environment variables for production.

---

## Testing Checklist

- [ ] **Unit**: Open PhotoStudio in Smile Design mode, complete the Smile Design flow (state = 'ready'), verify "🎬 Generar Smile Motion" button appears
- [ ] **Integration**: Click "Generar Smile Motion", verify spinner shows, wait ~60-90s, verify tab toggle appears and `SmileMotionPlayer` shows both videos playing synchronized
- [ ] **Sync**: Let videos loop — verify both restart simultaneously with no drift across 3+ loops
- [ ] **Save**: Click save in the `SmileDesignPanel` motion section, verify two `smile_motion` records appear in `patient_files` table
- [ ] **Portal**: Open patient portal link, verify `smile_motion` videos render side by side
- [ ] **Error**: Test with `FAL_KEY` unset or invalid → verify user-facing error message appears in Spanish, no crash
