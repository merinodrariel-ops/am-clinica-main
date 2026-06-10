'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Move, RotateCw, X, ZoomIn } from 'lucide-react';

/**
 * Canva-style transform editor for a background-removed cutout.
 * The subject can be dragged, scaled and rotated over the canvas; Apply
 * flattens it back onto a transparent PNG with the original dimensions,
 * so the rest of the photo studio pipeline (bg color, save) is untouched.
 */
interface SubjectTransformOverlayProps {
    cutoutUrl: string;
    bgPreview: string; // CSS background behind the subject while editing
    onApply: (blob: Blob) => void;
    onClose: () => void;
}

interface Transform {
    x: number; // offset in image pixels
    y: number;
    scale: number;
    rotation: number; // degrees
}

export default function SubjectTransformOverlay({ cutoutUrl, bgPreview, onApply, onClose }: SubjectTransformOverlayProps) {
    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, scale: 1, rotation: 0 });
    const [applying, setApplying] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number; pixelRatio: number } | null>(null);

    useEffect(() => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => setImg(image);
        image.src = cutoutUrl;
    }, [cutoutUrl]);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !img) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const cx = canvas.width / 2 + transform.x;
        const cy = canvas.height / 2 + transform.y;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((transform.rotation * Math.PI) / 180);
        ctx.scale(transform.scale, transform.scale);
        ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        ctx.restore();
    }, [img, transform]);

    useEffect(() => {
        draw();
    }, [draw]);

    function handlePointerDown(e: React.PointerEvent) {
        if (!img || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        // Displayed canvas is letterboxed via object-contain — compute on-screen scale.
        const displayScale = Math.min(rect.width / img.naturalWidth, rect.height / img.naturalHeight);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            baseX: transform.x,
            baseY: transform.y,
            pixelRatio: displayScale > 0 ? 1 / displayScale : 1,
        };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: React.PointerEvent) {
        const drag = dragRef.current;
        if (!drag) return;
        setTransform((t) => ({
            ...t,
            x: drag.baseX + (e.clientX - drag.startX) * drag.pixelRatio,
            y: drag.baseY + (e.clientY - drag.startY) * drag.pixelRatio,
        }));
    }

    function handlePointerUp() {
        dragRef.current = null;
    }

    function handleWheel(e: React.WheelEvent) {
        setTransform((t) => ({
            ...t,
            scale: Math.min(4, Math.max(0.1, t.scale * (e.deltaY < 0 ? 1.05 : 0.95))),
        }));
    }

    async function handleApply() {
        const canvas = canvasRef.current;
        if (!canvas) return;
        setApplying(true);
        canvas.toBlob((blob) => {
            setApplying(false);
            if (blob) onApply(blob);
        }, 'image/png');
    }

    return (
        <div className="fixed inset-0 z-[70] flex flex-col bg-black/90">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2 text-white/80">
                    <Move size={16} />
                    <span className="text-sm font-medium">Mover sujeto — arrastrá para mover, rueda para escalar</span>
                </div>
                <button onClick={onClose} className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
                    <X size={18} />
                </button>
            </div>

            {/* Canvas */}
            <div
                ref={containerRef}
                className="relative mx-4 flex-1 touch-none overflow-hidden rounded-xl"
                style={{ background: bgPreview }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onWheel={handleWheel}
            >
                {!img ? (
                    <div className="flex h-full items-center justify-center text-white/50">
                        <Loader2 className="animate-spin" size={24} />
                    </div>
                ) : (
                    <canvas
                        ref={canvasRef}
                        className="h-full w-full cursor-move object-contain"
                    />
                )}
            </div>

            {/* Controls */}
            <div className="space-y-3 p-4">
                <div className="flex items-center gap-3">
                    <ZoomIn size={16} className="shrink-0 text-white/50" />
                    <input
                        type="range"
                        min={0.1}
                        max={3}
                        step={0.01}
                        value={transform.scale}
                        onChange={(e) => setTransform((t) => ({ ...t, scale: Number(e.target.value) }))}
                        className="flex-1 accent-[#C9A96E]"
                    />
                    <span className="w-12 text-right text-xs tabular-nums text-white/60">
                        {Math.round(transform.scale * 100)}%
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <RotateCw size={16} className="shrink-0 text-white/50" />
                    <input
                        type="range"
                        min={-180}
                        max={180}
                        step={1}
                        value={transform.rotation}
                        onChange={(e) => setTransform((t) => ({ ...t, rotation: Number(e.target.value) }))}
                        className="flex-1 accent-[#C9A96E]"
                    />
                    <span className="w-12 text-right text-xs tabular-nums text-white/60">
                        {transform.rotation}°
                    </span>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setTransform({ x: 0, y: 0, scale: 1, rotation: 0 })}
                        className="flex-1 rounded-xl bg-white/10 py-2.5 text-sm text-white/70 transition-colors hover:bg-white/15"
                    >
                        Restablecer
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={!img || applying}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#C9A96E] py-2.5 text-sm font-semibold text-black transition-colors hover:bg-[#b8924e] disabled:opacity-50"
                    >
                        {applying ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                        Aplicar
                    </button>
                </div>
            </div>
        </div>
    );
}
