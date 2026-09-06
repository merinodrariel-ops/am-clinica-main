'use client';

import { useRef, useEffect } from 'react';
import { type CanvasLayer, type CanvasRatio, RATIOS as CANVAS_RATIOS } from './CanvasCompositor';

export function CanvasThumbnailPreview({ layers, bgColor, ratio }: {
    layers: CanvasLayer[];
    bgColor: string;
    ratio: string;
}) {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current;
        if (!canvas) return;
        const SIZE = 56;
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Background
        if (bgColor === 'transparent') {
            // Checkerboard pattern for transparent
            const sq = 7;
            for (let r = 0; r < SIZE / sq; r++) {
                for (let c = 0; c < SIZE / sq; c++) {
                    ctx.fillStyle = (r + c) % 2 === 0 ? '#888' : '#555';
                    ctx.fillRect(c * sq, r * sq, sq, sq);
                }
            }
        } else {
            ctx.fillStyle = bgColor === 'black' ? '#000000' : '#ffffff';
            ctx.fillRect(0, 0, SIZE, SIZE);
        }
        if (layers.length === 0) return;
        // Draw layers scaled to thumbnail
        layers.forEach(layer => {
            if (!(layer.img instanceof HTMLImageElement) || !layer.img.complete || layer.img.naturalWidth === 0) return;
            const cx = layer.x * SIZE;
            const cy = layer.y * SIZE;
            const w = layer.w * SIZE;
            const h = layer.h * SIZE;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate((layer.rotation ?? 0) * Math.PI / 180);
            ctx.globalAlpha = 1;
            ctx.drawImage(layer.img, -w / 2, -h / 2, w, h);
            ctx.restore();
        });
    }, [layers, bgColor, ratio]);
    return <canvas ref={ref} width={56} height={56} className="w-full h-full object-cover" />;
}

export function CanvasPresentationPreview({ layers, bgColor, ratio, name }: {
    layers: CanvasLayer[];
    bgColor: string;
    ratio: CanvasRatio;
    name: string;
}) {
    const canvasRatio = CANVAS_RATIOS.find(item => item.value === ratio) ?? CANVAS_RATIOS[0];
    const backgroundColor = bgColor === 'transparent'
        ? 'transparent'
        : bgColor === 'black' ? '#000000' : '#ffffff';
    const presentationWidth = `min(90vw, calc((100vh - 96px) * ${canvasRatio.w / canvasRatio.h}), 1400px)`;

    return (
        <div
            aria-label={name}
            className="relative flex-none overflow-hidden shadow-2xl"
            style={{
                aspectRatio: `${canvasRatio.w} / ${canvasRatio.h}`,
                backgroundColor,
                width: presentationWidth,
                backgroundImage: bgColor === 'transparent'
                    ? 'linear-gradient(45deg,#555 25%,transparent 25%),linear-gradient(-45deg,#555 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#555 75%),linear-gradient(-45deg,transparent 75%,#555 75%)'
                    : undefined,
                backgroundSize: bgColor === 'transparent' ? '24px 24px' : undefined,
                backgroundPosition: bgColor === 'transparent' ? '0 0,0 12px,12px -12px,-12px 0' : undefined,
            }}
        >
            {layers.map(layer => (
                <img
                    key={layer.id}
                    src={layer.src}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute"
                    style={{
                        left: `${layer.x * 100}%`,
                        top: `${layer.y * 100}%`,
                        width: `${layer.w * 100}%`,
                        height: `${layer.h * 100}%`,
                        filter: `brightness(${layer.brightness ?? 100}%)`,
                        transform: `translate(-50%, -50%) rotate(${layer.rotation ?? 0}deg)`,
                    }}
                />
            ))}
        </div>
    );
}
