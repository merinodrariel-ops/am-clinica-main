'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const GRID_CELL = 16;
const MAX_HISTORY = 20;

interface WarpBrushProps {
  imageSrc: string;
  onSave: (warped: string) => void;
  onCancel: () => void;
  patientName?: string;
}

function sampleDisp(
  grid: Float32Array, gw: number, gh: number,
  px: number, py: number, w: number, h: number
): number {
  const gx = (px / w) * (gw - 1);
  const gy = (py / h) * (gh - 1);
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const x1 = Math.min(x0 + 1, gw - 1), y1 = Math.min(y0 + 1, gh - 1);
  const fx = gx - x0, fy = gy - y0;
  return (
    grid[y0 * gw + x0] * (1 - fx) * (1 - fy) +
    grid[y0 * gw + x1] * fx * (1 - fy) +
    grid[y1 * gw + x0] * (1 - fx) * fy +
    grid[y1 * gw + x1] * fx * fy
  );
}

export default function WarpBrush({ imageSrc, onSave, onCancel, patientName }: WarpBrushProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const dispDxRef = useRef<Float32Array | null>(null);
  const dispDyRef = useRef<Float32Array | null>(null);
  const gridWRef = useRef(0);
  const gridHRef = useRef(0);
  const dragging = useRef(false);
  const panning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<Array<{ dx: Float32Array; dy: Float32Array }>>([]);

  const [brushRadius, setBrushRadius] = useState(20);
  const [brushStrength, setBrushStrength] = useState(40);
  const [initialized, setInitialized] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mousePos, setMousePos] = useState({ x: 0, y: 0, visible: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const maxW = 2400; // Increased for "4K" detail
      const scale = Math.min(1, maxW / img.naturalWidth);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.drawImage(img, 0, 0, w, h);
      sourceRef.current = ctx.getImageData(0, 0, w, h);
      const gw = Math.ceil(w / GRID_CELL) + 1;
      const gh = Math.ceil(h / GRID_CELL) + 1;
      gridWRef.current = gw;
      gridHRef.current = gh;
      dispDxRef.current = new Float32Array(gw * gh);
      dispDyRef.current = new Float32Array(gw * gh);
      setInitialized(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  const renderWarp = useCallback(() => {
    const canvas = canvasRef.current;
    const src = sourceRef.current;
    const dx = dispDxRef.current;
    const dy = dispDyRef.current;
    if (!canvas || !src || !dx || !dy) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const w = canvas.width, h = canvas.height;
    const gw = gridWRef.current, gh = gridHRef.current;
    const out = ctx.createImageData(w, h);
    const sd = src.data, od = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ddx = sampleDisp(dx, gw, gh, x, y, w, h);
        const ddy = sampleDisp(dy, gw, gh, x, y, w, h);
        const sx = x - ddx;
        const sy = y - ddy;
        const di = (y * w + x) * 4;

        if (sx >= 0 && sx < w - 1 && sy >= 0 && sy < h - 1) {
          // Bi-linear interpolation for smooth, sharp warping
          const x0 = Math.floor(sx), y0 = Math.floor(sy);
          const x1 = x0 + 1, y1 = y0 + 1;
          const fx = sx - x0, fy = sy - y0;
          const i00 = (y0 * w + x0) * 4;
          const i10 = (y0 * w + x1) * 4;
          const i01 = (y1 * w + x0) * 4;
          const i11 = (y1 * w + x1) * 4;

          for (let c = 0; c < 4; c++) {
            od[di + c] = sd[i00 + c] * (1 - fx) * (1 - fy) +
                         sd[i10 + c] * fx * (1 - fy) +
                         sd[i01 + c] * (1 - fx) * fy +
                         sd[i11 + c] * fx * fy;
          }
        } else {
          // Nearest neighbor for boundaries or out-of-bounds
          const sxr = Math.round(sx);
          const syr = Math.round(sy);
          if (sxr >= 0 && sxr < w && syr >= 0 && syr < h) {
            const si = (syr * w + sxr) * 4;
            od[di] = sd[si]; od[di + 1] = sd[si + 1];
            od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
          } else {
            od[di] = sd[di]; od[di + 1] = sd[di + 1];
            od[di + 2] = sd[di + 2]; od[di + 3] = sd[di + 3];
          }
        }
      }
    }
    ctx.putImageData(out, 0, 0);
  }, []);

  const applyBrush = useCallback((cx: number, cy: number, mvx: number, mvy: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !dispDxRef.current || !dispDyRef.current) return;
    const w = canvas.width, h = canvas.height;
    const gw = gridWRef.current, gh = gridHRef.current;
    const r = brushRadius;
    const strength = brushStrength / 100;
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const px = (gx / (gw - 1)) * w;
        const py = (gy / (gh - 1)) * h;
        const dist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);
        if (dist < r) {
          const falloff = (1 - dist / r) ** 2;
          const idx = gy * gw + gx;
          dispDxRef.current[idx] += mvx * strength * falloff;
          dispDyRef.current[idx] += mvy * strength * falloff;
        }
      }
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(renderWarp);
  }, [brushRadius, brushStrength, renderWarp]);

  const saveHistory = useCallback(() => {
    if (!dispDxRef.current || !dispDyRef.current) return;
    historyRef.current.push({
      dx: dispDxRef.current.slice(),
      dy: dispDyRef.current.slice(),
    });
    if (historyRef.current.length > MAX_HISTORY) historyRef.current.shift();
  }, []);

  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return;
    const snap = historyRef.current.pop()!;
    dispDxRef.current = snap.dx;
    dispDyRef.current = snap.dy;
    renderWarp();
  }, [renderWarp]);

  const reset = useCallback(() => {
    if (!dispDxRef.current || !dispDyRef.current) return;
    dispDxRef.current.fill(0);
    dispDyRef.current.fill(0);
    historyRef.current = [];
    renderWarp();
  }, [renderWarp]);

  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      cx: (e.clientX - rect.left) * scaleX,
      cy: (e.clientY - rect.top) * scaleY,
      mvx: e.movementX * scaleX,
      mvy: e.movementY * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      panning.current = true;
      return;
    }
    if (e.button === 0) {
      saveHistory();
      dragging.current = true;
      const { cx, cy } = getCanvasCoords(e);
      applyBrush(cx, cy, 0, 0);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    setMousePos({ x: e.clientX, y: e.clientY, visible: true });

    if (panning.current) {
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      return;
    }

    if (!dragging.current) return;
    const { cx, cy, mvx, mvy } = getCanvasCoords(e);
    applyBrush(cx, cy, mvx, mvy);
  };

  const handleMouseUp = () => {
    dragging.current = false;
    panning.current = false;
  };

  const handleWheel = (e: React.WheelEvent | WheelEvent) => {
    // If it's a native event from our effect, we prevent default
    if (e instanceof WheelEvent) {
      e.preventDefault();
    }

    if (e.ctrlKey || e.metaKey) {
      // Adjust Brush Size
      const delta = -e.deltaY;
      setBrushRadius(prev => Math.max(5, Math.min(300, prev + (delta > 0 ? 5 : -5))));
      return;
    }

    if (e.shiftKey) {
      // Adjust Brush Strength
      const delta = -e.deltaY;
      setBrushStrength(prev => Math.max(5, Math.min(95, prev + (delta > 0 ? 5 : -5))));
      return;
    }

    // Default: Zoom
    const delta = -e.deltaY;
    const factor = delta > 0 ? 1.1 : 0.9;
    setZoom(prev => Math.max(0.2, Math.min(10, prev * factor)));
  };

  // Improved wheel handling to prevent page scroll
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onNativeWheel = (e: WheelEvent) => {
      handleWheel(e);
    };

    container.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', onNativeWheel);
  }, [handleWheel]);

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/jpeg', 0.95));
  };

  // Brush radius overlay: needs to be scaled by zoom
  const visualBrushSize = brushRadius * (canvasRef.current ? canvasRef.current.getBoundingClientRect().width / canvasRef.current.width : 1);

  return (
    <div className="fixed inset-0 z-[60] bg-black/98 flex flex-col select-none overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 flex-wrap flex-shrink-0 bg-black/40 backdrop-blur-md">
        <div className="flex-1 flex flex-col justify-center gap-0.5 overflow-hidden">
          <h1 className="text-[#C9A96E] text-xl font-black uppercase tracking-tight truncate leading-none drop-shadow-sm">
            {patientName || 'Paciente'}
          </h1>
          <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] truncate flex items-center gap-2">
            <span className="bg-purple-600/20 text-purple-300 px-1 rounded-[2px] text-[8px]">Brush Tool</span>
            <span className="w-1 h-1 bg-white/10 rounded-full" />
            <span>Pincel de corrección dental</span>
          </p>
        </div>
        <div className="h-4 w-px bg-white/10 mx-1" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Tamaño</span>
            <input type="range" min={5} max={300} value={brushRadius}
              onChange={e => setBrushRadius(Number(e.target.value))}
              className="w-24 accent-purple-500" />
            <span className="text-[10px] text-purple-300 w-10">{brushRadius}px</span>
          </div>
          <div className="flex items-center gap-2 border-l border-white/5 pl-3">
            <span className="text-[10px] text-gray-400">Fuerza</span>
            <input type="range" min={5} max={95} value={brushStrength}
              onChange={e => setBrushStrength(Number(e.target.value))}
              className="w-24 accent-purple-500" />
            <span className="text-[10px] text-purple-300 w-10">{brushStrength}%</span>
          </div>
        </div>

        <div className="h-4 w-px bg-white/10 mx-1" />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">Zoom</span>
          <span className="text-[10px] text-white font-mono bg-white/5 px-1.5 py-0.5 rounded">
            {Math.round(zoom * 100)}%
          </span>
          <button 
            onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}
            className="text-[10px] text-gray-400 hover:text-white transition-colors"
          >
            Reset
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={undo}
            className="px-2.5 py-1.5 text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg border border-white/10 transition-colors">
            ↩ Deshacer
          </button>
          <button onClick={reset}
            className="px-2.5 py-1.5 text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg border border-white/10 transition-colors">
            ↺ Resetear
          </button>
          <button onClick={onCancel}
            className="px-2.5 py-1.5 text-[11px] bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg border border-white/10 transition-colors">
            Cancelar
          </button>
          <button onClick={handleApply}
            className="px-4 py-1.5 text-[11px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg shadow-lg shadow-purple-600/20 transition-all border border-purple-500/50">
            ✓ Aplicar detalle
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div 
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center bg-[#050505] cursor-none"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { handleMouseUp(); setMousePos(prev => ({ ...prev, visible: false })); }}
        onContextMenu={e => e.preventDefault()}
      >
        {!initialized && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400 text-sm font-medium animate-pulse">Cargando 4K Canvas...</span>
          </div>
        )}
        
        <div 
          className="relative transition-transform duration-75 ease-out"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: 'center',
          }}
        >
          <canvas
            ref={canvasRef}
            className="rounded-sm shadow-[0_0_100px_rgba(0,0,0,0.8)]"
            style={{
              display: initialized ? 'block' : 'none',
              maxWidth: 'none', // Allow it to grow beyond screen for zoom
              maxHeight: 'none',
              cursor: 'none', // Custom brush cursor used below
              imageRendering: zoom > 1 ? 'pixelated' : 'auto',
            }}
          />
        </div>

        {/* Visual Brush Cursor */}
        {mousePos.visible && (
          <div 
            className="pointer-events-none fixed z-[100] rounded-full border border-white/50 mix-blend-difference"
            style={{
              left: mousePos.x,
              top: mousePos.y,
              width: visualBrushSize * 2,
              height: visualBrushSize * 2,
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            }}
          >
            {/* Center dot */}
            <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 opacity-50" />
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-t border-white/5 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <span className="bg-white/10 px-1 rounded text-[9px]">Wheel</span> Zoom
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <span className="bg-white/10 px-1 rounded text-[9px]">Ctrl + Wheel</span> Tamaño Pincel
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <span className="bg-white/10 px-1 rounded text-[9px]">Shift + Wheel</span> Fuerza Pincel
          </span>
          <span className="text-[10px] text-gray-500 flex items-center gap-1.5">
            <span className="bg-white/10 px-1 rounded text-[9px]">Right Click</span> Pan
          </span>
        </div>
        <p className="text-[10px] text-gray-500 italic">
          El ajuste se aplica a la resolución nativa de la foto.
        </p>
      </div>
    </div>
  );
}
