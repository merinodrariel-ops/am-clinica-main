# Smile Motion — Design Spec

**Feature:** Animate before/after Smile Design photos into short portrait video clips, shown side-by-side in consultation and shareable via patient portal.

**Date:** 2026-03-28

---

## Goal

Take the existing Smile Design before/after photo pair and generate two synchronized 5-second portrait animation clips (MP4) showing the patient's face with natural subtle movement — one clip with the original smile, one with the AI-enhanced smile. Display them side-by-side in the same consultation session. Save to patient portal for later sharing.

---

## Context: Existing Smile Design Flow

The current flow (already implemented):

1. Staff selects patient photo in PhotoStudioModal
2. Triggers Smile Design → calls `/api/smile-design/align` (Gemini) + `/api/smile-design/enhance` (Gemini image)
3. `useSmileDesign` hook manages state: `idle → aligning → enhancing → ready`
4. Result: `beforeDataUrl` + `afterDataUrl` (base64 JPEG)
5. BeforeAfterSlider shows static comparison
6. Optional: WarpBrush for manual correction
7. Save to Supabase Storage + Google Drive + patient_files table

**Smile Motion extends step 5+** — after the user has the before/after photos, they can optionally generate portrait animation videos.

---

## Architecture

```
[Smile Design state=ready]
        ↓ click "🎬 Smile Motion"
useSmileMotion hook
        ↓
POST /api/smile-design/motion
    ├── fal.ai Kling v2.1 ← beforeBase64  (parallel)
    └── fal.ai Kling v2.1 ← afterBase64   (parallel)
        ↓ ~45–90s (Promise.all)
    beforeVideoFalUrl + afterVideoFalUrl (temp CDN URLs)
        ↓
    download MP4s → upload to Supabase Storage
        ↓
SmileMotionPlayer (side-by-side, synchronized)
        ↓ save click
    patient_files records × 2 (smile_motion, before + after)
    visible in patient portal
```

---

## New Files

| File | Purpose |
|---|---|
| `hooks/useSmileMotion.ts` | State machine + orchestration |
| `app/api/smile-design/motion/route.ts` | fal.ai calls (parallel) |
| `components/patients/drive/SmileMotionPlayer.tsx` | Dual synchronized video player |

## Modified Files

| File | Change |
|---|---|
| `components/patients/drive/SmileDesignPanel.tsx` | Add "🎬 Generar Smile Motion" button + motion status section |
| `components/patients/drive/PhotoStudioModal.tsx` | Integrate SmileMotionPlayer, toggle between photo slider and video player |
| `app/actions/smile-design.ts` | Add `saveSmileMotionVideos()` action |

---

## API Route: `/api/smile-design/motion`

**Method:** POST
**Max duration:** 120s (`export const maxDuration = 120`)
**New env var:** `FAL_KEY`

**Request body:**
```typescript
{
  beforeBase64: string;   // JPEG base64
  afterBase64: string;    // JPEG base64
  mimeType: string;       // 'image/jpeg'
}
```

**Implementation:**
```typescript
import * as fal from '@fal-ai/client';

fal.config({ credentials: process.env.FAL_KEY });

const MOTION_PROMPT =
  "Portrait photo, person with natural gentle smile expression, " +
  "subtle head movement, soft blinking, photorealistic, " +
  "smooth motion, face centered, no sudden movements";

// Both jobs submitted in parallel
const [beforeResult, afterResult] = await Promise.all([
  fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
    input: { image_url: `data:image/jpeg;base64,${beforeBase64}`, prompt: MOTION_PROMPT, duration: 5 }
  }),
  fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
    input: { image_url: `data:image/jpeg;base64,${afterBase64}`, prompt: MOTION_PROMPT, duration: 5 }
  }),
]);
```

**Response:**
```typescript
{
  beforeVideoUrl: string;  // fal.ai CDN temp URL
  afterVideoUrl: string;   // fal.ai CDN temp URL
}
```

**Error handling:** If either job fails, return `{ error: string }`. fal.ai errors include quota exceeded, content policy, model unavailable.

---

## Hook: `useSmileMotion`

```typescript
type MotionState = 'idle' | 'generating' | 'ready' | 'error';

interface MotionResult {
  beforeVideoUrl: string;  // Supabase permanent URL
  afterVideoUrl: string;   // Supabase permanent URL
}

interface UseSmileMotionReturn {
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
```

**Flow inside `generate()`:**
1. Set state → `'generating'`
2. Call `/api/smile-design/motion` with before/after base64
3. On success: download both MP4s from fal.ai temp URLs
4. Upload to Supabase Storage:
   - `portal/{patientId}/{baseName}_Antes_Motion.mp4`
   - `portal/{patientId}/{baseName}_Despues_Motion.mp4`
