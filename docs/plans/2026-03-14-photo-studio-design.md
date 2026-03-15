# Photo Studio Design — AM Clínica

**Date:** 2026-03-14
**Status:** Approved
**Phase:** 1 of 2 (MVP — editing only; Presentation Builder is Phase 2)

---

## Problem

Assistants currently upload photos twice:
1. To Google Drive (backup/records)
2. To Canva/Slides (to build annotated clinical presentations)

This is double work, double storage, and double time. The Photo Studio eliminates step 2 by bringing editing directly into the Drive file area — photos live in Drive, get edited in Drive, get saved back to Drive.

---

## Solution: Photo Studio Modal (Option A)

Replace `DrivePreviewModal` for image files with a full-screen `PhotoStudioModal` that has a 3-column layout:

```
┌─────────────────────────────────────────────────────────────────┐
│  Header: nombre archivo      [Guardar en Drive] [Descargar]  X  │
├────────────┬────────────────────────────────────┬───────────────┤
│            │                                    │               │
│  Thumbnail │         CANVAS                     │  TOOLS PANEL  │
│  strip     │     (foto + ReactCrop overlay)     │               │
│  (fotos    │                                    │  ↺ Rotar      │
│  de esta   │                                    │  ☀ Brillo     │
│  carpeta)  │                                    │  ✂ Recortar   │
│            │                                    │  🪄 Remover   │
│  [thumb]   │                                    │     fondo     │
│  [thumb]   │                                    │  🎨 Fondo     │
│  [thumb]   │                                    │     color     │
│  [thumb]   │                                    │               │
│            │                                    │  [Resetear]   │
└────────────┴────────────────────────────────────┴───────────────┘
```

**Mobile (< md):** thumbnail strip goes top (horizontal scroll), tools go bottom in collapsible section.

---

## Components

### New: `PhotoStudioModal.tsx`
`components/patients/drive/PhotoStudioModal.tsx`

**Props:**
```tsx
interface PhotoStudioModalProps {
    file: DriveFile | null;
    allFolderFiles: DriveFile[];   // all images from the same folder, for thumbnail strip
    onClose: () => void;
    onSaved: () => void;           // triggers folder refresh after save
}
```

**State:**
```tsx
const imgRef = useRef<HTMLImageElement>(null);
const objectUrlRef = useRef<string | null>(null);
const [imageUrl, setImageUrl] = useState('');
const [rotation, setRotation] = useState(0);        // -45 to +45 float
const [brightness, setBrightness] = useState(100);  // 0–200
const [bgProcessing, setBgProcessing] = useState(false);
const [bgDone, setBgDone] = useState(false);
const [bgColor, setBgColor] = useState<'transparent' | 'white' | 'black'>('transparent');
const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
const [activeFile, setActiveFile] = useState<DriveFile | null>(null);
const [saveDialogOpen, setSaveDialogOpen] = useState(false);
const [saving, setSaving] = useState(false);
```

**Image display:** `ReactCrop` wrapping `<img>` with CSS `transform: rotate(${rotation}deg)` + `filter: brightness(${brightness}%)`. When `bgDone`, the image container gets a `background` CSS based on `bgColor` (white/black/transparent checkerboard pattern).

**Reset:** Reloads `imageUrl` from `/api/drive/file/${file.id}`, resets all state to defaults.

**Navigation:** Click thumbnail in left strip → `setActiveFile(thumb)`, resets all edits (with a "Tenés cambios sin guardar — ¿continuar?" confirmation if dirty).

---

### Modified: `DrivePreviewModal.tsx` → becomes a router

Keep `DrivePreviewModal` as the entry point but delegate:
- `previewType === 'image'` → render `<PhotoStudioModal>`
- `previewType === 'video'` → existing video player
- `previewType === '3d'` → existing STLViewer

This avoids touching `PatientDriveTab` — it still calls `setPreviewFile(file)` and renders `<DrivePreviewModal>`.

**Important:** `DrivePreviewModal` needs to receive `allFolderFiles` so it can pass it to `PhotoStudioModal`. This requires a small change to `PatientDriveTab` to pass the current folder's files.

---

### New server actions in `app/actions/patient-files-drive.ts`

```ts
// Upload edited photo blob to a Drive folder
uploadEditedPhotoAction(
    folderId: string,
    fileName: string,
    blob: Blob
): Promise<{ fileId?: string; error?: string }>

// Delete a file from Drive (used for "replace original")
deleteDriveFileAction(
    fileId: string
): Promise<{ error?: string }>
```

Both use the existing Google Drive admin credentials (same pattern as `createPatientDriveFolderAction`).

---

## Tools Panel — Detailed Spec

### Rotate
- Slider: min=`-45`, max=`45`, step=`0.5`
- Label shows current value: `+12.5°` / `-3°` / `0°`
- Icon: `RotateCcw` from lucide-react

