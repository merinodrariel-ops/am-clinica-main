'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
    X, Download, RotateCcw, Sun, Crop as CropIcon, Wand2, Loader2, Check,
    RotateCw, Save, ImageIcon, Grid, ArrowLeft, Undo2,
    Play, ChevronLeft, ChevronRight, CheckSquare2, Globe2,
    PanelRightClose, PanelRightOpen, PenLine, Eye, EyeOff,
} from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { uploadEditedPhotoAction, replaceEditedPhotoAction } from '@/app/actions/patient-files-drive';

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

interface DrawShape {
    points: [number, number][]; // normalized 0–1 relative to image natural size
    closed: boolean;
    color: DrawColor;
}

function getDrawColorHex(color: DrawColor): string {
    switch (color) {
        case 'white':  return '#ffffff';
        case 'yellow': return '#FFE566';
        case 'cyan':   return '#66E5FF';
        case 'red':    return '#FF5566';
    }
}

function isImageFile(file: DriveFile): boolean {
    return file.mimeType.toLowerCase().startsWith('image/');
}

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

    const [drawActive, setDrawActive] = useState(false);
    const [drawVisible, setDrawVisible] = useState(true);
    const [drawColor, setDrawColor] = useState<DrawColor>('white');
    const [drawShapes, setDrawShapes] = useState<DrawShape[]>([]);
    const [currentPoints, setCurrentPoints] = useState<[number, number][]>([]);

    const [zoom, setZoom] = useState(1);
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
        imageUrl.startsWith('blob:');

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
        setDrawActive(false);
        setDrawShapes([]);
        setCurrentPoints([]);
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

    function handleSwitchFile(newFile: DriveFile) {
        if (newFile.id === activeFile?.id) return;
        if (isDirty && !confirm('Tenés cambios sin guardar. ¿Cambiar de foto de todas formas?')) return;
        resetEdits();
        setActiveFile(newFile);
        setImageUrl(`/api/drive/file/${newFile.id}`);
    }

    function handleMouseDown(e: React.MouseEvent) {
        if (zoom <= 1) return;
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
        // Bake bg-removed image + chosen color into a new blob → fixes it in the editor
        pushHistory();
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
        const img = imgRef.current;
        if (!canvas || !img) return;

        const W = img.naturalWidth || img.width;
        const H = img.naturalHeight || img.height;
        if (W === 0 || H === 0) return;
        canvas.width = W;
        canvas.height = H;

        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, W, H);

        if (!drawVisible) return;

        const allShapes = [...drawShapes];
        if (currentPoints.length > 0) {
            allShapes.push({ points: currentPoints, closed: false, color: drawColor });
        }

        for (const shape of allShapes) {
            if (shape.points.length < 1) continue;
            ctx.save();
            ctx.strokeStyle = getDrawColorHex(shape.color);
            ctx.lineWidth = Math.max(2, W / 400);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
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

            ctx.fillStyle = getDrawColorHex(shape.color);
            for (const [px, py] of shape.points) {
                ctx.beginPath();
                ctx.arc(px * W, py * H, Math.max(3, W / 250), 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }, [drawShapes, currentPoints, drawVisible, drawColor]);

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

    function getDrawCanvasXY(e: React.MouseEvent<HTMLCanvasElement>): [number, number] {
        const canvas = e.currentTarget;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
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
        setCurrentPoints(prev => {
            const pts = prev.slice(0, -1);
            if (pts.length >= 2) {
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
            setDrawShapes(prev => prev.slice(0, -1));
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

        return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), mime, 0.95));
    }

    async function handleEnterCropMode() {
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
                        a.download = `${f.name.replace(/\.[^.]+$/, '')}_web.jpg`;
                        a.click();
                        setTimeout(() => { URL.revokeObjectURL(url); res(); }, 500);
                    }, 'image/jpeg', 0.85);
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
                        {activeFile.name}
                    </p>
                    <div className="flex items-center gap-2 flex-shrink-0">
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
                                    <img
                                        ref={imgRef}
                                        src={imageUrl}
                                        alt={activeFile.name}
                                        crossOrigin="anonymous"
                                        style={imageStyle}
                                    />
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
                            rotation={rotation} setRotation={setRotation}
                            brightness={brightness} setBrightness={setBrightness}
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
                            onSetBrushMode={setBrushMode}
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
                            drawActive={drawActive}
                            onSetDrawActive={(v) => {
                                setDrawActive(v);
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
                        {/* Undo bg removal — mobile */}
                        {bgDone && (
                            <button
                                onClick={handleUndoBgRemoval}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/50 transition-colors"
                            >
                                <X size={13} /> Deshacer fondo
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
    drawActive, onSetDrawActive,
    drawVisible, onToggleDrawVisible,
    drawColor, onSetDrawColor,
    drawShapeCount, currentPointCount,
    onUndoLastDrawPoint,
    onClearDraw,
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
                        <button
                            onClick={onConfirmBg}
                            className="w-full mt-1 py-2 rounded-lg bg-blue-600/80 text-white text-sm font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                        >
                            <Check size={14} /> Confirmar
                        </button>
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
