# Trazo Smile Design — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a non-destructive polyline drawing layer to PhotoStudioModal for clinical smile design annotation, and rename the "Archivos" section to "Documentación".

**Architecture:** A transparent `<canvas>` overlay positioned absolutely on top of the photo. Shapes stored as normalized (0–1) point arrays in React state. Export flattens photo + canvas only when the layer is visible. The draw tool is mutually exclusive with crop/brush/bg-removal.

**Tech Stack:** React, TypeScript, HTML Canvas 2D API, Lucide icons, Tailwind CSS

---

### Task 1: Rename "Archivos" → "Documentación"

**Files:**
- Modify: `components/patients/PatientDashboard.tsx:363`

**Step 1: Make the change**

In `components/patients/PatientDashboard.tsx` line 363, change:
```tsx
<PatientSection id="archivos" title="Archivos" icon={FolderOpen} defaultOpen>
```
to:
```tsx
<PatientSection id="archivos" title="Documentación" icon={FolderOpen} defaultOpen>
```

**Step 2: Verify in browser**
Open any patient → the section header should read "Documentación" instead of "Archivos".

**Step 3: Commit**
```bash
git add components/patients/PatientDashboard.tsx
git commit -m "ux: rename Archivos → Documentación in patient dashboard"
```

---

### Task 2: Add draw state + types to PhotoStudioModal

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx` (top of component, state + refs section)

**Step 1: Add import for PenLine icon**

In the lucide-react import block (line 6–10), add `PenLine` and `Eye`, `EyeOff`:
```tsx
import {
    X, Download, RotateCcw, Sun, Crop as CropIcon, Wand2, Loader2, Check,
    RotateCw, Save, ImageIcon, Grid, ArrowLeft, Undo2,
    Play, ChevronLeft, ChevronRight, CheckSquare2, Globe2,
    PanelRightClose, PanelRightOpen, PenLine, Eye, EyeOff,
} from 'lucide-react';
```

**Step 2: Add draw types near the top of the file (after `type BgColor`)**

```tsx
type DrawColor = 'white' | 'yellow' | 'cyan' | 'red';

interface DrawShape {
    points: [number, number][]; // normalized 0–1 relative to image natural size
    closed: boolean;
    color: DrawColor;
}
```

**Step 3: Add draw refs and state inside the component (after `brushDrawingRef`)**

```tsx
const drawCanvasRef = useRef<HTMLCanvasElement>(null);
const drawingRef = useRef(false); // true while actively placing points

const [drawActive, setDrawActive] = useState(false);
const [drawVisible, setDrawVisible] = useState(true);
const [drawColor, setDrawColor] = useState<DrawColor>('white');
const [drawShapes, setDrawShapes] = useState<DrawShape[]>([]);
const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);
```

**Step 4: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(draw): add draw state types and refs to PhotoStudioModal"
```

---

### Task 3: Add draw canvas render effect

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add a helper to get stroke color hex**

Add this helper function right before the `return (` statement (around line 806):
```tsx
function getDrawColorHex(color: DrawColor): string {
    switch (color) {
        case 'white':  return '#ffffff';
        case 'yellow': return '#FFE566';
        case 'cyan':   return '#66E5FF';
        case 'red':    return '#FF5566';
    }
}
```

**Step 2: Add the render effect (right after the brush sync `useEffect` at line ~418)**

```tsx
// Redraw annotation layer whenever shapes or visibility change
useEffect(() => {
    const canvas = drawCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return;

    // Size canvas to match the displayed image natural dimensions
    const W = img.naturalWidth || img.width;
    const H = img.naturalHeight || img.height;
    if (W === 0 || H === 0) return;
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);

    if (!drawVisible) return;

    // Draw completed shapes
    const allShapes = [...drawShapes];
    // Also draw in-progress current points
    if (currentPoints.length > 0) {
        allShapes.push({ points: currentPoints, closed: false, color: drawColor });
    }

    for (const shape of allShapes) {
        if (shape.points.length < 1) continue;
        ctx.save();
        ctx.strokeStyle = getDrawColorHex(shape.color);
        ctx.lineWidth = Math.max(2, W / 400); // ~2px at 800px wide
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        // Subtle shadow for visibility on light backgrounds
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = Math.max(3, W / 300);

        ctx.beginPath();
        const [fx, fy] = shape.points[0];
        ctx.moveTo(fx * W, fy * H);
        for (let i = 1; i < shape.points.length; i++) {
            const [px, py] = shape.points[i];
            ctx.lineTo(px * W, py * H);
        }
        if (shape.closed) ctx.closePath();
        ctx.stroke();

        // Draw point dots
        ctx.fillStyle = getDrawColorHex(shape.color);
        for (const [px, py] of shape.points) {
            ctx.beginPath();
            ctx.arc(px * W, py * H, Math.max(3, W / 250), 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}, [drawShapes, currentPoints, drawVisible, drawColor]);
```

