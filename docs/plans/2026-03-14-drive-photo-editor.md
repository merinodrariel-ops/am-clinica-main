# Drive Photo Editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar un editor de fotos en la pestaña Archivos del paciente — accesible desde el modal de preview de imágenes — con crop, rotación, remoción de fondo, brillo y descarga.

**Architecture:** Un nuevo componente `DrivePhotoEditor` (full-screen, `'use client'`) reemplaza el modal de preview cuando el usuario hace clic en "Editar foto". Todo el procesamiento es client-side: CSS transforms para preview en vivo, canvas para exportar el resultado final. `react-image-crop` (ya instalado) maneja el UI de recorte; `@imgly/background-removal` (ya instalado) maneja el modelo AI de remoción de fondo (mismo patrón que `PortfolioEditor.tsx`).

**Tech Stack:** react-image-crop v11, @imgly/background-removal v1.7, Canvas API, lucide-react, Tailwind CSS

---

## Dependencias ya instaladas
- `react-image-crop@^11.0.10` ✅
- `@imgly/background-removal@^1.7.0` ✅
- `three` (para Mini3DPreview, no afecta) ✅

## Archivos existentes relevantes
- `components/patients/drive/DrivePreviewModal.tsx` — agregar botón "Editar foto" (solo para images)
- `components/caja-admin/PortfolioEditor.tsx:248-274` — patrón exacto de `removeBackground` con `@imgly/background-removal`
- `app/api/drive/file/[fileId]/route.ts` — proxy existente para cargar la imagen

---

## Task 1: Crear `DrivePhotoEditor.tsx`

**Files:**
- Create: `components/patients/drive/DrivePhotoEditor.tsx`

### Props interface
```tsx
interface DrivePhotoEditorProps {
    file: DriveFile;          // DriveFile de @/app/actions/patient-files-drive
    onClose: () => void;
}
```

### Estado interno
```tsx
const imgRef = useRef<HTMLImageElement>(null);
const [imageUrl, setImageUrl] = useState(`/api/drive/file/${file.id}`);
const [rotation, setRotation] = useState(0);        // 0 | 90 | 180 | 270
const [brightness, setBrightness] = useState(100);  // 0–200, default 100
const [bgProcessing, setBgProcessing] = useState(false);
const [bgDone, setBgDone] = useState(false);
const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
```

### Función `handleRemoveBackground`
Mismo patrón exacto que `PortfolioEditor.tsx:248-274`:
```tsx
async function handleRemoveBackground() {
    setBgProcessing(true);
    try {
        const { removeBackground: removeBg } = await import('@imgly/background-removal');
        const response = await fetch(imageUrl);
        const blob = await response.blob();
        const resultBlob = await removeBg(blob);
        const newUrl = URL.createObjectURL(resultBlob);
        setImageUrl(newUrl);
        setBgDone(true);
    } catch (err) {
        console.error('[bg-removal]', err);
        // silent fallback — show nothing
    } finally {
        setBgProcessing(false);
    }
}
```

### Función `handleRotate`
```tsx
function handleRotate() {
    setRotation(r => (r + 90) % 360);
    // Reset crop when rotating (coordinates no longer valid)
    setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
    setCompletedCrop(null);
}
```

### Función `handleDownload`
Aplica rotation + brightness + crop en canvas y descarga como PNG:
```tsx
async function handleDownload() {
    const img = imgRef.current;
    if (!img) return;

    const radians = (rotation * Math.PI) / 180;
    const rotated = rotation % 180 !== 0;
    // Natural dimensions after rotation
    const outW = rotated ? img.naturalHeight : img.naturalWidth;
    const outH = rotated ? img.naturalWidth : img.naturalHeight;

    // Step 1: rotate + brightness on full image
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = outW;
    fullCanvas.height = outH;
    const fullCtx = fullCanvas.getContext('2d')!;
    fullCtx.filter = `brightness(${brightness}%)`;
    fullCtx.translate(outW / 2, outH / 2);
    fullCtx.rotate(radians);
    fullCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    fullCtx.setTransform(1, 0, 0, 1, 0, 0); // reset

    // Step 2: crop (if user cropped)
    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
        // No crop: download full
        download(fullCanvas, file.name);
        return;
    }

    // Scale: rendered image size vs natural size
    const scaleX = outW / img.width;
    const scaleY = outH / img.height;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = completedCrop.width * scaleX;
    cropCanvas.height = completedCrop.height * scaleY;
    const cropCtx = cropCanvas.getContext('2d')!;
    cropCtx.drawImage(
        fullCanvas,
        completedCrop.x * scaleX, completedCrop.y * scaleY,
        cropCanvas.width, cropCanvas.height,
        0, 0, cropCanvas.width, cropCanvas.height
    );
    download(cropCanvas, file.name);
}

function download(canvas: HTMLCanvasElement, name: string) {
    const a = document.createElement('a');
    const ext = name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
    a.href = canvas.toDataURL(ext === 'png' ? 'image/png' : 'image/jpeg', 0.95);
    a.download = name.replace(/\.[^.]+$/, '') + '_editada.' + ext;
    a.click();
}
```

