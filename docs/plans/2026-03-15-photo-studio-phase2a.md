# Photo Studio Phase 2a — Zoom, Grid, Download & SEO Naming

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the Photo Studio and file grid with zoom+pan, bipupillar grid overlay, quick-download buttons, and SEO-friendly auto-naming on upload.

**Architecture:** All changes are confined to 3 components (`PhotoStudioModal`, `DriveFileCard`, `DriveUploadButton`) plus minor prop threading in `PatientDriveTab`. No new server actions or API routes needed — the existing `/api/drive/file/[fileId]` proxy handles downloads.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Framer Motion, Lucide icons, native browser APIs (WheelEvent, Touch, SVG).

---

## Context for implementer

- `components/patients/drive/PhotoStudioModal.tsx` — full-screen editor opened when clicking an image. Currently has rotation, brightness, crop, bg removal. The canvas area is the `flex-1` div in the body section.
- `components/patients/drive/DriveFileCard.tsx` — grid card for each file. Has `aspect-square` thumbnail area with `group` class for hover effects.
- `components/patients/drive/DriveUploadButton.tsx` — handles file upload to `/api/drive/upload`. Gets `folderId`, `patientId`. The actual filename is set in `formData.append('file', fileToUpload, file.name)`.
- `components/patients/drive/PatientDriveTab.tsx` — parent that wires everything. Has `patientName: string` prop. Renders `DriveUploadButton` twice: once for root files (line ~365), once per subfolder (line ~495).

---

## Task 1: Zoom + Pan in Photo Studio canvas

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

### Step 1: Add zoom/pan state + refs

In `PhotoStudioModal`, add these after the existing refs/state (after line 38, before `imageFiles`):

```tsx
const canvasContainerRef = useRef<HTMLDivElement>(null);
const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
const touchRef = useRef<{ dist: number; startZoom: number } | null>(null);

const [zoom, setZoom] = useState(1);
const [panX, setPanX] = useState(0);
const [panY, setPanY] = useState(0);
const [isDragging, setIsDragging] = useState(false);
```

### Step 2: Add wheel handler via useEffect (non-passive, prevents page scroll)

Add this effect after the existing cleanup effect (after line 99):

```tsx
useEffect(() => {
    const el = canvasContainerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(prev => {
            const next = Math.min(5, Math.max(1, prev + delta));
            if (next <= 1) { setPanX(0); setPanY(0); }
            return next;
        });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
}, []);
```

### Step 3: Add mouse drag handlers (pan when zoomed)

Add these functions after `handleSwitchFile`:

```tsx
function handleMouseDown(e: React.MouseEvent) {
    if (zoom <= 1) return;
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY };
    setIsDragging(true);
}

function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    setPanX(dragRef.current.startPanX + dx);
    setPanY(dragRef.current.startPanY + dy);
}

function handleMouseUp() {
    dragRef.current = null;
    setIsDragging(false);
}
```

### Step 4: Add touch pinch handlers

Add these functions after the mouse handlers:

```tsx
function getTouchDist(touches: React.TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
        touchRef.current = { dist: getTouchDist(e.touches), startZoom: zoom };
    }
}

function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && touchRef.current) {
        const newDist = getTouchDist(e.touches);
        const scale = newDist / touchRef.current.dist;
        setZoom(Math.min(5, Math.max(1, touchRef.current.startZoom * scale)));
    }
}

function handleTouchEnd() {
    touchRef.current = null;
}
```

### Step 5: Reset zoom/pan in resetEdits

In the existing `resetEdits` useCallback, add after `setCompletedCrop(null)`:

```tsx
setZoom(1);
setPanX(0);
setPanY(0);
```

### Step 6: Wire up the canvas area div

Find the canvas area div (currently: `<div className={`flex-1 flex items-center justify-center overflow-hidden p-4 ${canvasBg}`}>`).

Replace it with:

```tsx
<div
    ref={canvasContainerRef}
    className={`relative flex-1 flex items-center justify-center overflow-hidden p-4 ${canvasBg}`}
    onMouseDown={handleMouseDown}
    onMouseMove={handleMouseMove}
    onMouseUp={handleMouseUp}
    onMouseLeave={handleMouseUp}
    onTouchStart={handleTouchStart}
    onTouchMove={handleTouchMove}
    onTouchEnd={handleTouchEnd}
    onDoubleClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
    style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
>
    {/* zoom/pan wrapper */}
    <div style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: 'center', transition: isDragging ? 'none' : 'transform 0.05s ease-out' }}>
        {cropActive ? (
            <ReactCrop
                crop={crop}
                onChange={c => setCrop(c)}
                onComplete={c => setCompletedCrop(c)}
            >
                <img
                    ref={imgRef}
                    src={imageUrl}
                    alt={activeFile.name}
                    crossOrigin="anonymous"
                    style={imageStyle}
                />
            </ReactCrop>
        ) : (
            <img
                ref={imgRef}
                src={imageUrl}
                alt={activeFile.name}
                crossOrigin="anonymous"
                style={imageStyle}
            />
        )}
    </div>

    {/* Zoom indicator badge */}
    {zoom > 1 && (
        <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md bg-black/50 text-white/70 text-xs font-mono pointer-events-none select-none">
            {Math.round(zoom * 100)}%
        </div>
    )}
</div>
```

### Step 7: Verify manually

- Open Photo Studio on any image
- Scroll with mouse wheel → image zooms in/out, max 500%, min 100%
- When zoomed: drag to pan
- Double-click → resets to 100%
- Pinch on mobile → zooms
- Resetear todo → zoom returns to 100%

### Step 8: Commit

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(photo-studio): zoom+pan via scroll, drag, pinch"
```

---

## Task 2: Bipupillar grid overlay during rotation

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

### Step 1: Add showGrid state

In PhotoStudioModal, add after the `isDragging` state:

```tsx
const [showGrid, setShowGrid] = useState(false);
```

### Step 2: Add grid SVG overlay to canvas area

Inside the canvas area div (from Task 1), add the grid overlay AFTER the zoom/pan wrapper div and BEFORE the zoom indicator badge:

```tsx
{/* Bipupillar grid overlay */}
{(showGrid || rotation !== 0) && (
    <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        xmlns="http://www.w3.org/2000/svg"
    >
        {/* Rule-of-thirds verticals */}
        <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <line x1="66.67%" y1="0" x2="66.67%" y2="100%" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        {/* Rule-of-thirds horizontals */}
        <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        <line x1="0" y1="66.67%" x2="100%" y2="66.67%" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
        {/* Center horizontal — bipupillar reference line (gold, dashed) */}
        <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(201,169,110,0.6)" strokeWidth="1" strokeDasharray="10 5" />
        {/* Center vertical */}
        <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(201,169,110,0.3)" strokeWidth="0.5" strokeDasharray="10 5" />
    </svg>
)}
```

### Step 3: Add showGrid/setShowGrid to ToolsPanel interface and props

Find `interface ToolsPanelProps` and add:

```tsx
showGrid: boolean;
setShowGrid: (v: boolean | ((prev: boolean) => boolean)) => void;
```

In the `ToolsPanel` function parameters, add `showGrid, setShowGrid`.

### Step 4: Add grid toggle button to ToolsPanel's Rotate section

In ToolsPanel, in the Rotate section, after the optional "Centrar" button block, add:

```tsx
<button
    onClick={() => setShowGrid(v => !v)}
    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
        showGrid
            ? 'bg-[#C9A96E]/20 text-[#C9A96E]'
            : 'bg-white/5 text-white/40 hover:text-white/60'
    }`}
>
    <Grid size={11} />
    Grilla
</button>
```

Add `Grid` to the lucide-react import at the top of the file.

### Step 5: Pass showGrid/setShowGrid where ToolsPanel is rendered

Find the `<ToolsPanel` JSX (desktop, around line 356) and add the two props:

```tsx
showGrid={showGrid}
setShowGrid={setShowGrid}
```

### Step 6: Reset showGrid in resetEdits

In `resetEdits`, add:

```tsx
setShowGrid(false);
```

### Step 7: Verify manually

- Open Photo Studio
- Move rotation slider → grid appears automatically
- Return slider to 0 → grid disappears
- Click "Grilla" button → grid stays on even at 0°
- Click again → grid turns off
- The gold dashed horizontal line at center = bipupillar reference
- Resetear → grid disappears