5. Set `result` with Supabase public URLs
6. Set state → `'ready'`
7. On any error: set state → `'error'`, set `error` message

---

## Component: `SmileMotionPlayer`

```typescript
interface SmileMotionPlayerProps {
  beforeVideoUrl: string;
  afterVideoUrl: string;
  onClose?: () => void;
}
```

**UI:**
- Two `<video>` elements side by side in a dark container
- Both: `autoPlay muted loop playsInline`
- Single play/pause button that controls both refs simultaneously
- Label "ANTES" (left, amber), "DESPUÉS" (right, emerald) — same color scheme as BeforeAfterSlider
- Fullscreen button (native browser fullscreen on the container)
- "← Ver fotos" button to switch back to BeforeAfterSlider

**Synchronization:**
```typescript
const beforeRef = useRef<HTMLVideoElement>(null);
const afterRef = useRef<HTMLVideoElement>(null);

const togglePlay = () => {
  if (beforeRef.current?.paused) {
    beforeRef.current.play();
    afterRef.current?.play();
  } else {
    beforeRef.current?.pause();
    afterRef.current?.pause();
  }
};
```

**Layout:** CSS grid `grid-cols-2`, gap-2, each video `object-cover w-full rounded-lg`.

---

## SmileDesignPanel Changes

After the existing action buttons, add a new section:

```
── Divider ──────────────────────────────────────

[ 🎬 Generar Smile Motion ]
  ↳ visible only when smileState === 'ready' AND motionState === 'idle'|'error'

── if motionState === 'generating' ──────────────
  ⟳  Generando video... (~60s)
  [animated progress bar, indeterminate]

── if motionState === 'ready' ───────────────────
  ✓ Video listo
  [ 💾 Guardar videos en Drive ]
  [ 📲 Incluir en link del paciente ]
```

The "Guardar videos" button calls `saveSmileMotionVideos()` server action.

---

## Server Action: `saveSmileMotionVideos()`

Added to `app/actions/smile-design.ts`:

```typescript
saveSmileMotionVideos(
  patientId: string,
  beforeVideoUrl: string,
  afterVideoUrl: string,
  baseName: string,
  folderId?: string
): Promise<{ success: boolean; error?: string }>
```

**Steps:**
1. Insert two records into `patient_files`:
   ```
   { patient_id, file_url: beforeVideoUrl, file_type: 'smile_motion',
     file_name: `${baseName}_Antes_Motion.mp4`,
     metadata: { role: 'before' }, is_visible_to_patient: true }

   { patient_id, file_url: afterVideoUrl, file_type: 'smile_motion',
     file_name: `${baseName}_Despues_Motion.mp4`,
     metadata: { role: 'after' }, is_visible_to_patient: true }
   ```
2. If `folderId` provided: upload both MP4s to Google Drive (same pattern as photo save)

---

## PhotoStudioModal Integration

When in Smile Design mode:
- Canvas area shows `BeforeAfterSlider` by default (photos)
- After motion is ready, a "Ver video" tab appears above the canvas
- Clicking it swaps the canvas area to `SmileMotionPlayer`
- Both the photo slider and the video player coexist — user can switch freely
- The `useSmileMotion` hook is initialized alongside `useSmileDesign`

```typescript
const smileMotion = useSmileMotion();

// pass to SmileDesignPanel:
onGenerateMotion={() => smileMotion.generate(
  smileDesign.result.afterBase64,  // after = enhanced smile
  smileDesign.result.beforeBase64, // wait — before = original
  smileDesign.result.afterMime,
  patientId,
  baseName
)}
motionState={smileMotion.state}
motionResult={smileMotion.result}
```

---

## Patient Portal

The portal (`/mi-clinica/[token]`) already renders `patient_files` by file type. No changes needed — `smile_motion` files will appear as `<video>` elements automatically if the portal renders unknown types as video. **One small addition:** the portal's file renderer should handle `file_type === 'smile_motion'` explicitly, showing both before/after videos side-by-side using the same `SmileMotionPlayer` component.

---

## Cost Estimate

| Usage | Cost |
|---|---|
| 1 Smile Motion generation | ~$0.16 (2 × $0.08 Kling v2.1 standard) |
| 50 patients/month | ~$8/month |
| 100 patients/month | ~$16/month |

Storage: ~10MB per pair → 1GB for ~100 patients/month → negligible on Supabase.

---

## Environment Variables

```bash
FAL_KEY=fal_...    # fal.ai API key (server-side only, never expose to client)
```

---

## New npm Dependency

```bash
npm install @fal-ai/client
```

---

## Out of Scope

- Audio / lip-sync (explicitly excluded by product decision)
- Custom motion prompts per patient
- Video editing or trimming UI
- Auto-generating motion without user action (generation costs money, must be intentional)
- Batch generation for multiple patients at once
