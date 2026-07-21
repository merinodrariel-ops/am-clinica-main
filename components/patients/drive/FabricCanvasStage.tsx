'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Canvas as FabricCanvas, FabricImage, FabricObject } from 'fabric';

import {
    canvasLayerToFabricGeometry,
    fabricGeometryToCanvasLayer,
} from '@/lib/photo-studio/fabric-canvas-geometry';
import type { CanvasLayer, CanvasRatio } from './CanvasCompositor';

type LayerEntry = {
    object: FabricImage;
    src: string;
    brightness: number;
};

type Props = {
    layers: CanvasLayer[];
    ratio: CanvasRatio;
    bgColor: string;
    selectedId: string | null;
    showGrid: boolean;
    toolsHidden: boolean;
    onSelectionChange: (layerId: string | null) => void;
    onLayerChange: (layerId: string, patch: Partial<CanvasLayer>) => void;
    onInteractionChange: (active: boolean) => void;
    onDrop: (event: React.DragEvent<HTMLDivElement>, x: number, y: number) => void;
    onDoubleClickLayer: (layerId: string) => void;
    onContextMenuLayer: (layerId: string, clientX: number, clientY: number) => void;
};

const RATIOS: Record<CanvasRatio, { w: number; h: number }> = {
    '1:1': { w: 1, h: 1 },
    '4:5': { w: 4, h: 5 },
    '9:16': { w: 9, h: 16 },
    '16:9': { w: 16, h: 9 },
};

function getDisplaySize(ratio: CanvasRatio, toolsHidden: boolean) {
    if (typeof window === 'undefined') return { width: 540, height: 540 };
    const r = RATIOS[ratio];
    const desktop = window.innerWidth >= 768;
    const reservedWidth = desktop ? (toolsHidden ? 150 : 470) : 24;
    const maxWidth = Math.max(260, window.innerWidth - reservedWidth);
    const maxHeight = Math.max(260, window.innerHeight * (toolsHidden ? 0.88 : desktop ? 0.65 : 0.58));
    const scale = Math.min(maxWidth / r.w, maxHeight / r.h);
    return {
        width: Math.max(1, Math.round(r.w * scale)),
        height: Math.max(1, Math.round(r.h * scale)),
    };
}

function getLayerId(entries: Map<string, LayerEntry>, object?: FabricObject | null) {
    if (!object) return null;
    for (const [layerId, entry] of entries) {
        if (entry.object === object) return layerId;
    }
    return null;
}

function brightnessMatrix(brightness: number) {
    const factor = Math.max(0, brightness) / 100;
    return [
        factor, 0, 0, 0, 0,
        0, factor, 0, 0, 0,
        0, 0, factor, 0, 0,
        0, 0, 0, 1, 0,
    ];
}