### Step 8: Commit

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(photo-studio): bipupillar grid overlay during rotation"
```

---

## Task 3: Quick-download button on DriveFileCard

**Files:**
- Modify: `components/patients/drive/DriveFileCard.tsx`

### Step 1: Add Download import

In `DriveFileCard.tsx`, add `Download` to the lucide-react import:

```tsx
import {
    Image as ImageIcon,
    Video,
    Box,
    FileText,
    File,
    ExternalLink,
    Play,
    Download,
} from 'lucide-react';
```

### Step 2: Compute canDownload in DriveFileCard

After `const canPreview = ...`, add:

```tsx
// google-docs are served by Google directly; the Drive proxy can't download them
const canDownload = category !== 'google-doc';
```

### Step 3: Add download button overlay inside the thumbnail div

The thumbnail div currently ends with the `!canPreview` ExternalLink block. Add the download button AFTER that block, still inside the `aspect-square` div:

```tsx
{canDownload && (
    <a
        href={`/api/drive/file/${file.id}`}
        download={file.name}
        onClick={e => e.stopPropagation()}
        className="absolute bottom-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 sm:opacity-60 transition-all hover:bg-black/80 hover:text-white z-10"
        title="Descargar"
    >
        <Download size={13} />
    </a>
)}
```

Note: `sm:opacity-60` makes it always slightly visible on mobile (no hover on touch), while on desktop it only appears on hover via `group-hover:opacity-100`.

### Step 4: Verify manually

- Go to a patient's file grid
- Hover over an image card → small download icon appears bottom-right of thumbnail
- Hover over a 3D/STL card → same
- Hover over a Google Slides card → NO download icon (correct)
- Click the download icon → browser downloads the file WITHOUT opening the preview modal

### Step 5: Commit

```bash
git add components/patients/drive/DriveFileCard.tsx
git commit -m "feat(archivos): quick-download button on file cards"
```

---

## Task 4: SEO-friendly auto-naming on upload

**Files:**
- Modify: `components/patients/drive/DriveUploadButton.tsx`
- Modify: `components/patients/drive/PatientDriveTab.tsx`

### Step 1: Add toSlug utility and SEO naming to DriveUploadButton

In `DriveUploadButton.tsx`, add these two functions BEFORE the component definition:

```tsx
function toSlug(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')   // remove diacritics (á→a, ñ→n, etc.)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function buildSeoFileName(prefix: string, index: number, originalName: string): string {
    const ext = originalName.split('.').pop()?.toLowerCase() || 'jpg';
    const month = new Date().toISOString().slice(0, 7); // "2026-03"
    const seq = String(index + 1).padStart(3, '0');
    return `${toSlug(prefix)}_${month}_${seq}.${ext}`;
}
```

### Step 2: Add fileNamePrefix prop to DriveUploadButtonProps

```tsx
interface DriveUploadButtonProps {
    folderId: string;
    patientId: string;
    onUploaded: () => void;
    fileNamePrefix?: string;    // ← ADD THIS
    variant?: 'icon' | 'dropzone';
    dropzoneTitle?: string;
    dropzoneHint?: string;
    dropzoneClassName?: string;
    successMessage?: string | ((count: number) => string);
}
```

Add `fileNamePrefix` to the destructured props in the function signature.

### Step 3: Update handleFiles to use fileNamePrefix with index

Replace the current `for (const file of Array.from(files))` loop with an indexed one:

```tsx
const handleFiles = async (files: FileList) => {
    setUploading(true);
    let successCount = 0;
    const fileArray = Array.from(files);

    for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        try {
            let fileToUpload: File | Blob = file;

            // Compress images before upload
            if (file.type.startsWith('image/') && file.size > 500 * 1024) {
                const compressed = await compressImage(file, {
                    maxWidth: 2000,
                    maxHeight: 2000,
                    quality: 0.8,
                    maxSizeKB: 500,
                });
                fileToUpload = compressed.blob;
            }

            // SEO-friendly filename if prefix provided
            const uploadName = fileNamePrefix
                ? buildSeoFileName(fileNamePrefix, i, file.name)
                : file.name;

            const formData = new FormData();
            formData.append('file', fileToUpload, uploadName);
            formData.append('folderId', folderId);
            formData.append('patientId', patientId);

            const res = await fetch('/api/drive/upload', {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Error al subir');
            }

            successCount++;
        } catch (error) {
            toast.error(`Error subiendo ${file.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
        }
    }

    if (successCount > 0) {
        const defaultMessage = `${successCount} archivo${successCount > 1 ? 's' : ''} subido${successCount > 1 ? 's' : ''}`;
        const resolvedMessage = typeof successMessage === 'function'
            ? successMessage(successCount)
            : successMessage;
        toast.success(resolvedMessage || defaultMessage);
        onUploaded();
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = '';
};
```

### Step 4: Add toSlug to PatientDriveTab and pass fileNamePrefix

In `PatientDriveTab.tsx`, add this utility function after the existing `extractFolderIdFromUrl` function (around line 32):

```tsx
function toSlug(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}
```

### Step 5: Pass fileNamePrefix to each DriveUploadButton call

There are two places in `PatientDriveTab` where `DriveUploadButton` is rendered:

**Root files upload** (around line 364-378, inside `canUpload && motherFolderId` block):

```tsx
<DriveUploadButton
    folderId={motherFolderId}
    patientId={patientId}
    fileNamePrefix={`${toSlug(patientName)}_am-clinica_general`}
    onUploaded={() => handleUploadedToFolder(motherFolderId)}
    // ... rest of existing props unchanged
/>
```

**Subfolder upload button** (around line 472-480):

```tsx
<DriveUploadButton
    folderId={folder.id}
    patientId={patientId}
    fileNamePrefix={`${toSlug(patientName)}_am-clinica_${toSlug(folder.displayName)}`}
    onUploaded={() => handleUploadedToFolder(folder.id)}
    // ... rest of existing props unchanged
/>
```

**Subfolder dropzone** (around line 495-505):

```tsx
<DriveUploadButton
    folderId={folder.id}
    patientId={patientId}
    fileNamePrefix={`${toSlug(patientName)}_am-clinica_${toSlug(folder.displayName)}`}
    onUploaded={() => handleUploadedToFolder(folder.id)}
    variant="dropzone"
    // ... rest of existing props unchanged
/>
```

**Global drag-drop overlay** (around line 560-571):

```tsx
<DriveUploadButton
    folderId={effectiveGlobalDropFolderId}
    patientId={patientId}
    fileNamePrefix={`${toSlug(patientName)}_am-clinica_${toSlug(
        folders.find(f => f.id === effectiveGlobalDropFolderId)?.displayName ?? 'general'
    )}`}
    onUploaded={() => { resetGlobalDrag(); handleUploadedToFolder(effectiveGlobalDropFolderId); }}
    // ... rest of existing props unchanged
/>
```

### Step 6: Run TypeScript check

```bash
cd "/Users/am/Downloads/antigravity apps/am-clinica-main" && npx tsc --noEmit
```

Expected: no errors.

### Step 7: Verify manually

- Open a patient with a "[FOTO & VIDEO]" folder
- Upload a photo via drag-and-drop
- Expand the folder → new file should be named e.g. `garcia-ana_am-clinica_foto-video_2026-03_001.jpg`
- Upload 3 files at once → `_001`, `_002`, `_003`
- Upload to root → `garcia-ana_am-clinica_general_2026-03_001.jpg`

### Step 8: Commit

```bash
git add components/patients/drive/DriveUploadButton.tsx components/patients/drive/PatientDriveTab.tsx
git commit -m "feat(archivos): SEO-friendly auto-naming on upload (apellido-nombre_am-clinica_carpeta_YYYY-MM_seq)"
```

---

## Out of Scope (Phase 2b)

- AI auto-rotation (bipupillar line detection)
- Brush/mask tool for background removal refinement

---

## Verification Checklist

1. Photo Studio: scroll up/down → zooms in/out smoothly
2. Photo Studio: zoom > 1 → drag to pan
3. Photo Studio: double-click → resets zoom
4. Photo Studio: Resetear → zoom resets
5. Photo Studio: rotate slider → grid appears automatically
6. Photo Studio: grid shows gold center horizontal line + white rule-of-thirds lines
7. Photo Studio: Grilla toggle in tools panel → grid persists even at rotation=0
8. File grid: hover image card → download icon bottom-right
9. File grid: hover 3D card → download icon
10. File grid: hover Google Slides card → NO download icon
11. File grid: click download icon → browser downloads file (not modal)
12. Upload photo to patient folder → file named with patient+clinic+folder+date+seq
13. `npx tsc --noEmit` → no errors
