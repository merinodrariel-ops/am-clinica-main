'use client';
import { useRef, useState, useEffect } from 'react';
import { Download, Save, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';

// ── Types ─────────────────────────────────────────────────────────────────────

export type CanvasRatio = '1:1' | '4:5' | '9:16' | '16:9';

export interface CanvasLayer {
    id: string;
    src: string;
    fileId?: string;
    x: number;      // center X, normalized 0–1
    y: number;      // center Y, normalized 0–1
    w: number;      // width, normalized 0–1
    h: number;      // height, normalized 0–1
    rotation: number; // degrees
    brightness: number; // 0–200, default 100
    img: HTMLImageElement;
}

export const RATIOS: { label: string; value: CanvasRatio; desc: string; w: number; h: number }[] = [
    { label: '1:1',  value: '1:1',  desc: 'Instagram Post',     w: 1,  h: 1  },
    { label: '4:5',  value: '4:5',  desc: 'Instagram Portrait', w: 4,  h: 5  },
    { label: '9:16', value: '9:16', desc: 'Story / Reels',      w: 9,  h: 16 },
    { label: '16:9', value: '16:9', desc: 'Presentación',       w: 16, h: 9  },
];

const EXPORT_BASE = 1080;
const HANDLE_SIZE = 8;

// ── Module-level helpers (exported for reuse in PhotoStudioModal) ─────────────

export function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

export function makeLayer(
    img: HTMLImageElement,
    src: string,
    fileId?: string,
    dropX = 0.5,
    dropY = 0.5,
): CanvasLayer {
    const maxW = 0.5;
    const aspect = img.naturalWidth / (img.naturalHeight || 1);
    const w = maxW;
    const h = w / aspect;
    return {
        id: `layer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        src, fileId,
        x: Math.max(w / 2, Math.min(1 - w / 2, dropX)),
        y: Math.max(h / 2, Math.min(1 - h / 2, dropY)),
        w, h,
        rotation: 0,
        brightness: 100,
        img,
    };
}

export function getLayerCorners(layer: CanvasLayer, cw: number, ch: number): [number, number][] {
    const cx = layer.x * cw, cy = layer.y * ch;
    const hw = (layer.w * cw) / 2, hh = (layer.h * ch) / 2;
    const rad = layer.rotation * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return ([ [-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh] ] as [number,number][]).map(
        ([dx, dy]) => [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos]
    );
}

export function hitTestCorner(layer: CanvasLayer, nx: number, ny: number, cw: number, ch: number): number {
    const corners = getLayerCorners(layer, cw, ch);
    const px = nx * cw, py = ny * ch;
    for (let i = 0; i < corners.length; i++) {
        const [cx, cy] = corners[i];
        if (Math.abs(px - cx) <= HANDLE_SIZE + 2 && Math.abs(py - cy) <= HANDLE_SIZE + 2) return i;
    }
    return -1;
}

export function hitTestLayerBody(layer: CanvasLayer, nx: number, ny: number, cw: number, ch: number): boolean {
    const lx = layer.x * cw, ly = layer.y * ch;
    const px = nx * cw - lx, py = ny * ch - ly;
    const rad = -layer.rotation * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    const localX = px * cos - py * sin;
    const localY = px * sin + py * cos;
    const hw = (layer.w * cw) / 2, hh = (layer.h * ch) / 2;
    return Math.abs(localX) <= hw && Math.abs(localY) <= hh;
}

// ── Component ─────────────────────────────────────────────────────────────────

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
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
    const [displaySize, setDisplaySize] = useState({ w: 500, h: 500 });
    const [saving, setSaving] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{
        layerId: string;
        mode: 'move' | 'resize' | 'rotate';
        startX: number; startY: number;
        origLayer: CanvasLayer;
    } | null>(null);

    const currentRatio = RATIOS.find(r => r.value === ratio)!;
    const imageFiles = files.filter(f => f.mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name));

    // ── Resize observer for display canvas ───────────────────────────────────
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const update = () => {
            const { width, height } = el.getBoundingClientRect();
            const pad = 48;
            const aw = width - pad, ah = height - pad;
            const rw = currentRatio.w, rh = currentRatio.h;
            let cw = aw, ch = cw * rh / rw;
            if (ch > ah) { ch = ah; cw = ch * rw / rh; }
            setDisplaySize({ w: Math.max(100, Math.floor(cw)), h: Math.max(100, Math.floor(ch)) });
        };
        update();
        const ro = new ResizeObserver(update);
        ro.observe(el);
        return () => ro.disconnect();
    }, [ratio, currentRatio]);

    // ── Render canvas ─────────────────────────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = displaySize.w;
        canvas.height = displaySize.h;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, displaySize.w, displaySize.h);

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

        // Selection handles
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
                    ctx.strokeStyle = '#0D0D12';
                    ctx.lineWidth = 1;
                    ctx.fillRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                    ctx.strokeRect(x - HANDLE_SIZE / 2, y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
                });
                ctx.restore();
            }
        }
    }, [layers, displaySize, selectedId]);

    // ── Delete key ────────────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
                const tag = (document.activeElement as HTMLElement)?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA') return;
                setLayers(prev => prev.filter(l => l.id !== selectedId));
                setSelectedId(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [selectedId]);

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
        if (layers.length === 0) return;
        const blob = await exportToBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `canvas-${ratio.replace(':', 'x')}-${Date.now()}.jpg`;
        a.click();
        URL.revokeObjectURL(url);
    }

    async function handleSave() {
        if (layers.length === 0) return;
        setSaving(true);
        try {
            const blob = await exportToBlob();
            onSaveToDrive(blob, `canvas-${ratio.replace(':', 'x')}-${Date.now()}.jpg`);
        } finally {
            setSaving(false);
        }
    }

    // ── Drop handler ──────────────────────────────────────────────────────────
    async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
        e.preventDefault();
        setIsDragOver(false);
        const canvasEl = canvasRef.current;
        const rect = canvasEl?.getBoundingClientRect();
        const dropX = rect ? (e.clientX - rect.left) / rect.width : 0.5;
        const dropY = rect ? (e.clientY - rect.top) / rect.height : 0.5;

        // From thumbnail strip
        const fileId = e.dataTransfer.getData('driveFileId');
        if (fileId) {
            const src = `/api/drive/file/${fileId}`;
            try {
                const img = await loadImage(src);
                setLayers(prev => [...prev, makeLayer(img, src, fileId, dropX, dropY)]);
                setSelectedId(null);
            } catch { toast.error('No se pudo cargar la foto'); }
            return;
        }

        // From PC
        const pcFile = e.dataTransfer.files[0];
        if (pcFile?.type.startsWith('image/')) {
            const src = URL.createObjectURL(pcFile);
            try {
                const img = await loadImage(src);
                setLayers(prev => [...prev, makeLayer(img, src, undefined, dropX, dropY)]);
                setSelectedId(null);
            } catch {
                URL.revokeObjectURL(src);
                toast.error('No se pudo cargar la imagen');
            }
        }
    }

    // ── Pointer interaction ───────────────────────────────────────────────────
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
        // Hit layers in reverse order (top first)
        for (let i = layers.length - 1; i >= 0; i--) {
            const layer = layers[i];
            const ci = hitTestCorner(layer, nx, ny, cw, ch);
            if (ci >= 0) {
                e.currentTarget.setPointerCapture(e.pointerId);
                const mode = (e.metaKey || e.ctrlKey) ? 'rotate' : 'resize';
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
                return {
                    ...l,
                    x: Math.max(l.w / 2, Math.min(1 - l.w / 2, origLayer.x + dx)),
                    y: Math.max(l.h / 2, Math.min(1 - l.h / 2, origLayer.y + dy)),
                };
            }
            if (mode === 'rotate') {
                const cx = origLayer.x, cy = origLayer.y;
                const angle = Math.atan2(ny - cy, nx - cx) - Math.atan2(startY - cy, startX - cx);
                return { ...l, rotation: origLayer.rotation + angle * 180 / Math.PI };
            }
            // resize: scale from center, maintain aspect ratio
            const dist = Math.sqrt(dx * dx + dy * dy) * (dx + dy >= 0 ? 1 : -1);
            const newW = Math.max(0.05, origLayer.w + dist * 1.5);
            const aspect = origLayer.w / (origLayer.h || 1);
            return { ...l, w: newW, h: newW / aspect };
        }));
    }

    function handleCanvasPointerUp() {
        dragRef.current = null;
    }

    function handleCanvasContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        for (let i = layers.length - 1; i >= 0; i--) {
            if (hitTestLayerBody(layers[i], nx, ny, displaySize.w, displaySize.h)) {
                setSelectedId(layers[i].id);
                setContextMenu({ x: e.clientX, y: e.clientY, layerId: layers[i].id });
                return;
            }
        }
    }

    // ── Ratio change with layer rescale ───────────────────────────────────────
    function handleRatioChange(newRatio: CanvasRatio) {
        const oldR = RATIOS.find(r => r.value === ratio)!;
        const newR = RATIOS.find(r => r.value === newRatio)!;
        setRatio(newRatio);
        const scaleX = oldR.w / newR.w;
        const scaleY = oldR.h / newR.h;
        setLayers(prev => prev.map(l => ({
            ...l,
            x: Math.max(l.w / 2, Math.min(1 - l.w / 2, l.x * scaleX)),
            y: Math.max(l.h / 2, Math.min(1 - l.h / 2, l.y * scaleY)),
        })));
    }

    // ── Add photo via click (mobile) ──────────────────────────────────────────
    async function addPhotoFromFile(f: DriveFile) {
        const src = `/api/drive/file/${f.id}`;
        try {
            const img = await loadImage(src);
            setLayers(prev => [...prev, makeLayer(img, src, f.id, 0.5, 0.5)]);
        } catch { toast.error('No se pudo cargar la foto'); }
    }

    // ── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="flex-1 flex overflow-hidden min-h-0">

                {/* Left: thumbnail source strip (desktop) */}
                <div className="hidden md:flex flex-col w-[72px] border-r border-white/10 flex-shrink-0 bg-black/20">
                    <p className="text-white/30 text-[10px] text-center py-2 border-b border-white/10 flex-shrink-0">Fotos</p>
                    <div className="flex flex-col gap-1 p-1 overflow-y-auto flex-1">
                        {imageFiles.map(f => (
                            <div
                                key={f.id}
                                draggable
                                onDragStart={e => {
                                    e.dataTransfer.setData('driveFileId', f.id);
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

                {/* Center: canvas area */}
                <div
                    ref={containerRef}
                    className="flex-1 flex items-center justify-center overflow-hidden p-6 bg-[#0D0D12]"
                    onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
                    onDrop={handleDrop}
                >
                    <div
                        className={`relative shadow-2xl ring-2 transition-all duration-150 ${
                            isDragOver ? 'ring-[#C9A96E] scale-[1.01]' : 'ring-white/10'
                        }`}
                        style={{ width: displaySize.w, height: displaySize.h }}
                    >
                        <canvas
                            ref={canvasRef}
                            className="block w-full h-full"
                            style={{
                                cursor: selectedId ? 'move' : 'default',
                            }}
                            onPointerDown={handleCanvasPointerDown}
                            onPointerMove={handleCanvasPointerMove}
                            onPointerUp={handleCanvasPointerUp}
                            onPointerLeave={handleCanvasPointerUp}
                            onContextMenu={handleCanvasContextMenu}
                        />
                        {layers.length === 0 && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none select-none">
                                <div className="w-12 h-12 rounded-2xl bg-black/20 flex items-center justify-center">
                                    <ImageIcon size={22} className="text-black/20" />
                                </div>
                                <p className="text-black/25 text-sm text-center px-8">
                                    Arrastrá fotos desde el panel izquierdo
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: controls panel (desktop) */}
                <div className="hidden md:flex flex-col w-56 border-l border-white/10 flex-shrink-0 bg-black/20 p-4 gap-4 overflow-y-auto">
                    {/* Ratio selector */}
                    <div>
                        <p className="text-white/40 text-xs mb-2">Proporción</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {RATIOS.map(r => (
                                <button
                                    key={r.value}
                                    onClick={() => handleRatioChange(r.value)}
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
                        <p className="mt-1.5 text-[10px] text-white/30 text-center">
                            {RATIOS.find(r => r.value === ratio)?.desc}
                        </p>
                    </div>

                    {/* Save / Download */}
                    <div className="space-y-2 border-t border-white/10 pt-3">
                        {canSave && (
                            <button
                                onClick={handleSave}
                                disabled={layers.length === 0 || saving}
                                className="w-full py-2 rounded-lg bg-[#C9A96E] text-black text-sm font-semibold hover:bg-[#b8924e] transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Save size={14} /> {saving ? 'Guardando…' : 'Guardar en Drive'}
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

                    {/* Layer list */}
                    {layers.length > 0 && (
                        <div className="border-t border-white/10 pt-3 space-y-1">
                            <p className="text-white/40 text-xs mb-1.5">Capas ({layers.length})</p>
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
                                    <img src={layer.src} className="w-6 h-6 rounded object-cover flex-shrink-0" alt="" />
                                    <span className="truncate">Capa {layers.length - i}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Hint */}
                    <p className="text-white/20 text-[10px] border-t border-white/10 pt-3">
                        Arrastrá desde el panel izquierdo · Drag desde PC · Cmd+drag esquina = rotar · Clic derecho = opciones
                    </p>
                </div>
            </div>

            {/* Mobile: horizontal photo strip */}
            <div className="md:hidden flex gap-1 p-2 border-t border-white/10 overflow-x-auto bg-black/20 flex-shrink-0">
                {imageFiles.map(f => (
                    <button
                        key={f.id}
                        onClick={() => addPhotoFromFile(f)}
                        className="w-12 h-12 rounded-md overflow-hidden flex-shrink-0 border border-white/10 hover:border-[#C9A96E]/60 transition-colors"
                        title={f.name}
                    >
                        {f.thumbnailLink ? (
                            <img src={f.thumbnailLink} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt={f.name} />
                        ) : (
                            <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                <ImageIcon size={12} className="text-white/30" />
                            </div>
                        )}
                    </button>
                ))}
            </div>

            {/* Mobile: action bar */}
            <div className="md:hidden flex gap-2 px-3 py-2 border-t border-white/10 bg-black/20 flex-shrink-0">
                <select
                    value={ratio}
                    onChange={e => handleRatioChange(e.target.value as CanvasRatio)}
                    className="flex-1 bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/10"
                >
                    {RATIOS.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
                <button
                    onClick={handleDownload}
                    disabled={layers.length === 0}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-xs disabled:opacity-40 flex items-center gap-1"
                >
                    <Download size={14} />
                </button>
                {canSave && (
                    <button
                        onClick={handleSave}
                        disabled={layers.length === 0 || saving}
                        className="px-3 py-1.5 rounded-lg bg-[#C9A96E] text-black text-xs font-semibold disabled:opacity-40 flex items-center gap-1"
                    >
                        <Save size={14} />
                    </button>
                )}
            </div>

            {/* Context menu */}
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
        </div>
    );
}