export default function FabricCanvasStage({
    layers,
    ratio,
    bgColor,
    selectedId,
    showGrid,
    toolsHidden,
    onSelectionChange,
    onLayerChange,
    onInteractionChange,
    onDrop,
    onDoubleClickLayer,
    onContextMenuLayer,
}: Props) {
    const elementRef = useRef<HTMLCanvasElement>(null);
    const canvasRef = useRef<FabricCanvas | null>(null);
    const entriesRef = useRef<Map<string, LayerEntry>>(new Map());
    const syncingRef = useRef(false);
    const generationRef = useRef(0);
    const callbacksRef = useRef({
        onSelectionChange,
        onLayerChange,
        onInteractionChange,
        onDoubleClickLayer,
        onContextMenuLayer,
    });
    const [displaySize, setDisplaySize] = useState(() => getDisplaySize(ratio, toolsHidden));
    const [interacting, setInteracting] = useState(false);
    const [ready, setReady] = useState(false);

    callbacksRef.current = {
        onSelectionChange,
        onLayerChange,
        onInteractionChange,
        onDoubleClickLayer,
        onContextMenuLayer,
    };

    useEffect(() => {
        const resize = () => setDisplaySize(getDisplaySize(ratio, toolsHidden));
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, [ratio, toolsHidden]);

    const setInteraction = useCallback((active: boolean) => {
        setInteracting(active);
        callbacksRef.current.onInteractionChange(active);
    }, []);

    useEffect(() => {
        if (!elementRef.current) return;
        let disposed = false;
        let cleanupContextMenu: (() => void) | undefined;
        const entries = entriesRef.current;

        void import('fabric').then(({ Canvas }) => {
            if (disposed || !elementRef.current) return;
            const canvas = new Canvas(elementRef.current, {
                width: displaySize.width,
                height: displaySize.height,
                preserveObjectStacking: true,
                selection: false,
                uniformScaling: true,
                centeredScaling: true,
                fireRightClick: true,
                stopContextMenu: true,
            });
            canvasRef.current = canvas;

            const updateSelection = () => {
                if (syncingRef.current) return;
                callbacksRef.current.onSelectionChange(
                    getLayerId(entriesRef.current, canvas.getActiveObject()),
                );
            };
            const finishTransform = (event: { target?: FabricObject }) => {
                setInteraction(false);
                if (syncingRef.current || !event.target) return;
                const layerId = getLayerId(entriesRef.current, event.target);
                if (!layerId) return;
                callbacksRef.current.onLayerChange(
                    layerId,
                    fabricGeometryToCanvasLayer(event.target, canvas.getWidth(), canvas.getHeight()),
                );
            };
            const startTransform = () => setInteraction(true);

            canvas.on('selection:created', updateSelection);
            canvas.on('selection:updated', updateSelection);
            canvas.on('selection:cleared', updateSelection);
            canvas.on('before:transform', startTransform);
            canvas.on('object:moving', startTransform);
            canvas.on('object:scaling', startTransform);
            canvas.on('object:rotating', startTransform);
            canvas.on('object:modified', finishTransform);
            canvas.on('mouse:up', () => setInteraction(false));
            canvas.on('mouse:dblclick', event => {
                const layerId = getLayerId(entriesRef.current, event.target);
                if (layerId) callbacksRef.current.onDoubleClickLayer(layerId);
            });

            const contextMenuHandler = (event: MouseEvent) => {
                event.preventDefault();
                const { target } = canvas.findTarget(event);
                const layerId = getLayerId(entriesRef.current, target);
                if (!layerId || !target) return;
                canvas.setActiveObject(target);
                canvas.requestRenderAll();
                callbacksRef.current.onSelectionChange(layerId);
                callbacksRef.current.onContextMenuLayer(layerId, event.clientX, event.clientY);
            };
            canvas.upperCanvasEl.addEventListener('contextmenu', contextMenuHandler);
            cleanupContextMenu = () => canvas.upperCanvasEl.removeEventListener('contextmenu', contextMenuHandler);
            setReady(true);
        });

        return () => {
            disposed = true;
            setReady(false);
            cleanupContextMenu?.();
            generationRef.current += 1;
            entries.clear();
            const canvas = canvasRef.current;
            canvasRef.current = null;
            if (canvas) void canvas.dispose();
        };
    // Canvas is recreated only when its real pixel dimensions change.
    }, [displaySize.height, displaySize.width, setInteraction]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !ready) return;
        const nextGeneration = generationRef.current + 1;
        generationRef.current = nextGeneration;
        let cancelled = false;

        void import('fabric').then(async ({ FabricImage, filters }) => {
            if (cancelled || generationRef.current !== nextGeneration || canvasRef.current !== canvas) return;
            syncingRef.current = true;
            const currentIds = new Set(layers.map(layer => layer.id));
            for (const [layerId, entry] of entriesRef.current) {
                if (currentIds.has(layerId)) continue;
                canvas.remove(entry.object);
                entriesRef.current.delete(layerId);
            }

            for (const layer of layers) {
                let entry = entriesRef.current.get(layer.id);
                if (entry && entry.src !== layer.src) {
                    canvas.remove(entry.object);
                    entriesRef.current.delete(layer.id);
                    entry = undefined;
                }

                if (!entry) {
                    try {
                        const image = await FabricImage.fromURL(
                            layer.src,
                            layer.src.startsWith('blob:') || layer.src.startsWith('data:')
                                ? undefined
                                : { crossOrigin: 'anonymous' },
                        );
                        if (cancelled || generationRef.current !== nextGeneration || canvasRef.current !== canvas) return;
                        image.set({
                            originX: 'center',
                            originY: 'center',
                            cornerColor: '#C9A96E',
                            cornerStrokeColor: '#0D0D12',
                            borderColor: '#C9A96E',
                            cornerStyle: 'rect',
                            cornerSize: 14,
                            transparentCorners: false,
                            padding: 2,
                            lockScalingFlip: true,
                        });
                        image.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
                        entry = { object: image, src: layer.src, brightness: Number.NaN };
                        entriesRef.current.set(layer.id, entry);
                        canvas.add(image);
                    } catch {
                        continue;
                    }
                }

                const geometry = canvasLayerToFabricGeometry(
                    layer,
                    canvas.getWidth(),
                    canvas.getHeight(),
                    entry.object.width,
                    entry.object.height,
                );
                entry.object.set(geometry);
                if (entry.brightness !== (layer.brightness ?? 100)) {
                    const brightness = layer.brightness ?? 100;
                    entry.object.filters = brightness === 100
                        ? []
                        : [new filters.ColorMatrix({ matrix: brightnessMatrix(brightness) })];
                    entry.object.applyFilters();
                    entry.brightness = brightness;
                }
                entry.object.setCoords();
            }

            layers.forEach((layer, index) => {
                const object = entriesRef.current.get(layer.id)?.object;
                if (object) canvas.moveObjectTo(object, index);
            });
            const selected = selectedId ? entriesRef.current.get(selectedId)?.object : undefined;
            if (selected) canvas.setActiveObject(selected);
            else canvas.discardActiveObject();
            canvas.backgroundColor = bgColor === 'transparent'
                ? ''
                : bgColor === 'black' ? '#111111' : bgColor;
            canvas.requestRenderAll();
            syncingRef.current = false;
        });

        return () => {
            cancelled = true;
            if (generationRef.current === nextGeneration) generationRef.current += 1;
            syncingRef.current = false;
        };
    }, [bgColor, layers, ready, selectedId]);

    const gridVisible = showGrid || interacting;
    const gridStyle = useMemo<React.CSSProperties>(() => ({
        backgroundImage: [
            'linear-gradient(to right, rgba(201,169,110,0.28) 1px, transparent 1px)',
            'linear-gradient(to bottom, rgba(201,169,110,0.28) 1px, transparent 1px)',
        ].join(','),
        backgroundSize: '10% 10%',
    }), []);

    return (
        <div
            className="relative overflow-hidden shadow-2xl ring-1 ring-white/15"
            style={{ width: displaySize.width, height: displaySize.height }}
            data-testid="fabric-canvas-stage"
            data-ready={ready ? 'true' : 'false'}
            data-layer-count={layers.length}
            data-selected-layer={selectedId ?? ''}
            aria-label="Lienzo editable"
            onDragOver={event => {
                event.preventDefault();
                event.stopPropagation();
            }}
            onDrop={event => {
                event.preventDefault();
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                onDrop(
                    event,
                    (event.clientX - rect.left) / Math.max(rect.width, 1),
                    (event.clientY - rect.top) / Math.max(rect.height, 1),
                );
            }}
        >
            <canvas ref={elementRef} />
            {gridVisible && (
                <div className="pointer-events-none absolute inset-0 z-10" style={gridStyle} aria-hidden="true">
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#C9A96E]/70" />
                    <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[#C9A96E]/70" />
                </div>
            )}
            {!ready && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#0D0D12] text-xs text-white/50">
                    Preparando lienzo…
                </div>
            )}
        </div>
    );
}
