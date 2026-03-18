'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    X, Download, RotateCcw, Sun, Crop as CropIcon, Wand2, Loader2, Check,
    RotateCw, Save, ImageIcon, Grid, ArrowLeft, Undo2,
    Play, ChevronLeft, ChevronRight, CheckSquare2, Globe2,
    PanelRightClose, PanelRightOpen, PenLine, Eye, EyeOff, ArrowLeftRight, Type,
} from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { uploadEditedPhotoAction, replaceEditedPhotoAction } from '@/app/actions/patient-files-drive';
import { type CanvasLayer, type CanvasRatio, RATIOS as CANVAS_RATIOS, loadImage as loadCanvasImage, makeLayer as makeCanvasLayer, getLayerCorners, hitTestCorner as hitTestLayerCorner, hitTestLayerBody } from './CanvasCompositor';

interface PhotoStudioModalProps {
    file: DriveFile | null;
    folderId: string;
    allFolderFiles: DriveFile[];   // images in same folder — for thumbnail strip
    canSave: boolean;              // whether the current user can write to Drive
    onClose: () => void;
    onSaved: () => void;           // called after successful save → triggers folder refresh
}

type BgColor = 'transparent' | 'white' | 'black';

type DrawColor = 'white' | 'yellow' | 'cyan' | 'red';

interface DrawPoint {
    x: number;       // normalized 0–1
    y: number;       // normalized 0–1
    smooth: boolean; // true = Catmull-Rom tangent, false = sharp corner
}

interface DrawShape {
    id: string;
    points: DrawPoint[];
    closed: boolean;
    color: DrawColor;
    strokeStyle?: string;    // persisted per-shape so styles can coexist
    children?: DrawShape[];  // set only on group shapes
}

interface TextAnnotation {
    id: string;
    x: number;    // normalized 0–1
    y: number;    // normalized 0–1
    text: string;
    color: DrawColor;
    width: number; // normalized 0–1 — controls the wrap box width
}

const TEXT_LINE_HEIGHT = 1.35; // em — must match CSS in the textarea overlay

function wrapTextCanvas(ctx: CanvasRenderingContext2D, text: string, maxWidthPx: number): string[] {
    const result: string[] = [];
    for (const paragraph of text.split('\n')) {
        if (!paragraph) { result.push(''); continue; }
        const words = paragraph.split(' ');
        let line = '';
        for (const word of words) {
            const test = line ? `${line} ${word}` : word;
            if (line && ctx.measureText(test).width > maxWidthPx) {
                result.push(line);
                line = word;
            } else {
                line = test;
            }
        }
        result.push(line);
    }
    return result.length ? result : [''];
}

function getDrawColorHex(color: DrawColor): string {
    switch (color) {
        case 'white':  return '#ffffff';
        case 'yellow': return '#FFE566';
        case 'cyan':   return '#66E5FF';
        case 'red':    return '#FF5566';
    }
}

// Convert Catmull-Rom control points to cubic bezier control points.
// Returns [cp1x, cp1y, cp2x, cp2y] for the segment from P1 to P2.
function catmullRomToBezier(
    p0x: number, p0y: number,
    p1x: number, p1y: number,
    p2x: number, p2y: number,
    p3x: number, p3y: number,
): [number, number, number, number] {
    const t = 0.5;
    return [
        p1x + (p2x - p0x) * t / 3,
        p1y + (p2y - p0y) * t / 3,
        p2x - (p3x - p1x) * t / 3,
        p2y - (p3y - p1y) * t / 3,
    ];
}

// Evaluate a cubic bezier at parameter t (0–1)
function cubicBezierVal(p0: number, cp1: number, cp2: number, p3: number, t: number): number {
    const mt = 1 - t;
    return mt*mt*mt*p0 + 3*mt*mt*t*cp1 + 3*mt*t*t*cp2 + t*t*t*p3;
}

/**
 * Snaps (toX, toY) to the nearest 45° angle from (fromX, fromY).
 * Used for Shift-constrained drawing (0°, 45°, 90°, 135°, 180°, …).
 */
function snapTo45(fromX: number, fromY: number, toX: number, toY: number): [number, number] {
    const dx = toX - fromX, dy = toY - fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1e-6) return [toX, toY];
    const angle = Math.atan2(dy, dx);
    const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
    return [fromX + dist * Math.cos(snapped), fromY + dist * Math.sin(snapped)];
}

/**
 * Fills a variable-width stroke as a smooth polygon strip.
 * Each dot has its own radius; perpendiculars are computed per point.
 * Works for both open and closed paths.
 */
function fillStrokePolygon(
    ctx: CanvasRenderingContext2D,
    dots: { sx: number; sy: number }[],
    radii: number[],
    closed: boolean,
    offsetX = 0,
    offsetY = 0,
) {
    const D = dots.length;
    if (D < 2) return;
    // Compute perpendicular unit vector at each point
    const px: number[] = new Array(D);
    const py: number[] = new Array(D);
    for (let i = 0; i < D; i++) {
        const ai = closed ? (i - 1 + D) % D : Math.max(0, i - 1);
        const bi = closed ? (i + 1) % D : Math.min(D - 1, i + 1);
        const dx = dots[bi].sx - dots[ai].sx;
        const dy = dots[bi].sy - dots[ai].sy;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        px[i] = -dy / len;
        py[i] = dx / len;
    }
    ctx.beginPath();
    // Right side forward
    ctx.moveTo(dots[0].sx + px[0] * radii[0] + offsetX, dots[0].sy + py[0] * radii[0] + offsetY);
    for (let i = 1; i < D; i++) {
        ctx.lineTo(dots[i].sx + px[i] * radii[i] + offsetX, dots[i].sy + py[i] * radii[i] + offsetY);
    }
    // Left side backward
    for (let i = D - 1; i >= 0; i--) {
        ctx.lineTo(dots[i].sx - px[i] * radii[i] + offsetX, dots[i].sy - py[i] * radii[i] + offsetY);
    }
    ctx.closePath();
    ctx.fill();
}

/**
 * Renders the fill geometry of a finished (non-current) DrawShape.
 * Caller is responsible for ctx.save/restore and shadow settings.
 */
function renderFinishedShapeGeometry(
    ctx: CanvasRenderingContext2D,
    shape: DrawShape,
    W: number,
    H: number,
    displayScale: number,
) {
    const pts = shape.points;
    const n = pts.length;
    if (n < 1) return;
    const MAX_R = 1.0 * displayScale;
    const MIN_R = 0.1 * displayScale;
    const RAMP  = 0.18;
    const STEPS = 18;
    const segCount = shape.closed ? n : n - 1;
    const getP0 = (i: number) => !shape.closed && i === 0 ? pts[0] : pts[(i - 1 + n) % n];
    const getP3 = (i: number) => !shape.closed && i === segCount - 1 ? pts[n - 1] : pts[(i + 2) % n];

    const shapeStyle = shape.strokeStyle || 'taper';
    const color = getDrawColorHex(shape.color);

    if (segCount > 0) {
        const dots: { sx: number; sy: number }[] = [];
        for (let i = 0; i < segCount; i++) {
            const p0 = getP0(i), p1 = pts[i];
            const p2 = pts[(i + 1) % n], p3 = getP3(i);
            const x1 = p1.x * W, y1 = p1.y * H;
            const x2 = p2.x * W, y2 = p2.y * H;
            const startStep = i === 0 ? 0 : 1;
            for (let s = startStep; s <= STEPS; s++) {
                const u = s / STEPS;
                let sx: number, sy: number;
                if (p1.smooth && p2.smooth && n >= 3) {
                    const [cp1x, cp1y, cp2x, cp2y] = catmullRomToBezier(
                        p0.x * W, p0.y * H, x1, y1, x2, y2, p3.x * W, p3.y * H
                    );
                    sx = cubicBezierVal(x1, cp1x, cp2x, x2, u);
                    sy = cubicBezierVal(y1, cp1y, cp2y, y2, u);
                } else {
                    sx = x1 + (x2 - x1) * u;
                    sy = y1 + (y2 - y1) * u;
                }
                dots.push({ sx, sy });
            }
        }
        const D = dots.length;
        if (D < 2) return;

        if (shapeStyle === 'taper') {
            const radii = new Array(D).fill(MAX_R);
            if (!shape.closed) {
                for (let di = 0; di < D; di++) {
                    const t = di / (D - 1);
                    const raw = Math.min(t / RAMP, (1 - t) / RAMP, 1);
                    radii[di] = MIN_R + (MAX_R - MIN_R) * (raw * raw * (3 - 2 * raw));
                }
            }
            ctx.fillStyle = color; ctx.globalAlpha = 1;
            fillStrokePolygon(ctx, dots, radii, shape.closed);

        } else if (shapeStyle === 'velocity') {
            const spd = dots.map((_, di) => {
                const a = dots[Math.max(0, di - 1)], b = dots[Math.min(D - 1, di + 1)];
                const dx = b.sx - a.sx, dy = b.sy - a.sy;
                return Math.sqrt(dx * dx + dy * dy);
            });
            const ss = spd.map((_, di) => {
                let sum = 0;
                for (let k = -2; k <= 2; k++) sum += spd[Math.max(0, Math.min(D - 1, di + k))];
                return sum / 5;
            });
            const sMin = Math.min(...ss), sMax = Math.max(...ss);
            const sRange = Math.max(sMax - sMin, sMax * 0.6) || 1;
            const radii = ss.map(s => MAX_R * 2 * (1 - Math.min((s - sMin) / sRange, 1) * 0.9));
            ctx.fillStyle = color; ctx.globalAlpha = 1;
            fillStrokePolygon(ctx, dots, radii, shape.closed);

        } else if (shapeStyle === 'nib') {
            const NIB_ANGLE = Math.PI / 4;
            const radii = dots.map((_, di) => {
                const a = dots[Math.max(0, di - 1)], b = dots[Math.min(D - 1, di + 1)];
                const angle = Math.atan2(b.sy - a.sy, b.sx - a.sx);
                return MIN_R + (MAX_R * 2.5 - MIN_R) * Math.abs(Math.sin(angle - NIB_ANGLE));
            });
            ctx.fillStyle = color; ctx.globalAlpha = 1;
            fillStrokePolygon(ctx, dots, radii, shape.closed);

        } else if (shapeStyle === 'brush') {
            const baseRadii = dots.map((_, di) => {
                if (!shape.closed) {
                    const t = di / (D - 1);
                    const raw = Math.min(t / RAMP, (1 - t) / RAMP, 1);
                    return MIN_R + (MAX_R - MIN_R) * (raw * raw * (3 - 2 * raw));
                }
                return MAX_R;
            });
            ctx.fillStyle = color;
            ctx.globalAlpha = 0.12; fillStrokePolygon(ctx, dots, baseRadii.map(r => r * 3.0), shape.closed);
            ctx.globalAlpha = 0.28; fillStrokePolygon(ctx, dots, baseRadii.map(r => r * 1.8), shape.closed);
            ctx.globalAlpha = 0.90; fillStrokePolygon(ctx, dots, baseRadii, shape.closed);
            ctx.globalAlpha = 1;

        } else {
            // pencil: 3 thin offset passes, graphite feel
            const thinR = dots.map(() => MAX_R * 0.35);
            ctx.fillStyle = color;
            for (const [ox, oy, alpha] of [
                [-1.2 * displayScale, -0.4 * displayScale, 0.55],
                [0, 0, 0.75],
                [1.0 * displayScale,  0.5 * displayScale, 0.45],
            ] as [number, number, number][]) {
                ctx.globalAlpha = alpha;
                fillStrokePolygon(ctx, dots, thinR, shape.closed, ox, oy);
            }
            ctx.globalAlpha = 1;
        }
    } else if (n === 1) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pts[0].x * W, pts[0].y * H, MAX_R, 0, Math.PI * 2);
        ctx.fill();
    }
}

function isImageFile(file: DriveFile): boolean {
    return file.mimeType.toLowerCase().startsWith('image/');
}

// Custom rotation cursor — circular arrow SVG, hotspot at center (10,10)
const ROTATION_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20">' +
    '<path d="M10 3 A7 7 0 1 1 3 10" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/>' +
    '<polygon points="0,8 3,15 6,8" fill="white"/>' +
    '<path d="M10 3 A7 7 0 1 1 3 10" stroke="black" stroke-width="0.7" fill="none" stroke-linecap="round"/>' +
    '<polygon points="0,8 3,15 6,8" fill="none" stroke="black" stroke-width="0.5"/>' +
    '</svg>'
)}") 10 10, crosshair`;