**Step 3: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(draw): add canvas render effect for annotation layer"
```

---

### Task 4: Add click handlers for polyline drawing

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Add the click and double-click handlers (after `handleBrushUp`)**

```tsx
function getDrawCanvasXY(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;   // normalized 0–1
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
}

function handleDrawClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawActive) return;
    e.stopPropagation();
    const pt = getDrawCanvasXY(e);
    setCurrentPoints(prev => [...prev, pt]);
}

function handleDrawDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawActive) return;
    e.stopPropagation();
    // Remove the duplicate point added by the second click of dblclick
    setCurrentPoints(prev => {
        const pts = prev.slice(0, -1); // remove last (duplicate from single-click)
        if (pts.length >= 2) {
            // Commit shape as closed
            setDrawShapes(shapes => [...shapes, { points: pts, closed: true, color: drawColor }]);
        }
        return [];
    });
}

function handleClearDraw() {
    setDrawShapes([]);
    setCurrentPoints([]);
}

function handleUndoLastDrawPoint() {
    if (currentPoints.length > 0) {
        setCurrentPoints(prev => prev.slice(0, -1));
    } else if (drawShapes.length > 0) {
        // Undo last committed shape
        setDrawShapes(prev => prev.slice(0, -1));
    }
}
```

**Step 2: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(draw): add polyline click/dblclick handlers"
```

---

### Task 5: Mount the draw canvas overlay in the JSX

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Find the canvas area section (around line 933)**

Find this block:
```tsx
{brushMode !== null ? (
    <canvas
        ref={brushCanvasRef}
        style={{ ...imageStyle, cursor: 'crosshair' }}
        ...
    />
) : cropActive ? (
    <ReactCrop ...>
        <img ref={imgRef} ... />
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
```

**Step 2: Replace the last `<img>` branch with a wrapper that adds the draw canvas**

Replace only the final else branch (the plain `<img>`):
```tsx
) : (
    <div className="relative inline-block">
        <img
            ref={imgRef}
            src={imageUrl}
            alt={activeFile.name}
            crossOrigin="anonymous"
            style={imageStyle}
        />
        {/* Draw annotation overlay */}
        <canvas
            ref={drawCanvasRef}
            className="absolute inset-0 w-full h-full"
            style={{
                cursor: drawActive ? 'crosshair' : 'default',
                pointerEvents: drawActive ? 'auto' : 'none',
            }}
            onClick={handleDrawClick}
            onDoubleClick={handleDrawDblClick}
        />
    </div>
)}
```

**Step 3: Also reset draw state in `resetEdits` (find the `resetEdits` function around line 107)**

Add these lines at the end of `resetEdits`:
```tsx
setDrawActive(false);
setDrawShapes([]);
setCurrentPoints([]);
```

**Step 4: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(draw): mount transparent canvas overlay on image"
```

---

### Task 6: Add draw tool section to ToolsPanel

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx`

**Step 1: Extend `ToolsPanelProps` interface (around line 1327)**

Add these props:
```tsx
drawActive: boolean;
onSetDrawActive: (v: boolean) => void;
drawVisible: boolean;
onToggleDrawVisible: () => void;
drawColor: DrawColor;
onSetDrawColor: (c: DrawColor) => void;
drawShapeCount: number;
currentPointCount: number;
onUndoLastDrawPoint: () => void;
onClearDraw: () => void;
```

**Step 2: Destructure new props in `ToolsPanel` function signature**

Add to the destructured parameters:
```tsx
drawActive, onSetDrawActive,
drawVisible, onToggleDrawVisible,
drawColor, onSetDrawColor,
drawShapeCount, currentPointCount,
onUndoLastDrawPoint,
onClearDraw,
```

**Step 3: Add draw section to ToolsPanel JSX (add after the brush/bg section, before Reset/Undo buttons)**