### Brightness
- Slider: min=`0`, max=`200`, step=`1`, default=`100`
- Label: `120%`
- Icon: `Sun` (yellow)

### Crop
- Toggle button — when active, `ReactCrop` overlay appears on canvas
- When inactive, crop overlay hidden (but completedCrop preserved)

### Background Removal
- Button with 3 states: idle / processing (spinner) / done (checkmark)
- Uses `@imgly/background-removal` dynamic import (same as PortfolioEditor pattern)
- After `bgDone === true`, shows background selector:

```
Fondo:
[⬜ Blanco]  [⬛ Negro]  [▥ Transparente]
```
- Changing bg color is instant (CSS only, no reprocessing)
- Canvas container gets `background: white` / `background: #111` / `background: url(checkerboard)`

### Reset
- Small ghost button at bottom of panel
- Revokes objectURL, resets all state, reloads from `/api/drive/file/${file.id}`

---

## Save to Drive Flow

1. Click "Guardar en Drive" in header
2. Export canvas pipeline:
   - `rotation` + `brightness` filter + optional `crop` applied via Canvas API
   - If `bgDone` + `bgColor !== 'transparent'`: fill canvas with bg color before drawing image
   - Result: `Blob` (PNG if bgDone or original is PNG, else JPEG 0.95)
3. Bottom sheet dialog opens:
   ```
   ¿Cómo querés guardar?

   [Reemplazar original]    [Guardar como copia]
   ```
   - Reemplazar: `uploadEditedPhotoAction` → then `deleteDriveFileAction(file.id)`
   - Copia: `uploadEditedPhotoAction` only, filename = `originalName_editada.ext`
4. Loading state during upload
5. On success: toast, close modal, call `onSaved()` → PatientDriveTab refreshes folder

---

## PatientDriveTab changes

1. Pass `allFolderFiles` to `DrivePreviewModal`:
   - Track which folder the previewed file belongs to
   - Pass that folder's image files as `allFolderFiles`
   - For root files, pass `rootFiles` filtered to images

2. On `onSaved` callback: call `handleUploadedToFolder(folderId)` (already exists) to refresh just that folder

---

## Canvas Export Pipeline (same as current, with bg addition)

```ts
async function exportToBlob(): Promise<Blob> {
    const img = imgRef.current!;
    const radians = (rotation * Math.PI) / 180;
    const rotated = rotation % 180 !== 0; // only true for 90/270, not for -45..45
    const outW = img.naturalWidth;
    const outH = img.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d')!;

    // Background fill (only when bg removal done)
    if (bgDone && bgColor !== 'transparent') {
        ctx.fillStyle = bgColor === 'white' ? '#ffffff' : '#111111';
        ctx.fillRect(0, 0, outW, outH);
    }

    ctx.filter = `brightness(${brightness}%)`;
    ctx.translate(outW / 2, outH / 2);
    ctx.rotate(radians);
    ctx.drawImage(img, -outW / 2, -outH / 2);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    // Crop if active
    // ... (same crop logic as current DrivePreviewModal)

    const isPng = bgDone || file!.name.toLowerCase().endsWith('.png');
    return new Promise(resolve =>
        canvas.toBlob(blob => resolve(blob!), isPng ? 'image/png' : 'image/jpeg', 0.95)
    );
}
```

---

## File Structure

```
components/patients/drive/
  PhotoStudioModal.tsx    ← NEW (main editor)
  DrivePreviewModal.tsx   ← MODIFIED (routes image → PhotoStudioModal)
  PatientDriveTab.tsx     ← MODIFIED (pass allFolderFiles)
  DriveFileCard.tsx       ← unchanged
  Mini3DPreview.tsx       ← unchanged
  DriveUploadButton.tsx   ← unchanged

app/actions/patient-files-drive.ts  ← ADD 2 new server actions
```

---

## Out of Scope (Phase 2)
- Brush/mask tool for manual background removal refinement
- Presentation Builder (arrange multiple photos + text → export PDF)
- Before/after GIF export
- Filters (contrast, saturation, etc.)

---

## Verification Checklist
1. Click image in grid → `PhotoStudioModal` opens (not old modal)
2. Left strip shows only images from same folder
3. Click thumbnail → switches photo, resets all edits
4. Rotate slider moves photo smoothly -45° to +45°
5. Brightness slider updates live
6. Crop toggle shows/hides ReactCrop overlay
7. "Remover fondo" → spinner → done → bg selector appears
8. Bg color buttons switch background instantly (no reprocess)
9. "Guardar en Drive" → bottom sheet → Reemplazar → grid refreshes with new photo
10. "Guardar en Drive" → bottom sheet → Copia → new file appears in grid
11. Resetear → photo returns to original, all sliders at default
12. Videos and 3D files still use old modal (no regression)
13. Mobile: tools visible below canvas, thumbnail strip scrolls horizontally
