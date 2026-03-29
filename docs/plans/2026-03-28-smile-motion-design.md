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
4. Result: `beforeDataUrl` + `afterDataUrl` (base64 JPEG data URLs) + `afterBase64` (raw base64, no prefix) + `afterMime`
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
        ↓ compress both images to ≤1024px (client-side)
POST /api/smile-design/motion
    ├── fal.storage.upload(beforeBlob) → beforeFalUrl
    ├── fal.storage.upload(afterBlob)  → afterFalUrl    (parallel uploads)
    ├── fal.subscribe Kling v2.1 ← beforeFalUrl          (parallel jobs)
    └── fal.subscribe Kling v2.1 ← afterFalUrl
        ↓ total ~60–90s (maxDuration=180s)
    beforeVideoFalUrl + afterVideoFalUrl (temp CDN)
    ├── fetch beforeVideoFalUrl → ArrayBuffer
    ├── fetch afterVideoFalUrl  → ArrayBuffer
    ├── supabaseAdmin.upload(beforeMP4) → beforeStorageUrl
    └── supabaseAdmin.upload(afterMP4)  → afterStorageUrl  (all inside route)
        ↓ route returns permanent Supabase URLs
hook receives { beforeVideoUrl, afterVideoUrl }
        ↓ state → 'ready'
SmileMotionPlayer (side-by-side, synchronized)
        ↓ save click
saveSmileMotionVideos() server action
    → patient_files records × 2 (file_type: 'smile_motion')
    → optional: Google Drive upload
```

**Key decision:** The API route handles both the fal.ai calls AND the Supabase Storage uploads. The hook only calls the route and receives back permanent Supabase URLs. This avoids exposing the admin client to the browser (RLS would block client-side writes to the storage bucket).

---

## New Files

| File | Purpose |
|---|---|
| `hooks/useSmileMotion.ts` | State machine + orchestration |
| `app/api/smile-design/motion/route.ts` | fal.ai calls + Supabase upload (all server-side) |
| `components/patients/drive/SmileMotionPlayer.tsx` | Dual synchronized video player |

## Modified Files

| File | Change |
|---|---|
| `hooks/useSmileDesign.ts` | Add `beforeBase64: string` to `SmileResult` interface |
| `components/patients/drive/SmileDesignPanel.tsx` | Add "🎬 Generar Smile Motion" button + motion status section |
| `components/patients/drive/PhotoStudioModal.tsx` | Integrate SmileMotionPlayer; tab toggle between photo slider and video |
| `app/actions/smile-design.ts` | Add `saveSmileMotionVideos()` action |
| `app/mi-clinica/[token]/page.tsx` | Add `smile_motion` file type handler in portal renderer |

---

## Change to `useSmileDesign.ts`

Add `beforeBase64` to `SmileResult`:

```typescript
export interface SmileResult {
  beforeDataUrl: string;
  beforeBase64: string;   // ← NEW: raw base64, no data: prefix
  afterDataUrl: string;
  afterBase64: string;
  afterMime: string;
}
```

When setting the result, derive `beforeBase64` from `beforeDataUrl`:
```typescript
const beforeBase64 = processedBase64; // already available in process()
setResult({
  beforeDataUrl,
  beforeBase64: processedBase64,   // ← add this
  afterDataUrl,
  afterBase64,
  afterMime,
});
```

---

## API Route: `/api/smile-design/motion`

**Method:** POST
**Max duration:** `export const maxDuration = 180` (requires Vercel Pro; hobby plan is limited to 60s which may be insufficient)
**New env var:** `FAL_KEY`
**New dependency:** `@fal-ai/client@^1.0.0`

**Request body:**
```typescript
{
  beforeBase64: string;   // JPEG base64, ≤1024px wide (compressed client-side)
  afterBase64: string;    // JPEG base64, ≤1024px wide
  mimeType: string;       // 'image/jpeg'
  patientId: string;
  baseName: string;       // for storage file naming
}
```

**Implementation steps (all within the route handler):**

```typescript
import * as fal from '@fal-ai/client';
import { createAdminClient } from '@/utils/supabase/admin';

fal.config({ credentials: process.env.FAL_KEY });

const MOTION_PROMPT =
  "Portrait photo, person with natural gentle smile expression, " +
  "subtle head movement, soft blinking, photorealistic, " +
  "smooth motion, face centered, no sudden movements";

// Step 1: Convert base64 → Blob → upload to fal storage (parallel)
const beforeBlob = base64ToBlob(beforeBase64, mimeType);
const afterBlob  = base64ToBlob(afterBase64, mimeType);

const [beforeFalUrl, afterFalUrl] = await Promise.all([
  fal.storage.upload(beforeBlob),
  fal.storage.upload(afterBlob),
]);