```tsx
{/* ── Trazo (Smile Design) ── */}
<div className="space-y-2">
    <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
            <PenLine size={13} />
            Trazo
        </div>
        <div className="flex items-center gap-1">
            {/* Visibility toggle */}
            <button
                onClick={onToggleDrawVisible}
                title={drawVisible ? 'Ocultar trazo' : 'Mostrar trazo'}
                className="p-1 rounded text-white/40 hover:text-white/70 transition-colors"
            >
                {drawVisible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
        </div>
    </div>

    {/* Activate / deactivate */}
    <button
        onClick={() => onSetDrawActive(!drawActive)}
        className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            drawActive
                ? 'bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/30'
                : 'bg-white/5 text-white/50 hover:text-white/80 border border-white/10'
        }`}
    >
        <PenLine size={12} />
        {drawActive ? 'Dibujando — doble clic para cerrar' : 'Activar trazo'}
    </button>

    {/* Color selector */}
    {drawActive && (
        <div className="flex items-center gap-1.5">
            {(['white', 'yellow', 'cyan', 'red'] as DrawColor[]).map(c => {
                const hex = { white: '#ffffff', yellow: '#FFE566', cyan: '#66E5FF', red: '#FF5566' }[c];
                return (
                    <button
                        key={c}
                        onClick={() => onSetDrawColor(c)}
                        title={c}
                        className={`w-6 h-6 rounded-full border-2 transition-all ${
                            drawColor === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: hex }}
                    />
                );
            })}
        </div>
    )}

    {/* Undo last point + Clear */}
    {(drawShapeCount > 0 || currentPointCount > 0) && (
        <div className="flex gap-1.5">
            <button
                onClick={onUndoLastDrawPoint}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs bg-white/5 text-white/50 hover:text-white/80 transition-colors border border-white/10"
            >
                <Undo2 size={11} /> Deshacer
            </button>
            <button
                onClick={onClearDraw}
                className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs bg-white/5 text-white/50 hover:text-red-400 transition-colors border border-white/10"
            >
                <X size={11} /> Borrar todo
            </button>
        </div>
    )}

    {drawActive && currentPointCount > 0 && (
        <p className="text-white/25 text-[10px]">
            {currentPointCount} punto{currentPointCount !== 1 ? 's' : ''} — doble clic para cerrar forma
        </p>
    )}
</div>
```

**Step 4: Pass new props to ToolsPanel in the main JSX (around line 1035)**

Add to the `<ToolsPanel ... />` call:
```tsx
drawActive={drawActive}
onSetDrawActive={(v) => {
    setDrawActive(v);
    // Deactivate conflicting modes
    if (v) {
        setCropActive(false);
        setBrushMode(null);
    }
}}
drawVisible={drawVisible}
onToggleDrawVisible={() => setDrawVisible(v => !v)}
drawColor={drawColor}
onSetDrawColor={setDrawColor}
drawShapeCount={drawShapes.length}
currentPointCount={currentPoints.length}
onUndoLastDrawPoint={handleUndoLastDrawPoint}
onClearDraw={handleClearDraw}
```

**Step 5: Verify in browser**
- Open PhotoStudio on any photo
- Click "Activar trazo" → cursor becomes crosshair
- Click several points → lines appear connecting them
- Double-click → shape closes
- Toggle eye → strokes disappear / reappear
- Click "Borrar todo" → canvas clears

**Step 6: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(draw): add Trazo section to ToolsPanel with color picker and controls"
```

---

### Task 7: Flatten draw layer into export

**Files:**
- Modify: `components/patients/drive/PhotoStudioModal.tsx` — `exportToBlob` function (around line 498)

**Step 1: Update `exportToBlob` to include draw canvas when visible**

Find the end of `exportToBlob` (the `return new Promise(...)` line at ~538). After the `ctx.setTransform` line and before the final `return`, add:

```tsx
// If annotation layer is visible and has content, flatten it on top
if (drawVisible && drawCanvasRef.current && drawCanvasRef.current.width > 0) {
    // Scale the draw canvas to match the export canvas dimensions
    ctx.drawImage(drawCanvasRef.current, 0, 0, canvasW, canvasH);
}
```

Full context — the end of `exportToBlob` should look like:
```tsx
ctx.filter = `brightness(${brightness}%)`;
ctx.translate(canvasW / 2, canvasH / 2);
ctx.rotate(radians);
ctx.drawImage(img, -outW / 2, -outH / 2);
ctx.setTransform(1, 0, 0, 1, 0, 0);

// Flatten draw annotation layer when visible
if (drawVisible && drawCanvasRef.current && drawCanvasRef.current.width > 0) {
    ctx.drawImage(drawCanvasRef.current, 0, 0, canvasW, canvasH);
}

return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), mime, 0.95));
```

**Step 2: Verify export**
- Draw a trazo on a photo
- Click "Descargar" → downloaded file should include the strokes
- Toggle eye off, click "Descargar" → downloaded file has NO strokes

**Step 3: Commit**
```bash
git add components/patients/drive/PhotoStudioModal.tsx
git commit -m "feat(draw): flatten annotation layer into export when visible"
```

---

### Task 8: Final verification checklist

1. Open patient → section says "Documentación" ✅
2. Open PhotoStudio → "Trazo" section appears in right panel ✅
3. Click "Activar trazo" → cursor becomes crosshair, other tools (crop, brush) deactivated ✅
4. Click 4 points → white lines connect them with dots at each point ✅
5. Double-click → shape closes (last point connects to first) ✅
6. Start a new shape without clearing → both shapes visible ✅
7. Change color to yellow → new points use yellow ✅
8. Eye toggle hides/shows all strokes ✅
9. "Deshacer" removes last point (or last shape if no in-progress points) ✅
10. "Borrar todo" clears all shapes ✅
11. Download with strokes visible → JPEG includes strokes ✅
12. Download with strokes hidden → JPEG has no strokes ✅
13. Switch photo in thumbnail strip → strokes cleared (fresh canvas) ✅
14. Zoom/pan works normally when draw is not active ✅
