'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

const GRID_CELL = 16;
const MAX_HISTORY = 20;

interface WarpBrushProps {
  imageSrc: string;
  onSave: (warped: string) => void;
  onCancel: () => void;
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

export default function WarpBrush({ imageSrc, onSave, onCancel }: WarpBrushProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<ImageData | null>(null);
  const dispDxRef = useRef<Float32Array | null>(null);
  const dispDyRef = useRef<Float32Array | null>(null);
  const gridWRef = useRef(0);
  const gridHRef = useRef(0);
  const dragging = useRef(false);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<Array<{ dx: Float32Array; dy: Float32Array }>>([]);

  const [brushRadius, setBrushRadius] = useState(40);
  const [brushStrength, setBrushStrength] = useState(30);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    img.onload = () => {
      const maxW = 900;
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
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width, h = canvas.height;
    const gw = gridWRef.current, gh = gridHRef.current;
    const out = ctx.createImageData(w, h);
    const sd = src.data, od = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ddx = sampleDisp(dx, gw, gh, x, y, w, h);
        const ddy = sampleDisp(dy, gw, gh, x, y, w, h);
        const sx = Math.round(x - ddx);
        const sy = Math.round(y - ddy);
        const di = (y * w + x) * 4;
        if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
          const si = (sy * w + sx) * 4;
          od[di] = sd[si]; od[di + 1] = sd[si + 1];
          od[di + 2] = sd[si + 2]; od[di + 3] = sd[si + 3];
        } else {
          od[di] = sd[di]; od[di + 1] = sd[di + 1];
          od[di + 2] = sd[di + 2]; od[di + 3] = sd[di + 3];
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

  const onMouseDown = (e: React.MouseEvent) => {
    saveHistory();
    dragging.current = true;
    const { cx, cy } = getCanvasCoords(e);
    applyBrush(cx, cy, 0, 0);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return;
    const { cx, cy, mvx, mvy } = getCanvasCoords(e);
    applyBrush(cx, cy, mvx, mvy);
  };

  const onMouseUp = () => { dragging.current = false; };

  const handleApply = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave(canvas.toDataURL('image/jpeg', 0.95));
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/98 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/10 flex-wrap flex-shrink-0">
        <span className="text-white font-semibold text-sm">🖌️ Pincel de corrección</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">Tamaño</span>
          <input type="range" min={10} max={150} value={brushRadius}
            onChange={e => setBrushRadius(Number(e.target.value))}
            className="w-24 accent-purple-500" />
          <span className="text-[10px] text-purple-300 w-8">{brushRadius}px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">Fuerza</span>
          <input type="range" min={5} max={80} value={brushStrength}
            onChange={e => setBrushStrength(Number(e.target.value))}
            className="w-24 accent-purple-500" />
          <span className="text-[10px] text-purple-300 w-8">{brushStrength}%</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={undo}
            className="px-2.5 py-1.5 text-[11px] bg-white/8 hover:bg-white/15 text-gray-300 rounded-lg border border-white/10">
            ↩ Deshacer
          </button>
          <button onClick={reset}
            className="px-2.5 py-1.5 text-[11px] bg-white/8 hover:bg-white/15 text-gray-300 rounded-lg border border-white/10">
            ↺ Resetear
          </button>
          <button onClick={onCancel}
            className="px-2.5 py-1.5 text-[11px] bg-white/8 hover:bg-white/15 text-gray-300 rounded-lg border border-white/10">
            Cancelar
          </button>
          <button onClick={handleApply}
            className="px-3 py-1.5 text-[11px] bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg">
            ✓ Aplicar
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex items-center justify-center overflow-auto p-4">
        {!initialized && (
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-400 text-sm">Cargando imagen...</span>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="rounded-lg shadow-2xl"
          style={{
            display: initialized ? 'block' : 'none',
            maxWidth: '100%',
            maxHeight: '100%',
            cursor: 'crosshair',
          }}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
        />
      </div>
      <p className="text-center pb-2 text-[10px] text-gray-600">
        Arrastrá suavemente para deformar · Zoom para ver detalles · No modifica la foto original
      </p>
    </div>
  );
}
