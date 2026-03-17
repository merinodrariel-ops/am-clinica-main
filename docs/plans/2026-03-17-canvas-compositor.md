# Canvas Compositor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Agregar un modo "Canvas" dentro del PhotoStudioModal para componer comparativos antes/después arrastrando fotos del paciente sobre un lienzo con proporciones para redes sociales.

**Architecture:** Tab switcher "Editar Foto | Canvas" en el header del modal. El modo Canvas renderiza un nuevo componente `CanvasCompositor` que maneja un stack de capas de fotos sobre un `<canvas>` HTML2D. Cada capa tiene posición/tamaño/rotación normalizados (0–1). Export aplana todas las capas en un canvas offscreen a resolución 1080px.

**Tech Stack:** React 19, TypeScript, HTML Canvas 2D, Tailwind CSS 4, Lucide React. Sin dependencias nuevas.

---

## Contexto crítico para el implementador

- El modal vive en `components/patients/drive/PhotoStudioModal.tsx` (~3300 líneas)
- El modal ya tiene un strip de thumbnails vertical (izquierda, desktop) con `allFolderFiles`
- Proxy de Drive: `GET /api/drive/file/[fileId]` — devuelve la imagen binaria
- El `ToolsPanel` es un componente interno (al final del mismo archivo) que recibe props
- Colores del design system: fondo `#0D0D12`, gold `#C9A96E`, borde `border-white/10`
- Coordenadas normalizadas (0–1) igual que en el editor de foto — independiente de resolución

---

## Task 1: Tab switcher en el header

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx` (cerca de línea 390 para state, ~2180 para header JSX)

**Step 1: Agregar state `studioMode`**

Buscar el bloque de `useState` al principio del componente (cerca de línea 390). Agregar después de `const [drawClipboard, ...]`:

```tsx
const [studioMode, setStudioMode] = useState<'editor' | 'canvas'>('editor');
```

**Step 2: Agregar tab pills en el header**

En el header (alrededor de línea 2191), el filename `<p className="text-white font-semibold...">` está entre el botón Volver y los botones de acción. Reemplazar ese `<p>` por un flex container que incluya el nombre Y las tabs:

```tsx
<div className="flex-1 flex items-center gap-3 min-w-0">
    <p className="text-white font-semibold truncate text-sm hidden sm:block">
        {activeFile.name}
    </p>
    {/* Tab switcher */}
    <div className="flex items-center bg-white/5 rounded-lg p-0.5 flex-shrink-0">
        <button
            onClick={() => setStudioMode('editor')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                studioMode === 'editor'
                    ? 'bg-white/15 text-white'
                    : 'text-white/40 hover:text-white/70'
            }`}
        >
            Editar Foto
        </button>
        <button
            onClick={() => setStudioMode('canvas')}
            className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                studioMode === 'canvas'
                    ? 'bg-[#C9A96E]/20 text-[#C9A96E]'
                    : 'text-white/40 hover:text-white/70'
            }`}
        >
            Canvas
        </button>
    </div>
</div>
```

**Step 3: Verificar que compila**

```bash
cd "am-clinica-main" && npx tsc --noEmit 2>&1 | head -20
```
Esperado: sin errores.

**Step 4: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(canvas): add Editar Foto / Canvas tab switcher in header"
```

---

## Task 2: Crear CanvasCompositor — skeleton con selector de proporción

**Files:**
- Create: `components/patients/drive/CanvasCompositor.tsx`

**Step 1: Crear el archivo con la interfaz y el skeleton**