// Step 2: Submit both video jobs in parallel
const [beforeResult, afterResult] = await Promise.all([
  fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
    input: { image_url: beforeFalUrl, prompt: MOTION_PROMPT, duration: 5 }
  }),
  fal.subscribe('fal-ai/kling-video/v2.1/standard/image-to-video', {
    input: { image_url: afterFalUrl, prompt: MOTION_PROMPT, duration: 5 }
  }),
]);

const beforeFalVideoUrl = beforeResult.data.video.url;
const afterFalVideoUrl  = afterResult.data.video.url;

// Step 3: Download MP4s from fal CDN and upload to Supabase Storage
const [beforeBuffer, afterBuffer] = await Promise.all([
  fetch(beforeFalVideoUrl).then(r => r.arrayBuffer()),
  fetch(afterFalVideoUrl).then(r => r.arrayBuffer()),
]);

const supabase = createAdminClient();
const beforePath = `portal/${patientId}/${baseName}_Antes_Motion.mp4`;
const afterPath  = `portal/${patientId}/${baseName}_Despues_Motion.mp4`;

await Promise.all([
  supabase.storage.from('patient-portal-files').upload(beforePath, beforeBuffer, { contentType: 'video/mp4', upsert: true }),
  supabase.storage.from('patient-portal-files').upload(afterPath,  afterBuffer,  { contentType: 'video/mp4', upsert: true }),
]);

const beforeVideoUrl = supabase.storage.from('patient-portal-files').getPublicUrl(beforePath).data.publicUrl;
const afterVideoUrl  = supabase.storage.from('patient-portal-files').getPublicUrl(afterPath).data.publicUrl;
```

**Response:**
```typescript
{ beforeVideoUrl: string; afterVideoUrl: string }
```

**Error handling:**
- fal.ai quota exceeded → `{ error: 'Cuota de video agotada. Contactar soporte.' }`
- fal.ai content policy rejection → `{ error: 'La imagen fue rechazada por el modelo. Intentá con otra foto.' }`
- Route timeout (>180s) → Next.js will return 504; hook catches and shows error state
- Supabase upload failure → `{ error: 'Error al guardar el video. Intentá de nuevo.' }`

**Helper:**
```typescript
function base64ToBlob(base64: string, mimeType: string): Blob {
  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  return new Blob([bytes], { type: mimeType });
}
```

---

## Hook: `useSmileMotion`

```typescript
type MotionState = 'idle' | 'generating' | 'ready' | 'error';

interface MotionResult {
  beforeVideoUrl: string;  // Supabase permanent URL
  afterVideoUrl: string;
}

