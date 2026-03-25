# Photo Studio Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current `DrivePreviewModal` for images with a full-screen `PhotoStudioModal` — 3-column layout (thumbnail strip | canvas | tools panel) with rotate, brightness, crop, background removal + color selector, and save directly back to Google Drive.

**Architecture:** `PhotoStudioModal` is a new `'use client'` component that takes over the image preview. `DrivePreviewModal` becomes a thin router: images → `PhotoStudioModal`, videos/3D → existing players. `PatientDriveTab` passes `folderId` and `allFolderFiles` (images in that folder) so the studio knows where to upload and what to show in the thumbnail strip. Two new server actions handle upload and delete via the existing Google Drive service account.

**Tech Stack:** react-image-crop v11, @imgly/background-removal v1.7, Canvas API, lucide-react, Tailwind CSS, googleapis (existing), Next.js Server Actions

**Design doc:** `docs/plans/2026-03-14-photo-studio-design.md`

---

## Task 1: Add `uploadFileToFolder` utility to `lib/google-drive.ts`

**Files:**
- Modify: `lib/google-drive.ts` (append after `deleteFromDrive` ~line 797)

The existing `uploadToDrive` takes an `area` key (caja-admin etc), not a raw folder ID. We need a version that takes any folder ID — for uploading edited patient photos back to their Drive folder.

**Step 1: Add the function after `deleteFromDrive`**

Open `lib/google-drive.ts` and add this function after line 797 (after `deleteFromDrive`):

```ts
/**
 * Uploads a file buffer directly to a specific Drive folder by ID.
 * Used for saving edited photos back to patient folders.
 */
export async function uploadFileToFolder(
    folderId: string,
    fileName: string,
    buffer: Buffer,
    mimeType: string
): Promise<UploadResult> {
    try {
        const drive = getDriveClient();
        const stream = Readable.from(buffer);
        const response = await drive.files.create({
            supportsAllDrives: true,
            requestBody: {
                name: fileName,
                parents: [folderId],
            },
            media: {
                mimeType,
                body: stream,
            },
            fields: 'id, webViewLink',
        });
        return {
            success: true,
            fileId: response.data.id ?? undefined,
            webViewLink: response.data.webViewLink ?? undefined,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd "/Users/ariel/Downloads/antigravity apps/am-clinica-main"
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors related to `lib/google-drive.ts`

**Step 3: Commit**

```bash
git add lib/google-drive.ts
git commit -m "feat(drive): uploadFileToFolder utility for arbitrary folder IDs"
```

---

## Task 2: Add server actions to `app/actions/patient-files-drive.ts`

**Files:**
- Modify: `app/actions/patient-files-drive.ts` (append at end of file)

These actions are called from the Save to Drive flow in `PhotoStudioModal`.

**Step 1: Add the two server actions at the end of the file**

```ts
// ─── Photo Studio: save edited photo to Drive ───────────────────────────────

/**
 * Upload an edited photo blob (via FormData) to a specific Drive folder.
 * The client sends a FormData with key "file" containing the Blob.
 */