export default function PhotoStudioModal({
    file,
    folderId,
    allFolderFiles,
    canSave,
    onClose,
    onSaved,
}: PhotoStudioModalProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const objectUrlRef = useRef<string | null>(null);
    const preBgUrlRef = useRef<string | null>(null); // URL before bg removal (for undo)
    const preCropImageRef = useRef<string | null>(null);  // full image (rotation-baked) used as crop source; stays until reset
    const prevCroppedUrlRef = useRef<string | null>(null); // cropped imageUrl saved when entering re-crop (for cancel)
    const canvasContainerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number; startY: number; startPanX: number; startPanY: number } | null>(null);
    const touchRef = useRef<{ dist: number; startZoom: number } | null>(null);
    const cancelBgRef = useRef(false);
    const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const originalImgForRestoreRef = useRef<HTMLImageElement | null>(null);
    const brushCanvasRef = useRef<HTMLCanvasElement>(null);
    const brushDrawingRef = useRef(false);
    const drawCanvasRef = useRef<HTMLCanvasElement>(null);
    const dragStateRef = useRef<{ shapeId: string; pointIdx: number } | null>(null);
    const shapeDragRef = useRef<{ shapeId: string; lastNx: number; lastNy: number } | null>(null);
    const cornerDragRef = useRef<{
        corner: 0 | 1 | 2 | 3;
        anchorNx: number; anchorNy: number;
        origCornerNx: number; origCornerNy: number;
        origPoints: DrawPoint[];
    } | null>(null);
    const rotationDragRef = useRef<{
        shapeId: string;
        centerNx: number; centerNy: number;
        startAngle: number;
        origPoints: DrawPoint[];
    } | null>(null);
    const didDragRef = useRef(false);
    // Per-file state cache — persists draws/rotation/brightness across photo navigation
    type FileEditState = {
        rotation: number; brightness: number;
        drawShapes: DrawShape[]; textAnnotations: TextAnnotation[];
    };
    const fileStatesRef = useRef<Map<string, FileEditState>>(new Map());
    // Stable refs for arrow-key handler (avoids stale closure)
    const drawModeRef = useRef<DrawMode>('idle');
    const selectedShapeIdRef = useRef<string | null>(null);

    type DrawMode = 'idle' | 'drawing' | 'selected' | 'editing';
    const [drawMode, setDrawMode] = useState<DrawMode>('idle');
    const [drawVisible, setDrawVisible] = useState(true);
    const [drawColor, setDrawColor] = useState<DrawColor>('white');
    const [drawShapes, setDrawShapes] = useState<DrawShape[]>([]);
    const [currentPoints, setCurrentPoints] = useState<DrawPoint[]>([]);
    const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
    const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
    const [mousePos, setMousePos] = useState<[number, number] | null>(null);
    const [drawClipboard, setDrawClipboard] = useState<DrawShape | null>(null);

    // ── Canvas compositor state ────────────────────────────────────────────────
    const [canvasActive, setCanvasActive] = useState(false);
    const [canvasLayers, setCanvasLayers] = useState<CanvasLayer[]>([]);
    const [canvasRatio, setCanvasRatio] = useState<CanvasRatio>('1:1');
    const [canvasSelectedId, setCanvasSelectedId] = useState<string | null>(null);
    const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
    const canvasLayersRef = useRef<HTMLCanvasElement>(null);
    const canvasLayerDragRef = useRef<{
        layerId: string;
        mode: 'move' | 'resize' | 'rotate';
        startX: number; startY: number;
        origLayer: CanvasLayer;
    } | null>(null);

    // Stroke style
    type StrokeStyle = 'taper' | 'velocity' | 'nib' | 'brush' | 'pencil';
    const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>('brush');

    // Text annotation state
    const [textAnnotations, setTextAnnotations] = useState<TextAnnotation[]>([]);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [textToolActive, setTextToolActive] = useState(false);
    const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
    const textDragRef = useRef<{ id: string; lastNx: number; lastNy: number } | null>(null);
    const textResizeDragRef = useRef<{ id: string; startNx: number; startWidth: number } | null>(null);
    const textMetricsRef = useRef<Map<string, { hNorm: number }>>(new Map());
    const justFinishedEditRef = useRef<string | null>(null); // guards against blur-then-click creating new text

    const [zoom, setZoom] = useState(1);
    const zoomRef = useRef(1); // mirrors zoom for non-reactive wheel handler
    useEffect(() => { zoomRef.current = zoom; }, [zoom]);
    useEffect(() => { drawModeRef.current = drawMode; }, [drawMode]);
    useEffect(() => { selectedShapeIdRef.current = selectedShapeId; }, [selectedShapeId]);
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [showGrid, setShowGrid] = useState(false);

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

    const [brushMode, setBrushMode] = useState<'restore' | 'erase' | null>(null);
    const [brushSize, setBrushSize] = useState(40);

    // Undo history — each entry is a snapshot before a destructive op
    type Snapshot = { imageUrl: string; rotation: number; brightness: number; bgDone: boolean; bgColor: BgColor };
    const [history, setHistory] = useState<Snapshot[]>([]);

    // UI state
    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // Image files for the thumbnail strip (only images)
    const imageFiles = allFolderFiles.filter(isImageFile);

    // Always-current navigate function — used by wheel handler + arrow keys
    const switchToAdjacentRef = useRef<(dir: 1 | -1) => void>(() => {});
    useEffect(() => {
        switchToAdjacentRef.current = (dir: 1 | -1) => {
            if (imageFiles.length <= 1) return;
            const idx = imageFiles.findIndex(f => f.id === activeFile?.id);
            if (idx === -1) return;
            const nextIdx = Math.max(0, Math.min(imageFiles.length - 1, idx + dir));
            const next = imageFiles[nextIdx];
            if (next && next.id !== activeFile?.id) handleSwitchFile(next);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageFiles, activeFile?.id]);

    // Tools panel visibility
    const [toolsHidden, setToolsHidden] = useState(false);

    // Multi-select + web download state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [downloadingWeb, setDownloadingWeb] = useState(false);

    // Presentation mode state
    const [presentationMode, setPresentationMode] = useState(false);
    const [presentationIdx, setPresentationIdx] = useState(0);

    const isDirty =
        rotation !== 0 ||
        brightness !== 100 ||
        bgDone ||
        imageUrl.startsWith('blob:') ||
        drawShapes.length > 0 ||
        currentPoints.length > 0 ||
        textAnnotations.length > 0;

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
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setShowGrid(false);
        setBrushMode(null);
        offscreenCanvasRef.current = null;
        originalImgForRestoreRef.current = null;
        preCropImageRef.current = null;
        prevCroppedUrlRef.current = null;
        setHistory([]);
        setDrawMode('idle');
        setDrawShapes([]);
        setCurrentPoints([]);
        setSelectedShapeId(null);
        setMousePos(null);
        setTextAnnotations([]);
        setEditingTextId(null);
        setTextToolActive(false);
        setSelectedTextId(null);
        textMetricsRef.current.clear();
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

    // Keyboard navigation for presentation mode
    useEffect(() => {
        if (!presentationMode) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                setPresentationIdx(i => Math.min(i + 1, imageFiles.length - 1));
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                setPresentationIdx(i => Math.max(i - 1, 0));
            } else if (e.key === 'Escape') {
                setPresentationMode(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [presentationMode, imageFiles.length]);

    // Arrow-key navigation in normal studio view (mirrors presentation mode arrows)
    useEffect(() => {
        if (presentationMode) return; // presentation mode has its own handler
        const handler = (e: KeyboardEvent) => {
            if (editingTextId) return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            const isArrow = ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown'].includes(e.key);
            if (!isArrow) return;
            e.preventDefault();

            // If a shape is selected → nudge it instead of navigating
            const shapeId = selectedShapeIdRef.current;
            if (drawModeRef.current === 'selected' && shapeId) {
                const NUDGE = 0.002;
                const dx = e.key === 'ArrowRight' ? NUDGE : e.key === 'ArrowLeft' ? -NUDGE : 0;
                const dy = e.key === 'ArrowDown'  ? NUDGE : e.key === 'ArrowUp'   ? -NUDGE : 0;
                const mv = (pts: DrawPoint[]) => pts.map(p => ({
                    ...p,
                    x: Math.max(0, Math.min(1, p.x + dx)),
                    y: Math.max(0, Math.min(1, p.y + dy)),
                }));
                setDrawShapes(shapes => shapes.map(s => {
                    if (s.id !== shapeId) return s;
                    if (s.children) return { ...s, children: s.children.map(c => ({ ...c, points: mv(c.points) })) };
                    return { ...s, points: mv(s.points) };
                }));
                return;
            }

            // Otherwise navigate photos
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                switchToAdjacentRef.current(1);
            } else {
                switchToAdjacentRef.current(-1);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [presentationMode, editingTextId]);

    // Non-passive wheel + touch handlers (prevents page scroll / browser pinch-zoom interference)
    useEffect(() => {
        const el = canvasContainerRef.current;
        if (!el) return;

        const wheelHandler = (e: WheelEvent) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            setZoom(prev => {
                const next = Math.min(5, Math.max(1, prev + delta));
                if (next <= 1) { setPanX(0); setPanY(0); }
                return next;
            });
        };

        // Non-passive touch handlers prevent browser default pinch-zoom interference
        const nativeTouchStart = (e: TouchEvent) => {
            if (e.touches.length >= 2) e.preventDefault();
        };
        const nativeTouchMove = (e: TouchEvent) => {
            if (e.touches.length >= 2) e.preventDefault();
        };

        el.addEventListener('wheel', wheelHandler, { passive: false });
        el.addEventListener('touchstart', nativeTouchStart, { passive: false });
        el.addEventListener('touchmove', nativeTouchMove, { passive: false });

        return () => {
            el.removeEventListener('wheel', wheelHandler);
            el.removeEventListener('touchstart', nativeTouchStart);
            el.removeEventListener('touchmove', nativeTouchMove);
        };
    }, []);

    // Keyboard shortcut: Cmd/Ctrl+Z → undo
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                handleUndo();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history]);

    // Keyboard shortcut: Cmd+C / Cmd+V for draw shape copy/paste
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!e.metaKey && !e.ctrlKey) return;
            if (e.key === 'c' && selectedShapeId) {
                const shape = drawShapes.find(s => s.id === selectedShapeId);
                if (shape) setDrawClipboard(shape);
            }
            if (e.key === 'v' && drawClipboard) {
                const OFFSET = 0.02;
                const newShape: DrawShape = {
                    ...drawClipboard,
                    id: `shape-${Date.now()}`,
                    points: drawClipboard.points.map(p => ({
                        ...p,
                        x: Math.min(1, p.x + OFFSET),
                        y: Math.min(1, p.y + OFFSET),
                    })),
                };
                setDrawShapes(prev => [...prev, newShape]);
                setSelectedShapeId(newShape.id);
                setDrawMode('editing');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedShapeId, drawShapes, drawClipboard]);

    // Keyboard shortcut: Delete / Backspace → delete selected shape or text annotation
    // Escape while drawing → cancel current in-progress path
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (e.key === 'Escape' && drawMode === 'drawing') {
                e.preventDefault();
                setCurrentPoints([]);
                setMousePos(null);
                return;
            }
            if (e.key !== 'Delete' && e.key !== 'Backspace') return;
            if (editingTextId) return;
            if (selectedShapeId && (drawMode === 'selected' || drawMode === 'editing')) {
                e.preventDefault();
                setDrawShapes(prev => prev.filter(s => s.id !== selectedShapeId));
                setSelectedShapeId(null);
                setDrawMode('idle');
                return;
            }
            if (selectedTextId) {
                e.preventDefault();
                setTextAnnotations(prev => prev.filter(t => t.id !== selectedTextId));
                setSelectedTextId(null);
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedShapeId, drawMode, selectedTextId, editingTextId]);

    function handleSwitchFile(newFile: DriveFile) {
        if (newFile.id === activeFile?.id) return;
        // Save current photo's editable state before switching
        if (activeFile) {
            fileStatesRef.current.set(activeFile.id, {
                rotation, brightness, drawShapes, textAnnotations,
            });
        }
        // Reset and restore saved state for the new file (if any)
        resetEdits();
        const saved = fileStatesRef.current.get(newFile.id);
        if (saved) {
            setRotation(saved.rotation);
            setBrightness(saved.brightness);
            setDrawShapes(saved.drawShapes);
            setTextAnnotations(saved.textAnnotations);
        }
        setActiveFile(newFile);
        setImageUrl(`/api/drive/file/${newFile.id}`);
    }

    function handleMouseDown(e: React.MouseEvent) {
        if (zoom <= 1) return;
        if (drawMode !== 'idle') return; // draw tool active — don't pan
        e.preventDefault();
        dragRef.current = { startX: e.clientX, startY: e.clientY, startPanX: panX, startPanY: panY };
        setIsDragging(true);
    }

    function handleMouseMove(e: React.MouseEvent) {
        if (!dragRef.current) return;
        const dx = (e.clientX - dragRef.current.startX) / zoom;
        const dy = (e.clientY - dragRef.current.startY) / zoom;
        const newPanX = dragRef.current.startPanX + dx;
        const newPanY = dragRef.current.startPanY + dy;
        // Clamp so image can't be dragged fully off screen
        const container = canvasContainerRef.current;
        if (container) {
            const maxX = (container.clientWidth  * (zoom - 1)) / (2 * zoom);
            const maxY = (container.clientHeight * (zoom - 1)) / (2 * zoom);
            setPanX(Math.max(-maxX, Math.min(maxX, newPanX)));
            setPanY(Math.max(-maxY, Math.min(maxY, newPanY)));
        } else {
            setPanX(newPanX);
            setPanY(newPanY);
        }
    }

    function handleMouseUp() {
        dragRef.current = null;
        setIsDragging(false);
    }

    function getTouchDist(touches: React.TouchList): number {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function handleTouchStart(e: React.TouchEvent) {
        if (e.touches.length >= 1) {
            // Cancel any active mouse drag when touch begins
            dragRef.current = null;
            setIsDragging(false);
        }
        if (e.touches.length === 2) {
            touchRef.current = { dist: getTouchDist(e.touches), startZoom: zoom };
        }
    }

    function handleTouchMove(e: React.TouchEvent) {
        if (e.touches.length === 2 && touchRef.current) {
            const newDist = getTouchDist(e.touches);
            const scale = newDist / touchRef.current.dist;
            const next = Math.min(5, Math.max(1, touchRef.current.startZoom * scale));
            if (next <= 1) { setPanX(0); setPanY(0); }
            setZoom(next);
        }
    }

    function handleTouchEnd() {
        touchRef.current = null;
    }

    function pushHistory(snap?: Snapshot) {
        const entry = snap ?? { imageUrl, rotation, brightness, bgDone, bgColor };
        setHistory(prev => [...prev.slice(-19), entry]);
    }

    function handleUndo() {
        setHistory(prev => {
            if (prev.length === 0) return prev;
            const snap = prev[prev.length - 1];
            objectUrlRef.current = snap.imageUrl.startsWith('blob:') ? snap.imageUrl : null;
            setImageUrl(snap.imageUrl);
            setRotation(snap.rotation);
            setBrightness(snap.brightness);
            setBgDone(snap.bgDone);
            setBgColor(snap.bgColor);
            setCropActive(false);
            setCompletedCrop(null);
            setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
            setBrushMode(null);
            // preCropImageRef stays valid — user can still re-crop from full image after undo
            return prev.slice(0, -1);
        });
    }

    async function handleRemoveBackground() {
        cancelBgRef.current = false;
        setBgProcessing(true);
        preBgUrlRef.current = imageUrl; // save for undo
        try {
            const { removeBackground: removeBg } = await import('@imgly/background-removal');
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const resultBlob = await removeBg(blob);
            if (cancelBgRef.current) {
                preBgUrlRef.current = null;
                return;
            }
            pushHistory();
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            const newUrl = URL.createObjectURL(resultBlob);
            objectUrlRef.current = newUrl;
            preCropImageRef.current = null; // bg changed — crop reference must be refreshed
            setImageUrl(newUrl);
            setBgDone(true);
            setBgColor('transparent');
            initBrushCanvas(newUrl, preBgUrlRef.current!);
        } catch (err) {
            console.error('[bg-removal]', err);
            if (!cancelBgRef.current) {
                toast.error('Error al remover fondo');
            }
            preBgUrlRef.current = null;
        } finally {
            cancelBgRef.current = false;
            setBgProcessing(false);
        }
    }

    function handleCancelBgProcessing() {
        cancelBgRef.current = true;
        preBgUrlRef.current = null;
        setBgProcessing(false);
    }

    function initBrushCanvas(bgRemovedUrl: string, origUrl: string) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const oc = document.createElement('canvas');
            oc.width = img.naturalWidth;
            oc.height = img.naturalHeight;
            oc.getContext('2d')!.drawImage(img, 0, 0);
            offscreenCanvasRef.current = oc;
        };
        img.src = bgRemovedUrl;
        const origImg = new Image();
        origImg.crossOrigin = 'anonymous';
        origImg.src = origUrl;
        originalImgForRestoreRef.current = origImg;
    }

    async function handleConfirmBg() {
        // Push history pointing to the PRE-bg-removal URL so Undo cleanly
        // restores the original image (the bg-removed blob gets revoked below).
        pushHistory({
            imageUrl: preBgUrlRef.current ?? imageUrl,
            rotation, brightness,
            bgDone: false, bgColor: 'transparent',
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            el.crossOrigin = 'anonymous';
            el.onload = () => resolve(el);
            el.onerror = reject;
            el.src = imageUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        if (bgColor === 'white') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else if (bgColor === 'black') {
            ctx.fillStyle = '#111111';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(img, 0, 0);
        const isPng = bgColor === 'transparent';
        canvas.toBlob(blob => {
            if (!blob) return;
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            const newUrl = URL.createObjectURL(blob);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            setBgDone(false);
            setBgColor('transparent');
            setBrushMode(null);
            offscreenCanvasRef.current = null;
            preBgUrlRef.current = null;
            preCropImageRef.current = null;
        }, isPng ? 'image/png' : 'image/jpeg', 0.95);
    }

    function handleUndoBgRemoval() {
        const prev = preBgUrlRef.current;
        if (!prev) return;
        setBrushMode(null);
        offscreenCanvasRef.current = null;
        // Revoke the bg-removed object URL
        if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        // Restore: if prev was itself an object URL keep tracking it, else clear ref
        objectUrlRef.current = prev.startsWith('blob:') ? prev : null;
        setImageUrl(prev);
        preBgUrlRef.current = null;
        setBgDone(false);
        setBgColor('transparent');
    }

    useEffect(() => {
        if (!brushMode) return;
        const oc = offscreenCanvasRef.current;
        const vc = brushCanvasRef.current;
        if (!oc || !vc) return;
        const sync = () => {
            if (oc.width === 0) { requestAnimationFrame(sync); return; }
            vc.width = oc.width;
            vc.height = oc.height;
            vc.getContext('2d')!.drawImage(oc, 0, 0);
        };
        sync();
    }, [brushMode]);

    // Redraw annotation layer whenever shapes or visibility change
    useEffect(() => {
        const canvas = drawCanvasRef.current;
        let W: number, H: number, displayScale: number;
        if (canvasActive) {
            // In canvas mode: size draw canvas to match the layers canvas (display pixels)
            const layersCanvas = canvasLayersRef.current;
            if (!canvas || !layersCanvas || !layersCanvas.clientWidth) return;
            W = layersCanvas.clientWidth;
            H = layersCanvas.clientHeight;
            displayScale = 1; // already in display pixels
        } else {
            const img = imgRef.current;
            if (!canvas || !img) return;
            W = img.naturalWidth || img.width;
            H = img.naturalHeight || img.height;
            if (W === 0 || H === 0) return;
            const rect = canvas.getBoundingClientRect();
            displayScale = rect.width > 0 ? W / rect.width : 1;
        }
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);
        if (!drawVisible) return;
        const rect = canvas.getBoundingClientRect();
        // Stroke radius constants (natural pixels)
        const MAX_R = 1.0 * displayScale; // widest point
        const MIN_R = 0.1 * displayScale; // tip radius for taper
        const RAMP = 0.18; // fraction of path length for taper ramp
        const STEPS = 18; // samples per segment for smooth dot sampling

        const allShapes: DrawShape[] = [...drawShapes];
        if (currentPoints.length > 0) {
            allShapes.push({ id: '__current__', points: currentPoints, closed: false, color: drawColor, strokeStyle });
        }

        for (const shape of allShapes) {
            const isSelected = shape.id === selectedShapeId;

            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = 3 * displayScale;

            // ── GROUP shape: render children, show combined selection bbox ───
            if (shape.children && shape.children.length > 0) {
                for (const child of shape.children) {
                    renderFinishedShapeGeometry(ctx, child, W, H, displayScale);
                }
                if (drawMode === 'selected' && isSelected) {
                    const allPts = shape.children.flatMap(c => c.points);
                    if (allPts.length > 0) {
                        const xs = allPts.map(p => p.x * W);
                        const ys = allPts.map(p => p.y * H);
                        const pad = 10 * displayScale;
                        ctx.save();
                        ctx.strokeStyle = '#C9A96E';
                        ctx.lineWidth = 1.5 * displayScale;
                        ctx.setLineDash([5 * displayScale, 4 * displayScale]);
                        ctx.globalAlpha = 0.8;
                        ctx.shadowBlur = 0;
                        ctx.strokeRect(
                            Math.min(...xs) - pad, Math.min(...ys) - pad,
                            Math.max(...xs) - Math.min(...xs) + pad * 2,
                            Math.max(...ys) - Math.min(...ys) + pad * 2,
                        );
                        ctx.restore();
                    }
                }
                ctx.restore();
                continue;
            }

            if (shape.points.length < 1) { ctx.restore(); continue; }
            const pts = shape.points;
            const n = pts.length;
            const segCount = shape.closed ? n : n - 1;

            const getP0 = (i: number) =>
                !shape.closed && i === 0 ? pts[0] : pts[(i - 1 + n) % n];
            const getP3 = (i: number) =>
                !shape.closed && i === segCount - 1 ? pts[n - 1] : pts[(i + 2) % n];

            if (shape.id === '__current__') {
                // ── In-progress: clean bezier stroke ─────────────────────────
                ctx.strokeStyle = getDrawColorHex(shape.color);
                ctx.lineWidth = MAX_R * 2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                if (segCount > 0) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x * W, pts[0].y * H);
                    for (let i = 0; i < segCount; i++) {
                        const p0 = getP0(i), p1 = pts[i];
                        const p2 = pts[(i + 1) % n], p3 = getP3(i);
                        const x1 = p1.x * W, y1 = p1.y * H;
                        const x2 = p2.x * W, y2 = p2.y * H;
                        if (p1.smooth && p2.smooth && n >= 3) {
                            const [cp1x, cp1y, cp2x, cp2y] = catmullRomToBezier(
                                p0.x * W, p0.y * H, x1, y1, x2, y2, p3.x * W, p3.y * H
                            );
                            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
                        } else {
                            ctx.lineTo(x2, y2);
                        }
                    }
                    ctx.stroke();
                }
            } else {
                // ── Finished shape ────────────────────────────────────────────
                renderFinishedShapeGeometry(ctx, shape, W, H, displayScale);
            }

            // ── Rubber-band dashed line for in-progress shape ────────────────
            if (shape.id === '__current__' && mousePos && n >= 1) {
                const last = pts[n - 1];
                ctx.save();
                ctx.strokeStyle = getDrawColorHex(shape.color);
                ctx.lineWidth = displayScale;
                ctx.setLineDash([4 * displayScale, 4 * displayScale]);
                ctx.globalAlpha = 0.5;
                ctx.shadowBlur = 0;
                ctx.beginPath();
                ctx.moveTo(last.x * W, last.y * H);
                ctx.lineTo(mousePos[0] * W, mousePos[1] * H);
                ctx.stroke();
                ctx.restore();
            }

            // ── First-point close indicator while drawing (≥3 pts) ──────────
            if (shape.id === '__current__' && n >= 3 && drawMode === 'drawing') {
                const first = pts[0];
                const nearFirst = mousePos &&
                    Math.abs(mousePos[0] - first.x) < 14 / (rect.width || 1) &&
                    Math.abs(mousePos[1] - first.y) < 14 / (rect.height || 1);
                ctx.save();
                ctx.shadowBlur = 0;
                ctx.setLineDash([]);
                ctx.strokeStyle = getDrawColorHex(shape.color);
                ctx.lineWidth = 1.5 * displayScale;
                if (nearFirst) {
                    ctx.fillStyle = getDrawColorHex(shape.color);
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath();
                    ctx.arc(first.x * W, first.y * H, 5 * displayScale, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                } else {
                    ctx.globalAlpha = 0.55;
                    ctx.beginPath();
                    ctx.arc(first.x * W, first.y * H, 5 * displayScale, 0, Math.PI * 2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // ── Selection bounding box + corner resize handles ────────────────
            if (drawMode === 'selected' && shape.id !== '__current__' && isSelected) {
                const xs = pts.map(p => p.x * W);
                const ys = pts.map(p => p.y * H);
                const pad = 8 * displayScale;
                const bx = Math.min(...xs) - pad, by = Math.min(...ys) - pad;
                const bw = Math.max(...xs) - Math.min(...xs) + pad * 2;
                const bh = Math.max(...ys) - Math.min(...ys) + pad * 2;
                ctx.save();
                ctx.strokeStyle = getDrawColorHex(shape.color);
                ctx.lineWidth = displayScale;
                ctx.setLineDash([5 * displayScale, 4 * displayScale]);
                ctx.globalAlpha = 0.7;
                ctx.shadowBlur = 0;
                ctx.strokeRect(bx, by, bw, bh);
                ctx.restore();
                // Corner handles
                const CHR = 4 * displayScale;
                const cornerCoords: [number, number][] = [
                    [bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh],
                ];
                for (const [cx, cy] of cornerCoords) {
                    ctx.save();
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = getDrawColorHex(shape.color);
                    ctx.lineWidth = 1.5 * displayScale;
                    ctx.shadowBlur = 0;
                    ctx.setLineDash([]);
                    ctx.fillRect(cx - CHR, cy - CHR, CHR * 2, CHR * 2);
                    ctx.strokeRect(cx - CHR, cy - CHR, CHR * 2, CHR * 2);
                    ctx.restore();
                }
            }

            // ── Handles in edit mode ─────────────────────────────────────────
            if (drawMode === 'editing' && shape.id !== '__current__' && isSelected) {
                const HR = 5 * displayScale;
                for (const pt of pts) {
                    ctx.save();
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = getDrawColorHex(shape.color);
                    ctx.lineWidth = 1.5 * displayScale;
                    ctx.shadowBlur = 0;
                    if (pt.smooth) {
                        ctx.beginPath();
                        ctx.arc(pt.x * W, pt.y * H, HR, 0, Math.PI * 2);
                        ctx.fill(); ctx.stroke();
                    } else {
                        ctx.fillRect(pt.x * W - HR, pt.y * H - HR, HR * 2, HR * 2);
                        ctx.strokeRect(pt.x * W - HR, pt.y * H - HR, HR * 2, HR * 2);
                    }
                    ctx.restore();
                }
            }

            ctx.restore();
        }

        // ── Multi-select highlight (shown while selecting before grouping) ─
        for (const id of multiSelectedIds) {
            const shape = drawShapes.find(s => s.id === id);
            if (!shape || shape.points.length === 0) continue;
            const xs = shape.points.map(p => p.x * W);
            const ys = shape.points.map(p => p.y * H);
            const pad = 8 * displayScale;
            ctx.save();
            ctx.strokeStyle = '#C9A96E';
            ctx.lineWidth = 1.5 * displayScale;
            ctx.setLineDash([4 * displayScale, 3 * displayScale]);
            ctx.globalAlpha = 0.65;
            ctx.shadowBlur = 0;
            ctx.strokeRect(
                Math.min(...xs) - pad, Math.min(...ys) - pad,
                Math.max(...xs) - Math.min(...xs) + pad * 2,
                Math.max(...ys) - Math.min(...ys) + pad * 2,
            );
            ctx.restore();
        }

        // ── Text annotations ─────────────────────────────────────────────────
        if (drawVisible) {
            const fontSize = 24 * displayScale;
            const lineH = fontSize * TEXT_LINE_HEIGHT;
            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
            ctx.textBaseline = 'top';
            textMetricsRef.current.clear();
            for (const ta of textAnnotations) {
                const skip = ta.id === editingTextId;
                const tx = ta.x * W;
                const ty = ta.y * H;
                const maxWidthPx = ta.width * W;
                const lines = wrapTextCanvas(ctx, ta.text || '', maxWidthPx);
                const totalH = lines.length * lineH;
                textMetricsRef.current.set(ta.id, { hNorm: totalH / H });
                if (skip) continue; // HTML textarea handles display while editing
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 5 * displayScale;
                ctx.fillStyle = getDrawColorHex(ta.color);
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], tx, ty + i * lineH);
                }
                const isSelected = ta.id === selectedTextId && textToolActive;
                if (isSelected) {
                    const ds = displayScale;
                    ctx.shadowBlur = 0;
                    ctx.setLineDash([3 * ds, 2 * ds]);
                    ctx.strokeStyle = getDrawColorHex(ta.color);
                    ctx.lineWidth = ds;
                    ctx.globalAlpha = 0.6;
                    ctx.strokeRect(tx - 2 * ds, ty - 2 * ds, maxWidthPx + 4 * ds, totalH + 4 * ds);
                    // Resize handle — right edge, vertically centered
                    const hx = tx + maxWidthPx;
                    const hy = ty + totalH / 2;
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = getDrawColorHex(ta.color);
                    ctx.lineWidth = 1.5 * ds;
                    const HR = 5 * ds;
                    ctx.fillRect(hx - HR, hy - HR, HR * 2, HR * 2);
                    ctx.strokeRect(hx - HR, hy - HR, HR * 2, HR * 2);
                }
                ctx.restore();
            }
        }
    }, [drawShapes, currentPoints, drawVisible, drawColor, drawMode, selectedShapeId, mousePos, imageUrl,
        textAnnotations, editingTextId, selectedTextId, textToolActive, strokeStyle, multiSelectedIds, canvasActive]);

    // ── Canvas layers rendering ───────────────────────────────────────────────
    useEffect(() => {
        if (!canvasActive) return;
        const canvas = canvasLayersRef.current;
        if (!canvas || !canvas.clientWidth) return;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        const ctx = canvas.getContext('2d')!;
        const W = canvas.width, H = canvas.height;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
        for (const layer of canvasLayers) {
            const px = layer.x * W, py = layer.y * H;
            const pw = layer.w * W, ph = layer.h * H;
            ctx.save();
            ctx.filter = `brightness(${layer.brightness ?? 100}%)`;
            ctx.translate(px, py);
            ctx.rotate(layer.rotation * Math.PI / 180);
            ctx.drawImage(layer.img, -pw / 2, -ph / 2, pw, ph);
            ctx.restore();
        }
        if (canvasSelectedId) {
            const sel = canvasLayers.find(l => l.id === canvasSelectedId);
            if (sel) {
                const corners = getLayerCorners(sel, W, H);
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
                    ctx.fillRect(x - 4, y - 4, 8, 8);
                    ctx.strokeRect(x - 4, y - 4, 8, 8);
                });
                ctx.restore();
            }
        }
    }, [canvasActive, canvasLayers, canvasSelectedId]);

    // ── Canvas layer interaction ──────────────────────────────────────────────
    function getCanvasLayerNorm(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
        const rect = e.currentTarget.getBoundingClientRect();
        return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
    }

    function handleCanvasLayerPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        const [nx, ny] = getCanvasLayerNorm(e);
        const W = e.currentTarget.clientWidth, H = e.currentTarget.clientHeight;
        for (let i = canvasLayers.length - 1; i >= 0; i--) {
            const layer = canvasLayers[i];
            const ci = hitTestLayerCorner(layer, nx, ny, W, H);
            if (ci >= 0) {
                e.currentTarget.setPointerCapture(e.pointerId);
                canvasLayerDragRef.current = {
                    layerId: layer.id,
                    mode: (e.metaKey || e.ctrlKey) ? 'rotate' : 'resize',
                    startX: nx, startY: ny, origLayer: { ...layer },
                };
                setCanvasSelectedId(layer.id);
                return;
            }
            if (hitTestLayerBody(layer, nx, ny, W, H)) {
                e.currentTarget.setPointerCapture(e.pointerId);
                canvasLayerDragRef.current = { layerId: layer.id, mode: 'move', startX: nx, startY: ny, origLayer: { ...layer } };
                setCanvasSelectedId(layer.id);
                return;
            }
        }
        setCanvasSelectedId(null);
    }

    function handleCanvasLayerPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!canvasLayerDragRef.current) return;
        const [nx, ny] = getCanvasLayerNorm(e);
        const { layerId, mode, startX, startY, origLayer } = canvasLayerDragRef.current;
        const dx = nx - startX, dy = ny - startY;
        setCanvasLayers(prev => prev.map(l => {
            if (l.id !== layerId) return l;
            if (mode === 'move') return {
                ...l,
                x: Math.max(l.w / 2, Math.min(1 - l.w / 2, origLayer.x + dx)),
                y: Math.max(l.h / 2, Math.min(1 - l.h / 2, origLayer.y + dy)),
            };
            if (mode === 'rotate') {
                const angle = Math.atan2(ny - origLayer.y, nx - origLayer.x) - Math.atan2(startY - origLayer.y, startX - origLayer.x);
                return { ...l, rotation: origLayer.rotation + angle * 180 / Math.PI };
            }
            const dist = Math.sqrt(dx * dx + dy * dy) * (dx + dy >= 0 ? 1 : -1);
            const newW = Math.max(0.05, origLayer.w + dist * 1.5);
            return { ...l, w: newW, h: newW / (origLayer.w / (origLayer.h || 1)) };
        }));
    }

    function handleCanvasLayerPointerUp() { canvasLayerDragRef.current = null; }

    async function handleCanvasLayerDrop(e: React.DragEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = (e.clientX - rect.left) / rect.width;
        const dropY = (e.clientY - rect.top) / rect.height;
        const fileId = e.dataTransfer.getData('driveFileId');
        if (fileId) {
            try {
                const img = await loadCanvasImage(`/api/drive/file/${fileId}`);
                setCanvasLayers(prev => [...prev, makeCanvasLayer(img, `/api/drive/file/${fileId}`, fileId, dropX, dropY)]);
            } catch { toast.error('No se pudo cargar la foto'); }
            return;
        }
        const pcFile = e.dataTransfer.files[0];
        if (pcFile?.type.startsWith('image/')) {
            const src = URL.createObjectURL(pcFile);
            try {
                const img = await loadCanvasImage(src);
                setCanvasLayers(prev => [...prev, makeCanvasLayer(img, src, undefined, dropX, dropY)]);
            } catch { URL.revokeObjectURL(src); toast.error('No se pudo cargar la imagen'); }
        }
    }

    function handleCanvasLayerContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const W = e.currentTarget.clientWidth, H = e.currentTarget.clientHeight;
        for (let i = canvasLayers.length - 1; i >= 0; i--) {
            if (hitTestLayerBody(canvasLayers[i], nx, ny, W, H)) {
                setCanvasSelectedId(canvasLayers[i].id);
                setCanvasContextMenu({ x: e.clientX, y: e.clientY, layerId: canvasLayers[i].id });
                return;
            }
        }
    }

    function handleActivateCanvas() {
        setCanvasActive(true);
        setCanvasLayers([]);
        setCanvasSelectedId(null);
        // Reset editor-specific state
        setDrawMode('idle');
        setCropActive(false);
        setBrushMode(null);
    }

    async function exportCanvasToBlob(): Promise<Blob> {
        const r = CANVAS_RATIOS.find(r => r.value === canvasRatio)!;
        const shorter = Math.min(r.w, r.h);
        const expW = Math.round(1080 * r.w / shorter);
        const expH = Math.round(1080 * r.h / shorter);
        const off = document.createElement('canvas');
        off.width = expW; off.height = expH;
        const ctx = off.getContext('2d')!;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, expW, expH);
        for (const layer of canvasLayers) {
            ctx.save();
            ctx.translate(layer.x * expW, layer.y * expH);
            ctx.rotate(layer.rotation * Math.PI / 180);
            ctx.drawImage(layer.img, -layer.w * expW / 2, -layer.h * expH / 2, layer.w * expW, layer.h * expH);
            ctx.restore();
        }
        // Bake draw annotations on top if visible
        if (drawVisible && drawCanvasRef.current && drawCanvasRef.current.width > 0) {
            ctx.drawImage(drawCanvasRef.current, 0, 0, expW, expH);
        }
        return new Promise<Blob>((res, rej) =>
            off.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/jpeg', 0.92)
        );
    }

    function getCanvasRatioStyle(): React.CSSProperties {
        const r = CANVAS_RATIOS.find(r => r.value === canvasRatio)!;
        return {
            display: 'block',
            aspectRatio: `${r.w} / ${r.h}`,
            maxHeight: toolsHidden ? '90vh' : '65vh',
            maxWidth: '100%',
        };
    }

    function getCanvasRatioDims() {
        const r = CANVAS_RATIOS.find(r => r.value === canvasRatio)!;
        return { w: r.w, h: r.h };
    }

    function handleCanvasRatioChange(newRatio: CanvasRatio) {
        const oldR = CANVAS_RATIOS.find(r => r.value === canvasRatio)!;
        const newR = CANVAS_RATIOS.find(r => r.value === newRatio)!;
        setCanvasRatio(newRatio);
        setCanvasLayers(prev => prev.map(l => ({
            ...l,
            x: Math.max(l.w / 2, Math.min(1 - l.w / 2, l.x * oldR.w / newR.w)),
            y: Math.max(l.h / 2, Math.min(1 - l.h / 2, l.y * oldR.h / newR.h)),
        })));
    }

    function getCanvasXY(e: React.PointerEvent<HTMLCanvasElement>) {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) * (canvas.width / rect.width),
            y: (e.clientY - rect.top) * (canvas.height / rect.height),
        };
    }

    function applyBrushAt(canvasEl: HTMLCanvasElement, x: number, y: number) {
        const oc = offscreenCanvasRef.current;
        if (!oc || oc.width === 0) return;
        const octx = oc.getContext('2d')!;
        const scaleX = oc.width / canvasEl.getBoundingClientRect().width;
        const brushPx = brushSize * scaleX;

        if (brushMode === 'erase') {
            octx.save();
            octx.globalCompositeOperation = 'destination-out';
            octx.beginPath();
            octx.arc(x, y, brushPx, 0, Math.PI * 2);
            octx.fill();
            octx.restore();
        } else {
            const origImg = originalImgForRestoreRef.current;
            if (!origImg?.complete) return;
            octx.save();
            octx.beginPath();
            octx.arc(x, y, brushPx, 0, Math.PI * 2);
            octx.clip();
            octx.drawImage(origImg, 0, 0, oc.width, oc.height);
            octx.restore();
        }

        const vctx = canvasEl.getContext('2d')!;
        vctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        vctx.drawImage(oc, 0, 0);
    }

    function handleBrushDown(e: React.PointerEvent<HTMLCanvasElement>) {
        e.currentTarget.setPointerCapture(e.pointerId);
        brushDrawingRef.current = true;
        const { x, y } = getCanvasXY(e);
        applyBrushAt(e.currentTarget, x, y);
    }

    function handleBrushMove(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!brushDrawingRef.current) return;
        const { x, y } = getCanvasXY(e);
        applyBrushAt(e.currentTarget, x, y);
    }

    function handleBrushUp(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!brushDrawingRef.current) return;
        brushDrawingRef.current = false;
        pushHistory();
        preCropImageRef.current = null; // brush stroke changed the image — crop reference must be refreshed
        offscreenCanvasRef.current?.toBlob(blob => {
            if (!blob) return;
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            const newUrl = URL.createObjectURL(blob);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
        }, 'image/png');
    }

    // ── Draw tool helpers ─────────────────────────────────────────────────────

    function getDrawNormXY(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        return [x, y];
    }

    function getPointerNormXY(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        return [x, y];
    }

    function hitTestPoint(shape: DrawShape, nx: number, ny: number, canvas: HTMLCanvasElement): number {
        // Use display (CSS) pixels for hit radius so it works on any resolution photo
        const rect = canvas.getBoundingClientRect();
        const RADIUS_CSS_PX = 14;
        const rx = RADIUS_CSS_PX / (rect.width || 1);
        const ry = RADIUS_CSS_PX / (rect.height || 1);
        for (let i = 0; i < shape.points.length; i++) {
            const p = shape.points[i];
            if (Math.abs(p.x - nx) < rx && Math.abs(p.y - ny) < ry) return i;
        }
        return -1;
    }

    // Returns which shape's bounding box contains the click (for select/drag)
    function hitTestShapeBody(shape: DrawShape, nx: number, ny: number, canvas: HTMLCanvasElement): boolean {
        if (shape.children && shape.children.length > 0) {
            return shape.children.some(child => hitTestShapeBody(child, nx, ny, canvas));
        }
        if (shape.points.length === 0) return false;
        const rect = canvas.getBoundingClientRect();
        const PAD = 14 / (rect.width || 1);
        const xs = shape.points.map(p => p.x);
        const ys = shape.points.map(p => p.y);
        return nx >= Math.min(...xs) - PAD && nx <= Math.max(...xs) + PAD
            && ny >= Math.min(...ys) - PAD && ny <= Math.max(...ys) + PAD;
    }

    function hitTestAnyShape(shapes: DrawShape[], nx: number, ny: number, canvas: HTMLCanvasElement): DrawShape | null {
        for (const shape of [...shapes].reverse()) {
            if (hitTestShapeBody(shape, nx, ny, canvas)) return shape;
        }
        return null;
    }

    function hitTestTextAnnotation(annotations: TextAnnotation[], nx: number, ny: number): TextAnnotation | null {
        const PAD = 0.015;
        for (const ta of [...annotations].reverse()) {
            const m = textMetricsRef.current.get(ta.id);
            const h = m ? m.hNorm + PAD * 2 : 0.06;
            if (nx >= ta.x - PAD && nx <= ta.x + ta.width + PAD && ny >= ta.y - PAD && ny <= ta.y + h) return ta;
        }
        return null;
    }

    function hitTestTextResizeHandle(ta: TextAnnotation, nx: number, ny: number): boolean {
        const m = textMetricsRef.current.get(ta.id);
        const hx = ta.x + ta.width;
        const hy = ta.y + (m ? m.hNorm / 2 : 0.03);
        return Math.abs(nx - hx) < 0.025 && Math.abs(ny - hy) < 0.025;
    }

    function finishTextEditing(id: string) {
        setTextAnnotations(prev => prev.filter(t => t.id !== id || t.text.trim() !== ''));
        setEditingTextId(null);
        setSelectedTextId(id); // keep visually selected so user can see + drag it
        justFinishedEditRef.current = id;
        setTimeout(() => { justFinishedEditRef.current = null; }, 350);
    }

    // Returns which corner (0=TL, 1=TR, 2=BR, 3=BL) of the selection bbox is hit, or -1
    function hitTestCorner(shape: DrawShape, nx: number, ny: number, canvas: HTMLCanvasElement): -1 | 0 | 1 | 2 | 3 {
        if (shape.points.length === 0) return -1;
        const rect = canvas.getBoundingClientRect();
        const padX = 8 / (rect.width || 1);
        const padY = 8 / (rect.height || 1);
        const xs = shape.points.map(p => p.x);
        const ys = shape.points.map(p => p.y);
        const minX = Math.min(...xs) - padX;
        const maxX = Math.max(...xs) + padX;
        const minY = Math.min(...ys) - padY;
        const maxY = Math.max(...ys) + padY;
        const corners: [number, number][] = [
            [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY],
        ];
        const rx = 12 / (rect.width || 1);
        const ry = 12 / (rect.height || 1);
        for (let i = 0; i < 4; i++) {
            const [cx, cy] = corners[i];
            if (Math.abs(nx - cx) < rx && Math.abs(ny - cy) < ry) return i as 0 | 1 | 2 | 3;
        }
        return -1;
    }

    function handleDrawClick(e: React.MouseEvent<HTMLCanvasElement>) {
        // Suppress click if we were dragging
        if (didDragRef.current) { didDragRef.current = false; return; }

        // Text tool: click to create or edit
        if (textToolActive) {
            e.stopPropagation();
            // Guard: blur fires before click when clicking away from an active input;
            // finishTextEditing sets this ref so we don't create a new annotation accidentally.
            if (justFinishedEditRef.current) {
                justFinishedEditRef.current = null;
                return;
            }
            const [nx, ny] = getDrawNormXY(e);
            const hit = hitTestTextAnnotation(textAnnotations, nx, ny);
            if (hit) {
                setSelectedTextId(hit.id);
                setEditingTextId(hit.id);
            } else {
                setSelectedTextId(null);
                const newId = `text-${Date.now()}`;
                const newTA: TextAnnotation = { id: newId, x: nx, y: ny, text: '', color: drawColor, width: 0.35 };
                setTextAnnotations(prev => [...prev, newTA]);
                setSelectedTextId(newId);
                setEditingTextId(newId);
            }
            return;
        }

        if (drawMode === 'drawing') {
            e.stopPropagation();
            let [x, y] = getDrawNormXY(e);
            // Shift → snap to nearest 45° from the last placed point
            const shiftSnap = e.shiftKey && currentPoints.length >= 1;
            if (shiftSnap) {
                const last = currentPoints[currentPoints.length - 1];
                [x, y] = snapTo45(last.x, last.y, x, y);
            }
            // If clicking near the first point (≥3 pts already) → close the shape
            if (currentPoints.length >= 3) {
                const canvas = drawCanvasRef.current!;
                const rect = canvas.getBoundingClientRect();
                const first = currentPoints[0];
                if (Math.abs(x - first.x) < 14 / (rect.width || 1) &&
                    Math.abs(y - first.y) < 14 / (rect.height || 1)) {
                    const newId = `shape-${Date.now()}`;
                    setDrawShapes(shapes => [...shapes, { id: newId, points: currentPoints, closed: true, color: drawColor, strokeStyle }]);
                    setCurrentPoints([]);
                    setMousePos(null);
                    setSelectedShapeId(null);
                    setDrawMode('drawing');
                    return;
                }
            }
            // Shift-snapped points use smooth:false (straight segment)
            setCurrentPoints(prev => [...prev, { x, y, smooth: !shiftSnap }]);
            return;
        }
        if (drawMode === 'idle' || drawMode === 'selected' || drawMode === 'editing') {
            const canvas = drawCanvasRef.current!;
            const [nx, ny] = getDrawNormXY(e);
            const hit = hitTestAnyShape(drawShapes, nx, ny, canvas);

            if (e.metaKey || e.ctrlKey) {
                // Cmd/Ctrl+click → toggle multi-select
                // If a single shape was already selected, carry it into multiSelectedIds first
                if (hit) {
                    setMultiSelectedIds(prev => {
                        const base = selectedShapeId && !prev.includes(selectedShapeId)
                            ? [...prev, selectedShapeId]
                            : prev;
                        return base.includes(hit.id)
                            ? base.filter(id => id !== hit.id)
                            : [...base, hit.id];
                    });
                    setSelectedShapeId(null);
                    setDrawMode('idle');
                }
                return;
            }

            // Normal click: clear multi-select
            setMultiSelectedIds([]);
            if (hit) {
                setSelectedShapeId(hit.id);
                setDrawMode('selected');
            } else {
                setSelectedShapeId(null);
                setDrawMode('idle');
            }
        }
    }

    function handleDrawDblClick(e: React.MouseEvent<HTMLCanvasElement>) {
        if (drawMode === 'drawing') {
            e.stopPropagation();
            const pts = currentPoints.slice(0, -1); // remove phantom point from last click
            if (pts.length >= 2) {
                const newId = `shape-${Date.now()}`;
                // Double-click = open path (no line back to first point)
                // To close: click on the first point while drawing
                setDrawShapes(shapes => [...shapes, { id: newId, points: pts, closed: false, color: drawColor, strokeStyle }]);
                // Stay in drawing mode — user can keep drawing immediately
                setSelectedShapeId(null);
                setDrawMode('drawing');
            }
            setCurrentPoints([]);
            setMousePos(null);
            return;
        }
        if (drawMode === 'selected' && selectedShapeId) {
            // Double-click on selected shape → enter edit mode (show handles)
            e.stopPropagation();
            setDrawMode('editing');
            return;
        }
        if (drawMode === 'editing' && selectedShapeId) {
            // Double-click on a handle → toggle smooth/sharp
            const canvas = drawCanvasRef.current!;
            const [nx, ny] = getDrawNormXY(e);
            const shape = drawShapes.find(s => s.id === selectedShapeId);
            if (!shape) return;
            const idx = hitTestPoint(shape, nx, ny, canvas);
            if (idx >= 0) {
                e.stopPropagation();
                setDrawShapes(shapes => shapes.map(s =>
                    s.id === selectedShapeId
                        ? { ...s, points: s.points.map((p, i) => i === idx ? { ...p, smooth: !p.smooth } : p) }
                        : s
                ));
            } else {
                // Double-click outside handles → back to selected
                setDrawMode('selected');
            }
        }
    }

    function handleDrawPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        didDragRef.current = false;
        const canvas = drawCanvasRef.current!;
        const [nx, ny] = getPointerNormXY(e);

        // Text interactions: always available regardless of text tool state
        if (textAnnotations.length > 0) {
            // Check resize handle first (only on selected text)
            if (selectedTextId) {
                const selText = textAnnotations.find(t => t.id === selectedTextId);
                if (selText && hitTestTextResizeHandle(selText, nx, ny)) {
                    e.stopPropagation();
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    textResizeDragRef.current = { id: selText.id, startNx: nx, startWidth: selText.width };
                    return;
                }
            }
            // Then check body drag
            const textHit = hitTestTextAnnotation(textAnnotations, nx, ny);
            if (textHit) {
                e.stopPropagation();
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setSelectedTextId(textHit.id);
                textDragRef.current = { id: textHit.id, lastNx: nx, lastNy: ny };
                return;
            }
        }
        // If text tool is active but clicked on empty area: let click handler create text, skip shape logic
        if (textToolActive) return;

        if (drawMode === 'editing' && selectedShapeId) {
            // Try to grab a point handle
            const shape = drawShapes.find(s => s.id === selectedShapeId);
            if (shape) {
                const idx = hitTestPoint(shape, nx, ny, canvas);
                if (idx >= 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragStateRef.current = { shapeId: selectedShapeId, pointIdx: idx };
                    return;
                }
            }
        }

        if (drawMode === 'selected' && selectedShapeId) {
            // Check corner handles — Cmd/Ctrl = rotate, plain = resize
            const shape = drawShapes.find(s => s.id === selectedShapeId);
            if (shape) {
                const ci = hitTestCorner(shape, nx, ny, canvas);
                if (ci >= 0) {
                    e.stopPropagation();
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const xs = shape.points.map(p => p.x);
                    const ys = shape.points.map(p => p.y);
                    const minX = Math.min(...xs), maxX = Math.max(...xs);
                    const minY = Math.min(...ys), maxY = Math.max(...ys);
                    if (e.metaKey || e.ctrlKey) {
                        // Rotation drag
                        const centerNx = (minX + maxX) / 2;
                        const centerNy = (minY + maxY) / 2;
                        rotationDragRef.current = {
                            shapeId: selectedShapeId,
                            centerNx, centerNy,
                            startAngle: Math.atan2(ny - centerNy, nx - centerNx),
                            origPoints: shape.points.map(p => ({ ...p })),
                        };
                    } else {
                        // Resize drag
                        const origCorners: [number, number][] = [
                            [minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY],
                        ];
                        const anchorIdx = (ci + 2) % 4;
                        cornerDragRef.current = {
                            corner: ci as 0 | 1 | 2 | 3,
                            anchorNx: origCorners[anchorIdx][0],
                            anchorNy: origCorners[anchorIdx][1],
                            origCornerNx: origCorners[ci][0],
                            origCornerNy: origCorners[ci][1],
                            origPoints: shape.points.map(p => ({ ...p })),
                        };
                    }
                    return;
                }
            }
        }

        if (drawMode === 'selected' || drawMode === 'idle') {
            // Cmd/Ctrl+click → let onClick handle multi-select, don't start drag
            if (e.metaKey || e.ctrlKey) return;
            // Try to grab a shape for whole-shape drag
            const hit = hitTestAnyShape(drawShapes, nx, ny, canvas);
            if (hit) {
                e.stopPropagation();
                e.preventDefault();
                e.currentTarget.setPointerCapture(e.pointerId);
                setSelectedShapeId(hit.id);
                setDrawMode('selected');
                shapeDragRef.current = { shapeId: hit.id, lastNx: nx, lastNy: ny };
            }
        }
    }

    function handleDrawPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
        // Text resize (right-edge handle drag)
        if (textResizeDragRef.current) {
            const [nx] = getPointerNormXY(e);
            didDragRef.current = true;
            const { id, startNx, startWidth } = textResizeDragRef.current;
            const newWidth = Math.max(0.05, Math.min(0.95, startWidth + (nx - startNx)));
            setTextAnnotations(prev => prev.map(t => t.id === id ? { ...t, width: newWidth } : t));
            return;
        }
        // Text drag
        if (textDragRef.current) {
            const [nx, ny] = getPointerNormXY(e);
            const dx = nx - textDragRef.current.lastNx;
            const dy = ny - textDragRef.current.lastNy;
            if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) didDragRef.current = true;
            const { id } = textDragRef.current;
            setTextAnnotations(prev => prev.map(t => t.id === id
                ? { ...t, x: Math.max(0, Math.min(0.98, t.x + dx)), y: Math.max(0, Math.min(0.98, t.y + dy)) }
                : t
            ));
            textDragRef.current.lastNx = nx;
            textDragRef.current.lastNy = ny;
            return;
        }
        // Rubber-band preview while drawing
        if (drawMode === 'drawing') {
            let [x, y] = getPointerNormXY(e);
            // Shift held → snap preview to nearest 45° from last placed point
            if (e.shiftKey && currentPoints.length >= 1) {
                const last = currentPoints[currentPoints.length - 1];
                [x, y] = snapTo45(last.x, last.y, x, y);
            }
            setMousePos([x, y]);
        }
        // Point drag (editing mode)
        if (dragStateRef.current) {
            didDragRef.current = true;
            const [nx, ny] = getPointerNormXY(e);
            const { shapeId, pointIdx } = dragStateRef.current;
            setDrawShapes(shapes => shapes.map(s =>
                s.id === shapeId
                    ? { ...s, points: s.points.map((p, i) => i === pointIdx ? { ...p, x: nx, y: ny } : p) }
                    : s
            ));
            return;
        }
        // Rotation drag (Cmd+corner)
        if (rotationDragRef.current) {
            didDragRef.current = true;
            const [nx, ny] = getPointerNormXY(e);
            const { shapeId, centerNx, centerNy, startAngle, origPoints } = rotationDragRef.current;
            const delta = Math.atan2(ny - centerNy, nx - centerNx) - startAngle;
            const cos = Math.cos(delta), sin = Math.sin(delta);
            setDrawShapes(shapes => shapes.map(s =>
                s.id === shapeId
                    ? {
                        ...s,
                        points: origPoints.map(p => {
                            const dx = p.x - centerNx, dy = p.y - centerNy;
                            return {
                                ...p,
                                x: Math.max(0, Math.min(1, centerNx + dx * cos - dy * sin)),
                                y: Math.max(0, Math.min(1, centerNy + dx * sin + dy * cos)),
                            };
                        }),
                    }
                    : s
            ));
            return;
        }
        // Corner resize (selected mode)
        if (cornerDragRef.current && selectedShapeId) {
            didDragRef.current = true;
            const [nx, ny] = getPointerNormXY(e);
            const { anchorNx, anchorNy, origCornerNx, origCornerNy, origPoints } = cornerDragRef.current;
            const dOrigX = origCornerNx - anchorNx;
            const dOrigY = origCornerNy - anchorNy;
            const scaleX = Math.abs(dOrigX) < 0.0001 ? 1 : (nx - anchorNx) / dOrigX;
            const scaleY = Math.abs(dOrigY) < 0.0001 ? 1 : (ny - anchorNy) / dOrigY;
            setDrawShapes(shapes => shapes.map(s =>
                s.id === selectedShapeId
                    ? {
                        ...s,
                        points: origPoints.map(p => ({
                            ...p,
                            x: Math.max(0, Math.min(1, anchorNx + (p.x - anchorNx) * scaleX)),
                            y: Math.max(0, Math.min(1, anchorNy + (p.y - anchorNy) * scaleY)),
                        })),
                    }
                    : s
            ));
            return;
        }
        // Whole-shape drag (selected mode)
        if (shapeDragRef.current) {
            const [nx, ny] = getPointerNormXY(e);
            const dx = nx - shapeDragRef.current.lastNx;
            const dy = ny - shapeDragRef.current.lastNy;
            if (Math.abs(dx) > 0.0005 || Math.abs(dy) > 0.0005) didDragRef.current = true;
            const { shapeId } = shapeDragRef.current;
            const movePoints = (pts: DrawPoint[]) => pts.map(p => ({
                ...p,
                x: Math.max(0, Math.min(1, p.x + dx)),
                y: Math.max(0, Math.min(1, p.y + dy)),
            }));
            setDrawShapes(shapes => shapes.map(s => {
                if (s.id !== shapeId) return s;
                if (s.children) {
                    return { ...s, children: s.children.map(c => ({ ...c, points: movePoints(c.points) })) };
                }
                return { ...s, points: movePoints(s.points) };
            }));
            shapeDragRef.current.lastNx = nx;
            shapeDragRef.current.lastNy = ny;
            return;
        }
        // Dynamic cursor for text annotations
        if (textAnnotations.length > 0 || textToolActive) {
            const canvas = e.currentTarget;
            const [nx, ny] = getPointerNormXY(e);
            // Resize handle on selected text
            if (selectedTextId) {
                const selText = textAnnotations.find(t => t.id === selectedTextId);
                if (selText && hitTestTextResizeHandle(selText, nx, ny)) {
                    canvas.style.cursor = 'ew-resize';
                    return;
                }
            }
            if (hitTestTextAnnotation(textAnnotations, nx, ny)) {
                canvas.style.cursor = 'move';
                return;
            }
            if (textToolActive) { canvas.style.cursor = 'text'; return; }
        }
        // Dynamic cursor in selected mode: resize cursor over corners, move over body
        if (drawMode === 'selected' && selectedShapeId) {
            const canvas = e.currentTarget;
            const shape = drawShapes.find(s => s.id === selectedShapeId);
            if (shape) {
                const [nx, ny] = getPointerNormXY(e);
                const ci = hitTestCorner(shape, nx, ny, canvas);
                const isRotate = e.metaKey || e.ctrlKey;
                if (ci >= 0) {
                    canvas.style.cursor = isRotate ? ROTATION_CURSOR : (ci === 0 || ci === 2 ? 'nwse-resize' : 'nesw-resize');
                } else if (hitTestShapeBody(shape, nx, ny, canvas)) {
                    canvas.style.cursor = 'move';
                } else {
                    canvas.style.cursor = 'default';
                }
            }
        }
    }

    function handleDrawPointerUp() {
        dragStateRef.current = null;
        shapeDragRef.current = null;
        cornerDragRef.current = null;
        rotationDragRef.current = null;
        textDragRef.current = null;
        textResizeDragRef.current = null;
    }

    function handleClearDraw() {
        setDrawShapes([]);
        setCurrentPoints([]);
        setSelectedShapeId(null);
        setMultiSelectedIds([]);
        setDrawMode('idle');
        setMousePos(null);
        setTextAnnotations([]);
        setEditingTextId(null);
        setSelectedTextId(null);
        textMetricsRef.current.clear();
    }

    function handleGroupShapes() {
        const toGroup = drawShapes.filter(s => multiSelectedIds.includes(s.id));
        if (toGroup.length < 2) return;
        const groupId = `group-${Date.now()}`;
        setDrawShapes(prev => [
            ...prev.filter(s => !multiSelectedIds.includes(s.id)),
            { id: groupId, points: [], closed: false, color: toGroup[0].color, children: toGroup },
        ]);
        setMultiSelectedIds([]);
        setSelectedShapeId(groupId);
        setDrawMode('selected');
    }

    function handleUngroupShape() {
        if (!selectedShapeId) return;
        const group = drawShapes.find(s => s.id === selectedShapeId);
        if (!group?.children) return;
        setDrawShapes(prev => [
            ...prev.filter(s => s.id !== selectedShapeId),
            ...group.children!,
        ]);
        setSelectedShapeId(null);
        setDrawMode('idle');
    }

    function handleDrawContextMenu(e: React.MouseEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const canvas = drawCanvasRef.current!;
        const [nx, ny] = getDrawNormXY(e);
        const hit = hitTestAnyShape(drawShapes, nx, ny, canvas);

        // If right-clicking on a shape while others are already multi-selected, include it
        if (hit && !multiSelectedIds.includes(hit.id)) {
            setMultiSelectedIds(prev => {
                const base = selectedShapeId && !prev.includes(selectedShapeId) ? [...prev, selectedShapeId] : prev;
                return [...base, hit.id];
            });
            setSelectedShapeId(null);
            setDrawMode('idle');
        } else if (hit && !selectedShapeId) {
            // Right-click on single shape with nothing selected
            setSelectedShapeId(hit.id);
            setDrawMode('selected');
        }

        if (hit || multiSelectedIds.length >= 1 || selectedShapeId) {
            setContextMenu({ x: e.clientX, y: e.clientY });
        }
    }

    function handleFlipHorizontal() {
        if (!selectedShapeId) return;
        setDrawShapes(shapes => shapes.map(s => {
            if (s.id !== selectedShapeId) return s;
            const xs = s.points.map(p => p.x);
            const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
            return { ...s, points: s.points.map(p => ({ ...p, x: 2 * centerX - p.x })) };
        }));
    }

    function handleUndoLastDrawPoint() {
        if (drawMode === 'drawing' && currentPoints.length > 0) {
            setCurrentPoints(prev => prev.slice(0, -1));
        } else if (drawShapes.length > 0) {
            setDrawShapes(prev => prev.slice(0, -1));
            setSelectedShapeId(null);
            setDrawMode('idle');
        }
    }

    async function exportToBlob(): Promise<Blob> {
        // Crop is already baked into imageUrl (done at confirm time).
        // This function only needs to apply remaining rotation + brightness.
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const i = new Image();
            i.crossOrigin = 'anonymous';
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('No se pudo cargar la imagen para exportar'));
            i.src = imageUrl;
        });

        const outW = img.naturalWidth;
        const outH = img.naturalHeight;
        if (outW === 0 || outH === 0) throw new Error('Imagen vacía o sin dimensiones');

        const isPng = bgDone || activeFile!.name.toLowerCase().endsWith('.png');
        const mime = isPng ? 'image/png' : 'image/jpeg';

        const radians = (rotation * Math.PI) / 180;
        const sin = Math.abs(Math.sin(radians));
        const cos = Math.abs(Math.cos(radians));
        const canvasW = Math.ceil(outW * cos + outH * sin);
        const canvasH = Math.ceil(outW * sin + outH * cos);

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d')!;

        if (bgDone && bgColor !== 'transparent') {
            ctx.fillStyle = bgColor === 'white' ? '#ffffff' : '#111111';
            ctx.fillRect(0, 0, canvasW, canvasH);
        }

        ctx.filter = `brightness(${brightness}%)`;
        ctx.translate(canvasW / 2, canvasH / 2);
        ctx.rotate(radians);
        ctx.drawImage(img, -outW / 2, -outH / 2);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.filter = 'none'; // reset filter so annotation layer is not brightness-affected

        // Flatten draw annotation layer when visible
        if (drawVisible && drawCanvasRef.current && drawCanvasRef.current.width > 0) {
            ctx.drawImage(drawCanvasRef.current, 0, 0, canvasW, canvasH);
        }
        // Bake text annotations with word-wrap (including any currently being edited)
        if (drawVisible && textAnnotations.length > 0) {
            const displayW = drawCanvasRef.current?.getBoundingClientRect().width || canvasW;
            const fontSize = 24 * (canvasW / displayW);
            const lineH = fontSize * TEXT_LINE_HEIGHT;
            ctx.font = `600 ${fontSize}px Inter, sans-serif`;
            ctx.textBaseline = 'top';
            for (const ta of textAnnotations) {
                if (!ta.text.trim()) continue;
                const tx = ta.x * canvasW;
                const ty = ta.y * canvasH;
                const maxWidthPx = ta.width * canvasW;
                const lines = wrapTextCanvas(ctx, ta.text, maxWidthPx);
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 5 * (canvasW / displayW);
                ctx.fillStyle = getDrawColorHex(ta.color);
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], tx, ty + i * lineH);
                }
                ctx.restore();
            }
        }

        return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), mime, 0.95));
    }

    async function handleEnterCropMode() {
        setDrawMode('idle');
        setMousePos(null);
        if (preCropImageRef.current) {
            // Already have a full pre-crop reference → restore it so user crops from full image
            prevCroppedUrlRef.current = imageUrl; // save current (may be cropped) for cancel
            setImageUrl(preCropImageRef.current);
            objectUrlRef.current = preCropImageRef.current.startsWith('blob:') ? preCropImageRef.current : null;
            setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
            setCompletedCrop(null);
            setCropActive(true);
            return;
        }

        if (rotation === 0) {
            // No rotation to bake — remember the current image as pre-crop reference
            preCropImageRef.current = imageUrl;
            setCropActive(true);
            return;
        }

        // Bake the current rotation into a new blob so the user sees the straightened
        // image while drawing the crop selection, and coordinates are correct.
        try {
            const img = await new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('load failed'));
                i.src = imageUrl;
            });
            const radians = (rotation * Math.PI) / 180;
            const sin = Math.abs(Math.sin(radians));
            const cos = Math.abs(Math.cos(radians));
            const cW = Math.ceil(img.naturalWidth * cos + img.naturalHeight * sin);
            const cH = Math.ceil(img.naturalWidth * sin + img.naturalHeight * cos);
            const canvas = document.createElement('canvas');
            canvas.width = cW;
            canvas.height = cH;
            const ctx = canvas.getContext('2d')!;
            ctx.translate(cW / 2, cH / 2);
            ctx.rotate(radians);
            ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const isPng = bgDone || activeFile!.name.toLowerCase().endsWith('.png');
            const blob = await new Promise<Blob>((res, rej) =>
                canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), isPng ? 'image/png' : 'image/jpeg', 0.95)
            );
            const newUrl = URL.createObjectURL(blob);
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = newUrl;
            preCropImageRef.current = newUrl; // this is the full image source for all future crops
            setImageUrl(newUrl);
            setRotation(0); // baked
        } catch {
            preCropImageRef.current = imageUrl; // fallback: bake failed
        }
        setCropActive(true);
    }

    async function handleConfirmCrop() {
        if (!completedCrop || completedCrop.width === 0) {
            // Nothing selected — restore previous if re-crop, just exit
            if (prevCroppedUrlRef.current) {
                setImageUrl(prevCroppedUrlRef.current);
                objectUrlRef.current = prevCroppedUrlRef.current.startsWith('blob:') ? prevCroppedUrlRef.current : null;
                prevCroppedUrlRef.current = null;
            }
            setCropActive(false);
            return;
        }

        const sourceUrl = preCropImageRef.current ?? imageUrl;
        try {
            pushHistory();
            const img = await new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                i.crossOrigin = 'anonymous';
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('load failed'));
                i.src = sourceUrl;
            });
            const dispW = imgRef.current?.width ?? img.naturalWidth;
            const dispH = imgRef.current?.height ?? img.naturalHeight;
            const scaleX = img.naturalWidth / dispW;
            const scaleY = img.naturalHeight / dispH;
            const srcX = Math.round(completedCrop.x * scaleX);
            const srcY = Math.round(completedCrop.y * scaleY);
            const srcW = Math.round(completedCrop.width * scaleX);
            const srcH = Math.round(completedCrop.height * scaleY);

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = srcW;
            cropCanvas.height = srcH;
            cropCanvas.getContext('2d')!.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);

            const isPng = bgDone || activeFile!.name.toLowerCase().endsWith('.png');
            const blob = await new Promise<Blob>((res, rej) =>
                cropCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), isPng ? 'image/png' : 'image/jpeg', 0.95)
            );
            const newUrl = URL.createObjectURL(blob);

            // Revoke old cropped URL (but keep preCropImageRef untouched)
            if (prevCroppedUrlRef.current &&
                prevCroppedUrlRef.current.startsWith('blob:') &&
                prevCroppedUrlRef.current !== preCropImageRef.current) {
                URL.revokeObjectURL(prevCroppedUrlRef.current);
            }
            prevCroppedUrlRef.current = null;
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            setCompletedCrop(null);
            setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        } catch {
            toast.error('No se pudo aplicar el recorte');
            if (prevCroppedUrlRef.current) {
                setImageUrl(prevCroppedUrlRef.current);
                objectUrlRef.current = prevCroppedUrlRef.current.startsWith('blob:') ? prevCroppedUrlRef.current : null;
                prevCroppedUrlRef.current = null;
            }
        }
        setCropActive(false);
    }

    function handleCancelCrop() {
        if (prevCroppedUrlRef.current) {
            // Restore the previously-cropped image (user cancelled re-crop)
            setImageUrl(prevCroppedUrlRef.current);
            objectUrlRef.current = prevCroppedUrlRef.current.startsWith('blob:') ? prevCroppedUrlRef.current : null;
            prevCroppedUrlRef.current = null;
        }
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        setCompletedCrop(null);
        setCropActive(false);
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
        }).catch(() => {
            toast.error('No se pudo generar el archivo para descargar');
        });
    }

    async function handleWebDownload() {
        const files = imageFiles.filter(f => selectedIds.has(f.id));
        if (files.length === 0) return;
        setDownloadingWeb(true);
        try {
            for (let i = 0; i < files.length; i++) {
                const f = files[i];
                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const el = new Image();
                    el.crossOrigin = 'anonymous';
                    el.onload = () => resolve(el);
                    el.onerror = reject;
                    el.src = `/api/drive/file/${f.id}`;
                });
                const MAX = 1920;
                let w = img.naturalWidth, h = img.naturalHeight;
                if (w > MAX || h > MAX) {
                    const r = Math.min(MAX / w, MAX / h);
                    w = Math.round(w * r); h = Math.round(h * r);
                }
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                await new Promise<void>(res => {
                    canvas.toBlob(blob => {
                        if (!blob) { res(); return; }
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${f.name.replace(/\.[^.]+$/, '')}_web.webp`;
                        a.click();
                        setTimeout(() => { URL.revokeObjectURL(url); res(); }, 500);
                    }, 'image/webp', 0.85);
                });
                if (i < files.length - 1) await new Promise(r => setTimeout(r, 350));
            }
            setSelectedIds(new Set());
            setMultiSelectMode(false);
            toast.success(`${files.length} foto${files.length > 1 ? 's descargadas' : ' descargada'} para web`);
        } catch {
            toast.error('Error al descargar algunas fotos');
        } finally {
            setDownloadingWeb(false);
        }
    }

    async function handleSaveToDrive(mode: 'replace' | 'copy') {
        if (!activeFile) return;
        setSaving(true);
        try {
            const blob = await exportToBlob();
            const isPng = blob.type === 'image/png';
            const ext = isPng ? 'png' : 'jpg';
            const baseName = activeFile.name.replace(/\.[^.]+$/, '');

            if (mode === 'replace') {
                // Update existing file content in-place (preserves file ID, no duplicate)
                const formData = new FormData();
                formData.append('file', blob, `${baseName}.${ext}`);
                const result = await replaceEditedPhotoAction(activeFile.id, formData);
                if (result.error) {
                    toast.error(`Error al reemplazar: ${result.error}`);
                    return;
                }
                toast.success('Foto reemplazada en Drive');
                // Reset edit state and reload fresh from Drive (cache-busted)
                setImageUrl(`/api/drive/file/${activeFile.id}?t=${Date.now()}`);
                setRotation(0);
                setBrightness(100);
                setBgDone(false);
                preCropImageRef.current = null;
                prevCroppedUrlRef.current = null;
                setHistory([]);
            } else {
                // Save as a new copy
                const copyName = `${baseName}_editada.${ext}`;
                const formData = new FormData();
                formData.append('file', blob, copyName);
                const result = await uploadEditedPhotoAction(folderId, copyName, formData);
                if (result.error) {
                    toast.error(`Error al guardar: ${result.error}`);
                    return;
                }
                toast.success('Copia guardada en Drive');
            }

            setSaveDialogOpen(false);
            onSaved(); // refresca la carpeta, pero nos quedamos en el estudio
        } catch (err) {
            toast.error('Error inesperado al guardar');
            console.error('[PhotoStudio save]', err);
        } finally {
            setSaving(false);
        }
    }

    if (!file || !activeFile) return null;

    async function handleCanvasSave(blob: Blob, filename: string) {
        try {
            const formData = new FormData();
            formData.append('file', new File([blob], filename, { type: 'image/jpeg' }));
            await uploadEditedPhotoAction(folderId, filename, formData);
            toast.success('Canvas guardado en Drive');
            onSaved();
        } catch {
            toast.error('Error al guardar el canvas');
        }
    }

    // Canvas background style (for bg removal preview)
    const canvasBg = bgDone
        ? bgColor === 'white'
            ? 'bg-white'
            : bgColor === 'black'
            ? 'bg-[#111]'
            : 'bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D\'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg\'%20width%3D\'16\'%20height%3D\'16\'%3E%3Crect%20width%3D\'8\'%20height%3D\'8\'%20fill%3D\'%23bbb\'%2F%3E%3Crect%20x%3D\'8\'%20y%3D\'8\'%20width%3D\'8\'%20height%3D\'8\'%20fill%3D\'%23bbb\'%2F%3E%3C%2Fsvg%3E")]'
        : 'bg-[#0D0D12]';

    const imageStyle: React.CSSProperties = {
        transform: `rotate(${rotation}deg)`,
        filter: `brightness(${brightness}%)`,
        maxHeight: toolsHidden ? '90vh' : '65vh',
        maxWidth: '100%',
        objectFit: 'contain',
        display: 'block',
    };

    return (
        <>
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-[#0D0D12] flex flex-col"
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
                    <button
                        onClick={() => {
                            if (isDirty && !confirm('Tenés cambios sin guardar. ¿Salir de todas formas?')) return;
                            onClose();
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors flex-shrink-0 text-sm"
                    >
                        <ArrowLeft size={15} />
                        <span className="hidden sm:inline">Volver</span>
                    </button>
                    <p className="text-white font-semibold truncate flex-1 text-sm">
                        {canvasActive ? `Canvas ${canvasRatio}` : activeFile.name}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Canvas toggle */}
                        {canvasActive ? (
                            <button
                                onClick={() => { setCanvasActive(false); setCanvasLayers([]); setCanvasSelectedId(null); }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E]/20 text-[#C9A96E] text-sm border border-[#C9A96E]/40 hover:bg-[#C9A96E]/30 transition-colors"
                            >
                                ✕ Cerrar lienzo
                            </button>
                        ) : (
                            <button
                                onClick={handleActivateCanvas}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-sm border border-white/10 hover:bg-white/15 hover:text-white transition-colors"
                            >
                                + Lienzo
                            </button>
                        )}
                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleWebDownload}
                                disabled={downloadingWeb}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/80 text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
                            >
                                {downloadingWeb ? <Loader2 size={14} className="animate-spin" /> : <Globe2 size={14} />}
                                <span className="hidden sm:inline">Web ({selectedIds.size})</span>
                            </button>
                        )}
                        {imageFiles.length > 1 && (
                            <button
                                onClick={() => {
                                    const idx = imageFiles.findIndex(f => f.id === activeFile.id);
                                    setPresentationIdx(Math.max(0, idx));
                                    setPresentationMode(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                            >
                                <Play size={14} />
                                <span className="hidden sm:inline">Presentación</span>
                            </button>
                        )}
                        {canSave && (
                            <button
                                onClick={() => setSaveDialogOpen(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E] text-black text-sm font-semibold hover:bg-[#b8924e] transition-colors"
                            >
                                <Save size={14} />
                                <span className="hidden sm:inline">Guardar en Drive</span>
                            </button>
                        )}
                        <button
                            onClick={handleDownload}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                        >
                            <Download size={14} />
                            <span className="hidden sm:inline">Descargar</span>
                        </button>
                    </div>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="flex-1 flex overflow-hidden min-h-0">

                    {/* Thumbnail strip — vertical on desktop */}
                    {imageFiles.length > 1 && (
                        <div className="hidden md:flex flex-col w-[72px] border-r border-white/10 flex-shrink-0 bg-black/20">
                            {/* Multi-select toggle */}
                            <button
                                onClick={() => { setMultiSelectMode(v => !v); if (multiSelectMode) setSelectedIds(new Set()); }}
                                title={multiSelectMode ? 'Cancelar selección' : 'Seleccionar varias fotos'}
                                className={`flex-shrink-0 flex items-center justify-center h-8 border-b border-white/10 transition-colors ${
                                    multiSelectMode ? 'bg-[#C9A96E]/20 text-[#C9A96E]' : 'text-white/30 hover:text-white/60'
                                }`}
                            >
                                <CheckSquare2 size={14} />
                            </button>
                            <div className="flex flex-col gap-1 p-1 overflow-y-auto flex-1">
                                {imageFiles.map(f => {
                                    const isSelected = selectedIds.has(f.id);
                                    return (
                                        <button
                                            key={f.id}
                                            draggable={canvasActive}
                                            onDragStart={canvasActive ? (e) => {
                                                e.dataTransfer.setData('driveFileId', f.id);
                                                e.dataTransfer.effectAllowed = 'copy';
                                            } : undefined}
                                            onClick={() => {
                                                if (multiSelectMode) {
                                                    setSelectedIds(prev => {
                                                        const next = new Set(prev);
                                                        if (next.has(f.id)) next.delete(f.id); else next.add(f.id);
                                                        return next;
                                                    });
                                                } else {
                                                    handleSwitchFile(f);
                                                }
                                            }}
                                            className={`relative aspect-square rounded-md overflow-hidden flex-shrink-0 border-2 transition-all ${
                                                canvasActive ? 'cursor-grab active:cursor-grabbing' : ''
                                            } ${
                                                multiSelectMode && isSelected
                                                    ? 'border-[#C9A96E]'
                                                    : !multiSelectMode && f.id === activeFile.id
                                                        ? 'border-[#C9A96E]'
                                                        : 'border-transparent hover:border-white/30'
                                            }`}
                                        >
                                            {f.thumbnailLink ? (
                                                <img src={f.thumbnailLink} alt={f.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                    <ImageIcon size={16} className="text-white/30" />
                                                </div>
                                            )}
                                            {multiSelectMode && isSelected && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-[#C9A96E]/30">
                                                    <Check size={16} className="text-white drop-shadow" />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Canvas area */}
                    <div
                        ref={canvasContainerRef}
                        className={`relative flex-1 flex items-center justify-center overflow-hidden p-4 ${canvasBg}`}
                        onMouseDown={handleMouseDown}
                        onMouseMove={handleMouseMove}
                        onMouseUp={handleMouseUp}
                        onMouseLeave={handleMouseUp}
                        onTouchStart={handleTouchStart}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        onDoubleClick={() => { setZoom(1); setPanX(0); setPanY(0); }}
                        style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                    >
                        {/* scale() then translate(): translates happen in pre-scale space; handleMouseMove divides by zoom to compensate */}
                        <div style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)`, transformOrigin: 'center', transition: isDragging ? 'none' : 'transform 0.05s ease-out' }}>
                            {brushMode !== null ? (
                                <canvas
                                    ref={brushCanvasRef}
                                    style={{ ...imageStyle, cursor: 'crosshair' }}
                                    onPointerDown={handleBrushDown}
                                    onPointerMove={handleBrushMove}
                                    onPointerUp={handleBrushUp}
                                    onPointerLeave={handleBrushUp}
                                />
                            ) : cropActive ? (
                                <ReactCrop
                                    crop={crop}
                                    onChange={c => setCrop(c)}
                                    onComplete={c => setCompletedCrop(c)}
                                >
                                    {/* No CSS rotation in crop mode — coordinates must be in unrotated space */}
                                    <img
                                        ref={imgRef}
                                        src={imageUrl}
                                        alt={activeFile.name}
                                        crossOrigin="anonymous"
                                        style={{ ...imageStyle, transform: 'none' }}
                                    />
                                </ReactCrop>
                            ) : (
                                <div className="relative inline-block">
                                    {canvasActive ? (
                                        <canvas
                                            ref={canvasLayersRef}
                                            style={getCanvasRatioStyle()}
                                            onPointerDown={handleCanvasLayerPointerDown}
                                            onPointerMove={handleCanvasLayerPointerMove}
                                            onPointerUp={handleCanvasLayerPointerUp}
                                            onPointerLeave={handleCanvasLayerPointerUp}
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={handleCanvasLayerDrop}
                                            onContextMenu={handleCanvasLayerContextMenu}
                                        />
                                    ) : (
                                    <img
                                        ref={imgRef}
                                        src={imageUrl}
                                        alt={activeFile.name}
                                        crossOrigin="anonymous"
                                        style={imageStyle}
                                    />
                                    )}
                                    <canvas
                                        ref={drawCanvasRef}
                                        className="absolute inset-0 w-full h-full"
                                        style={{
                                            cursor: drawMode === 'drawing' ? 'crosshair'
                                                  : drawMode === 'editing' ? 'crosshair'
                                                  : drawMode === 'selected' ? 'move'
                                                  : drawShapes.length > 0 ? 'pointer'
                                                  : 'default',
                                            pointerEvents: (drawMode !== 'idle' || drawShapes.length > 0 || textToolActive || textAnnotations.length > 0) ? 'auto' : 'none',
                                        }}
                                        onClick={handleDrawClick}
                                        onDoubleClick={handleDrawDblClick}
                                        onPointerDown={handleDrawPointerDown}
                                        onPointerMove={handleDrawPointerMove}
                                        onPointerUp={handleDrawPointerUp}
                                        onPointerLeave={() => { setMousePos(null); shapeDragRef.current = null; dragStateRef.current = null; cornerDragRef.current = null; rotationDragRef.current = null; textDragRef.current = null; textResizeDragRef.current = null; }}
                                        onContextMenu={handleDrawContextMenu}
                                    />
                                    {/* Text annotation editing overlay */}
                                    {textAnnotations.map(ta => {
                                        if (ta.id !== editingTextId) return null;
                                        return (
                                            <div
                                                key={ta.id}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${ta.x * 100}%`,
                                                    top: `${ta.y * 100}%`,
                                                    zIndex: 20,
                                                    pointerEvents: 'auto',
                                                }}
                                            >
                                                <textarea
                                                    autoFocus
                                                    value={ta.text}
                                                    placeholder="Texto..."
                                                    rows={1}
                                                    onChange={e => {
                                                        setTextAnnotations(prev => prev.map(t => t.id === ta.id ? { ...t, text: e.target.value } : t));
                                                        // auto-grow height
                                                        e.target.style.height = 'auto';
                                                        e.target.style.height = `${e.target.scrollHeight}px`;
                                                    }}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Escape') {
                                                            e.preventDefault();
                                                            finishTextEditing(ta.id);
                                                        }
                                                        // Enter inserts newline (textarea default)
                                                    }}
                                                    onBlur={() => finishTextEditing(ta.id)}
                                                    style={{
                                                        width: `${ta.width * 100}%`,
                                                        background: 'transparent',
                                                        border: 'none',
                                                        outline: 'none',
                                                        resize: 'none',
                                                        overflow: 'hidden',
                                                        padding: 0,
                                                        display: 'block',
                                                        font: `600 24px Inter, sans-serif`,
                                                        lineHeight: TEXT_LINE_HEIGHT,
                                                        color: getDrawColorHex(ta.color),
                                                        caretColor: getDrawColorHex(ta.color),
                                                        textShadow: '0 0 4px rgba(0,0,0,0.8)',
                                                        minHeight: '30px',
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Zoom indicator badge */}
                        {zoom > 1 && (
                            <div className="absolute bottom-3 right-3 z-10 px-2 py-1 rounded-md bg-black/50 text-white/70 text-xs font-mono pointer-events-none select-none">
                                {Math.round(zoom * 100)}%
                            </div>
                        )}

                        {/* Bipupillar grid overlay — full grid when rotating/toggled; center crosshair also during pan */}
                        {(showGrid || rotation !== 0 || isDragging || zoom > 1) && (
                            <svg
                                className="absolute inset-0 w-full h-full pointer-events-none"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                {/* Rule-of-thirds — only when grid is explicitly active */}
                                {(showGrid || rotation !== 0) && (<>
                                    <line x1="33.33%" y1="0" x2="33.33%" y2="100%" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                                    <line x1="66.67%" y1="0" x2="66.67%" y2="100%" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                                    <line x1="0" y1="33.33%" x2="100%" y2="33.33%" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                                    <line x1="0" y1="66.67%" x2="100%" y2="66.67%" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                                </>)}
                                {/* Center crosshair — always visible when zoomed/panning or grid active */}
                                <line x1="0" y1="50%" x2="100%" y2="50%" stroke="rgba(255,255,255,0.75)" strokeWidth="1.5" strokeDasharray="8 4" />
                                <line x1="50%" y1="0" x2="50%" y2="100%" stroke="rgba(255,255,255,0.45)" strokeWidth="1" strokeDasharray="8 4" />
                            </svg>
                        )}
                    </div>

                    {/* Tab to restore panel when hidden */}
                    {toolsHidden && (
                        <button
                            onClick={() => setToolsHidden(false)}
                            title="Mostrar herramientas"
                            className="hidden md:flex items-center justify-center w-6 border-l border-white/10 bg-black/20 hover:bg-white/5 transition-colors flex-shrink-0 text-white/30 hover:text-white/60"
                        >
                            <PanelRightOpen size={13} />
                        </button>
                    )}

                    {/* Tools panel — right side on desktop */}
                    <div className={`${toolsHidden ? '!hidden' : ''} hidden md:flex flex-col w-64 border-l border-white/10 overflow-y-auto flex-shrink-0 bg-black/20`}>
                        {/* Panel header — just the hide button, title is already inside ToolsPanel */}
                        <div className="flex items-center justify-end px-4 pt-3 pb-0 flex-shrink-0">
                            <button
                                onClick={() => setToolsHidden(true)}
                                className="flex items-center gap-1 text-white/30 hover:text-white/70 text-xs transition-colors"
                            >
                                <PanelRightClose size={13} />
                                Ocultar
                            </button>
                        </div>
                        <div className="flex flex-col gap-5 p-4 pt-2 overflow-y-auto flex-1">
                        <ToolsPanel
                            rotation={canvasActive && canvasSelectedId
                                ? (canvasLayers.find(l => l.id === canvasSelectedId)?.rotation ?? 0)
                                : rotation}
                            setRotation={canvasActive && canvasSelectedId
                                ? (v) => setCanvasLayers(prev => prev.map(l => l.id === canvasSelectedId ? { ...l, rotation: v } : l))
                                : setRotation}
                            brightness={canvasActive && canvasSelectedId
                                ? (canvasLayers.find(l => l.id === canvasSelectedId)?.brightness ?? 100)
                                : brightness}
                            setBrightness={canvasActive && canvasSelectedId
                                ? (v) => setCanvasLayers(prev => prev.map(l => l.id === canvasSelectedId ? { ...l, brightness: v as number } : l))
                                : setBrightness}
                            cropActive={cropActive}
                            setCropActive={setCropActive}
                            hasPriorCrop={preCropImageRef.current !== null}
                            onEnterCropMode={handleEnterCropMode}
                            onConfirmCrop={handleConfirmCrop}
                            onCancelCrop={handleCancelCrop}
                            bgProcessing={bgProcessing} bgDone={bgDone}
                            bgColor={bgColor} setBgColor={setBgColor}
                            onRemoveBg={handleRemoveBackground}
                            onUndoBg={handleUndoBgRemoval}
                            onCancelBg={handleCancelBgProcessing}
                            brushMode={brushMode}
                            onSetBrushMode={(mode) => {
                                setBrushMode(mode);
                                if (mode !== null) { setDrawMode('idle'); setMousePos(null); }
                            }}
                            brushSize={brushSize}
                            onSetBrushSize={setBrushSize}
                            onReset={() => {
                                resetEdits();
                                setImageUrl(`/api/drive/file/${activeFile.id}`);
                            }}
                            onUndo={handleUndo}
                            historyCount={history.length}
                            showGrid={showGrid}
                            setShowGrid={setShowGrid}
                            isGridVisible={showGrid || rotation !== 0}
                            onConfirmBg={handleConfirmBg}
                            drawMode={drawMode}
                            onSetDrawMode={(mode) => {
                                setDrawMode(mode);
                                if (mode !== 'idle') {
                                    setCropActive(false);
                                    setBrushMode(null);
                                    setTextToolActive(false);
                                    setEditingTextId(null);
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
                            onFlipHorizontal={handleFlipHorizontal}
                            textToolActive={textToolActive}
                            onToggleTextTool={() => {
                                setTextToolActive(v => !v);
                                if (!textToolActive) {
                                    setDrawMode('idle');
                                    setCurrentPoints([]);
                                    setBrushMode(null);
                                }
                                setEditingTextId(null);
                                setSelectedTextId(null);
                            }}
                            textAnnotationCount={textAnnotations.length}
                            strokeStyle={strokeStyle}
                            onSetStrokeStyle={s => setStrokeStyle(s as 'taper' | 'velocity' | 'nib' | 'brush' | 'pencil')}
                            multiSelectedCount={multiSelectedIds.length}
                            onGroupShapes={handleGroupShapes}
                            selectedShapeIsGroup={!!(selectedShapeId && drawShapes.find(s => s.id === selectedShapeId)?.children)}
                            onUngroupShape={handleUngroupShape}
                            canvasActive={canvasActive}
                            canvasRatio={canvasRatio}
                            onCanvasRatioChange={handleCanvasRatioChange}
                            canvasLayerCount={canvasLayers.length}
                            onClearCanvasLayers={() => { setCanvasLayers([]); setCanvasSelectedId(null); }}
                        />
                        </div>
                    </div>
                </div>

                {/* Tools — bottom strip on mobile */}
                <div className={`${toolsHidden ? 'hidden' : ''} md:hidden border-t border-white/10 px-3 py-2 overflow-x-auto flex-shrink-0`}>
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
                        {cropActive ? (
                            <>
                                <button
                                    onClick={handleConfirmCrop}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-600 text-white transition-colors"
                                >
                                    <Check size={13} /> Confirmar
                                </button>
                                <button
                                    onClick={handleCancelCrop}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/50 transition-colors"
                                >
                                    <X size={13} /> Cancelar
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handleEnterCropMode}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/70 transition-colors"
                            >
                                <CropIcon size={13} />
                                {preCropImageRef.current ? 'Reajustar' : 'Recortar'}
                            </button>
                        )}
                        {/* BG removal */}
                        {bgProcessing ? (
                            <button
                                onClick={handleCancelBgProcessing}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-white/10 text-white/50 text-xs transition-colors"
                            >
                                <Loader2 size={13} className="animate-spin" /> Cancelar
                            </button>
                        ) : (
                            <button
                                onClick={handleRemoveBackground}
                                disabled={bgDone}
                                className="flex items-center gap-1 px-2 py-1 rounded-md bg-violet-600/30 text-violet-300 text-xs disabled:opacity-50"
                            >
                                {bgDone ? <Check size={13} /> : <Wand2 size={13} />}
                                Sin fondo
                            </button>
                        )}
                        {/* Undo — mobile */}
                        <button
                            onClick={handleUndo}
                            disabled={history.length === 0}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/60 transition-colors disabled:opacity-25"
                        >
                            <Undo2 size={13} /> Deshacer
                        </button>
                        {/* Grid toggle */}
                        <button
                            onClick={() => setShowGrid(v => !v)}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors ${
                                (showGrid || rotation !== 0) ? 'bg-[#C9A96E]/30 text-[#C9A96E]' : 'bg-white/10 text-white/70'
                            }`}
                        >
                            <Grid size={13} /> Grilla
                        </button>
                        {/* Cancelar / Confirmar bg removal — mobile */}
                        {bgDone && (
                            <button
                                onClick={handleUndoBgRemoval}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/50 transition-colors"
                            >
                                <X size={13} /> Cancelar
                            </button>
                        )}
                        {bgDone && (
                            <button
                                onClick={handleConfirmBg}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-600/80 text-white font-semibold transition-colors hover:bg-blue-600"
                            >
                                <Check size={13} /> Confirmar
                            </button>
                        )}
                        {/* BG color selector — only when bg removed */}
                        {bgDone && (
                            <div className="flex items-center gap-1">
                                {([
                                    { value: 'transparent', label: '▥', title: 'Transparente' },
                                    { value: 'white', label: '⬜', title: 'Blanco' },
                                    { value: 'black', label: '⬛', title: 'Negro' },
                                ] as const).map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setBgColor(opt.value)}
                                        title={opt.title}
                                        className={`px-2 py-1 rounded text-xs border transition-all ${
                                            bgColor === opt.value ? 'border-[#C9A96E]' : 'border-white/10'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        )}
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

        {/* ── Presentation Mode ─────────────────────────────────────────── */}

        <AnimatePresence>
            {presentationMode && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[70] bg-black flex flex-col select-none"
                >
                    {/* Top bar */}
                    <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-6 py-4 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                        <span className="text-white/50 text-sm font-mono tabular-nums pointer-events-auto">
                            {presentationIdx + 1} / {imageFiles.length}
                        </span>
                        <p className="text-white/60 text-sm truncate max-w-xs">
                            {imageFiles[presentationIdx]?.name}
                        </p>
                        <button
                            onClick={() => setPresentationMode(false)}
                            className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors border border-white/10"
                        >
                            <X size={14} /> Salir
                        </button>
                    </div>

                    {/* Main image */}
                    <div className="flex-1 flex items-center justify-center relative">
                        <AnimatePresence mode="wait">
                            <motion.img
                                key={imageFiles[presentationIdx]?.id}
                                initial={{ opacity: 0, scale: 0.97 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 1.02 }}
                                transition={{ duration: 0.18 }}
                                src={`/api/drive/file/${imageFiles[presentationIdx]?.id}`}
                                alt={imageFiles[presentationIdx]?.name}
                                className="max-w-full max-h-full object-contain"
                                style={{ maxHeight: 'calc(100vh - 96px)' }}
                            />
                        </AnimatePresence>

                        {/* Prev arrow */}
                        {presentationIdx > 0 && (
                            <button
                                onClick={() => setPresentationIdx(i => i - 1)}
                                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors border border-white/10"
                            >
                                <ChevronLeft size={26} className="text-white" />
                            </button>
                        )}
                        {/* Next arrow */}
                        {presentationIdx < imageFiles.length - 1 && (
                            <button
                                onClick={() => setPresentationIdx(i => i + 1)}
                                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/25 flex items-center justify-center transition-colors border border-white/10"
                            >
                                <ChevronRight size={26} className="text-white" />
                            </button>
                        )}
                    </div>

                    {/* Dot indicators */}
                    {imageFiles.length <= 24 && (
                        <div className="flex items-center justify-center gap-1.5 py-5 flex-shrink-0">
                            {imageFiles.map((_, i) => (
                                <button
                                    key={i}
                                    onClick={() => setPresentationIdx(i)}
                                    className={`rounded-full transition-all duration-200 ${
                                        i === presentationIdx
                                            ? 'w-6 h-2 bg-white'
                                            : 'w-2 h-2 bg-white/30 hover:bg-white/60'
                                    }`}
                                />
                            ))}
                        </div>
                    )}
                </motion.div>
            )}
        </AnimatePresence>

        {/* ── Canvas Layer Context Menu ─────────────────────────────────────── */}
        {canvasContextMenu && (
            <>
                <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setCanvasContextMenu(null)}
                    onContextMenu={e => { e.preventDefault(); setCanvasContextMenu(null); }}
                />
                <div
                    className="fixed z-[91] bg-[#1A1A24] border border-white/15 rounded-xl shadow-xl py-1.5 min-w-[160px]"
                    style={{ left: canvasContextMenu.x, top: canvasContextMenu.y }}
                >
                    <button
                        onClick={() => {
                            setCanvasLayers(prev => {
                                const idx = prev.findIndex(l => l.id === canvasContextMenu.layerId);
                                if (idx <= 0) return prev;
                                const next = [...prev];
                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                return next;
                            });
                            setCanvasContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <span className="text-[#C9A96E]">↑</span> Traer al frente
                    </button>
                    <button
                        onClick={() => {
                            setCanvasLayers(prev => {
                                const idx = prev.findIndex(l => l.id === canvasContextMenu.layerId);
                                if (idx < 0 || idx >= prev.length - 1) return prev;
                                const next = [...prev];
                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                return next;
                            });
                            setCanvasContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <span className="text-white/50">↓</span> Enviar atrás
                    </button>
                    <button
                        onClick={() => {
                            setCanvasLayers(prev => prev.filter(l => l.id !== canvasContextMenu.layerId));
                            if (canvasSelectedId === canvasContextMenu.layerId) setCanvasSelectedId(null);
                            setCanvasContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <span>✕</span> Eliminar capa
                    </button>
                </div>
            </>
        )}

        {/* ── Draw Context Menu ────────────────────────────────────────────── */}
        {contextMenu && (
            <>
                {/* backdrop to close */}
                <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setContextMenu(null)}
                    onContextMenu={e => { e.preventDefault(); setContextMenu(null); }}
                />
                <div
                    className="fixed z-[91] bg-[#1A1A24] border border-white/15 rounded-xl shadow-xl py-1.5 min-w-[160px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    {/* Agrupar — when 2+ shapes selected */}
                    {(multiSelectedIds.length >= 2 || (multiSelectedIds.length >= 1 && selectedShapeId)) && (
                        <button
                            onClick={() => { handleGroupShapes(); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <span className="text-[#C9A96E]">⊞</span> Agrupar selección
                        </button>
                    )}
                    {/* Desagrupar — when a group is selected */}
                    {selectedShapeId && drawShapes.find(s => s.id === selectedShapeId)?.children && (
                        <button
                            onClick={() => { handleUngroupShape(); setContextMenu(null); }}
                            className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <span className="text-white/50">⊟</span> Desagrupar
                        </button>
                    )}
                    {/* Eliminar */}
                    {(selectedShapeId || multiSelectedIds.length >= 1) && (
                        <button
                            onClick={() => {
                                if (multiSelectedIds.length >= 1) {
                                    setDrawShapes(prev => prev.filter(s => !multiSelectedIds.includes(s.id)));
                                    setMultiSelectedIds([]);
                                } else if (selectedShapeId) {
                                    setDrawShapes(prev => prev.filter(s => s.id !== selectedShapeId));
                                    setSelectedShapeId(null);
                                    setDrawMode('idle');
                                }
                                setContextMenu(null);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-white/10 transition-colors flex items-center gap-2"
                        >
                            <span>✕</span> Eliminar
                        </button>
                    )}
                </div>
            </>
        )}
        </>
    );
}

// ─── Tools Panel (desktop right sidebar) ──────────────────────────────────────

interface ToolsPanelProps {
    rotation: number; setRotation: (v: number) => void;
    brightness: number; setBrightness: (v: number) => void;
    cropActive: boolean; setCropActive: (v: boolean | ((prev: boolean) => boolean)) => void;
    hasPriorCrop: boolean;
    onEnterCropMode: () => void;
    onConfirmCrop: () => void;
    onCancelCrop: () => void;
    bgProcessing: boolean; bgDone: boolean;
    bgColor: BgColor; setBgColor: (v: BgColor) => void;
    onRemoveBg: () => void;
    onUndoBg: () => void;
    onCancelBg: () => void;
    brushMode: 'restore' | 'erase' | null;
    onSetBrushMode: (mode: 'restore' | 'erase' | null) => void;
    brushSize: number;
    onSetBrushSize: (v: number) => void;
    onReset: () => void;
    onUndo: () => void;
    historyCount: number;
    showGrid: boolean;
    setShowGrid: (v: boolean | ((prev: boolean) => boolean)) => void;
    isGridVisible: boolean;
    onConfirmBg: () => void;
    drawMode: 'idle' | 'drawing' | 'selected' | 'editing';
    onSetDrawMode: (mode: 'idle' | 'drawing' | 'selected' | 'editing') => void;
    drawVisible: boolean;
    onToggleDrawVisible: () => void;
    drawColor: DrawColor;
    onSetDrawColor: (c: DrawColor) => void;
    drawShapeCount: number;
    currentPointCount: number;
    onUndoLastDrawPoint: () => void;
    onClearDraw: () => void;
    onFlipHorizontal: () => void;
    textToolActive: boolean;
    onToggleTextTool: () => void;
    textAnnotationCount: number;
    strokeStyle: string;
    onSetStrokeStyle: (s: string) => void;
    multiSelectedCount: number;
    onGroupShapes: () => void;
    selectedShapeIsGroup: boolean;
    onUngroupShape: () => void;
    canvasActive: boolean;
    canvasRatio: CanvasRatio;
    onCanvasRatioChange: (r: CanvasRatio) => void;
    canvasLayerCount: number;
    onClearCanvasLayers: () => void;
}

function ToolsPanel({
    rotation, setRotation,
    brightness, setBrightness,
    cropActive, setCropActive,
    hasPriorCrop,
    onEnterCropMode,
    onConfirmCrop,
    onCancelCrop,
    bgProcessing, bgDone,
    bgColor, setBgColor,
    onRemoveBg,
    onUndoBg,
    onCancelBg,
    brushMode,
    onSetBrushMode,
    brushSize,
    onSetBrushSize,
    onReset,
    onUndo,
    historyCount,
    showGrid, setShowGrid,
    isGridVisible,
    onConfirmBg,
    drawMode, onSetDrawMode,
    drawVisible, onToggleDrawVisible,
    drawColor, onSetDrawColor,
    drawShapeCount, currentPointCount,
    onUndoLastDrawPoint,
    onClearDraw,
    onFlipHorizontal,
    textToolActive, onToggleTextTool,
    textAnnotationCount,
    strokeStyle, onSetStrokeStyle,
    multiSelectedCount, onGroupShapes,
    selectedShapeIsGroup, onUngroupShape,
    canvasActive, canvasRatio, onCanvasRatioChange,
    canvasLayerCount, onClearCanvasLayers,
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
                <button
                    onClick={() => setShowGrid(v => !v)}
                    className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                        isGridVisible
                            ? 'bg-[#C9A96E]/20 text-[#C9A96E]'
                            : 'bg-white/5 text-white/40 hover:text-white/60'
                    }`}
                >
                    <Grid size={11} />
                    Grilla
                </button>
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
                    <CropIcon size={13} /> Recortar
                </p>
                {cropActive ? (
                    <>
                        <p className="text-white/30 text-xs">
                            Seleccioná el área a conservar. El recorte se aplica al guardar.
                        </p>
                        <button
                            onClick={onConfirmCrop}
                            className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium transition-colors hover:bg-blue-500 flex items-center justify-center gap-1.5"
                        >
                            <Check size={13} /> Confirmar recorte
                        </button>
                        <button
                            onClick={onCancelCrop}
                            className="w-full py-1.5 rounded-lg text-white/40 text-xs hover:text-white/70 transition-colors"
                        >
                            Cancelar
                        </button>
                    </>
                ) : (
                    <button
                        onClick={onEnterCropMode}
                        className="w-full py-2 rounded-lg bg-white/10 text-white/70 text-sm font-medium hover:bg-white/15 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <CropIcon size={13} />
                        {hasPriorCrop ? 'Reajustar recorte' : 'Activar recorte'}
                    </button>
                )}
            </div>

            {/* Background removal */}
            <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                    <Wand2 size={13} className="text-violet-400" /> Fondo
                </p>
                {bgProcessing ? (
                    <>
                        <div className="flex items-center gap-2 text-violet-300 text-xs">
                            <Loader2 size={13} className="animate-spin" /> Removiendo fondo...
                        </div>
                        <button
                            onClick={onCancelBg}
                            className="w-full py-1.5 rounded-lg bg-white/10 text-white/50 text-xs hover:text-white/70 transition-colors"
                        >
                            Cancelar
                        </button>
                    </>
                ) : (
                    <button
                        onClick={onRemoveBg}
                        disabled={bgDone}
                        className="w-full py-2 rounded-lg bg-violet-600/30 text-violet-300 text-sm hover:bg-violet-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {bgDone
                            ? <><Check size={14} /> Fondo removido</>
                            : <><Wand2 size={14} /> Remover fondo</>
                        }
                    </button>
                )}

                {/* Undo bg removal */}
                {bgDone && !bgProcessing && (
                    <button
                        onClick={onUndoBg}
                        className="w-full py-1.5 rounded-lg text-white/40 text-xs hover:text-white/70 transition-colors"
                    >
                        Deshacer remoción de fondo
                    </button>
                )}

                {/* Brush editing controls */}
                {bgDone && !bgProcessing && (
                    <div className="space-y-2 pt-1 border-t border-white/10">
                        <p className="text-white/40 text-xs">Corrección de máscara:</p>
                        {brushMode === null ? (
                            <button
                                onClick={() => onSetBrushMode('restore')}
                                className="w-full py-2 rounded-lg bg-white/10 text-white/70 text-sm hover:bg-white/15 transition-colors flex items-center justify-center gap-1.5"
                            >
                                Editar máscara
                            </button>
                        ) : (
                            <>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onSetBrushMode('restore')}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${brushMode === 'restore' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
                                    >
                                        Restaurar
                                    </button>
                                    <button
                                        onClick={() => onSetBrushMode('erase')}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${brushMode === 'erase' ? 'bg-red-600 text-white' : 'bg-white/10 text-white/60 hover:bg-white/15'}`}
                                    >
                                        Borrar más
                                    </button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-white/40 text-xs w-12">Tamaño</span>
                                    <input
                                        type="range" min={5} max={120} step={5}
                                        value={brushSize}
                                        onChange={e => onSetBrushSize(Number(e.target.value))}
                                        className="flex-1 accent-white/70"
                                    />
                                    <span className="text-white/40 text-xs w-6">{brushSize}</span>
                                </div>
                                <button
                                    onClick={() => onSetBrushMode(null)}
                                    className="w-full py-1.5 rounded-lg bg-[#C9A96E]/20 text-[#C9A96E] text-xs hover:bg-[#C9A96E]/30 transition-colors"
                                >
                                    Terminar edición
                                </button>
                            </>
                        )}
                    </div>
                )}

                {/* Background color selector — only visible after bg removed */}
                {bgDone && !bgProcessing && (
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
                        <div className="flex gap-2 mt-1">
                            <button
                                onClick={onUndoBg}
                                className="flex-1 py-2 rounded-lg bg-white/10 text-white/60 text-sm hover:bg-white/20 transition-colors flex items-center justify-center gap-1.5"
                            >
                                <X size={14} /> Cancelar
                            </button>
                            <button
                                onClick={onConfirmBg}
                                className="flex-1 py-2 rounded-lg bg-blue-600/80 text-white text-sm font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5"
                            >
                                <Check size={14} /> Confirmar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Trazo (Smile Design) ── */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                        <PenLine size={13} />
                        Trazo
                    </div>
                    <button
                        onClick={onToggleDrawVisible}
                        title={drawVisible ? 'Ocultar trazo' : 'Mostrar trazo'}
                        className="p-1 rounded text-white/40 hover:text-white/70 transition-colors"
                    >
                        {drawVisible ? <Eye size={13} /> : <EyeOff size={13} />}
                    </button>
                </div>

                <button
                    onClick={() => onSetDrawMode(drawMode === 'idle' ? 'drawing' : 'idle')}
                    className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        drawMode !== 'idle'
                            ? 'bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/30'
                            : 'bg-white/5 text-white/50 hover:text-white/80 border border-white/10'
                    }`}
                >
                    <PenLine size={12} />
                    {drawMode === 'drawing'
                        ? '● Dibujando — clic aquí para detener'
                        : drawMode === 'selected' ? 'Forma seleccionada'
                        : drawMode === 'editing' ? 'Editando puntos'
                        : 'Activar trazo'}
                </button>

                {drawMode !== 'idle' && (
                    <div className="flex items-center gap-1.5">
                        {(['white', 'yellow', 'cyan', 'red'] as DrawColor[]).map(c => {
                            const hex = getDrawColorHex(c);
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

                {/* Stroke style selector */}
                <div className="grid grid-cols-5 gap-1">
                    {([
                        { id: 'taper',    label: 'Taper',    title: 'Taper — fino en puntas, grueso en medio' },
                        { id: 'velocity', label: 'Firma',    title: 'Firma — rápido=fino, lento=grueso' },
                        { id: 'nib',      label: 'Pluma',    title: 'Pluma — caligrafía a 45°' },
                        { id: 'brush',    label: 'Pincel',   title: 'Pincel — taper + transparencia' },
                        { id: 'pencil',   label: 'Lápiz',    title: 'Lápiz — trazo fino con textura' },
                    ] as const).map(opt => (
                        <button
                            key={opt.id}
                            title={opt.title}
                            onClick={() => onSetStrokeStyle(opt.id)}
                            className={`py-1 rounded text-[10px] font-medium transition-all border ${
                                strokeStyle === opt.id
                                    ? 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/40'
                                    : 'bg-white/5 text-white/40 border-white/10 hover:text-white/70 hover:border-white/20'
                            }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

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

                {/* Multi-select group button */}
                {multiSelectedCount >= 2 && (
                    <button
                        onClick={onGroupShapes}
                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/40 hover:bg-[#C9A96E]/30 transition-colors"
                    >
                        Agrupar {multiSelectedCount} formas
                    </button>
                )}
                {multiSelectedCount >= 1 && multiSelectedCount < 2 && (
                    <p className="text-white/30 text-[10px]">Cmd+clic en más formas para seleccionar</p>
                )}

                {/* Ungroup button */}
                {selectedShapeIsGroup && (
                    <button
                        onClick={onUngroupShape}
                        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-white/5 text-white/50 hover:text-white/80 border border-white/10 transition-colors"
                    >
                        Desagrupar
                    </button>
                )}

                {drawMode === 'drawing' && currentPointCount > 0 && (
                    <p className="text-white/25 text-[10px]">
                        {currentPointCount} punto{currentPointCount !== 1 ? 's' : ''} — doble clic para terminar abierto · clic en el primer punto para cerrar
                    </p>
                )}
                {(drawMode === 'selected' || drawMode === 'editing') && (
                    <button
                        onClick={onFlipHorizontal}
                        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs bg-white/5 text-white/60 hover:text-white/90 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <ArrowLeftRight size={12} /> Voltear horizontal
                    </button>
                )}
                {drawMode === 'selected' && (
                    <p className="text-white/25 text-[10px]">
                        Esquinas: arrastrar=escalar · Cmd+arrastrar=rotar · mover · doble clic=editar · Cmd+C/V=copiar
                    </p>
                )}
                {drawMode === 'editing' && (
                    <p className="text-white/25 text-[10px]">
                        Arrastrá puntos · doble clic en punto para curva/esquina · doble clic afuera para salir
                    </p>
                )}
            </div>

            {/* ── Texto ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-white/70 text-xs font-medium">
                    <Type size={13} />
                    Texto
                </div>
                <button
                    onClick={onToggleTextTool}
                    className={`w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        textToolActive
                            ? 'bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/30'
                            : 'bg-white/5 text-white/50 hover:text-white/80 border border-white/10'
                    }`}
                >
                    <Type size={12} />
                    {textToolActive ? 'Texto activo — clic para escribir' : 'Agregar texto'}
                </button>
                {textToolActive && (
                    <p className="text-white/25 text-[10px]">
                        Clic = crear · clic en texto = editar · mantener+arrastrar = mover · Enter o Esc = confirmar
                    </p>
                )}
                {textAnnotationCount > 0 && (
                    <p className="text-white/30 text-[10px]">
                        {textAnnotationCount} texto{textAnnotationCount !== 1 ? 's' : ''}
                    </p>
                )}
            </div>

            {/* ── Lienzo (Canvas mode) ── */}
            {canvasActive && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[#C9A96E] text-xs font-semibold uppercase tracking-widest">
                        <span>⊞</span> Lienzo
                    </div>
                    <p className="text-white/30 text-[10px]">Proporción</p>
                    <div className="grid grid-cols-2 gap-1">
                        {([
                            { value: '1:1', label: '1:1', sub: 'Instagram' },
                            { value: '4:5', label: '4:5', sub: 'Portrait' },
                            { value: '9:16', label: '9:16', sub: 'Stories' },
                            { value: '16:9', label: '16:9', sub: 'Slides' },
                        ] as const).map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => onCanvasRatioChange(opt.value)}
                                className={`flex flex-col items-center py-1.5 rounded-lg border text-xs transition-all ${
                                    canvasRatio === opt.value
                                        ? 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/40'
                                        : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80'
                                }`}
                            >
                                <span className="font-semibold">{opt.label}</span>
                                <span className="text-[9px] opacity-60">{opt.sub}</span>
                            </button>
                        ))}
                    </div>
                    {canvasLayerCount > 0 && (
                        <div className="flex items-center justify-between text-[10px] text-white/30 mt-1">
                            <span>{canvasLayerCount} capa{canvasLayerCount !== 1 ? 's' : ''}</span>
                            <button
                                onClick={onClearCanvasLayers}
                                className="text-red-400/60 hover:text-red-400 transition-colors"
                            >
                                Limpiar
                            </button>
                        </div>
                    )}
                    <p className="text-white/20 text-[10px]">Arrastrá fotos al lienzo · clic derecho en capa para opciones</p>
                </div>
            )}

            {/* Spacer + Undo + Reset */}
            <div className="flex-1" />
            <button
                onClick={onUndo}
                disabled={historyCount === 0}
                className="w-full py-2 rounded-lg border border-white/10 text-white/60 text-xs hover:text-white/80 hover:border-white/20 transition-colors disabled:opacity-25 flex items-center justify-center gap-1.5"
            >
                <Undo2 size={13} /> Deshacer (Ctrl+Z)
            </button>
            <button
                onClick={onReset}
                className="w-full py-2 rounded-lg border border-white/10 text-white/40 text-xs hover:text-white/70 hover:border-white/20 transition-colors"
            >
                Resetear todo
            </button>
        </>
    );
}