```tsx
'use client';
import { useRef, useState, useEffect, useCallback } from 'react';
import { Download, Save, ImageIcon } from 'lucide-react';
import type { DriveFile } from '@/app/actions/patient-files-drive';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CanvasRatio = '1:1' | '4:5' | '9:16' | '16:9';

export interface CanvasLayer {
    id: string;
    src: string;        // blob URL loaded from Drive proxy
    fileId?: string;    // Drive file ID (if from Drive)
    x: number;          // center X, normalized 0–1
    y: number;          // center Y, normalized 0–1
    w: number;          // width, normalized 0–1
    h: number;          // height, normalized 0–1
    rotation: number;   // degrees
    img: HTMLImageElement; // pre-loaded image element
}

const RATIOS: { label: string; value: CanvasRatio; w: number; h: number }[] = [
    { label: '1:1', value: '1:1', w: 1, h: 1 },
    { label: '4:5', value: '4:5', w: 4, h: 5 },
    { label: '9:16', value: '9:16', w: 9, h: 16 },
    { label: '16:9', value: '16:9', w: 16, h: 9 },
];

// Export resolution base: 1080px on the shorter dimension
const EXPORT_BASE = 1080;

interface Props {
    files: DriveFile[];
    canSave: boolean;
    onSaveToDrive: (blob: Blob, filename: string) => void;
}

export default function CanvasCompositor({ files, canSave, onSaveToDrive }: Props) {
    const [ratio, setRatio] = useState<CanvasRatio>('1:1');
    const [layers, setLayers] = useState<CanvasLayer[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Canvas display size based on container and ratio
    const [displaySize, setDisplaySize] = useState({ w: 500, h: 500 });

    const currentRatio = RATIOS.find(r => r.value === ratio)!;

    // Update display size when container or ratio changes
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const { width, height } = el.getBoundingClientRect();
            const padding = 48;
            const available = { w: width - padding, h: height - padding };
            const rw = currentRatio.w, rh = currentRatio.h;
            let cw = available.w, ch = cw * rh / rw;
            if (ch > available.h) { ch = available.h; cw = ch * rw / rh; }
            setDisplaySize({ w: Math.floor(cw), h: Math.floor(ch) });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ratio, currentRatio]);

    // ── Render ────────────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = displaySize.w;
        canvas.height = displaySize.h;
        const ctx = canvas.getContext('2d')!;
        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, displaySize.w, displaySize.h);
        // Render layers (placeholder — full implementation in Task 3)
        for (const layer of layers) {
            const px = layer.x * displaySize.w;
            const py = layer.y * displaySize.h;
            const pw = layer.w * displaySize.w;
            const ph = layer.h * displaySize.h;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(layer.rotation * Math.PI / 180);
            ctx.drawImage(layer.img, -pw / 2, -ph / 2, pw, ph);
            ctx.restore();
        }
        // Selection handles (placeholder — Task 6)
    }, [layers, displaySize, selectedId]);

    // ── Export ────────────────────────────────────────────────────────────────
    function exportToBlob(): Promise<Blob> {
        const rw = currentRatio.w, rh = currentRatio.h;
        const shorter = Math.min(rw, rh);
        const expW = Math.round(EXPORT_BASE * rw / shorter);
        const expH = Math.round(EXPORT_BASE * rh / shorter);
        const off = document.createElement('canvas');
        off.width = expW; off.height = expH;
        const ctx = off.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, expW, expH);
        for (const layer of layers) {
            const px = layer.x * expW, py = layer.y * expH;
            const pw = layer.w * expW, ph = layer.h * expH;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(layer.rotation * Math.PI / 180);
            ctx.drawImage(layer.img, -pw / 2, -ph / 2, pw, ph);
            ctx.restore();
        }
        return new Promise<Blob>((res, rej) =>
            off.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/jpeg', 0.92)
        );
    }

    async function handleDownload() {
        const blob = await exportToBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `canvas-${ratio.replace(':', 'x')}-${Date.now()}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function handleSave() {
        const blob = await exportToBlob();
        onSaveToDrive(blob, `canvas-${ratio.replace(':', 'x')}-${Date.now()}.jpg`);
    }

    // ── Render JSX ────────────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex overflow-hidden min-h-0">
            {/* Left: thumbnail source strip */}
            <div className="hidden md:flex flex-col w-[72px] border-r border-white/10 flex-shrink-0 bg-black/20">
                <p className="text-white/30 text-[10px] text-center py-2 border-b border-white/10">Fotos</p>
                <div className="flex flex-col gap-1 p-1 overflow-y-auto flex-1">
                    {files.filter(f => f.mimeType?.startsWith('image/')).map(f => (
                        <div
                            key={f.id}
                            draggable
                            onDragStart={e => {
                                e.dataTransfer.setData('driveFileId', f.id);
                                e.dataTransfer.setData('thumbnailLink', f.thumbnailLink ?? '');
                                e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className="aspect-square rounded-md overflow-hidden flex-shrink-0 border-2 border-transparent hover:border-[#C9A96E]/60 cursor-grab active:cursor-grabbing transition-all"
                            title={f.name}
                        >
                            {f.thumbnailLink ? (
                                <img src={f.thumbnailLink} alt={f.name} referrerPolicy="no-referrer" className="w-full h-full object-cover pointer-events-none" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center bg-white/5">
                                    <ImageIcon size={14} className="text-white/30" />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Center: canvas */}
            <div
                ref={containerRef}
                className="flex-1 flex items-center justify-center overflow-hidden p-6 bg-[#0D0D12]"
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={e => { e.preventDefault(); setIsDragOver(false); handleDrop(e); }}
            >
                <div
                    className={`relative shadow-2xl ring-2 transition-all ${
                        isDragOver ? 'ring-[#C9A96E] scale-[1.01]' : 'ring-white/10'
                    }`}
                    style={{ width: displaySize.w, height: displaySize.h }}
                >
                    <canvas
                        ref={canvasRef}
                        className="block w-full h-full"
                        style={{ imageRendering: 'high-quality' }}
                    />
                    {layers.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center">
                                <ImageIcon size={22} className="text-white/20" />
                            </div>
                            <p className="text-white/20 text-sm text-center px-8">
                                Arrastrá fotos desde el panel izquierdo o desde tu computadora
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right: ratio selector + actions */}
            <div className="hidden md:flex flex-col w-56 border-l border-white/10 flex-shrink-0 bg-black/20 p-4 gap-4">
                <div>
                    <p className="text-white/40 text-xs mb-2">Proporción</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {RATIOS.map(r => (
                            <button
                                key={r.value}
                                onClick={() => setRatio(r.value)}
                                className={`py-2 rounded-lg text-xs font-medium transition-colors border ${
                                    ratio === r.value
                                        ? 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/40'
                                        : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80'
                                }`}
                            >
                                {r.label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-1.5 text-[10px] text-white/25 text-center">
                        {ratio === '1:1' && 'Instagram Post'}
                        {ratio === '4:5' && 'Instagram Portrait'}
                        {ratio === '9:16' && 'Story / Reels'}
                        {ratio === '16:9' && 'Presentación'}
                    </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/10">
                    {canSave && (
                        <button
                            onClick={handleSave}
                            disabled={layers.length === 0}
                            className="w-full py-2 rounded-lg bg-[#C9A96E] text-black text-sm font-semibold hover:bg-[#b8924e] transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            <Save size={14} /> Guardar en Drive
                        </button>
                    )}
                    <button
                        onClick={handleDownload}
                        disabled={layers.length === 0}
                        className="w-full py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/15 transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Download size={14} /> Descargar
                    </button>
                </div>

                {layers.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-white/10">
                        <p className="text-white/40 text-xs">Capas ({layers.length})</p>
                        {[...layers].reverse().map((layer, i) => (
                            <div
                                key={layer.id}
                                onClick={() => setSelectedId(layer.id === selectedId ? null : layer.id)}
                                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                                    layer.id === selectedId
                                        ? 'bg-[#C9A96E]/15 text-[#C9A96E]'
                                        : 'text-white/50 hover:bg-white/5'
                                }`}
                            >
                                <img
                                    src={layer.src}
                                    className="w-6 h-6 rounded object-cover flex-shrink-0"
                                    alt=""
                                />
                                <span className="truncate">Capa {layers.length - i}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // ── Drop handler (stub — implemented in Task 4) ──────────────────────────
    async function handleDrop(_e: React.DragEvent) {
        // implemented in Task 4
    }
}
```

**Step 2: Verificar que compila**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**
```bash
git add components/patients/drive/CanvasCompositor.tsx
git commit -m "feat(canvas): CanvasCompositor skeleton with ratio selector and layer list"
```

---

## Task 3: Montar CanvasCompositor en PhotoStudioModal

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Importar CanvasCompositor**

Al principio del archivo, después de los imports existentes:
```tsx
import CanvasCompositor from './CanvasCompositor';
```

**Step 2: Implementar `handleCanvasSave` en PhotoStudioModal**

Buscar la función `handleSaveToDrive` o el bloque de save existente. Agregar antes del `return (`:

```tsx
async function handleCanvasSave(blob: Blob, filename: string) {
    // Reutilizar la misma lógica de upload que la foto editada
    // pero como archivo nuevo siempre (un canvas no reemplaza la foto original)
    try {
        const file = new File([blob], filename, { type: 'image/jpeg' });
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folderId', folderId);
        await uploadEditedPhotoAction(formData);
        toast.success('Canvas guardado en Drive');
        onSaved();
    } catch {
        toast.error('Error al guardar el canvas');
    }
}
```

**Step 3: Renderizar CanvasCompositor condicionalmente**

En el cuerpo del modal (alrededor de línea 2237, el `{/* ── Body ──*/}`), envolver el body existente con una condición:

```tsx
{/* ── Body ───────────────────────────────────────────────── */}
{studioMode === 'canvas' ? (
    <CanvasCompositor
        files={allFolderFiles}
        canSave={canSave}
        onSaveToDrive={handleCanvasSave}
    />
) : (
    <div className="flex-1 flex overflow-hidden min-h-0">
        {/* ... TODO el contenido existente del body sin cambios ... */}
    </div>
)}
```

**IMPORTANTE:** El contenido del body existente va entero dentro del `<div className="flex-1 flex overflow-hidden min-h-0">` del else branch. No tocar nada dentro.

**Step 4: Verificar que compila y el modal sigue funcionando en modo editor**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 5: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(canvas): mount CanvasCompositor in PhotoStudioModal when mode=canvas"
```

---

## Task 4: Drag desde thumbnail strip + desde PC

**Files:**
- Modify: `components/patients/drive/CanvasCompositor.tsx`

**Step 1: Helper para cargar imagen**

Agregar esta función module-level antes del componente:

```tsx
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}
```

**Step 2: Helper para crear capa centrada**

Agregar función module-level:

```tsx
function makeLayer(img: HTMLImageElement, src: string, fileId?: string, dropX = 0.5, dropY = 0.5): CanvasLayer {
    // Fit inside 50% of canvas width, maintain aspect ratio
    const maxW = 0.5;
    const aspect = img.naturalWidth / img.naturalHeight;
    const w = maxW;
    const h = w / aspect;
    return {
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        src,
        fileId,
        x: dropX,
        y: dropY,
        w,
        h,
        rotation: 0,
        img,
    };
}
```

**Step 3: Implementar `handleDrop`**

Reemplazar el stub `handleDrop` con la implementación real:

```tsx
async function handleDrop(e: React.DragEvent) {
    // 1. Drop from thumbnail strip (Drive file)
    const fileId = e.dataTransfer.getData('driveFileId');
    if (fileId) {
        const src = `/api/drive/file/${fileId}`;
        try {
            const img = await loadImage(src);
            const canvasRect = canvasRef.current?.getBoundingClientRect();
            const dropX = canvasRect ? (e.clientX - canvasRect.left) / canvasRect.width : 0.5;
            const dropY = canvasRect ? (e.clientY - canvasRect.top) / canvasRect.height : 0.5;
            setLayers(prev => [...prev, makeLayer(img, src, fileId, dropX, dropY)]);
            setSelectedId(null);
        } catch {
            toast.error('No se pudo cargar la foto');
        }
        return;
    }

    // 2. Drop from PC (local file)
    const pcFile = e.dataTransfer.files[0];
    if (pcFile && pcFile.type.startsWith('image/')) {
        const src = URL.createObjectURL(pcFile);
        try {
            const img = await loadImage(src);
            const canvasRect = canvasRef.current?.getBoundingClientRect();
            const dropX = canvasRect ? (e.clientX - canvasRect.left) / canvasRect.width : 0.5;
            const dropY = canvasRect ? (e.clientY - canvasRect.top) / canvasRect.height : 0.5;
            setLayers(prev => [...prev, makeLayer(img, src, undefined, dropX, dropY)]);
            setSelectedId(null);
        } catch {
            URL.revokeObjectURL(src);
            toast.error('No se pudo cargar la imagen');
        }
        return;
    }
}
```

**Step 4: Importar toast**

Agregar al inicio del archivo:
```tsx
import { toast } from 'sonner';
```

**Step 5: Verificar**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 6: Commit**
```bash
git add components/patients/drive/CanvasCompositor.tsx
git commit -m "feat(canvas): drag photos from thumbnail strip and from PC onto canvas"
```

---

## Task 5: Selección, movimiento y handles de esquina

**Files:**
- Modify: `components/patients/drive/CanvasCompositor.tsx`

**Step 1: Refs para interacción**

Agregar dentro del componente, después de los refs existentes:

```tsx
const dragRef = useRef<{
    layerId: string;
    mode: 'move' | 'resize-tl' | 'resize-tr' | 'resize-br' | 'resize-bl' | 'rotate';
    startX: number; startY: number;
    origLayer: CanvasLayer;
} | null>(null);
```

**Step 2: Helpers para hit-test**

Agregar como funciones module-level:

```tsx
const HANDLE_SIZE = 8; // px

function getLayerCorners(layer: CanvasLayer, cw: number, ch: number) {
    const cx = layer.x * cw, cy = layer.y * ch;
    const hw = (layer.w * cw) / 2, hh = (layer.h * ch) / 2;
    const rad = layer.rotation * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const corners = [
        [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh],
    ] as [number, number][];
    return corners.map(([dx, dy]) => [
        cx + dx * cos - dy * sin,
        cy + dx * sin + dy * cos,
    ] as [number, number]);
}

function hitTestCorner(layer: CanvasLayer, nx: number, ny: number, cw: number, ch: number): number {
    const corners = getLayerCorners(layer, cw, ch);
    const px = nx * cw, py = ny * ch;
    for (let i = 0; i < corners.length; i++) {
        const [cx, cy] = corners[i];
        if (Math.abs(px - cx) <= HANDLE_SIZE && Math.abs(py - cy) <= HANDLE_SIZE) return i;
    }
    return -1;
}

function hitTestLayerBody(layer: CanvasLayer, nx: number, ny: number, cw: number, ch: number): boolean {
    // Transform point into layer's local space
    const lx = (layer.x * cw), ly = (layer.y * ch);
    const px = nx * cw - lx, py = ny * ch - ly;
    const rad = -layer.rotation * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const localX = px * cos - py * sin;
    const localY = px * sin + py * cos;
    const hw = (layer.w * cw) / 2, hh = (layer.h * ch) / 2;
    return Math.abs(localX) <= hw && Math.abs(localY) <= hh;
}
```

**Step 3: Dibujar selection handles en el useEffect de render**

Dentro del `useEffect` de render, después del loop `for (const layer of layers)`, agregar:

```tsx
// Draw selection handles
if (selectedId) {
    const sel = layers.find(l => l.id === selectedId);
    if (sel) {
        const corners = getLayerCorners(sel, displaySize.w, displaySize.h);
        ctx.save();
        ctx.strokeStyle = '#C9A96E';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        corners.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        corners.forEach(([x, y]) => {
            ctx.fillStyle = '#C9A96E';
            ctx.fillRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
        });
        ctx.restore();
    }
}
```

**Step 4: Handlers de pointer en el canvas**

Agregar estas funciones dentro del componente, antes del return:

```tsx
function getNorm(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const rect = e.currentTarget.getBoundingClientRect();
    return [
        (e.clientX - rect.left) / rect.width,
        (e.clientY - rect.top) / rect.height,
    ];
}

function handleCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const [nx, ny] = getNorm(e);
    const cw = displaySize.w, ch = displaySize.h;

    // Hit-test layers in reverse (top layer first)
    for (let i = layers.length - 1; i >= 0; i--) {
        const layer = layers[i];
        const ci = hitTestCorner(layer, nx, ny, cw, ch);
        if (ci >= 0) {
            e.currentTarget.setPointerCapture(e.pointerId);
            const mode = e.metaKey || e.ctrlKey ? 'rotate'
                : ci === 0 ? 'resize-tl' : ci === 1 ? 'resize-tr'
                : ci === 2 ? 'resize-br' : 'resize-bl';
            dragRef.current = { layerId: layer.id, mode, startX: nx, startY: ny, origLayer: { ...layer } };
            setSelectedId(layer.id);
            return;
        }
        if (hitTestLayerBody(layer, nx, ny, cw, ch)) {
            e.currentTarget.setPointerCapture(e.pointerId);
            dragRef.current = { layerId: layer.id, mode: 'move', startX: nx, startY: ny, origLayer: { ...layer } };
            setSelectedId(layer.id);
            return;
        }
    }
    // Click on empty area: deselect
    setSelectedId(null);
}

function handleCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    const [nx, ny] = getNorm(e);
    const { layerId, mode, startX, startY, origLayer } = dragRef.current;
    const dx = nx - startX, dy = ny - startY;

    setLayers(prev => prev.map(l => {
        if (l.id !== layerId) return l;
        if (mode === 'move') {
            return { ...l, x: origLayer.x + dx, y: origLayer.y + dy };
        }
        if (mode === 'rotate') {
            const cx = origLayer.x, cy = origLayer.y;
            const angle = Math.atan2(ny - cy, nx - cx) - Math.atan2(startY - cy, startX - cx);
            return { ...l, rotation: origLayer.rotation + angle * 180 / Math.PI };
        }
        // Resize: scale width/height symmetrically from center
        const scaleDx = Math.abs(dx) * 2, scaleDy = Math.abs(dy) * 2;
        const newW = Math.max(0.05, origLayer.w + (mode.includes('r') ? scaleDx : -scaleDx));
        const aspect = origLayer.w / origLayer.h;
        const newH = newW / aspect;
        return { ...l, w: newW, h: newH };
    }));
}

function handleCanvasPointerUp() {
    dragRef.current = null;
}
```

**Step 5: Agregar onPointerDown/Move/Up al canvas**

En el JSX, el elemento `<canvas ref={canvasRef} ...>` ya existe. Agregar los handlers:

```tsx
<canvas
    ref={canvasRef}
    className="block w-full h-full"
    style={{ imageRendering: 'high-quality', cursor: selectedId ? 'move' : 'default' }}
    onPointerDown={handleCanvasPointerDown}
    onPointerMove={handleCanvasPointerMove}
    onPointerUp={handleCanvasPointerUp}
    onPointerLeave={handleCanvasPointerUp}
/>
```

**Step 6: Verificar**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 7: Commit**
```bash
git add components/patients/drive/CanvasCompositor.tsx
git commit -m "feat(canvas): layer selection, drag-to-move, corner resize/rotate handles"
```

---

## Task 6: Delete layer + right-click context menu

**Files:**
- Modify: `components/patients/drive/CanvasCompositor.tsx`

**Step 1: Agregar state para context menu**

```tsx
const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
```

**Step 2: Handler teclado Delete**

Agregar `useEffect` dentro del componente:

```tsx
useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
            // Only if not focused on an input
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
            setLayers(prev => prev.filter(l => l.id !== selectedId));
            setSelectedId(null);
        }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
}, [selectedId]);
```

**Step 3: Handler de clic derecho en canvas**

```tsx
function handleCanvasContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const [nx, ny] = [
        (e.clientX - e.currentTarget.getBoundingClientRect().left) / e.currentTarget.getBoundingClientRect().width,
        (e.clientY - e.currentTarget.getBoundingClientRect().top) / e.currentTarget.getBoundingClientRect().height,
    ];
    for (let i = layers.length - 1; i >= 0; i--) {
        if (hitTestLayerBody(layers[i], nx, ny, displaySize.w, displaySize.h)) {
            setSelectedId(layers[i].id);
            setContextMenu({ x: e.clientX, y: e.clientY, layerId: layers[i].id });
            return;
        }
    }
}
```

**Step 4: Agregar `onContextMenu` al canvas**

```tsx
onContextMenu={handleCanvasContextMenu}
```

**Step 5: JSX del context menu**

Agregar al final del return, antes del `</div>` raíz:

```tsx
{contextMenu && (
    <>
        <div className="fixed inset-0 z-[90]" onClick={() => setContextMenu(null)} />
        <div
            className="fixed z-[91] bg-[#1A1A24] border border-white/15 rounded-xl shadow-xl py-1.5 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
        >
            <button
                onClick={() => {
                    setLayers(prev => {
                        const idx = prev.findIndex(l => l.id === contextMenu.layerId);
                        if (idx < prev.length - 1) {
                            const next = [...prev];
                            [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                            return next;
                        }
                        return prev;
                    });
                    setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
            >
                Traer al frente
            </button>
            <button
                onClick={() => {
                    setLayers(prev => {
                        const idx = prev.findIndex(l => l.id === contextMenu.layerId);
                        if (idx > 0) {
                            const next = [...prev];
                            [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
                            return next;
                        }
                        return prev;
                    });
                    setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
            >
                Enviar atrás
            </button>
            <div className="border-t border-white/10 my-1" />
            <button
                onClick={() => {
                    setLayers(prev => prev.filter(l => l.id !== contextMenu.layerId));
                    if (selectedId === contextMenu.layerId) setSelectedId(null);
                    setContextMenu(null);
                }}
                className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors"
            >
                Eliminar capa
            </button>
        </div>
    </>
)}
```

**Step 6: Verificar**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 7: Commit**
```bash
git add components/patients/drive/CanvasCompositor.tsx
git commit -m "feat(canvas): delete layer with Delete key + right-click context menu"
```

---

## Task 7: Cambio de proporción sin perder capas

**Files:**
- Modify: `components/patients/drive/CanvasCompositor.tsx`

**Step 1: Reescalar capas al cambiar ratio**

Reemplazar el `setRatio(r.value)` en el botón de ratios por:

```tsx
onClick={() => {
    const oldR = RATIOS.find(r2 => r2.value === ratio)!;
    const newR = r;
    setRatio(r.value);
    // Reescalar posiciones X/Y para que queden proporcionalmente
    // en el mismo lugar visual relativo al nuevo canvas
    const scaleX = oldR.w / newR.w;
    const scaleY = oldR.h / newR.h;
    setLayers(prev => prev.map(l => ({
        ...l,
        x: Math.max(l.w / 2, Math.min(1 - l.w / 2, l.x * scaleX)),
        y: Math.max(l.h / 2, Math.min(1 - l.h / 2, l.y * scaleY)),
    })));
}}
```

**Step 2: Verificar**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 3: Commit**
```bash
git add components/patients/drive/CanvasCompositor.tsx
git commit -m "feat(canvas): rescale layer positions when changing canvas proportion"
```

---

## Task 8: Polish — mobile strip + drag visual feedback

**Files:**
- Modify: `components/patients/drive/CanvasCompositor.tsx`

**Step 1: Strip de fotos en mobile (horizontal, abajo)**

Agregar después del div de canvas central, antes del div del panel derecho:

```tsx
{/* Mobile: horizontal photo strip at bottom */}
<div className="md:hidden flex gap-1 p-2 border-t border-white/10 overflow-x-auto bg-black/20 flex-shrink-0">
    {files.filter(f => f.mimeType?.startsWith('image/')).map(f => (
        <button
            key={f.id}
            onClick={async () => {
                const src = `/api/drive/file/${f.id}`;
                try {
                    const img = await loadImage(src);
                    setLayers(prev => [...prev, makeLayer(img, src, f.id, 0.5, 0.5)]);
                } catch { toast.error('No se pudo cargar la foto'); }
            }}
            className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-white/10"
        >
            {f.thumbnailLink
                ? <img src={f.thumbnailLink} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt={f.name} />
                : <div className="w-full h-full bg-white/5 flex items-center justify-center"><ImageIcon size={12} className="text-white/30" /></div>
            }
        </button>
    ))}
</div>
```

**Step 2: Mobile action buttons (Save/Download)**

Agregar debajo del mobile strip:

```tsx
{/* Mobile actions */}
<div className="md:hidden flex gap-2 px-3 py-2 border-t border-white/10 bg-black/20 flex-shrink-0">
    <select
        value={ratio}
        onChange={e => setRatio(e.target.value as CanvasRatio)}
        className="flex-1 bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/10"
    >
        {RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
    </select>
    <button
        onClick={handleDownload}
        disabled={layers.length === 0}
        className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs disabled:opacity-40"
    >
        <Download size={14} />
    </button>
    {canSave && (
        <button
            onClick={handleSave}
            disabled={layers.length === 0}
            className="px-3 py-1.5 rounded-lg bg-[#C9A96E] text-black text-xs font-semibold disabled:opacity-40"
        >
            <Save size={14} />
        </button>
    )}
</div>
```

**Step 3: Verificar build final**
```bash
npx tsc --noEmit 2>&1 | head -20
```

**Step 4: Commit final**
```bash
git add components/patients/drive/CanvasCompositor.tsx components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(canvas): mobile strip + action buttons — Canvas Compositor complete"
```

---

## Verificación manual end-to-end

1. Abrir ficha de paciente → tab Archivos → click en cualquier foto
2. PhotoStudioModal abre en modo "Editar Foto" — todo funciona igual que antes
3. Click en tab **"Canvas"** → aparece lienzo blanco 1:1 con strip de fotos a la izquierda
4. **Drag** thumbnail de la izquierda → suelta sobre el canvas → foto aparece como capa
5. **Drag** foto desde el escritorio → suelta sobre canvas → foto aparece
6. Click en capa → handles dorados en esquinas
7. Drag capa → se mueve
8. Drag esquina → redimensiona
9. Cmd+drag esquina → rota
10. Click derecho → menú "Traer al frente / Enviar atrás / Eliminar"
11. Delete key → elimina capa seleccionada
12. Cambiar proporción a **9:16** → canvas cambia, capas se reposicionan
13. Click **Descargar** → descarga JPG a la carpeta Downloads
14. Click **Guardar en Drive** → archivo aparece en la carpeta del paciente
15. Volver a tab "Editar Foto" → todo sigue funcionando sin regresión