export async function uploadEditedPhotoAction(
    folderId: string,
    fileName: string,
    formData: FormData
): Promise<{ fileId?: string; error?: string }> {
    try {
        const file = formData.get('file') as File | null;
        if (!file) return { error: 'No file in FormData' };

        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadFileToFolder(folderId, fileName, buffer, file.type || 'image/jpeg');

        if (!result.success) return { error: result.error };
        return { fileId: result.fileId };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

/**
 * Delete a file from Drive by ID (used for "replace original" in Photo Studio).
 */
export async function deleteDriveFileAction(
    fileId: string
): Promise<{ error?: string }> {
    try {
        const result = await deleteFromDrive(fileId);
        if (!result.success) return { error: result.error };
        return {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}
```

**Step 2: Add the missing imports at top of the file** (after the existing imports from `@/lib/google-drive`):

The file already imports from `@/lib/google-drive`. Add `uploadFileToFolder` and `deleteFromDrive` to that import:

```ts
import {
    listFolderFiles,
    extractFolderIdFromUrl,
    ensureStandardPatientFolders,
    getFolderWebViewLink,
    uploadFileToFolder,
    deleteFromDrive,
} from '@/lib/google-drive';
```

**Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

**Step 4: Commit**

```bash
git add app/actions/patient-files-drive.ts
git commit -m "feat(archivos): server actions uploadEditedPhoto + deleteDriveFile"
```

---

## Task 3: Create `PhotoStudioModal.tsx`

**Files:**
- Create: `components/patients/drive/PhotoStudioModal.tsx`

This is the main component. Full-screen modal with:
- Left: vertical thumbnail strip (desktop) / top horizontal strip (mobile)
- Center: canvas (ReactCrop + img with CSS transforms)
- Right: tools panel (desktop) / bottom section (mobile)

**Step 1: Create the file with this complete implementation**

```tsx
'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    X, Download, RotateCcw, Sun, Crop, Wand2, Loader2, Check,
    RotateCw, Save, ImageIcon,
} from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { uploadEditedPhotoAction, deleteDriveFileAction } from '@/app/actions/patient-files-drive';

interface PhotoStudioModalProps {
    file: DriveFile | null;
    folderId: string;
    allFolderFiles: DriveFile[];   // images in same folder — for thumbnail strip
    onClose: () => void;
    onSaved: () => void;           // called after successful save → triggers folder refresh
}

type BgColor = 'transparent' | 'white' | 'black';

function isImageFile(file: DriveFile): boolean {
    return file.mimeType.toLowerCase().startsWith('image/');
}

export default function PhotoStudioModal({
    file,
    folderId,
    allFolderFiles,
    onClose,
    onSaved,
}: PhotoStudioModalProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const objectUrlRef = useRef<string | null>(null);

    // Active file in the studio (may differ from initial file when user clicks thumbnails)
    const [activeFile, setActiveFile] = useState<DriveFile | null>(file);
    const [imageUrl, setImageUrl] = useState(() => file ? `/api/drive/file/${file.id}` : '');

    // Edit state
    const [rotation, setRotation] = useState(0);
    const [brightness, setBrightness] = useState(100);
    const [bgProcessing, setBgProcessing] = useState(false);
    const [bgDone, setBgDone] = useState(false);
    const [bgColor, setBgColor] = useState<BgColor>('transparent');
    const [cropActive, setCropActive] = useState(false);
    const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

    // UI state
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // Image files for the thumbnail strip (only images)
    const imageFiles = allFolderFiles.filter(isImageFile);

    const isDirty =
        rotation !== 0 ||
        brightness !== 100 ||
        bgDone ||
        (completedCrop != null && completedCrop.width > 0);

    // Reset edits without changing the active file
    const resetEdits = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
        setRotation(0);
        setBrightness(100);
        setBgDone(false);
        setBgProcessing(false);
        setBgColor('transparent');
        setCropActive(false);
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        setCompletedCrop(null);
    }, []);

    // When initial file prop changes (shouldn't normally happen, but be safe)
    useEffect(() => {
        if (file && file.id !== activeFile?.id) {
            setActiveFile(file);
            setImageUrl(`/api/drive/file/${file.id}`);
            resetEdits();
        }
    }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup object URL on unmount
    useEffect(() => {
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, []);

    function handleSwitchFile(newFile: DriveFile) {
        if (newFile.id === activeFile?.id) return;
        if (isDirty && !confirm('Tenés cambios sin guardar. ¿Cambiar de foto de todas formas?')) return;
        resetEdits();
        setActiveFile(newFile);
        setImageUrl(`/api/drive/file/${newFile.id}`);
    }

    async function handleRemoveBackground() {
        setBgProcessing(true);
        try {
            const { removeBackground: removeBg } = await import('@imgly/background-removal');
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const resultBlob = await removeBg(blob);
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            const newUrl = URL.createObjectURL(resultBlob);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            setBgDone(true);
            setBgColor('transparent');
        } catch (err) {
            console.error('[bg-removal]', err);
            toast.error('Error al remover fondo');
        } finally {
            setBgProcessing(false);
        }
    }

    async function exportToBlob(): Promise<Blob> {
        const img = imgRef.current!;
        const radians = (rotation * Math.PI) / 180;
        const outW = img.naturalWidth;
        const outH = img.naturalHeight;

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d')!;

        // Background fill (only when bg removed + non-transparent)
        if (bgDone && bgColor !== 'transparent') {
            ctx.fillStyle = bgColor === 'white' ? '#ffffff' : '#111111';
            ctx.fillRect(0, 0, outW, outH);
        }

        ctx.filter = `brightness(${brightness}%)`;
        ctx.translate(outW / 2, outH / 2);
        ctx.rotate(radians);
        ctx.drawImage(img, -outW / 2, -outH / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const isPng = bgDone || activeFile!.name.toLowerCase().endsWith('.png');
        const mime = isPng ? 'image/png' : 'image/jpeg';

        if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
            return new Promise(res => canvas.toBlob(b => res(b!), mime, 0.95));
        }

        const scaleX = outW / img.width;
        const scaleY = outH / img.height;
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = completedCrop.width * scaleX;
        cropCanvas.height = completedCrop.height * scaleY;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(
            canvas,
            completedCrop.x * scaleX, completedCrop.y * scaleY,
            cropCanvas.width, cropCanvas.height,
            0, 0, cropCanvas.width, cropCanvas.height
        );
        return new Promise(res => cropCanvas.toBlob(b => res(b!), mime, 0.95));
    }

    function handleDownload() {
        exportToBlob().then(blob => {
            const isPng = bgDone || activeFile!.name.toLowerCase().endsWith('.png');
            const ext = isPng ? 'png' : 'jpg';
            const baseName = activeFile!.name.replace(/\.[^.]+$/, '');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${baseName}_editada.${ext}`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        });
    }

    async function handleSaveToDrive(mode: 'replace' | 'copy') {
        if (!activeFile) return;
        setSaving(true);
        try {
            const blob = await exportToBlob();
            const isPng = blob.type === 'image/png';
            const ext = isPng ? 'png' : 'jpg';
            const baseName = activeFile.name.replace(/\.[^.]+$/, '');
            const fileName = mode === 'copy'
                ? `${baseName}_editada.${ext}`
                : `${baseName}.${ext}`;

            const formData = new FormData();
            formData.append('file', blob, fileName);

            const uploadResult = await uploadEditedPhotoAction(folderId, fileName, formData);
            if (uploadResult.error) {
                toast.error(`Error al guardar: ${uploadResult.error}`);
                return;
            }

            if (mode === 'replace') {
                const deleteResult = await deleteDriveFileAction(activeFile.id);
                if (deleteResult.error) {
                    toast.error(`Foto guardada pero no se pudo borrar la original: ${deleteResult.error}`);
                } else {
                    toast.success('Foto guardada y original reemplazada');
                }
            } else {
                toast.success('Copia guardada en Drive');
            }

            setSaveDialogOpen(false);
            onSaved();
            onClose();
        } catch (err) {
            toast.error('Error inesperado al guardar');
            console.error('[PhotoStudio save]', err);
        } finally {
            setSaving(false);
        }
    }

    if (!file || !activeFile) return null;

    // Canvas background style (for bg removal preview)
    const canvasBg = bgDone
        ? bgColor === 'white'
            ? 'bg-white'
            : bgColor === 'black'
            ? 'bg-[#111]'
            : 'bg-[url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'16\'%3E%3Crect width=\'8\' height=\'8\' fill=\'%23ccc\'/%3E%3Crect x=\'8\' y=\'8\' width=\'8\' height=\'8\' fill=\'%23ccc\'/%3E%3C/svg%3E")]'
        : 'bg-[#0D0D12]';

    const imageStyle: React.CSSProperties = {
        transform: `rotate(${rotation}deg)`,
        filter: `brightness(${brightness}%)`,
        maxHeight: '65vh',
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-[#0D0D12] flex flex-col"
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
                    <p className="text-white font-semibold truncate flex-1 mr-4 text-sm">
                        {activeFile.name}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={() => setSaveDialogOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E] text-black text-sm font-semibold hover:bg-[#b8924e] transition-colors"
                        >
                            <Save size={14} />
                            <span className="hidden sm:inline">Guardar en Drive</span>
                        </button>
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                        >
                            <Download size={14} />
                            <span className="hidden sm:inline">Descargar</span>
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="flex-1 flex overflow-hidden min-h-0">

                    {/* Thumbnail strip — vertical on desktop */}
                    {imageFiles.length > 1 && (
                        <div className="hidden md:flex flex-col w-[72px] border-r border-white/10 overflow-y-auto gap-1 p-1 flex-shrink-0 bg-black/20">
                            {imageFiles.map(f => (
                                <button
                                    key={f.id}
                                    onClick={() => handleSwitchFile(f)}
                                    className={`relative aspect-square rounded-md overflow-hidden flex-shrink-0 border-2 transition-all ${
                                        f.id === activeFile.id
                                            ? 'border-[#C9A96E]'
                                            : 'border-transparent hover:border-white/30'
                                    }`}
                                >
                                    {f.thumbnailLink ? (
                                        <img
                                            src={f.thumbnailLink}
                                            alt={f.name}
                                            referrerPolicy="no-referrer"
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-white/5">
                                            <ImageIcon size={16} className="text-white/30" />
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Canvas area */}
                    <div className={`flex-1 flex items-center justify-center overflow-hidden p-4 ${canvasBg}`}>
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

                    {/* Tools panel — right side on desktop */}
                    <div className="hidden md:flex flex-col w-64 border-l border-white/10 overflow-y-auto p-4 gap-5 flex-shrink-0 bg-black/20">
                        <ToolsPanel
                            rotation={rotation} setRotation={setRotation}
                            brightness={brightness} setBrightness={setBrightness}
                            cropActive={cropActive} setCropActive={setCropActive}
                            bgProcessing={bgProcessing} bgDone={bgDone}
                            bgColor={bgColor} setBgColor={setBgColor}
                            onRemoveBg={handleRemoveBackground}
                            onReset={() => {
                                resetEdits();
                                setImageUrl(`/api/drive/file/${activeFile.id}`);
                            }}
                        />
                    </div>
                </div>

                {/* Tools — bottom strip on mobile */}
                <div className="md:hidden border-t border-white/10 px-3 py-2 overflow-x-auto flex-shrink-0">
                    <div className="flex items-center gap-4 min-w-max">
                        {/* Rotate */}
                        <div className="flex items-center gap-1.5">
                            <RotateCcw size={13} className="text-white/50" />
                            <input
                                type="range" min={-45} max={45} step={0.5}
                                value={rotation}
                                onChange={e => setRotation(Number(e.target.value))}
                                className="w-20 accent-white/70"
                            />
                            <span className="text-white/40 text-xs w-8">
                                {rotation > 0 ? `+${rotation}°` : `${rotation}°`}
                            </span>
                        </div>
                        {/* Brightness */}
                        <div className="flex items-center gap-1.5">
                            <Sun size={13} className="text-yellow-400" />
                            <input
                                type="range" min={0} max={200} step={1}
                                value={brightness}
                                onChange={e => setBrightness(Number(e.target.value))}
                                className="w-20 accent-yellow-400"
                            />
                        </div>
                        {/* Crop */}
                        <button
                            onClick={() => setCropActive(v => !v)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                                cropActive ? 'bg-blue-600 text-white' : 'bg-white/10 text-white/70'
                            }`}
                        >
                            <Crop size={13} /> Recortar
                        </button>
                        {/* BG removal */}
                        <button
                            onClick={handleRemoveBackground}
                            disabled={bgProcessing || bgDone}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-600/30 text-violet-300 text-xs disabled:opacity-50"
                        >
                            {bgProcessing ? <Loader2 size={13} className="animate-spin" /> : bgDone ? <Check size={13} /> : <Wand2 size={13} />}
                            {bgProcessing ? 'Procesando...' : bgDone ? 'Sin fondo' : 'Sin fondo'}
                        </button>
                    </div>
                </div>

                {/* ── Save dialog (bottom sheet) ──────────────────────────── */}
                <AnimatePresence>
                    {saveDialogOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-4"
                            onClick={() => !saving && setSaveDialogOpen(false)}
                        >
                            <motion.div
                                initial={{ y: 40, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: 40, opacity: 0 }}
                                onClick={e => e.stopPropagation()}
                                className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm"
                            >
                                <h3 className="text-white font-semibold mb-1">Guardar en Drive</h3>
                                <p className="text-white/50 text-sm mb-5">
                                    ¿Reemplazás la foto original o guardás una copia?
                                </p>
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => handleSaveToDrive('replace')}
                                        disabled={saving}
                                        className="w-full py-3 rounded-xl bg-red-600/80 text-white font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                                        Reemplazar original
                                    </button>
                                    <button
                                        onClick={() => handleSaveToDrive('copy')}
                                        disabled={saving}
                                        className="w-full py-3 rounded-xl bg-[#C9A96E] text-black font-semibold hover:bg-[#b8924e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Guardar como copia
                                    </button>
                                    <button
                                        onClick={() => setSaveDialogOpen(false)}
                                        disabled={saving}
                                        className="w-full py-2 rounded-xl text-white/50 text-sm hover:text-white/70 transition-colors"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </AnimatePresence>
    );
}

// ─── Tools Panel (desktop right sidebar) ──────────────────────────────────────

interface ToolsPanelProps {
    rotation: number; setRotation: (v: number) => void;
    brightness: number; setBrightness: (v: number) => void;
    cropActive: boolean; setCropActive: (v: boolean | ((prev: boolean) => boolean)) => void;
    bgProcessing: boolean; bgDone: boolean;
    bgColor: BgColor; setBgColor: (v: BgColor) => void;
    onRemoveBg: () => void;
    onReset: () => void;
}

function ToolsPanel({
    rotation, setRotation,
    brightness, setBrightness,
    cropActive, setCropActive,
    bgProcessing, bgDone,
    bgColor, setBgColor,
    onRemoveBg,
    onReset,
}: ToolsPanelProps) {
    return (
        <>
            <p className="text-white/30 text-xs font-semibold uppercase tracking-widest">Herramientas</p>

            {/* Rotate */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                        <RotateCcw size={13} />
                        Rotar
                    </div>
                    <span className="text-white/40 text-xs">
                        {rotation > 0 ? `+${rotation}°` : `${rotation}°`}
                    </span>
                </div>
                <input
                    type="range" min={-45} max={45} step={0.5}
                    value={rotation}
                    onChange={e => setRotation(Number(e.target.value))}
                    className="w-full accent-white/70"
                />
                {rotation !== 0 && (
                    <button
                        onClick={() => setRotation(0)}
                        className="text-xs text-white/30 hover:text-white/60 transition-colors"
                    >
                        Centrar
                    </button>
                )}
            </div>

            {/* Brightness */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                        <Sun size={13} className="text-yellow-400" />
                        Brillo
                    </div>
                    <span className="text-white/40 text-xs">{brightness}%</span>
                </div>
                <input
                    type="range" min={0} max={200} step={1}
                    value={brightness}
                    onChange={e => setBrightness(Number(e.target.value))}
                    className="w-full accent-yellow-400"
                />
            </div>

            {/* Crop */}
            <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                    <Crop size={13} /> Recortar
                </p>
                <button
                    onClick={() => setCropActive(v => !v)}
                    className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                        cropActive
                            ? 'bg-blue-600 text-white'
                            : 'bg-white/10 text-white/70 hover:bg-white/15'
                    }`}
                >
                    {cropActive ? 'Desactivar recorte' : 'Activar recorte'}
                </button>
                {cropActive && (
                    <p className="text-white/30 text-xs">
                        Arrastrá sobre la imagen para seleccionar el área a conservar
                    </p>
                )}
            </div>

            {/* Background removal */}
            <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                    <Wand2 size={13} className="text-violet-400" /> Fondo
                </p>
                <button
                    onClick={onRemoveBg}
                    disabled={bgProcessing || bgDone}
                    className="w-full py-2 rounded-lg bg-violet-600/30 text-violet-300 text-sm hover:bg-violet-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {bgProcessing
                        ? <><Loader2 size={14} className="animate-spin" /> Procesando...</>
                        : bgDone
                        ? <><Check size={14} /> Fondo removido</>
                        : <><Wand2 size={14} /> Remover fondo</>
                    }
                </button>

                {/* Background color selector — only visible after bg removed */}
                {bgDone && (
                    <div className="space-y-1.5">
                        <p className="text-white/40 text-xs">Reemplazar con:</p>
                        <div className="flex gap-2">
                            {([
                                { value: 'transparent', label: '▥', title: 'Transparente', cls: 'bg-white/10' },
                                { value: 'white', label: '⬜', title: 'Blanco', cls: 'bg-white' },
                                { value: 'black', label: '⬛', title: 'Negro', cls: 'bg-[#111]' },
                            ] as const).map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => setBgColor(opt.value)}
                                    title={opt.title}
                                    className={`flex-1 py-2 rounded-lg text-sm border-2 transition-all ${opt.cls} ${
                                        bgColor === opt.value
                                            ? 'border-[#C9A96E] scale-105'
                                            : 'border-transparent hover:border-white/20'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Spacer + Reset */}
            <div className="flex-1" />
            <button
                onClick={onReset}
                className="w-full py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/70 hover:border-white/20 transition-colors"
            >
                Resetear todo
            </button>
        </>
    );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: no errors in `PhotoStudioModal.tsx`

**Step 3: Commit**

```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(archivos): PhotoStudioModal — 3-col layout, tools panel, save to Drive"
```

---

## Task 4: Update `DrivePreviewModal.tsx` to route images → `PhotoStudioModal`

**Files:**
- Modify: `components/patients/drive/DrivePreviewModal.tsx`

`DrivePreviewModal` currently handles everything. We make it a router: images go to `PhotoStudioModal`, videos/3D keep the existing players.

This component receives 2 new props: `folderId` and `allFolderFiles`.

**Step 1: Replace the full contents of `DrivePreviewModal.tsx`**

```tsx
'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, ExternalLink } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import PhotoStudioModal from './PhotoStudioModal';

const STLViewer = dynamic(() => import('@/components/portal-paciente/STLViewer'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

interface DrivePreviewModalProps {
    file: DriveFile | null;
    folderId: string;
    allFolderFiles: DriveFile[];
    onClose: () => void;
    onSaved: () => void;
}

function getPreviewType(file: DriveFile): 'image' | 'video' | '3d' | null {
    const mime = file.mimeType.toLowerCase();
    const name = file.name.toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (name.endsWith('.stl') || name.endsWith('.ply') || mime === 'application/sla' || mime === 'model/stl') return '3d';
    return null;
}

function get3DFormat(file: DriveFile): 'stl' | 'ply' {
    return file.name.toLowerCase().endsWith('.ply') ? 'ply' : 'stl';
}

export default function DrivePreviewModal({
    file,
    folderId,
    allFolderFiles,
    onClose,
    onSaved,
}: DrivePreviewModalProps) {
    if (!file) return null;

    const previewType = getPreviewType(file);

    // Images → Photo Studio
    if (previewType === 'image') {
        return (
            <PhotoStudioModal
                file={file}
                folderId={folderId}
                allFolderFiles={allFolderFiles}
                onClose={onClose}
                onSaved={onSaved}
            />
        );
    }

    const proxyUrl = `/api/drive/file/${file.id}`;

    // Video / 3D → original minimal modal
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col"
                onClick={onClose}
            >
                <div
                    className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 flex-shrink-0"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="min-w-0 flex-1 mr-4">
                        <p className="text-white font-semibold truncate">{file.name}</p>
                        {previewType === '3d' && (
                            <p className="text-white/40 text-xs mt-0.5">
                                Arrastrá para rotar · Scroll para zoom
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                        >
                            <ExternalLink size={14} />
                            <span className="hidden sm:inline">Drive</span>
                        </a>
                        {previewType !== '3d' && (
                            <a
                                href={proxyUrl}
                                download={file.name}
                                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                                onClick={e => e.stopPropagation()}
                            >
                                <span className="hidden sm:inline">Descargar</span>
                            </a>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
                    {previewType === 'video' && (
                        <div className="flex-1 flex items-center justify-center p-4">
                            <video
                                src={proxyUrl}
                                controls
                                autoPlay
                                className="max-h-full max-w-full rounded-lg"
                            >
                                Tu navegador no soporta video HTML5.
                            </video>
                        </div>
                    )}
                    {previewType === '3d' && (
                        <div className="flex-1">
                            <STLViewer url={proxyUrl} format={get3DFormat(file)} />
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
}
```

**Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: errors only in `PatientDriveTab.tsx` (not yet updated — that's Task 5)

**Step 3: Commit**

```bash
git add components/patients/drive/DrivePreviewModal.tsx
git commit -m "refactor(archivos): DrivePreviewModal routes images to PhotoStudioModal"
```

---

## Task 5: Update `PatientDriveTab.tsx` to pass `folderId` + `allFolderFiles` + `onSaved`

**Files:**
- Modify: `components/patients/drive/PatientDriveTab.tsx`

The tab needs to:
1. Track which folder the currently previewed file belongs to (`previewFolderId`)
2. Pass the images of that folder as `allFolderFiles` to the modal
3. Wire `onSaved` to refresh the folder

**Step 1: Add `previewFolderId` state**

After the existing `const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);` line, add:

```ts
const [previewFolderId, setPreviewFolderId] = useState<string>('');
```

**Step 2: Replace `setPreviewFile` calls with a helper**

Add this function after the state declarations:

```ts
function openPreview(file: DriveFile, folderId: string) {
    setPreviewFile(file);
    setPreviewFolderId(folderId);
}
```

**Step 3: Update `DriveFileCard` calls in the render to use `openPreview`**

There are two places where `onPreview={setPreviewFile}` appears — change both:

For root files section (`rootFiles.map`):
```tsx
<DriveFileCard key={file.id} file={file} onPreview={f => openPreview(f, motherFolderId || '')} />
```

For subfolder files (`folder.files.map`):
```tsx
<DriveFileCard key={file.id} file={file} onPreview={f => openPreview(f, folder.id)} />
```

**Step 4: Update the `DrivePreviewModal` call at the bottom**

Replace:
```tsx
<DrivePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
```

With:
```tsx
<DrivePreviewModal
    file={previewFile}
    folderId={previewFolderId}
    allFolderFiles={
        previewFolderId === motherFolderId
            ? rootFiles.filter(f => f.mimeType.toLowerCase().startsWith('image/'))
            : (folders.find(f => f.id === previewFolderId)?.files ?? [])
                .filter(f => f.mimeType.toLowerCase().startsWith('image/'))
    }
    onClose={() => setPreviewFile(null)}
    onSaved={() => {
        setPreviewFile(null);
        handleUploadedToFolder(previewFolderId);
    }}
/>
```

**Step 5: Verify TypeScript compiles with no errors**

```bash
npx tsc --noEmit 2>&1 | head -30
```
Expected: 0 errors

**Step 6: Verify build**

```bash
npm run build 2>&1 | tail -20
```
Expected: `✓ Compiled successfully`

**Step 7: Commit**

```bash
git add components/patients/drive/PatientDriveTab.tsx
git commit -m "feat(archivos): pass folderId + allFolderFiles to DrivePreviewModal"
```

---

## Verification Checklist

Run these manual tests after all tasks complete:

1. Abrir ficha de un paciente → tab Archivos → expandir carpeta con fotos
2. Click en una foto → `PhotoStudioModal` abre full-screen (no el modal anterior)
3. Tira lateral izquierda muestra las otras fotos de la misma carpeta (solo imágenes)
4. Click en otra miniatura de la tira → cambia la foto activa, resetea todos los sliders
5. Si tenés cambios sin guardar y hacés click en otra miniatura → aparece el confirm de "¿cambiar de todas formas?"
6. Slider de rotar → foto gira suavemente de -45° a +45°
7. Slider de brillo → foto cambia de oscuro a brillante en vivo
8. Botón "Activar recorte" → aparece el overlay de ReactCrop sobre la foto
9. "Remover fondo" → spinner "Procesando..." → luego aparece selector de fondo (Transparente/Blanco/Negro)
10. Clic en "Blanco" → fondo del canvas cambia a blanco instantáneamente
11. "Guardar en Drive" → abre bottom sheet con las 2 opciones
12. "Guardar como copia" → sube y cierra, grid se refresca mostrando la nueva foto
13. "Reemplazar original" → sube, borra la original, grid se refresca
14. "Descargar" → descarga el archivo con los cambios aplicados
15. "Resetear todo" → todos los sliders vuelven a 0/100, imagen recargada desde Drive
16. Click en video en el grid → modal original (sin herramientas) — sin regresión
17. Click en STL → modal con STLViewer — sin regresión
18. Mobile: herramientas aparecen en la barra inferior (no en el panel derecho)