interface UseSmileMotionReturn {
  generate: (
    beforeBase64: string,    // original smile (no data: prefix)
    afterBase64: string,     // enhanced smile (no data: prefix)
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

**Compression before sending:**
Before calling the route, compress both images client-side to ≤1024px to stay well under Vercel's 4.5MB body limit and fal.ai's upload limits:

```typescript
async function compressForMotion(base64: string, mimeType: string): Promise<string> {
  // Same pattern as compressBlob() in useSmileDesign.ts
  // Max width: 1024px, quality: 0.85
  // Returns raw base64 (no data: prefix)
}
```

**Flow inside `generate()`:**
1. Compress both images
2. Set state → `'generating'`
3. POST `/api/smile-design/motion` with compressed base64 + patientId + baseName
4. On success: set `result`, set state → `'ready'`
5. On error: set `error` message, set state → `'error'`

---

## Component: `SmileMotionPlayer`

```typescript
interface SmileMotionPlayerProps {
  beforeVideoUrl: string;
  afterVideoUrl: string;
  onClose: () => void;
}
```

**UI:**
- Two `<video>` elements side by side, dark container (same palette as BeforeAfterSlider)
- Both: `autoPlay muted playsInline` (no `loop` — see synchronization below)
- Labels "ANTES" (amber) left, "DESPUÉS" (emerald) right
- Single play/pause button controlling both refs
- Fullscreen button (native `requestFullscreen` on the container div)
- "← Ver fotos" button triggers `onClose`

**Synchronization — loop re-sync:**
Do NOT use the `loop` attribute. Instead, listen for the `ended` event on either video and restart both from `currentTime = 0`:

```typescript
const handleEnded = () => {
  if (beforeRef.current) { beforeRef.current.currentTime = 0; beforeRef.current.play(); }
  if (afterRef.current)  { afterRef.current.currentTime = 0;  afterRef.current.play(); }
};

// Attach to both videos' onEnded
```

This prevents drift from differing durations across loops.

**Layout:** CSS grid `grid-cols-2 gap-2`, each video `w-full h-full object-cover rounded-lg`.

---

## SmileDesignPanel Changes

After the existing action buttons, add a new section:

```
── Divider ──────────────────────────────────────────────────

[ 🎬 Generar Smile Motion ]
  ↳ visible only when smileState === 'ready' AND motionState === 'idle' | 'error'

── if motionState === 'generating' ──────────────────────────
  ⟳  Generando video... (~60s)
  [animated indeterminate progress bar]

── if motionState === 'ready' ───────────────────────────────
  ✓ Video listo
  [ 💾 Guardar videos en Drive ]
  [ 📲 Incluir en link del paciente ]
```

---

## PhotoStudioModal Integration

When in Smile Design mode, the canvas area has a two-tab toggle after motion is ready:
```
[ 📷 Fotos ]  [ 🎬 Video ]
```

- Default: BeforeAfterSlider (photos)
- After motion ready: "Video" tab appears; clicking shows SmileMotionPlayer

```typescript
const smileMotion = useSmileMotion();

// Correct argument order: before first, after second
onGenerateMotion={() => smileMotion.generate(
  smileDesign.result.beforeBase64,   // original smile
  smileDesign.result.afterBase64,    // enhanced smile
  smileDesign.result.afterMime,
  patientId,
  baseName
)}
```

---

## Server Action: `saveSmileMotionVideos()`

Added to `app/actions/smile-design.ts`:

```typescript
export async function saveSmileMotionVideos(
  patientId: string,
  beforeVideoUrl: string,
  afterVideoUrl: string,
  baseName: string,
  folderId?: string
): Promise<{ success: boolean; error?: string }>
```

**Steps:**
1. Auth check (SSR client)
2. Insert two records into `patient_files` via admin client:
```typescript
{ patient_id: patientId, file_url: beforeVideoUrl, file_type: 'smile_motion',
  file_name: `${baseName}_Antes_Motion.mp4`,
  metadata: { role: 'before' }, is_visible_to_patient: true }

{ patient_id: patientId, file_url: afterVideoUrl, file_type: 'smile_motion',
  file_name: `${baseName}_Despues_Motion.mp4`,
  metadata: { role: 'after' }, is_visible_to_patient: true }
```
3. If `folderId` provided: upload both MP4s to Google Drive (fetch from Supabase URL → Drive upload, same pattern as photo save)

---

## Patient Portal: Required Change

**File:** `app/mi-clinica/[token]/page.tsx`

The portal currently handles: `stl`, `smile_design`, `photo_before`, `photo_after`, `photo_comparison`, `document`, `comprobante`. It does NOT have a fallback video renderer — `smile_motion` files will be silently ignored without this change.

**Required addition:** In the file-type rendering switch, add a `smile_motion` branch that:
1. Finds all `smile_motion` files for the patient
2. Pairs them by `metadata.role` (`before` + `after`)
3. Renders each pair as a `SmileMotionPlayer` (or simpler inline player if importing the full component creates a bundle issue)

Minimum viable implementation: render each MP4 as `<video controls autoPlay muted playsInline>` with role labels, grouped visually.

---

## New npm Dependency

```bash
npm install @fal-ai/client@^1.0.0
```

---

## Environment Variables

```bash
FAL_KEY=fal_...    # fal.ai API key — server-side only, never pass to client
```

---

## Cost Estimate

| Usage | Cost |
|---|---|
| 1 Smile Motion generation | ~$0.16 (2 × $0.08 Kling v2.1 standard) |
| 50 patients/month | ~$8/month |
| 100 patients/month | ~$16/month |

Storage: ~10MB per pair (MP4 ~5MB each) → negligible on Supabase.

---

## Out of Scope

- Audio / lip-sync (explicitly excluded)
- Custom motion prompts per patient
- Video editing or trimming UI
- Auto-generating motion without explicit user click (generation has a per-unit cost)
- Batch generation for multiple patients at once
- Local/on-device generation (separate consideration — see notes below)

---

## Note: Local Generation Alternative

The user raised the possibility of running portrait animation locally on a Mac M4 (Apple Silicon). This is technically feasible with:
- **Wan I2V** or **CogVideoX-I2V** via `ollama` or `mlx` (Apple Silicon optimized)
- MLX-based video models are under rapid development as of early 2026
- A Mac M4 with 32GB unified memory can run 14B parameter video models
- Generation would be slower (~3–8 min per clip locally vs. ~45s on fal.ai) but zero API cost
- Would require a local server process (e.g., a FastAPI wrapper) that the Next.js app calls via localhost

**Recommended approach:** Implement cloud (fal.ai) first. Add local generation as an optional toggle (`SMILE_MOTION_LOCAL=true` env var → call `localhost:8000/generate` instead of fal.ai) in a future iteration. The API route interface is identical from the hook's perspective.