### JSX Layout
```tsx
return (
    <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <p className="text-white font-semibold truncate flex-1 mr-4">{file.name}</p>
            <div className="flex items-center gap-2">
                <button onClick={handleDownload} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-1.5 hover:bg-blue-700 transition-colors">
                    <Download size={14} /> Descargar
                </button>
                <button onClick={onClose} className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors">
                    <X size={16} />
                </button>
            </div>
        </div>

        {/* Main: image + crop */}
        <div className="flex-1 overflow-auto flex items-center justify-center p-4">
            <ReactCrop
                crop={crop}
                onChange={setCrop}
                onComplete={setCompletedCrop}
                className="max-h-full"
            >
                <img
                    ref={imgRef}
                    src={imageUrl}
                    alt={file.name}
                    style={{
                        transform: `rotate(${rotation}deg)`,
                        filter: `brightness(${brightness}%)`,
                        maxHeight: '65vh',
                        maxWidth: '100%',
                        objectFit: 'contain',
                        transition: 'transform 0.2s ease',
                    }}
                    crossOrigin="anonymous"
                />
            </ReactCrop>
        </div>

        {/* Bottom toolbar */}
        <div className="px-4 py-3 border-t border-white/10 flex flex-wrap items-center gap-3 justify-center">
            {/* Rotate */}
            <button
                onClick={handleRotate}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
            >
                <RotateCw size={16} /> Rotar 90°
            </button>

            {/* Brightness */}
            <div className="flex items-center gap-2">
                <Sun size={16} className="text-yellow-400" />
                <input
                    type="range"
                    min={0}
                    max={200}
                    value={brightness}
                    onChange={e => setBrightness(Number(e.target.value))}
                    className="w-28 accent-yellow-400"
                />
                <span className="text-white/50 text-xs w-8">{brightness}%</span>
            </div>

            {/* Background removal */}
            <button
                onClick={handleRemoveBackground}
                disabled={bgProcessing || bgDone}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600/30 text-violet-300 text-sm hover:bg-violet-600/50 transition-colors disabled:opacity-50"
            >
                {bgProcessing
                    ? <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                    : bgDone
                    ? <><Check size={16} /> Sin fondo</>
                    : <><Wand2 size={16} /> Remover fondo</>
                }
            </button>
        </div>
    </div>
);
```

### Imports necesarios
```tsx
'use client';
import { useRef, useState } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Download, RotateCw, Sun, Wand2, Loader2, Check } from 'lucide-react';
import type { DriveFile } from '@/app/actions/patient-files-drive';
```

**Commit:** `feat(archivos): DrivePhotoEditor — crop, rotar, brillo, remover fondo`

---

## Task 2: Conectar editor en `DrivePreviewModal.tsx`

**Files:**
- Modify: `components/patients/drive/DrivePreviewModal.tsx`

### Cambios
1. Agregar import de `DrivePhotoEditor` y `useState`
2. Agregar estado `const [editMode, setEditMode] = useState(false)`
3. En el header (solo cuando `previewType === 'image'`), agregar botón "Editar foto":
```tsx
{previewType === 'image' && (
    <button
        onClick={() => setEditMode(true)}
        className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
    >
        <Pencil size={14} />
        <span className="hidden sm:inline">Editar foto</span>
    </button>
)}
```
4. Al final del JSX (antes de `</AnimatePresence>`), montar el editor cuando `editMode`:
```tsx
{editMode && file && (
    <DrivePhotoEditor
        file={file}
        onClose={() => setEditMode(false)}
    />
)}
```
5. Agregar `Pencil` a imports de lucide-react
6. Limpiar `editMode` al cerrar el modal (agregar `useEffect` o en `onClose`)

**Commit:** `feat(archivos): botón Editar foto en DrivePreviewModal`

---

## Verificación
1. Abrir ficha de un paciente → Archivos → expandir carpeta FOTO & VIDEO
2. Doble click en una foto → modal de preview
3. Clic en "Editar foto" → se abre DrivePhotoEditor
4. Probar rotar 90° → imagen rota visualmente
5. Mover slider de brillo → imagen más clara/oscura en vivo
6. Clic "Remover fondo" → spinner → imagen sin fondo (PNG)
7. Arrastrar el crop overlay → seleccionar área
8. Clic "Descargar" → descarga el archivo con todos los cambios aplicados
9. Clic X → vuelve al preview normal sin editor
10. Fotos sin editar, videos y 3D no muestran el botón "Editar foto"
