'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
    X, Download, RotateCcw, Sun, Crop as CropIcon, Wand2, Loader2, Check,
    RotateCw, Save, ImageIcon, Grid, ArrowLeft, Undo2, Redo2,
    Play, ChevronLeft, ChevronRight, CheckSquare2, Globe2,
    PanelRightClose, PanelRightOpen, PenLine, Eye, EyeOff, ArrowLeftRight, Type, Plus, Copy, MessageCircle, Tag, Edit2, Zap, Trash2,
    AlignLeft, AlignCenter, AlignRight, Minus, Sparkles, Folder, Eraser
} from 'lucide-react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { uploadEditedPhotoAction, replaceEditedPhotoAction, duplicateDriveFileAction, saveFotosOrderAction, renameDriveFileAction, uploadPhotoForSocialAction } from '@/app/actions/patient-files-drive';
import { createClient as createSupabaseClient } from '@/utils/supabase/client';
import { type CanvasLayer, type CanvasRatio, RATIOS as CANVAS_RATIOS, loadImage as loadCanvasImage, makeLayer as makeCanvasLayer, getLayerCorners, hitTestCorner as hitTestLayerCorner, hitTestLayerBody } from './CanvasCompositor';
import { CROP_ASPECT_PRESETS, buildCenteredAspectCrop, getCropAspectPreset, shouldExportPhotoAsPng, type CropAspectPresetId } from '@/lib/photo-studio/crop-aspects';
import { getPhotoAnnotationDisplayScale } from '@/lib/photo-studio/text-scale';
import { DEFAULT_TEXT_FONT_SIZE, cloneTextAnnotationForPaste } from '@/lib/photo-studio/text-annotations';
import { shouldStartPhotoStudioInPresentation } from '@/lib/photo-studio/mobile-presentation';
import ShareWithPatientModal, { type ShareWithPatientItem } from './ShareWithPatientModal';
import { useSmileDesign } from '@/hooks/useSmileDesign';
import { useSmileMotion } from '@/hooks/useSmileMotion';
import SmileDesignPanel from './SmileDesignPanel';
import WarpBrush from './WarpBrush';
import BeforeAfterSlider from './BeforeAfterSlider';
import SubjectTransformOverlay from './SubjectTransformOverlay';
import { saveSmileDesignResult, getSmileShareUrl, saveSmileMotionVideos } from '@/app/actions/smile-design';

/**
 * Generates a side-by-side (before/after) base64 string for saving.
 */
async function generateComparisonBase64(beforeUrl: string, afterDataUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
        const imgBefore = new Image();
        const imgAfter = new Image();
        let loadedCount = 0;

        const onBothLoaded = () => {
            loadedCount++;
            if (loadedCount === 2) {
                try {
                    const canvas = document.createElement('canvas');
                    const w = imgBefore.naturalWidth || imgBefore.width;
                    const h = imgBefore.naturalHeight || imgBefore.height;
                    
                    // Constrain for performance/safety
                    const maxSide = 3200;
                    let scale = 1;
                    if (w > maxSide || h > maxSide) {
                        scale = maxSide / Math.max(w, h);
                    }
                    
                    const sw = Math.round(w * scale);
                    const sh = Math.round(h * scale);
                    
                    canvas.width = sw * 2;
                    canvas.height = sh;
                    const ctx = canvas.getContext('2d', { alpha: false })!;
                    
                    ctx.drawImage(imgBefore, 0, 0, sw, sh);
                    ctx.drawImage(imgAfter, sw, 0, sw, sh);
                    
                    // Separator line
                    ctx.fillStyle = '#ffffff44';
                    ctx.fillRect(sw - 1, 0, 2, sh);

                    const result = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(result.split(',')[1]);
                } catch (e) {
                    console.error('Comparison generation failed:', e);
                    resolve(null);
                }
            }
        };

        imgBefore.onload = onBothLoaded;
        imgAfter.onload = onBothLoaded;
        imgBefore.onerror = () => resolve(null);
        imgAfter.onerror = () => resolve(null);

        if (beforeUrl && !beforeUrl.startsWith('blob:') && !beforeUrl.startsWith('data:')) {
            imgBefore.crossOrigin = "anonymous";
        }
        if (afterDataUrl && !afterDataUrl.startsWith('blob:') && !afterDataUrl.startsWith('data:')) {
            imgAfter.crossOrigin = "anonymous";
        }
        imgBefore.src = beforeUrl;
        imgAfter.src = afterDataUrl;
    });
}

/**
 * Generates a before/after slice image at a given divider position (0-100%).
 * The left portion draws "before" and the right portion draws "after".
 */
async function generateSliceBase64(beforeUrl: string, afterDataUrl: string, pos: number): Promise<string | null> {
    return new Promise((resolve) => {
        const imgBefore = new Image();
        const imgAfter = new Image();
        let loadedCount = 0;

        const onBothLoaded = () => {
            loadedCount++;
            if (loadedCount === 2) {
                try {
                    const canvas = document.createElement('canvas');
                    const w = imgBefore.naturalWidth || imgBefore.width;
                    const h = imgBefore.naturalHeight || imgBefore.height;
                    const maxSide = 2400;
                    const scale = Math.min(1, maxSide / Math.max(w, h));
                    const sw = Math.round(w * scale);
                    const sh = Math.round(h * scale);
                    canvas.width = sw;
                    canvas.height = sh;
                    const ctx = canvas.getContext('2d', { alpha: false })!;

                    // Draw full "after" image as background
                    ctx.drawImage(imgAfter, 0, 0, sw, sh);

                    // Clip left portion and draw "before"
                    const splitX = Math.round(sw * (pos / 100));
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(0, 0, splitX, sh);
                    ctx.clip();
                    ctx.drawImage(imgBefore, 0, 0, sw, sh);
                    ctx.restore();

                    // Draw divider line
                    ctx.fillStyle = 'rgba(168,85,247,0.9)'; // purple-500
                    ctx.fillRect(splitX - 1, 0, 3, sh);

                    // Draw handle circle
                    const cx = splitX;
                    const cy = Math.round(sh / 2);
                    const r = Math.round(sw * 0.022);
                    ctx.beginPath();
                    ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(168,85,247,1)';
                    ctx.fill();

                    // Labels
                    const fontSize = Math.max(14, Math.round(sw * 0.018));
                    ctx.font = `bold ${fontSize}px sans-serif`;
                    ctx.fillStyle = 'rgba(255,255,255,0.7)';
                    ctx.fillText('ANTES', 12, sh - 12);
                    ctx.textAlign = 'right';
                    ctx.fillText('DESPUÉS', sw - 12, sh - 12);

                    const result = canvas.toDataURL('image/jpeg', 0.88);
                    resolve(result.split(',')[1]);
                } catch (e) {
                    console.error('Slice generation failed:', e);
                    resolve(null);
                }
            }
        };

        imgBefore.onload = onBothLoaded;
        imgAfter.onload = onBothLoaded;
        imgBefore.onerror = () => resolve(null);
        imgAfter.onerror = () => resolve(null);
        if (beforeUrl && !beforeUrl.startsWith('blob:') && !beforeUrl.startsWith('data:')) {
            imgBefore.crossOrigin = 'anonymous';
        }
        if (afterDataUrl && !afterDataUrl.startsWith('blob:') && !afterDataUrl.startsWith('data:')) {
            imgAfter.crossOrigin = 'anonymous';
        }
        imgBefore.src = beforeUrl;
        imgAfter.src = afterDataUrl;
    });
}


const PHOTO_CATEGORIES = [
  { group: 'Rostro (Natural)', items: ['Frente', 'Perfil Izquierdo', 'Perfil Derecho', '45 Grados'] },
  { group: 'Labios / Sonrisa', items: ['Reposo', 'Sonrisa Media', 'Sonrisa Amplia', 'Perfil'] },
  { group: 'Con Expansores', items: ['Frente en Oclusión', 'Frente en Apertura', 'Lateral Izquierdo', 'Lateral Derecho', 'Facial'] },
  { group: 'Intraoral', items: ['Frente', 'Lateral Izquierdo', 'Lateral Derecho', 'Oclusal Superior', 'Oclusal Inferior'] },
  { group: 'Radiología / Estudios', items: ['Panorámica', 'Telerradiografía', 'Escaneo Intraoral', 'Tomografía'] },
  { group: 'Otros', items: ['Documento', 'Referencia'] }
];

interface PhotoStudioModalProps {
    file: DriveFile | null;
    folderId: string;
    allFolderFiles: DriveFile[];   // images in same folder — for thumbnail strip
    patientId: string;
    patientName: string;
    canSave: boolean;              // whether the current user can write to Drive
    onClose: () => void;
    onSaved: () => void;           // called after successful save → triggers folder refresh
    autoStartSmile?: boolean;
}

/**
 * Heuristically guesses the category from a filename string.
 */
function guessCategory(filename: string): string | null {
    const f = filename.toLowerCase();
    
    // Face / Rostro
    if (f.includes('fren') && (f.includes('rost') || f.includes('fac'))) return 'Rostro (Natural) - Frente';
    if (f.includes('per') && (f.includes('rost') || f.includes('fac'))) return 'Rostro (Natural) - Perfil Izquierdo'; // Default guess
    if (f.includes('45')) return 'Rostro (Natural) - 45 Grados';
    
    // Lip / Smile
    if (f.includes('sonr') && f.includes('media')) return 'Labios / Sonrisa - Sonrisa Media';
    if (f.includes('sonr') && (f.includes('amp') || f.includes('max'))) return 'Labios / Sonrisa - Sonrisa Amplia';
    if (f.includes('repo')) return 'Labios / Sonrisa - Reposo';
    if (f.includes('sonr') || f.includes('lab')) return 'Labios / Sonrisa - Sonrisa Media';
    
    // Expansores
    if (f.includes('exp') || f.includes('ret')) {
        if (f.includes('ocl') || f.includes('mord')) return 'Con Expansores - Frente en Oclusión';
        if (f.includes('aper') || f.includes('abie')) return 'Con Expansores - Frente en Apertura';
        return 'Con Expansores - Frente en Oclusión';
    }
    
    // Intraoral
    if (f.includes('intra') || f.includes('buc')) {
        if (f.includes('lat') || f.includes('der') || f.includes('izq')) return 'Intraoral - Lateral Izquierdo';
        if (f.includes('sup') || f.includes('ocl')) return 'Intraoral - Oclusal Superior';
        if (f.includes('inf')) return 'Intraoral - Oclusal Inferior';
        return 'Intraoral - Frente';
    }
    
    // X-Ray / Radiography
    if (f.includes('pan') || f.includes('xray') || f.includes('rad')) return 'Radiología / Estudios - Panorámica';
    if (f.includes('tel')) return 'Radiología / Estudios - Telerradiografía';
    if (f.includes('scan') || f.includes('stl')) return 'Radiología / Estudios - Escaneo Intraoral';

    return null;
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
    fontSize: number;
    align: 'left' | 'center' | 'right';
}

interface FileEditState {
    rotation: number;
    brightness: number;
    drawShapes: DrawShape[];
    textAnnotations: TextAnnotation[];
}

function normalizeFileEditState(state?: Partial<FileEditState> | null): FileEditState {
    return {
        rotation: state?.rotation ?? 0,
        brightness: state?.brightness ?? 100,
        drawShapes: state?.drawShapes ?? [],
        textAnnotations: (state?.textAnnotations ?? []).map(normalizeTextAnnotation),
    };
}

function serializeFileEditState(state: FileEditState): string {
    return JSON.stringify(state);
}

function persistFileStatesToLocalStorage(patientId: string, states: Map<string, FileEditState>) {
    if (typeof window === 'undefined') return;

    const key = `am-clinica-states-${patientId}`;
    const data: Record<string, FileEditState> = {};
    states.forEach((value, id) => {
        data[id] = value;
    });

    if (Object.keys(data).length > 0) {
        localStorage.setItem(key, JSON.stringify(data));
    }
}

// Keep a cursor-positioned context menu fully inside the viewport (no off-screen clipping).
function clampMenuToViewport(x: number, y: number, width: number, height: number, padding = 12) {
    if (typeof window === 'undefined') return { x, y };
    const left = Math.max(padding, Math.min(x, window.innerWidth - width - padding));
    const top = Math.max(padding, Math.min(y, window.innerHeight - height - padding));
    return { x: left, y: top };
}

function AirDropIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden="true"
        >
            <path d="M12 20L8.5 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 20L15.5 16.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 4V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M5.2 10.5C6.8 7.7 9.1 6.3 12 6.3C14.9 6.3 17.2 7.7 18.8 10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M2.8 8.1C5.1 4.6 8.2 2.8 12 2.8C15.8 2.8 18.9 4.6 21.2 8.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
        </svg>
    );
}

const TEXT_LINE_HEIGHT = 1.35; // em — must match CSS in the textarea overlay
const DEFAULT_TEXT_ANNOTATION_WIDTH = 0.5;
function normalizeTextAnnotation(annotation: Partial<TextAnnotation>): TextAnnotation {
    return {
        id: annotation.id ?? `text-${Date.now()}`,
        x: annotation.x ?? 0,
        y: annotation.y ?? 0,
        text: annotation.text ?? '',
        color: annotation.color ?? 'white',
        width: annotation.width ?? DEFAULT_TEXT_ANNOTATION_WIDTH,
        fontSize: annotation.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
        align: annotation.align ?? 'left',
    };
}

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

function measureTextAnnotationWidth(text: string, currentWidth: number, x: number, canvasWidthPx: number, fontSize: number): number {
    if (!canvasWidthPx) return currentWidth;

    const measureCanvas = document.createElement('canvas');
    const ctx = measureCanvas.getContext('2d');
    if (!ctx) return currentWidth;

    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    const longestLinePx = Math.max(
        ...text.split('\n').map((line) => ctx.measureText(line || ' ').width),
        ctx.measureText('Texto...').width,
    );

    const desiredWidth = (longestLinePx + 24) / canvasWidthPx;
    const maxWidth = Math.max(0.18, 0.95 - x);
    return Math.max(0.18, Math.min(maxWidth, Math.max(currentWidth, desiredWidth)));
}

function getDefaultTextAnnotationWidth(x: number): number {
    return Math.max(0.22, Math.min(DEFAULT_TEXT_ANNOTATION_WIDTH, 0.95 - x));
}

function getAlignedTextX(baseX: number, boxWidth: number, align: TextAnnotation['align']): number {
    if (align === 'center') return baseX + boxWidth / 2;
    if (align === 'right') return baseX + boxWidth;
    return baseX;
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

function CanvasThumbnailPreview({ layers, bgColor, ratio }: {
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
            ctx.fillStyle = bgColor === 'black' ? '#111111' : '#ffffff';
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

export default function PhotoStudioModal({
    file,
    folderId,
    allFolderFiles,
    patientId,
    patientName,
    canSave,
    onClose,
    onSaved,
    autoStartSmile,
}: PhotoStudioModalProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const objectUrlRef = useRef<string | null>(null);
    const createdBlobUrlsRef = useRef<string[]>([]);
    const preBgUrlRef = useRef<string | null>(null); // URL before bg removal (for undo)
    const preCropImageRef = useRef<string | null>(null);  // full image (rotation-baked) used as crop source; stays until reset
    const prevCroppedUrlRef = useRef<string | null>(null); // cropped imageUrl saved when entering re-crop (for cancel)
    const cropPreBakeRef = useRef<string | null>(null);    // un-rotated base image used as rebake source while in crop mode
    const cropEntryRotationRef = useRef<number>(0);        // rotation value when crop was entered (restored on cancel)
    const cropJustEnteredRef = useRef<boolean>(false);     // skip the first useEffect fire when entering crop mode
    const cropRebakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const supabase = useMemo(() => createSupabaseClient(), []);
    // Per-file state cache — persists draws/rotation/brightness across photo navigation
    const fileStatesRef = useRef<Map<string, FileEditState>>(new Map());
    const activeFileIdRef = useRef<string | null>(file?.id ?? null);
    const latestPhotoStateRef = useRef<FileEditState>(normalizeFileEditState());
    const skipNextPhotoStateAutosaveRef = useRef(false);
    const photoStateDirtyRef = useRef(false);
    const photoStateLoadInProgressRef = useRef(false);
    const photoStateSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [photoStateReady, setPhotoStateReady] = useState(false);
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
    const [thumbnailContextMenu, setThumbnailContextMenu] = useState<{
        x: number;
        y: number;
        file: DriveFile;
        targetIds: string[];
    } | null>(null);
    const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
    const [hasCanvas, setHasCanvas] = useState(false);
    const [mousePos, setMousePos] = useState<[number, number] | null>(null);
    const [drawClipboard, setDrawClipboard] = useState<DrawShape | null>(null);

    // ── Multi-canvas state ─────────────────────────────────────────────────────
    type CanvasDoc = { id: string; name: string; ratio: CanvasRatio; layers: CanvasLayer[]; bgColor: string };
    const [canvases, setCanvases] = useState<CanvasDoc[]>([]);
    const [activeCanvasId, setActiveCanvasId] = useState<string | null>(null);
    const [canvasActive, setCanvasActive] = useState(false);
    const [canvasSaving, setCanvasSaving] = useState(false);

    // Derived — keep backward compat with all existing code referencing these
    const activeCanvas = canvases.find(c => c.id === activeCanvasId) ?? null;
    const canvasLayers: CanvasLayer[] = activeCanvas?.layers ?? [];
    const canvasRatio: CanvasRatio = (activeCanvas?.ratio as CanvasRatio) ?? '1:1';

    // Setters that update the active canvas inside canvases[]
    const setCanvasLayers = useCallback((updater: CanvasLayer[] | ((prev: CanvasLayer[]) => CanvasLayer[])) => {
        setCanvases(prev => prev.map(c => {
            if (c.id !== activeCanvasId) return c;
            const newLayers = typeof updater === 'function' ? updater(c.layers) : updater;
            return { ...c, layers: newLayers };
        }));
    }, [activeCanvasId]);

    const setCanvasRatio = useCallback((ratio: CanvasRatio) => {
        setCanvases(prev => prev.map(c => c.id === activeCanvasId ? { ...c, ratio } : c));
    }, [activeCanvasId]);

    const setActiveCanvasBgColor = useCallback((color: string) => {
        setCanvases(prev => prev.map(c => c.id === activeCanvasId ? { ...c, bgColor: color } : c));
    }, [activeCanvasId]);

    // ── Load canvases from DB on mount ─────────────────────────────────────────
    useEffect(() => {
        if (!patientId) return;
        import('@/app/actions/patient-canvases').then(async ({ listPatientCanvasesAction }) => {
            const { data, error } = await listPatientCanvasesAction(patientId);
            if (error || !data || data.length === 0) {
                // Try legacy localStorage fallback
                const key = `am-clinica-canvas-${patientId}`;
                const saved = localStorage.getItem(key);
                if (saved) {
                    try {
                        const parsed = JSON.parse(saved);
                        if (parsed.layers && parsed.layers.length > 0) {
                            const legacyId = 'legacy-' + patientId;
                            Promise.all((parsed.layers as any[]).map(async (l: any) => {
                                if (l.src?.startsWith('blob:')) return null;
                                try { const img = await loadCanvasImage(l.src); return { ...l, img }; }
                                catch { return null; }
                            })).then(results => {
                                const layers = results.filter(Boolean) as CanvasLayer[];
                                if (layers.length > 0) {
                                    setCanvases([{ id: legacyId, name: 'Lienzo 1', ratio: parsed.ratio ?? '1:1', layers, bgColor: '#ffffff' }]);
                                    setActiveCanvasId(legacyId);
                                    setHasCanvas(true);
                                }
                            });
                        }
                    } catch {}
                }
                return;
            }
            // Hydrate all canvases from DB
            const hydrated = await Promise.all(data.map(async (row) => {
                const layers = await Promise.all((row.layers as any[]).map(async (l: any) => {
                    if (l.src?.startsWith('blob:')) return null;
                    try { const img = await loadCanvasImage(l.src); return { ...l, img }; }
                    catch { return null; }
                }));
                return {
                    id: row.id,
                    name: row.name,
                    ratio: (row.ratio as CanvasRatio) ?? '1:1',
                    layers: layers.filter(Boolean) as CanvasLayer[],
                    bgColor: row.bg_color ?? '#ffffff',
                };
            }));
            setCanvases(hydrated);
            setActiveCanvasId(hydrated[0]?.id ?? null);
            if (hydrated.length > 0) setHasCanvas(true);
        });
    }, [patientId]);

    // ── Auto-save active canvas to DB (debounced) ──────────────────────────────
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (!activeCanvasId || activeCanvasId.startsWith('legacy-')) return;
        if (!activeCanvas) return;
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(async () => {
            setCanvasSaving(true);
            const { savePatientCanvasAction } = await import('@/app/actions/patient-canvases');
            await savePatientCanvasAction({
                id: activeCanvasId,
                layers: activeCanvas.layers.map(l => ({ ...l, img: undefined })),
                ratio: activeCanvas.ratio,
                bgColor: activeCanvas.bgColor,
            });
            setCanvasSaving(false);
        }, 2000);
        return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
    }, [activeCanvasId, activeCanvas]);

    const [canvasSelectedId, setCanvasSelectedId] = useState<string | null>(null);
    const [canvasContextMenu, setCanvasContextMenu] = useState<{ x: number; y: number; layerId: string } | null>(null);
    const [canvasLayerCropId, setCanvasLayerCropId] = useState<string | null>(null);
    const [canvasLayerCropAspectPreset, setCanvasLayerCropAspectPreset] = useState<CropAspectPresetId>('free');
    const [canvasLayerCropSel, setCanvasLayerCropSel] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
    const [canvasLayerCompletedCrop, setCanvasLayerCompletedCrop] = useState<PixelCrop | null>(null);
    const [canvasLayerCropRotation, setCanvasLayerCropRotation] = useState(0);
    const [canvasLayerCropBakedSrc, setCanvasLayerCropBakedSrc] = useState<string | null>(null);
    const canvasLayerCropPreBakeRef = useRef<string | null>(null); // layer.src before any rotation bake
    const canvasLayerCropRebakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const canvasLayerCropImgRef = useRef<HTMLImageElement>(null);
    const canvasLayersRef = useRef<HTMLCanvasElement>(null);
    const canvasHealPreviewRef = useRef<{ layerId: string; canvas: HTMLCanvasElement } | null>(null);
    const canvasHealSessionRef = useRef<{ layerId: string; prevSrc: string; canvas: HTMLCanvasElement } | null>(null);
    const openCvRef = useRef<any>(null);
    const openCvLoadingRef = useRef<Promise<any> | null>(null);
    const healLastPointRef = useRef<{ x: number; y: number; target: string } | null>(null);
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
    const textClipboardRef = useRef<TextAnnotation | null>(null);
    const selectedText = useMemo(() => textAnnotations.find(t => t.id === selectedTextId) ?? null, [textAnnotations, selectedTextId]);

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
    const [imageUrl, setImageUrl] = useState(() => file ? `/api/drive/file/${file.id}?cors=1` : '');
    const [imgLoaded, setImgLoaded] = useState(false);

    // Reset loading flag whenever we switch to a Drive-proxied URL (not local blobs/base64)
    useEffect(() => {
        if (imageUrl.startsWith('/api/drive/file/')) setImgLoaded(false);
    }, [imageUrl]);

    // Edit state
    const [rotation, setRotation] = useState(0);
    const [brightness, setBrightness] = useState(100);
    const [bgProcessing, setBgProcessing] = useState(false);
    const [bgDone, setBgDone] = useState(false);
    const [subjectTransformOpen, setSubjectTransformOpen] = useState(false);
    const [bgColor, setBgColor] = useState<BgColor>('transparent');
    const [hasTransparentBg, setHasTransparentBg] = useState(false);
    const [cropActive, setCropActive] = useState(false);
    const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
    const [cropAspectPreset, setCropAspectPreset] = useState<CropAspectPresetId>('free');
    const activeCropAspect = getCropAspectPreset(cropAspectPreset).aspect;
    const cropActiveRef = useRef(false);
    useEffect(() => { cropActiveRef.current = cropActive; }, [cropActive]);
    const isCropActive = cropActive || !!canvasLayerCropId;
    const isCropActiveRef = useRef(false);
    useEffect(() => { isCropActiveRef.current = isCropActive; }, [isCropActive]);

    const [brushMode, setBrushMode] = useState<'restore' | 'erase' | null>(null);
    const [brushSize, setBrushSize] = useState(40);
    const [magicWandActive, setMagicWandActive] = useState(false);
    const [magicWandTolerance, setMagicWandTolerance] = useState(50);
    const [exportFileName, setExportFileName] = useState('');
    const [exportDestination, setExportDestination] = useState<'patient' | 'social'>('social');
    const [healMode, setHealMode] = useState(false);
    const [healSize, setHealSize] = useState(28);
    const [healPreviewNonce, setHealPreviewNonce] = useState(0);
    const [healCursor, setHealCursor] = useState<{ x: number; y: number; size: number; visible: boolean }>({ x: 0, y: 0, size: 28, visible: false });

    type PhotoSnapshot = { kind: 'photo'; imageUrl: string; rotation: number; brightness: number; bgDone: boolean; bgColor: BgColor; hasTransparentBg?: boolean };
    type CanvasLayerSnapshot = { kind: 'canvas-layer'; canvasId: string; layerId: string; layerSrc: string };
    type Snapshot = PhotoSnapshot | CanvasLayerSnapshot;
    const [history, setHistory] = useState<Snapshot[]>([]);
    const [redoStack, setRedoStack] = useState<Snapshot[]>([]);

    // ── Persistence: Save/Restore individual file states (drawings, etc.) ────────
    useEffect(() => {
        activeFileIdRef.current = activeFile?.id ?? null;
    }, [activeFile]);

    useEffect(() => {
        latestPhotoStateRef.current = normalizeFileEditState({ rotation, brightness, drawShapes, textAnnotations });
    }, [rotation, brightness, drawShapes, textAnnotations]);

    useEffect(() => {
        if (!patientId) return;

        let cancelled = false;
        setPhotoStateReady(false);
        photoStateLoadInProgressRef.current = true;

        const loadPhotoStates = async () => {
            const key = `am-clinica-states-${patientId}`;
            const localStates = new Map<string, FileEditState>();
            const saved = localStorage.getItem(key);

            if (saved) {
                try {
                    const parsed = JSON.parse(saved) as Record<string, unknown>;
                    Object.entries(parsed).forEach(([id, state]) => {
                        localStates.set(id, normalizeFileEditState(state as Partial<FileEditState>));
                    });
                } catch (e) {
                    console.error('File states persistence load error', e);
                }
            }

            const { listPatientPhotoEditStatesAction } = await import('@/app/actions/patient-photo-edit-states');
            const { data, error } = await listPatientPhotoEditStatesAction(patientId);
            if (cancelled) return;

            const mergedStates = new Map<string, FileEditState>();

            if (!error) {
                data.forEach((row) => {
                    mergedStates.set(row.file_id, normalizeFileEditState({
                        rotation: row.rotation,
                        brightness: row.brightness,
                        drawShapes: Array.isArray(row.draw_shapes) ? row.draw_shapes as DrawShape[] : [],
                        textAnnotations: Array.isArray(row.text_annotations) ? row.text_annotations as TextAnnotation[] : [],
                    }));
                });
            }

            localStates.forEach((state, id) => {
                if (!mergedStates.has(id)) mergedStates.set(id, state);
            });

            fileStatesRef.current = mergedStates;
            persistFileStatesToLocalStorage(patientId, mergedStates);

            const currentFileId = activeFileIdRef.current;
            if (!currentFileId) return;

            const currentSaved = mergedStates.get(currentFileId);
            if (currentSaved) {
                skipNextPhotoStateAutosaveRef.current = true;
                setRotation(currentSaved.rotation);
                setBrightness(currentSaved.brightness);
                setDrawShapes(currentSaved.drawShapes);
                setTextAnnotations(currentSaved.textAnnotations);
            }
        };

        void loadPhotoStates().finally(() => {
            if (!cancelled) {
                photoStateLoadInProgressRef.current = false;
                setPhotoStateReady(true);
            }
        });

        return () => {
            cancelled = true;
        };
    }, [patientId]);

    const flushPhotoStateSave = useCallback(async (overrides?: { fileId?: string | null; state?: FileEditState }) => {
        const fileId = overrides?.fileId ?? activeFileIdRef.current;
        const state = overrides?.state ?? latestPhotoStateRef.current;

        if (!patientId || !fileId) return;

        if (photoStateSaveTimerRef.current) {
            clearTimeout(photoStateSaveTimerRef.current);
            photoStateSaveTimerRef.current = null;
        }

        const { savePatientPhotoEditStateAction } = await import('@/app/actions/patient-photo-edit-states');
        const { error } = await savePatientPhotoEditStateAction({
            fileId,
            patientId,
            rotation: state.rotation,
            brightness: state.brightness,
            drawShapes: state.drawShapes,
            textAnnotations: state.textAnnotations,
        });

        if (error) {
            console.error('[PhotoStudioModal] flush photo state error:', error);
            return;
        }

        fileStatesRef.current.set(fileId, state);
        persistFileStatesToLocalStorage(patientId, fileStatesRef.current);
        if (fileId === activeFileIdRef.current && serializeFileEditState(state) === serializeFileEditState(latestPhotoStateRef.current)) {
            photoStateDirtyRef.current = false;
        }
    }, [patientId]);

    useEffect(() => {
        if (!patientId) return;

        const channel = supabase
            .channel(`patient-photo-edit-states-${patientId}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'patient_photo_edit_states', filter: `patient_id=eq.${patientId}` },
                (payload: { new: { file_id?: string; rotation?: number; brightness?: number; draw_shapes?: unknown; text_annotations?: unknown } | null }) => {
                    const row = payload.new;
                    if (!row?.file_id) return;

                    const nextState = normalizeFileEditState({
                        rotation: row.rotation,
                        brightness: row.brightness,
                        drawShapes: Array.isArray(row.draw_shapes) ? row.draw_shapes as DrawShape[] : [],
                        textAnnotations: Array.isArray(row.text_annotations) ? row.text_annotations as TextAnnotation[] : [],
                    });

                    fileStatesRef.current.set(row.file_id, nextState);
                    persistFileStatesToLocalStorage(patientId, fileStatesRef.current);

                    if (row.file_id !== activeFileIdRef.current) return;

                    const localState = latestPhotoStateRef.current;
                    if (photoStateDirtyRef.current && serializeFileEditState(nextState) !== serializeFileEditState(localState)) {
                        return;
                    }

                    if (serializeFileEditState(nextState) === serializeFileEditState(localState)) return;

                    skipNextPhotoStateAutosaveRef.current = true;
                    setRotation(nextState.rotation);
                    setBrightness(nextState.brightness);
                    setDrawShapes(nextState.drawShapes);
                    setTextAnnotations(nextState.textAnnotations);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [patientId, supabase]);

    useEffect(() => {
        if (!patientId) return;

        // Capture current state into ref before saving
        if (activeFile) {
            fileStatesRef.current.set(activeFile.id, normalizeFileEditState({
                rotation, brightness, drawShapes, textAnnotations,
            }));
        }

        persistFileStatesToLocalStorage(patientId, fileStatesRef.current);
    }, [patientId, activeFile, rotation, brightness, drawShapes, textAnnotations]);

    useEffect(() => {
        if (!patientId || !activeFile) return;
        if (!photoStateReady || photoStateLoadInProgressRef.current) return;

        if (skipNextPhotoStateAutosaveRef.current) {
            skipNextPhotoStateAutosaveRef.current = false;
            return;
        }

        const nextState = normalizeFileEditState({ rotation, brightness, drawShapes, textAnnotations });
        photoStateDirtyRef.current = true;

        if (photoStateSaveTimerRef.current) clearTimeout(photoStateSaveTimerRef.current);
        photoStateSaveTimerRef.current = setTimeout(async () => {
            await flushPhotoStateSave({ fileId: activeFile.id, state: nextState });
        }, 400);

        return () => {
            if (photoStateSaveTimerRef.current) clearTimeout(photoStateSaveTimerRef.current);
        };
    }, [patientId, activeFile, rotation, brightness, drawShapes, textAnnotations, photoStateReady, flushPhotoStateSave]);

    // Rebake crop source when user adjusts rotation while crop mode is active.
    // This lets the user simultaneously rotate and crop (like Keynote / Google Slides).
    useEffect(() => {
        if (!cropActive || cropPreBakeRef.current === null) return;

        // Skip the initial fire that happens right when entering crop mode
        // (the entry handler already set up the correct initial image)
        if (cropJustEnteredRef.current) {
            cropJustEnteredRef.current = false;
            return;
        }

        if (cropRebakeTimerRef.current) clearTimeout(cropRebakeTimerRef.current);
        cropRebakeTimerRef.current = setTimeout(async () => {
            // 50ms debounce — fast enough to feel live without flooding canvas ops
            const base = cropPreBakeRef.current;
            if (!base) return;

            if (rotation === 0) {
                // No rotation — restore flat base image
                preCropImageRef.current = base;
                setImageUrl(base);
                objectUrlRef.current = base.startsWith('blob:') ? base : null;
                setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
                setCompletedCrop(null);
                return;
            }

            try {
                const img = await new Promise<HTMLImageElement>((res, rej) => {
                    const i = new Image();
                    if (base && !base.startsWith('blob:') && !base.startsWith('data:')) {
                        i.crossOrigin = 'anonymous';
                    }
                    i.onload = () => res(i);
                    i.onerror = () => rej(new Error('load failed'));
                    i.src = base;
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
                // While the cutout is active the bg color is only a CSS preview — a JPEG
                // bake here would flatten the transparency to black and the chosen color
                // could never be applied at export time. Keep PNG until bg is confirmed.
                const isPng = bgDone || shouldExportPhotoAsPng({
                    fileName: activeFile?.name ?? '',
                    mimeType: activeFile?.mimeType,
                    bgDone,
                    bgColor,
                    hasTransparentBg
                });
                const blob = await new Promise<Blob>((res, rej) =>
                    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), isPng ? 'image/png' : 'image/jpeg', 0.95)
                );
                const newUrl = URL.createObjectURL(blob);
                createdBlobUrlsRef.current.push(newUrl);
                objectUrlRef.current = newUrl;
                preCropImageRef.current = newUrl;
                setImageUrl(newUrl);
                // Reset crop selection since image dimensions changed after rotation
                setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
                setCompletedCrop(null);
            } catch {
                // ignore — keep current crop image
            }
        }, 50);

        return () => {
            if (cropRebakeTimerRef.current) clearTimeout(cropRebakeTimerRef.current);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rotation, cropActive]);

    const applyCropAspectPreset = useCallback((presetId: CropAspectPresetId, img = imgRef.current) => {
        setCropAspectPreset(presetId);
        const preset = getCropAspectPreset(presetId);

        if (!img || img.width === 0 || img.height === 0) {
            setCompletedCrop(null);
            return;
        }

        if (!preset.aspect) {
            return;
        }

        const nextCrop = buildCenteredAspectCrop(img.width, img.height, preset.aspect);
        setCrop(nextCrop);
        setCompletedCrop({
            unit: 'px',
            x: Math.round((nextCrop.x / 100) * img.width),
            y: Math.round((nextCrop.y / 100) * img.height),
            width: Math.round((nextCrop.width / 100) * img.width),
            height: Math.round((nextCrop.height / 100) * img.height),
        });
    }, []);

    const applyCanvasLayerCropAspectPreset = useCallback((presetId: CropAspectPresetId, img = canvasLayerCropImgRef.current) => {
        setCanvasLayerCropAspectPreset(presetId);
        const preset = getCropAspectPreset(presetId);

        if (!img || img.width === 0 || img.height === 0) {
            setCanvasLayerCompletedCrop(null);
            return;
        }

        if (!preset.aspect) {
            return;
        }

        const nextCrop = buildCenteredAspectCrop(img.width, img.height, preset.aspect);
        setCanvasLayerCropSel(nextCrop);
        setCanvasLayerCompletedCrop({
            unit: 'px',
            x: Math.round((nextCrop.x / 100) * img.width),
            y: Math.round((nextCrop.y / 100) * img.height),
            width: Math.round((nextCrop.width / 100) * img.width),
            height: Math.round((nextCrop.height / 100) * img.height),
        });
    }, []);

    // UI state
    // Rebake canvas layer crop source when rotation changes inside the layer crop overlay.
    // Same debounce pattern as the photo-mode rebake above.
    useEffect(() => {
        if (!canvasLayerCropId || canvasLayerCropPreBakeRef.current === null) return;
        if (canvasLayerCropRebakeTimerRef.current) clearTimeout(canvasLayerCropRebakeTimerRef.current);
        canvasLayerCropRebakeTimerRef.current = setTimeout(async () => {
            const base = canvasLayerCropPreBakeRef.current;
            if (!base) return;
            if (canvasLayerCropRotation === 0) {
                setCanvasLayerCropBakedSrc(base);
                return;
            }
            try {
                const img = await new Promise<HTMLImageElement>((res, rej) => {
                    const i = new Image();
                    if (base && !base.startsWith('blob:') && !base.startsWith('data:')) {
                        i.crossOrigin = 'anonymous';
                    }
                    i.onload = () => res(i); i.onerror = () => rej(new Error('load'));
                    i.src = base;
                });
                const radians = (canvasLayerCropRotation * Math.PI) / 180;
                const sin = Math.abs(Math.sin(radians));
                const cos = Math.abs(Math.cos(radians));
                const cW = Math.ceil(img.naturalWidth * cos + img.naturalHeight * sin);
                const cH = Math.ceil(img.naturalWidth * sin + img.naturalHeight * cos);
                const canvas = document.createElement('canvas');
                canvas.width = cW; canvas.height = cH;
                const ctx = canvas.getContext('2d')!;
                ctx.translate(cW / 2, cH / 2);
                ctx.rotate(radians);
                ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                const blob = await new Promise<Blob>((res, rej) =>
                    canvas.toBlob(b => b ? res(b) : rej(new Error('null')), 'image/jpeg', 0.95)
                );
                const newUrl = URL.createObjectURL(blob);
                setCanvasLayerCropBakedSrc(prev => {
                    if (prev && prev !== base) URL.revokeObjectURL(prev);
                    return newUrl;
                });
                setCanvasLayerCropSel({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
                setCanvasLayerCompletedCrop(null);
            } catch { /* ignore */ }
        }, 50);
        return () => { if (canvasLayerCropRebakeTimerRef.current) clearTimeout(canvasLayerCropRebakeTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasLayerCropRotation, canvasLayerCropId]);

    const [saveDialogOpen, setSaveDialogOpen] = useState(false);
    const [saving, setSaving] = useState<'replace' | 'copy' | 'redes' | null>(null);

    const [editedFileIds, setEditedFileIds] = useState<Set<string>>(() => {
        if (typeof window === 'undefined') return new Set();
        try {
            const stored = localStorage.getItem(`edited_photos_${patientId}`);
            return stored ? new Set(JSON.parse(stored) as string[]) : new Set();
        } catch { return new Set(); }
    });

    const markAsEdited = useCallback((fileId: string) => {
        setEditedFileIds(prev => {
            const next = new Set([...prev, fileId]);
            try { localStorage.setItem(`edited_photos_${patientId}`, JSON.stringify([...next])); } catch {}
            return next;
        });
    }, [patientId]);

    const baseImageFiles = useMemo(() => allFolderFiles.filter(isImageFile), [allFolderFiles]);
    const [imageOrderIds, setImageOrderIds] = useState<string[]>(() => baseImageFiles.map(item => item.id));
    // Tracks the ID of a recently saved copy so it always lands at the end of the filmstrip
    const pendingCopyIdRef = useRef<string | null>(null);
    const imageFiles = useMemo(() => {
        const byId = new Map(baseImageFiles.map(item => [item.id, item]));
        const ordered: DriveFile[] = [];

        imageOrderIds.forEach((id) => {
            const item = byId.get(id);
            if (item) {
                ordered.push(item);
                byId.delete(id);
            }
        });

        return [...ordered, ...byId.values()];
    }, [baseImageFiles, imageOrderIds]);

    useEffect(() => {
        setImageOrderIds((prev) => {
            const validPrev = prev.filter((id) => baseImageFiles.some((item) => item.id === id));
            const allIds = baseImageFiles.map((item) => item.id);
            const missing = allIds.filter((id) => !validPrev.includes(id));
            // If a copy was just saved, ensure its ID lands at the very end
            const pendingId = pendingCopyIdRef.current;
            if (pendingId && missing.includes(pendingId)) {
                pendingCopyIdRef.current = null;
                const otherMissing = missing.filter((id) => id !== pendingId);
                return [...validPrev, ...otherMissing, pendingId];
            }
            return [...validPrev, ...missing];
        });
    }, [baseImageFiles]);

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

    // ── Smile Design ──────────────────────────────────────────────────────────
    const smileDesign = useSmileDesign();
    const smileMotion = useSmileMotion();
    const [smileMode, setSmileMode] = useState(false);
    const [showSmileGrid, setShowSmileGrid] = useState(false);
    const [smileSaved, setSmileSaved] = useState(false);
    const [smileProcessingTime, setSmileProcessingTime] = useState<number | null>(null);
    const [showWarpBrush, setShowWarpBrush] = useState(false);
    const smileStartTimeRef = useRef<number | null>(null);
    const slicePosRef = useRef<number>(50); // tracks the current BeforeAfterSlider divider position
    const autoStartSmileRef = useRef(autoStartSmile ?? false);

    // Auto-trigger Smile Design when opened via quick-access button
    useEffect(() => {
        if (!autoStartSmileRef.current || !imageUrl || smileMode) return;
        const run = async () => {
            try {
                const res = await fetch(imageUrl);
                const blob = await res.blob();
                setSmileMode(true);
                setSmileProcessingTime(null);
                smileStartTimeRef.current = Date.now();
                await smileDesign.process(blob);
                if (smileStartTimeRef.current) {
                    setSmileProcessingTime((Date.now() - smileStartTimeRef.current) / 1000);
                }
            } catch { /* silently fail */ }
        };
        run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageUrl]);

    // Multi-select + web download state
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [multiSelectMode, setMultiSelectMode] = useState(false);
    const [downloadingWeb, setDownloadingWeb] = useState(false);
    const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
    const [sharePatientItems, setSharePatientItems] = useState<ShareWithPatientItem[] | null>(null);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [shareLoading, setShareLoading] = useState(false);
    const [shareFile, setShareFile] = useState<{ url: string; name: string; rawFile?: File } | null>(null);
    const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
    const [thumbnailDragId, setThumbnailDragId] = useState<string | null>(null);
    const [thumbnailDropIndicator, setThumbnailDropIndicator] = useState<{ id: string; edge: 'top' | 'bottom' } | null>(null);
    const downloadMenuRef = useRef<HTMLDivElement>(null);
    const currentTargetIds = useMemo(() => {
        if (selectedIds.size > 0) {
            return imageFiles.filter(item => selectedIds.has(item.id)).map(item => item.id);
        }
        return activeFile ? [activeFile.id] : [];
    }, [activeFile, imageFiles, selectedIds]);

    const getFileById = useCallback((fileId: string) => imageFiles.find(item => item.id === fileId) ?? null, [imageFiles]);

    const getContextTargetIds = useCallback((clickedId: string) => {
        if (selectedIds.size > 1 && selectedIds.has(clickedId)) {
            return imageFiles.filter(item => selectedIds.has(item.id)).map(item => item.id);
        }
        return [clickedId];
    }, [imageFiles, selectedIds]);

    const openThumbnailContextMenu = useCallback((event: React.MouseEvent<HTMLButtonElement>, file: DriveFile) => {
        event.preventDefault();
        const MENU_WIDTH = 240;
        const MENU_HEIGHT = 206;
        const PADDING = 12;
        const rect = event.currentTarget.getBoundingClientRect();
        const preferredLeft = rect.right + 12;
        const preferredTop = rect.top + rect.height / 2 - MENU_HEIGHT / 2;
        const left = Math.max(PADDING, Math.min(preferredLeft, window.innerWidth - MENU_WIDTH - PADDING));
        const top = Math.max(PADDING, Math.min(preferredTop, window.innerHeight - MENU_HEIGHT - PADDING));

        setMenuView('main');
        setThumbnailContextMenu({
            x: left,
            y: top,
            file,
            targetIds: getContextTargetIds(file.id),
        });
    }, [getContextTargetIds]);

    const [menuView, setMenuView] = useState<'main' | 'categories'>('main');

    useEffect(() => {
        if (!downloadMenuOpen) return;

        function handlePointerDown(event: MouseEvent) {
            if (!downloadMenuRef.current?.contains(event.target as Node)) {
                setDownloadMenuOpen(false);
            }
        }

        window.addEventListener('mousedown', handlePointerDown);
        return () => window.removeEventListener('mousedown', handlePointerDown);
    }, [downloadMenuOpen]);

    // Presentation mode state
    const [presentationMode, setPresentationMode] = useState(false);
    const [presentationIdx, setPresentationIdx] = useState(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!shouldStartPhotoStudioInPresentation({
            viewportWidth: window.innerWidth,
            imageCount: imageFiles.length,
            autoStartSmile: autoStartSmileRef.current,
        })) return;

        const idx = imageFiles.findIndex(f => f.id === activeFile?.id);
        setPresentationIdx(Math.max(0, idx));
        setPresentationMode(true);
    }, [activeFile?.id, imageFiles]);

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
        setHasTransparentBg(false);
        setCropActive(false);
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        setCompletedCrop(null);
        setCropAspectPreset('free');
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setShowGrid(false);
        setBrushMode(null);
        setMagicWandActive(false);
        setMagicWandTolerance(15);
        setHealMode(false);
        hideHealCursor();
        offscreenCanvasRef.current = null;
        originalImgForRestoreRef.current = null;
        canvasHealPreviewRef.current = null;
        canvasHealSessionRef.current = null;
        healLastPointRef.current = null;
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
            setImageUrl(`/api/drive/file/${file.id}?cors=1`);
            resetEdits();
        }
    }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            createdBlobUrlsRef.current.forEach((url) => {
                try {
                    URL.revokeObjectURL(url);
                } catch (e) {}
            });
            createdBlobUrlsRef.current = [];
            if (objectUrlRef.current) {
                try {
                    URL.revokeObjectURL(objectUrlRef.current);
                } catch (e) {}
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
            if (isCropActiveRef.current) return;
            const delta = e.deltaY > 0 ? -0.15 : 0.15;
            setZoom(prev => {
                const next = Math.min(5, Math.max(0.25, prev + delta));
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

    // Keyboard shortcut: Cmd/Ctrl+Z → undo, Cmd/Ctrl+Y / Cmd/Ctrl+Shift+Z → redo
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.metaKey || e.ctrlKey) {
                if (e.shiftKey && e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    handleRedo();
                } else if (e.key.toLowerCase() === 'z') {
                    e.preventDefault();
                    handleUndo();
                } else if (e.key.toLowerCase() === 'y') {
                    e.preventDefault();
                    handleRedo();
                }
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [history, redoStack]);

    // Keyboard shortcut: Cmd+C / Cmd+V for selected text annotations or draw shapes
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!e.metaKey && !e.ctrlKey) return;
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            const key = e.key.toLowerCase();
            if (key === 'c' && selectedTextId) {
                const textAnnotation = textAnnotations.find(t => t.id === selectedTextId);
                if (textAnnotation) {
                    textClipboardRef.current = textAnnotation;
                    setDrawClipboard(null);
                    e.preventDefault();
                    return;
                }
            }
            if (key === 'v' && textClipboardRef.current) {
                const newText = cloneTextAnnotationForPaste(textClipboardRef.current, `text-${Date.now()}`);
                textClipboardRef.current = newText;
                setTextAnnotations(prev => [...prev, newText]);
                setSelectedTextId(newText.id);
                setEditingTextId(null);
                setTextToolActive(true);
                e.preventDefault();
                return;
            }

            if (key === 'c' && selectedShapeId) {
                const shape = drawShapes.find(s => s.id === selectedShapeId);
                if (shape) {
                    textClipboardRef.current = null;
                    setDrawClipboard(shape);
                    e.preventDefault();
                }
            }
            if (key === 'v' && drawClipboard) {
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
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTextId, textAnnotations, selectedShapeId, drawShapes, drawClipboard]);

    // Keyboard shortcut: Delete / Backspace → delete selected shape, text annotation, or canvas layer
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
            if (e.key !== 'Delete' && e.key !== 'Backspace' && e.keyCode !== 8 && e.keyCode !== 46) return;
            if (editingTextId) return;

            // Use the centralized delete handler
            handleDeleteSelection();
            e.preventDefault();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasActive, canvasSelectedId, selectedShapeId, drawMode, selectedTextId, editingTextId]);

    async function handleSwitchFile(newFile: DriveFile) {
        if (newFile.id === activeFile?.id) {
            setCanvasActive(false);
            return;
        }
        setCanvasActive(false);
        // Exit Smile Design mode silently when switching photos
        if (smileMode) {
            smileDesign.reset();
            setSmileMode(false);
            setShowSmileGrid(false);
            setSmileSaved(false);
        }
        // Save current photo's editable state before switching
        if (activeFile) {
            const currentState = normalizeFileEditState({
                rotation, brightness, drawShapes, textAnnotations,
            });
            fileStatesRef.current.set(activeFile.id, currentState);
            await flushPhotoStateSave({ fileId: activeFile.id, state: currentState });
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
        setImageUrl(`/api/drive/file/${newFile.id}?cors=1`);
    }

    function clearMultiSelection() {
        setSelectedIds(new Set());
        setSelectionAnchorId(null);
        setMultiSelectMode(false);
    }

    function handleThumbnailSelect(file: DriveFile, e: React.MouseEvent<HTMLButtonElement>) {
        const wantsMultiSelect = e.shiftKey || e.metaKey || e.ctrlKey || multiSelectMode;

        if (!wantsMultiSelect) {
            clearMultiSelection();
            setCanvasActive(false);
            // handleSwitchFile already handles smile mode exit
            handleSwitchFile(file);
            setSelectionAnchorId(file.id);
            return;
        }

        setMultiSelectMode(true);
        setCanvasActive(false);

        if (e.shiftKey && selectionAnchorId) {
            const anchorIdx = imageFiles.findIndex(item => item.id === selectionAnchorId);
            const currentIdx = imageFiles.findIndex(item => item.id === file.id);
            if (anchorIdx !== -1 && currentIdx !== -1) {
                const start = Math.min(anchorIdx, currentIdx);
                const end = Math.max(anchorIdx, currentIdx);
                const rangeIds = imageFiles.slice(start, end + 1).map(item => item.id);
                setSelectedIds(prev => {
                    const next = new Set(prev);
                    rangeIds.forEach(id => next.add(id));
                    return next;
                });
                return;
            }
        }

        setSelectionAnchorId(file.id);
        let nextSize = 0;
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (e.metaKey || e.ctrlKey || multiSelectMode) {
                if (next.has(file.id)) next.delete(file.id);
                else next.add(file.id);
            } else {
                next.add(file.id);
            }
            nextSize = next.size;
            return next;
        });
        if (nextSize === 0) setMultiSelectMode(false);
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
            const next = Math.min(5, Math.max(0.25, touchRef.current.startZoom * scale));
            if (next <= 1) { setPanX(0); setPanY(0); }
            setZoom(next);
        }
    }

    function handleTouchEnd() {
        touchRef.current = null;
    }

    function pushHistory(snap?: Snapshot) {
        const entry: Snapshot = snap ?? { kind: 'photo', imageUrl, rotation, brightness, bgDone, bgColor, hasTransparentBg };
        setHistory(prev => [...prev.slice(-19), entry]);
        setRedoStack([]); // Clear redo stack on new action
    }

    function handleUndo() {
        const snap = history[history.length - 1];
        if (!snap) return;

        const selectedLayer = canvasActive && canvasSelectedId
            ? canvasLayers.find(l => l.id === canvasSelectedId)
            : null;

        const currentEntry: Snapshot = selectedLayer
            ? {
                kind: 'canvas-layer',
                canvasId: activeCanvasId || '',
                layerId: selectedLayer.id,
                layerSrc: selectedLayer.src,
              }
            : {
                kind: 'photo',
                imageUrl,
                rotation,
                brightness,
                bgDone,
                bgColor,
                hasTransparentBg,
              };

        setRedoStack(prev => [...prev, currentEntry]);
        setHistory(prev => prev.slice(0, -1));

        if (snap.kind === 'canvas-layer') {
            void loadCanvasImage(snap.layerSrc).then(img => {
                setCanvases(prev => prev.map(canvas => {
                    if (canvas.id !== snap.canvasId) return canvas;
                    return {
                        ...canvas,
                        layers: canvas.layers.map(layer =>
                            layer.id === snap.layerId
                                ? { ...layer, src: snap.layerSrc, img }
                                : layer
                        ),
                    };
                }));
            }).catch(() => {
                toast.error('No se pudo deshacer la corrección');
            });
            return;
        }

        objectUrlRef.current = snap.imageUrl.startsWith('blob:') ? snap.imageUrl : null;
        setImageUrl(snap.imageUrl);
        setRotation(snap.rotation);
        setBrightness(snap.brightness);
        setBgDone(snap.bgDone);
        setBgColor(snap.bgColor);
        setHasTransparentBg(snap.hasTransparentBg ?? false);
        setCropActive(false);
        setCompletedCrop(null);
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });

        if (brushMode !== null || magicWandActive) {
            // Keep brush/wand active and reload the undone image into the offscreen/onscreen canvases
            const img = new Image();
            if (snap.imageUrl && !snap.imageUrl.startsWith('blob:') && !snap.imageUrl.startsWith('data:')) {
                img.crossOrigin = 'anonymous';
            }
            img.onload = () => {
                const oc = offscreenCanvasRef.current;
                if (oc) {
                    oc.width = img.naturalWidth;
                    oc.height = img.naturalHeight;
                    const octx = oc.getContext('2d')!;
                    octx.clearRect(0, 0, oc.width, oc.height);
                    octx.drawImage(img, 0, 0);

                    const vc = brushCanvasRef.current;
                    if (vc) {
                        vc.width = oc.width;
                        vc.height = oc.height;
                        const vctx = vc.getContext('2d')!;
                        vctx.clearRect(0, 0, vc.width, vc.height);
                        vctx.drawImage(oc, 0, 0);
                    }
                }
            };
            img.src = snap.imageUrl;
        } else {
            setBrushMode(null);
            setMagicWandActive(false);
            offscreenCanvasRef.current = null;
        }

        setHealMode(false);
        hideHealCursor();
        canvasHealPreviewRef.current = null;
        canvasHealSessionRef.current = null;
        healLastPointRef.current = null;
        // preCropImageRef stays valid — user can still re-crop from full image after undo
    }

    function handleRedo() {
        const snap = redoStack[redoStack.length - 1];
        if (!snap) return;

        const selectedLayer = canvasActive && canvasSelectedId
            ? canvasLayers.find(l => l.id === canvasSelectedId)
            : null;

        const currentEntry: Snapshot = selectedLayer
            ? {
                kind: 'canvas-layer',
                canvasId: activeCanvasId || '',
                layerId: selectedLayer.id,
                layerSrc: selectedLayer.src,
              }
            : {
                kind: 'photo',
                imageUrl,
                rotation,
                brightness,
                bgDone,
                bgColor,
                hasTransparentBg,
              };

        setHistory(prev => [...prev, currentEntry]);
        setRedoStack(prev => prev.slice(0, -1));

        if (snap.kind === 'canvas-layer') {
            void loadCanvasImage(snap.layerSrc).then(img => {
                setCanvases(prev => prev.map(canvas => {
                    if (canvas.id !== snap.canvasId) return canvas;
                    return {
                        ...canvas,
                        layers: canvas.layers.map(layer =>
                            layer.id === snap.layerId
                                ? { ...layer, src: snap.layerSrc, img }
                                : layer
                        ),
                    };
                }));
            }).catch(() => {
                toast.error('No se pudo rehacer la corrección');
            });
            return;
        }

        objectUrlRef.current = snap.imageUrl.startsWith('blob:') ? snap.imageUrl : null;
        setImageUrl(snap.imageUrl);
        setRotation(snap.rotation);
        setBrightness(snap.brightness);
        setBgDone(snap.bgDone);
        setBgColor(snap.bgColor);
        setHasTransparentBg(snap.hasTransparentBg ?? false);
        setCropActive(false);
        setCompletedCrop(null);
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });

        if (brushMode !== null || magicWandActive) {
            const img = new Image();
            if (snap.imageUrl && !snap.imageUrl.startsWith('blob:') && !snap.imageUrl.startsWith('data:')) {
                img.crossOrigin = 'anonymous';
            }
            img.onload = () => {
                const oc = offscreenCanvasRef.current;
                if (oc) {
                    oc.width = img.naturalWidth;
                    oc.height = img.naturalHeight;
                    const octx = oc.getContext('2d')!;
                    octx.clearRect(0, 0, oc.width, oc.height);
                    octx.drawImage(img, 0, 0);

                    const vc = brushCanvasRef.current;
                    if (vc) {
                        vc.width = oc.width;
                        vc.height = oc.height;
                        const vctx = vc.getContext('2d')!;
                        vctx.clearRect(0, 0, vc.width, vc.height);
                        vctx.drawImage(oc, 0, 0);
                    }
                }
            };
            img.src = snap.imageUrl;
        } else {
            setBrushMode(null);
            setMagicWandActive(false);
            offscreenCanvasRef.current = null;
        }

        setHealMode(false);
        hideHealCursor();
        canvasHealPreviewRef.current = null;
        canvasHealSessionRef.current = null;
        healLastPointRef.current = null;
    }

    async function handleRemoveBackground() {
        cancelBgRef.current = false;
        setBgProcessing(true);
        
        const selectedLayer = canvasActive && canvasSelectedId
            ? canvasLayers.find(l => l.id === canvasSelectedId)
            : null;
        
        const srcToUse = selectedLayer ? selectedLayer.src : imageUrl;
        if (!selectedLayer) {
            preBgUrlRef.current = imageUrl; // save for undo only for main image
        }
        
        try {
            const { removeBackground: removeBg } = await import('@imgly/background-removal');
            const response = await fetch(srcToUse);
            const blob = await response.blob();
            const resultBlob = await removeBg(blob, {
                model: 'isnet_quint8',
                device: 'gpu'
            });
            if (cancelBgRef.current) {
                if (!selectedLayer) preBgUrlRef.current = null;
                return;
            }
            
            if (selectedLayer && activeCanvasId) {
                pushHistory({
                    kind: 'canvas-layer',
                    canvasId: activeCanvasId,
                    layerId: selectedLayer.id,
                    layerSrc: selectedLayer.src
                });
            } else {
                pushHistory();
            }
            
            const newUrl = URL.createObjectURL(resultBlob);
            createdBlobUrlsRef.current.push(newUrl);
            
            if (selectedLayer) {
                let baseName = 'recorte';
                if (selectedLayer.fileId) {
                    baseName = `recorte_${selectedLayer.fileId}`;
                }
                const filename = `${baseName}_${Date.now()}.png`;
                
                const formData = new FormData();
                formData.append('file', new File([resultBlob], filename, { type: 'image/png' }));
                
                const saveToastId = toast.loading('Guardando recorte en Drive...');
                try {
                    const uploadRes = await uploadEditedPhotoAction(folderId, filename, formData);
                    if (uploadRes.error || !uploadRes.fileId) {
                        console.error('[canvas-layer-bg-upload] error:', uploadRes.error);
                        const img = await loadCanvasImage(newUrl);
                        setCanvasLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, src: newUrl, img } : l));
                        toast.success('Fondo de capa eliminado (sesión temporal)', { id: saveToastId });
                    } else {
                        const driveUrl = `/api/drive/file/${uploadRes.fileId}`;
                        const img = await loadCanvasImage(driveUrl);
                        setCanvasLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, src: driveUrl, img, fileId: uploadRes.fileId } : l));
                        toast.success('Fondo de capa eliminado y guardado en Drive', { id: saveToastId });
                    }
                } catch (uploadErr) {
                    console.error('[canvas-layer-bg-upload] exception:', uploadErr);
                    const img = await loadCanvasImage(newUrl);
                    setCanvasLayers(prev => prev.map(l => l.id === selectedLayer.id ? { ...l, src: newUrl, img } : l));
                    toast.success('Fondo de capa eliminado (sesión temporal)', { id: saveToastId });
                }
            } else {
                objectUrlRef.current = newUrl;
                preCropImageRef.current = null; // bg changed — crop reference must be refreshed
                setImageUrl(newUrl);
                setBgDone(true);
                setBgColor('transparent');
                initBrushCanvas(newUrl, preBgUrlRef.current!);
                // Canva-style: open the subject transform editor right away so the
                // cutout is immediately draggable/scalable as its own layer.
                setSubjectTransformOpen(true);
                toast.success('Fondo eliminado — arrastrá el sujeto para moverlo', { duration: 4000 });
            }
        } catch (err) {
            console.error('[bg-removal]', err);
            if (!cancelBgRef.current) {
                toast.error('Error al remover fondo');
            }
            if (!selectedLayer) preBgUrlRef.current = null;
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

    // Flattened result of moving/scaling the cutout (Canva-style). Keeps the
    // transparent background so the bg color selector and save flow are untouched.
    function handleSubjectTransformApply(blob: Blob) {
        pushHistory();
        const newUrl = URL.createObjectURL(blob);
        objectUrlRef.current = newUrl;
        preCropImageRef.current = null;
        setImageUrl(newUrl);
        setSubjectTransformOpen(false);
    }

    function initBrushCanvas(bgRemovedUrl: string, origUrl: string) {
        const img = new Image();
        if (bgRemovedUrl && !bgRemovedUrl.startsWith('blob:') && !bgRemovedUrl.startsWith('data:')) {
            img.crossOrigin = 'anonymous';
        }
        img.onload = () => {
            const oc = document.createElement('canvas');
            oc.width = img.naturalWidth;
            oc.height = img.naturalHeight;
            oc.getContext('2d')!.drawImage(img, 0, 0);
            offscreenCanvasRef.current = oc;
        };
        img.src = bgRemovedUrl;
        const origImg = new Image();
        if (origUrl && !origUrl.startsWith('blob:') && !origUrl.startsWith('data:')) {
            origImg.crossOrigin = 'anonymous';
        }
        origImg.src = origUrl;
        originalImgForRestoreRef.current = origImg;
    }

    async function startManualEraser(initialMode: 'restore' | 'erase' | 'magic') {
        if (!bgDone) {
            const toastId = toast.loading('Inicializando editor de fondo...');
            try {
                preBgUrlRef.current = imageUrl; // save for undo/restore
                
                // Wait for the image to load into offscreen canvas
                const img = new Image();
                if (imageUrl && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
                    img.crossOrigin = 'anonymous';
                }
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = () => reject(new Error('No se pudo cargar la imagen para editar'));
                    img.src = imageUrl;
                });
                
                const oc = document.createElement('canvas');
                oc.width = img.naturalWidth;
                oc.height = img.naturalHeight;
                oc.getContext('2d')!.drawImage(img, 0, 0);
                offscreenCanvasRef.current = oc;
                
                const origImg = new Image();
                if (imageUrl && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
                    origImg.crossOrigin = 'anonymous';
                }
                await new Promise((resolve) => {
                    origImg.onload = resolve;
                    origImg.onerror = resolve; // fallback
                    origImg.src = imageUrl;
                });
                originalImgForRestoreRef.current = origImg;
                
                pushHistory();
                setBgDone(true);
                setBgColor('black');
                toast.success('Editor manual inicializado', { id: toastId });
            } catch (err) {
                toast.error('Error al inicializar editor manual', { id: toastId });
                return;
            }
        }
        
        if (initialMode === 'magic') {
            setMagicWandActive(true);
            setBrushMode(null);
        } else {
            setMagicWandActive(false);
            setBrushMode(initialMode);
        }
        setHealMode(false);
        setDrawMode('idle');
        setMousePos(null);
    }

    function scanlineFloodFillErase(ctx: CanvasRenderingContext2D, startX: number, startY: number, tolerancePercent: number) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const imgData = ctx.getImageData(0, 0, width, height);
        const data = imgData.data;
        
        const tolerance = (tolerancePercent / 100) * 441.67;
        const startIdx = (startY * width + startX) * 4;
        const targetR = data[startIdx];
        const targetG = data[startIdx + 1];
        const targetB = data[startIdx + 2];
        const targetA = data[startIdx + 3];
        
        if (targetA === 0) return;
        
        const visited = new Uint8Array(width * height);
        
        function match(x: number, y: number): boolean {
            const idx = (y * width + x) * 4;
            if (data[idx + 3] === 0) return false;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const dist = Math.sqrt((r - targetR) ** 2 + (g - targetG) ** 2 + (b - targetB) ** 2);
            return dist <= tolerance;
        }
        
        const queueX: number[] = [startX];
        const queueY: number[] = [startY];
        
        while (queueX.length > 0) {
            const cx = queueX.pop()!;
            const cy = queueY.pop()!;
            
            let lx = cx;
            while (lx > 0 && match(lx - 1, cy) && !visited[cy * width + (lx - 1)]) {
                lx--;
            }
            
            let rx = cx;
            while (rx < width - 1 && match(rx + 1, cy) && !visited[cy * width + (rx + 1)]) {
                rx++;
            }
            
            for (let x = lx; x <= rx; x++) {
                const idx = cy * width + x;
                visited[idx] = 1;
                const pIdx = idx * 4;
                data[pIdx + 3] = 0;
            }
            
            let scanUp = false;
            let scanDown = false;
            for (let x = lx; x <= rx; x++) {
                if (cy > 0) {
                    const isMatch = match(x, cy - 1);
                    const isVisited = visited[(cy - 1) * width + x];
                    if (isMatch && !isVisited) {
                        if (!scanUp) {
                            queueX.push(x);
                            queueY.push(cy - 1);
                            scanUp = true;
                        }
                    } else {
                        scanUp = false;
                    }
                }
                if (cy < height - 1) {
                    const isMatch = match(x, cy + 1);
                    const isVisited = visited[(cy + 1) * width + x];
                    if (isMatch && !isVisited) {
                        if (!scanDown) {
                            queueX.push(x);
                            queueY.push(cy + 1);
                            scanDown = true;
                        }
                    } else {
                        scanDown = false;
                    }
                }
            }
        }
        
        ctx.putImageData(imgData, 0, 0);
        return visited;
    }

    async function createEditableCanvasFromSource(src: string) {
        const img = await loadCanvasImage(src);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d')!.drawImage(img, 0, 0);
        return canvas;
    }

    async function getOpenCv() {
        if (openCvRef.current) return openCvRef.current;
        if (!openCvLoadingRef.current) {
            openCvLoadingRef.current = new Promise((resolve, reject) => {
                const win = window as any;
                if (win.cv?.Mat) {
                    openCvRef.current = win.cv;
                    resolve(win.cv);
                    return;
                }

                const attachRuntimeReady = () => {
                    const cv = (window as any).cv;
                    if (!cv) {
                        reject(new Error('OpenCV no disponible en window'));
                        return;
                    }
                    if (cv.Mat) {
                        openCvRef.current = cv;
                        resolve(cv);
                        return;
                    }
                    cv.onRuntimeInitialized = () => {
                        openCvRef.current = cv;
                        resolve(cv);
                    };
                };

                const existing = document.querySelector('script[data-opencv-runtime="true"]') as HTMLScriptElement | null;
                if (existing) {
                    attachRuntimeReady();
                    return;
                }

                const script = document.createElement('script');
                script.src = 'https://docs.opencv.org/4.x/opencv.js';
                script.async = true;
                script.dataset.opencvRuntime = 'true';
                script.onload = attachRuntimeReady;
                script.onerror = () => reject(new Error('No se pudo cargar OpenCV.js'));
                document.body.appendChild(script);
            });
        }
        return openCvLoadingRef.current;
    }

    function updateHealCursor(clientX: number, clientY: number) {
        const rect = canvasContainerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const size = brushMode !== null ? brushSize * 2 : healSize * 2;
        setHealCursor({
            x: clientX - rect.left,
            y: clientY - rect.top,
            size: size,
            visible: true,
        });
    }

    function hideHealCursor() {
        setHealCursor(prev => ({ ...prev, visible: false }));
    }

    function shouldApplyHealPoint(x: number, y: number, radius: number, target: string) {
        const last = healLastPointRef.current;
        if (!last || last.target !== target) {
            healLastPointRef.current = { x, y, target };
            return true;
        }
        const minDist = Math.max(2, radius * 0.35);
        const moved = Math.hypot(x - last.x, y - last.y);
        if (moved < minDist) return false;
        healLastPointRef.current = { x, y, target };
        return true;
    }

    function applySpotHealAt(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) {
        const cv = openCvRef.current;
        if (!cv) return false;

        const margin = Math.max(16, Math.ceil(radius * 2.5));
        const sx = Math.max(0, Math.floor(x - margin));
        const sy = Math.max(0, Math.floor(y - margin));
        const sw = Math.min(ctx.canvas.width - sx, Math.ceil(margin * 2));
        const sh = Math.min(ctx.canvas.height - sy, Math.ceil(margin * 2));
        if (sw <= 4 || sh <= 4) return false;

        const sourceCanvas = document.createElement('canvas');
        sourceCanvas.width = sw;
        sourceCanvas.height = sh;
        sourceCanvas.getContext('2d')!.drawImage(ctx.canvas, sx, sy, sw, sh, 0, 0, sw, sh);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = sw;
        maskCanvas.height = sh;
        const maskCtx = maskCanvas.getContext('2d')!;
        maskCtx.fillStyle = '#000';
        maskCtx.fillRect(0, 0, sw, sh);
        maskCtx.fillStyle = '#fff';
        maskCtx.beginPath();
        maskCtx.arc(x - sx, y - sy, radius, 0, Math.PI * 2);
        maskCtx.fill();

        const src = cv.imread(sourceCanvas);
        const maskRgba = cv.imread(maskCanvas);
        const mask = new cv.Mat();
        const dst = new cv.Mat();

        try {
            cv.cvtColor(maskRgba, mask, cv.COLOR_RGBA2GRAY, 0);
            cv.threshold(mask, mask, 1, 255, cv.THRESH_BINARY);
            cv.inpaint(src, mask, dst, Math.max(3, Math.round(radius * 0.45)), cv.INPAINT_TELEA);

            const outCanvas = document.createElement('canvas');
            outCanvas.width = sw;
            outCanvas.height = sh;
            cv.imshow(outCanvas, dst);
            ctx.clearRect(sx, sy, sw, sh);
            ctx.drawImage(outCanvas, sx, sy);
            return true;
        } finally {
            src.delete();
            maskRgba.delete();
            mask.delete();
            dst.delete();
        }
    }

    function mapCanvasPointToLayerPixel(layer: CanvasLayer, nx: number, ny: number, canvasW: number, canvasH: number, sizeCss: number) {
        const cx = layer.x * canvasW;
        const cy = layer.y * canvasH;
        const px = nx * canvasW - cx;
        const py = ny * canvasH - cy;
        const rad = -layer.rotation * Math.PI / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const localX = px * cos - py * sin;
        const localY = px * sin + py * cos;
        const layerW = layer.w * canvasW;
        const layerH = layer.h * canvasH;
        const u = (localX + layerW / 2) / layerW;
        const v = (localY + layerH / 2) / layerH;
        if (u < 0 || u > 1 || v < 0 || v > 1) return null;
        const scaleX = layer.img.naturalWidth / layerW;
        const scaleY = layer.img.naturalHeight / layerH;
        return {
            x: u * layer.img.naturalWidth,
            y: v * layer.img.naturalHeight,
            radius: Math.max(4, sizeCss * ((scaleX + scaleY) / 2)),
        };
    }

    async function handleConfirmBg() {
        // Push history pointing to the PRE-bg-removal URL so Undo cleanly
        // restores the original image (the bg-removed blob gets revoked below).
        pushHistory({
            kind: 'photo',
            imageUrl: preBgUrlRef.current ?? imageUrl,
            rotation, brightness,
            bgDone: false, bgColor: 'transparent',
            hasTransparentBg,
        });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const el = new Image();
            if (imageUrl && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
                el.crossOrigin = 'anonymous';
            }
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
            const newUrl = URL.createObjectURL(blob);
            createdBlobUrlsRef.current.push(newUrl);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            setBgDone(false);
            setBgColor('transparent');
            setHasTransparentBg(isPng);
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
        setMagicWandActive(false);
        offscreenCanvasRef.current = null;
        // Restore: if prev was itself an object URL keep tracking it, else clear ref
        objectUrlRef.current = prev.startsWith('blob:') ? prev : null;
        setImageUrl(prev);
        preBgUrlRef.current = null;
        setBgDone(false);
        setBgColor('transparent');
        setHasTransparentBg(false);
    }

    useEffect(() => {
        if (!brushMode && !healMode && !magicWandActive) return;
        if (canvasActive) return;
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
    }, [brushMode, healMode, magicWandActive, canvasActive]);

    useEffect(() => {
        if (!healMode || canvasActive) return;
        let cancelled = false;
        void Promise.all([getOpenCv(), createEditableCanvasFromSource(imageUrl)]).then(([, canvas]) => {
            if (cancelled) return;
            offscreenCanvasRef.current = canvas;
            const vc = brushCanvasRef.current;
            if (!vc) return;
            vc.width = canvas.width;
            vc.height = canvas.height;
            vc.getContext('2d')!.drawImage(canvas, 0, 0);
        }).catch(() => {
            toast.error('No se pudo preparar el corrector');
            setHealMode(false);
        });
        return () => { cancelled = true; };
    }, [healMode, canvasActive, imageUrl]);

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
            displayScale = getPhotoAnnotationDisplayScale({
                canvasWidthPx: W,
                layoutWidthPx: canvas.clientWidth,
            });
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
            ctx.textBaseline = 'top';
            textMetricsRef.current.clear();
            for (const ta of textAnnotations) {
                const skip = ta.id === editingTextId;
                const tx = ta.x * W;
                const ty = ta.y * H;
                const maxWidthPx = ta.width * W;
                const fontSize = ta.fontSize * displayScale;
                const lineH = fontSize * TEXT_LINE_HEIGHT;
                ctx.font = `600 ${fontSize}px Inter, sans-serif`;
                ctx.textAlign = ta.align;
                const lines = wrapTextCanvas(ctx, ta.text || '', maxWidthPx);
                const totalH = lines.length * lineH;
                textMetricsRef.current.set(ta.id, { hNorm: totalH / H });
                if (skip) continue; // HTML textarea handles display while editing
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 5 * displayScale;
                ctx.fillStyle = getDrawColorHex(ta.color);
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], getAlignedTextX(tx, maxWidthPx, ta.align), ty + i * lineH);
                }
                const isSelected = ta.id === selectedTextId;
                if (isSelected) {
                    const ds = displayScale;
                    ctx.shadowBlur = 0;
                    ctx.setLineDash([3 * ds, 2 * ds]);
                    ctx.strokeStyle = getDrawColorHex(ta.color);
                    ctx.lineWidth = Math.max(ds, 1.5 * ds);
                    ctx.globalAlpha = 0.8;
                    ctx.strokeRect(tx - 2 * ds, ty - 2 * ds, maxWidthPx + 4 * ds, totalH + 4 * ds);
                    // Resize handle — right edge, vertically centered
                    const hx = tx + maxWidthPx;
                    const hy = ty + totalH / 2;
                    ctx.setLineDash([]);
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = '#ffffff';
                    ctx.strokeStyle = getDrawColorHex(ta.color);
                    ctx.lineWidth = 2 * ds;
                    const HR = 6 * ds;
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

        // Render at export resolution (1080 base) so photos look sharp, then
        // CSS scales it down to the display container size.
        const r = CANVAS_RATIOS.find(rv => rv.value === canvasRatio)!;
        const shorter = Math.min(r.w, r.h);
        const renderW = Math.round(1080 * r.w / shorter);
        const renderH = Math.round(1080 * r.h / shorter);
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        canvas.width = renderW;
        canvas.height = renderH;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        // Draw in render-space (renderW × renderH), using normalized layer coords
        const ctx = canvas.getContext('2d')!;
        const effectiveBg = canvasActive ? (activeCanvas?.bgColor ?? '#ffffff') : (bgDone ? bgColor : '#ffffff');
        const isTransparent = effectiveBg === 'transparent';
        if (isTransparent) {
            ctx.clearRect(0, 0, renderW, renderH);
        } else {
            ctx.fillStyle = effectiveBg === 'black' ? '#111111' : '#ffffff';
            ctx.fillRect(0, 0, renderW, renderH);
        }
        for (const layer of canvasLayers) {
            const px = layer.x * renderW, py = layer.y * renderH;
            const pw = layer.w * renderW, ph = layer.h * renderH;
            const previewCanvas = canvasHealPreviewRef.current?.layerId === layer.id
                ? canvasHealPreviewRef.current.canvas
                : null;
            ctx.save();
            ctx.filter = `brightness(${layer.brightness ?? 100}%)`;
            ctx.translate(px, py);
            ctx.rotate(layer.rotation * Math.PI / 180);
            if (previewCanvas) {
                ctx.drawImage(previewCanvas, -pw / 2, -ph / 2, pw, ph);
            } else if (layer.img instanceof HTMLImageElement && layer.img.complete && layer.img.naturalWidth > 0) {
                ctx.drawImage(layer.img, -pw / 2, -ph / 2, pw, ph);
            }
            ctx.restore();
        }

        // Selection handles — drawn in render-space coords
        if (canvasSelectedId) {
            const sel = canvasLayers.find(l => l.id === canvasSelectedId);
            if (sel) {
                const corners = getLayerCorners(sel, renderW, renderH);
                ctx.save();
                ctx.strokeStyle = '#C9A96E';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                corners.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
                ctx.closePath();
                ctx.stroke();
                ctx.setLineDash([]);
                corners.forEach(([x, y]) => {
                    ctx.fillStyle = '#C9A96E';
                    ctx.strokeStyle = '#0D0D12';
                    ctx.lineWidth = 2;
                    ctx.fillRect(x - 8, y - 8, 16, 16);
                    ctx.strokeRect(x - 8, y - 8, 16, 16);
                });
                ctx.restore();
            }
        }
    }, [canvasActive, canvasLayers, canvasSelectedId, canvasRatio, activeCanvas?.bgColor, healPreviewNonce]);

    // ── Canvas layer interaction ──────────────────────────────────────────────
    function getCanvasLayerNorm(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
        const rect = e.currentTarget.getBoundingClientRect();
        return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height];
    }

    const handleDeleteSelection = useCallback(() => {
        if (canvasActive && canvasSelectedId) {
            setCanvasLayers(prev => prev.filter(l => l.id !== canvasSelectedId));
            setCanvasSelectedId(null);
        } else if (multiSelectedIds.length > 0) {
            setDrawShapes(prev => prev.filter(s => !multiSelectedIds.includes(s.id)));
            setMultiSelectedIds([]);
        } else if (selectedShapeId) {
            setDrawShapes(prev => prev.filter(s => s.id !== selectedShapeId));
            setSelectedShapeId(null);
            setDrawMode('idle');
        } else if (selectedTextId) {
            setTextAnnotations(prev => prev.filter(t => t.id !== selectedTextId));
            setSelectedTextId(null);
        }
    }, [canvasActive, canvasSelectedId, multiSelectedIds, selectedShapeId, selectedTextId]);

    function handleCanvasLayerPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
        if (healMode) {
            updateHealCursor(e.clientX, e.clientY);
            if (!canvasSelectedId) {
                toast.error('Seleccioná una foto del lienzo para usar el corrector');
                return;
            }
            const layer = canvasLayers.find(item => item.id === canvasSelectedId);
            if (!layer) return;
            const [nx, ny] = getCanvasLayerNorm(e);
            const W = e.currentTarget.clientWidth;
            const H = e.currentTarget.clientHeight;
            const mapped = mapCanvasPointToLayerPixel(layer, nx, ny, W, H, healSize);
            if (!mapped) return;
            const editCanvas = document.createElement('canvas');
            editCanvas.width = layer.img.naturalWidth;
            editCanvas.height = layer.img.naturalHeight;
            editCanvas.getContext('2d')!.drawImage(layer.img, 0, 0);
            canvasHealSessionRef.current = { layerId: layer.id, prevSrc: layer.src, canvas: editCanvas };
            canvasHealPreviewRef.current = { layerId: layer.id, canvas: editCanvas };
            brushDrawingRef.current = true;
            healLastPointRef.current = null;
            if (applySpotHealAt(editCanvas.getContext('2d')!, mapped.x, mapped.y, mapped.radius)) {
                shouldApplyHealPoint(mapped.x, mapped.y, mapped.radius, layer.id);
            }
            setHealPreviewNonce(v => v + 1);
            e.currentTarget.setPointerCapture(e.pointerId);
            return;
        }
        const [nx, ny] = getCanvasLayerNorm(e);
        const W = e.currentTarget.clientWidth, H = e.currentTarget.clientHeight;
        
        // Ensure the canvas gets focus so keyboard events always fire
        e.currentTarget.focus();

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
        if (healMode) {
            updateHealCursor(e.clientX, e.clientY);
            if (!brushDrawingRef.current || !canvasHealSessionRef.current) return;
            const layer = canvasLayers.find(item => item.id === canvasHealSessionRef.current?.layerId);
            if (!layer) return;
            const [nx, ny] = getCanvasLayerNorm(e);
            const mapped = mapCanvasPointToLayerPixel(layer, nx, ny, e.currentTarget.clientWidth, e.currentTarget.clientHeight, healSize);
            if (!mapped) return;
            if (!shouldApplyHealPoint(mapped.x, mapped.y, mapped.radius, layer.id)) return;
            if (!applySpotHealAt(canvasHealSessionRef.current.canvas.getContext('2d')!, mapped.x, mapped.y, mapped.radius)) return;
            setHealPreviewNonce(v => v + 1);
            return;
        }
        if (!canvasLayerDragRef.current) return;
        const [nx, ny] = getCanvasLayerNorm(e);
        const { layerId, mode, startX, startY, origLayer } = canvasLayerDragRef.current;
        const dx = nx - startX, dy = ny - startY;
        setCanvasLayers(prev => prev.map(l => {
            if (l.id !== layerId) return l;
            if (mode === 'move') return {
                ...l,
                x: origLayer.x + dx,
                y: origLayer.y + dy,
            };
            if (mode === 'rotate') {
                const angle = Math.atan2(ny - origLayer.y, nx - origLayer.x)
                            - Math.atan2(startY - origLayer.y, startX - origLayer.x);
                let deg = origLayer.rotation + angle * 180 / Math.PI;
                // Shift held -> snap to 45° for better precision (0, 45, 90, etc.)
                if (e.shiftKey) {
                    deg = Math.round(deg / 45) * 45;
                }
                return { ...l, rotation: deg };
            }
            const W = e.currentTarget.clientWidth, H = e.currentTarget.clientHeight;
            const distSqStart = Math.pow((startX - origLayer.x) * W, 2) + Math.pow((startY - origLayer.y) * H, 2);
            const distSqNow = Math.pow((nx - origLayer.x) * W, 2) + Math.pow((ny - origLayer.y) * H, 2);
            if (distSqStart < 1) return l;
            const ratio = Math.sqrt(distSqNow / distSqStart);
            const newW = Math.max(0.05, origLayer.w * ratio);
            return { ...l, w: newW, h: newW / (origLayer.w / (origLayer.h || 1)) };
        }));
    }

    function handleCanvasLayerPointerUp() {
        if (healMode) {
            if (!brushDrawingRef.current || !canvasHealSessionRef.current || !activeCanvasId) return;
            const session = canvasHealSessionRef.current;
            brushDrawingRef.current = false;
            healLastPointRef.current = null;
            pushHistory({ kind: 'canvas-layer', canvasId: activeCanvasId, layerId: session.layerId, layerSrc: session.prevSrc });
            session.canvas.toBlob(blob => {
                if (!blob) return;
                const nextUrl = URL.createObjectURL(blob);
                void loadCanvasImage(nextUrl).then(img => {
                    setCanvasLayers(prev => prev.map(layer =>
                        layer.id === session.layerId
                            ? { ...layer, src: nextUrl, img }
                            : layer
                    ));
                    setHealMode(false);
                }).catch(() => {
                    toast.error('No se pudo aplicar el corrector');
                }).finally(() => {
                    hideHealCursor();
                    canvasHealPreviewRef.current = null;
                    canvasHealSessionRef.current = null;
                    setHealPreviewNonce(v => v + 1);
                });
            }, 'image/png');
            return;
        }
        canvasLayerDragRef.current = null;
    }

    function handleCanvasLayerDoubleClick(e: React.MouseEvent<HTMLCanvasElement>) {
        const rect = e.currentTarget.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        const W = e.currentTarget.clientWidth, H = e.currentTarget.clientHeight;
        for (let i = canvasLayers.length - 1; i >= 0; i--) {
            if (hitTestLayerBody(canvasLayers[i], nx, ny, W, H)) {
                const layer = canvasLayers[i];
                const initialRot = layer.rotation ?? 0;
                canvasLayerCropPreBakeRef.current = layer.src;
                setCanvasLayerCropRotation(initialRot);
                setCanvasLayerCropBakedSrc(initialRot === 0 ? layer.src : null); // will bake via useEffect if != 0
                setCanvasLayerCropId(layer.id);
                setCanvasLayerCropSel({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
                setCanvasLayerCompletedCrop(null);
                setCanvasSelectedId(null);
                return;
            }
        }
    }

    const handleConfirmCanvasLayerCrop = useCallback(async () => {
        if (!canvasLayerCropId) return;
        const layer = canvasLayers.find(l => l.id === canvasLayerCropId);
        if (!layer || !canvasLayerCropImgRef.current) { setCanvasLayerCropId(null); return; }
        if (!canvasLayerCompletedCrop || canvasLayerCompletedCrop.width === 0) {
            toast.error('Dibujá el área de recorte primero');
            return;
        }
        const img = canvasLayerCropImgRef.current;
        const isPercent = (canvasLayerCompletedCrop.unit as string) === '%';

        const scaleX = isPercent ? (img.naturalWidth / 100) : (img.naturalWidth / (img.width || 1));
        const scaleY = isPercent ? (img.naturalHeight / 100) : (img.naturalHeight / (img.height || 1));

        const srcX = Math.round(canvasLayerCompletedCrop.x * scaleX);
        const srcY = Math.round(canvasLayerCompletedCrop.y * scaleY);
        const srcW = Math.round(canvasLayerCompletedCrop.width * scaleX);
        const srcH = Math.round(canvasLayerCompletedCrop.height * scaleY);
        const cc = document.createElement('canvas');
        cc.width = srcW; cc.height = srcH;
        cc.getContext('2d')!.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, srcW, srcH);
        try {
            const blob = await new Promise<Blob>((res, rej) =>
                cc.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), 'image/jpeg', 0.95)
            );
            const newUrl = URL.createObjectURL(blob);
            const newImg = await loadCanvasImage(newUrl);
            setCanvasLayers(prev => prev.map(l => {
                if (l.id !== canvasLayerCropId) return l;
                const newAspect = srcW / (srcH || 1);
                // rotation was baked into the baked source → reset to 0 on the layer
                return { ...l, src: newUrl, img: newImg, h: l.w / newAspect, rotation: 0 };
            }));
            // Clean up baked URL
            setCanvasLayerCropBakedSrc(prev => {
                if (prev && prev !== canvasLayerCropPreBakeRef.current) URL.revokeObjectURL(prev);
                return null;
            });
            canvasLayerCropPreBakeRef.current = null;
            setCanvasLayerCropId(null);
        } catch {
            toast.error('No se pudo aplicar el recorte');
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canvasLayerCropId, canvasLayers, canvasLayerCompletedCrop]);

    async function handleCanvasLayerDrop(e: React.DragEvent<HTMLCanvasElement>) {
        e.preventDefault();
        const rect = e.currentTarget.getBoundingClientRect();
        const dropX = (e.clientX - rect.left) / rect.width;
        const dropY = (e.clientY - rect.top) / rect.height;
        const fileId = e.dataTransfer.getData('driveFileId');
        if (fileId) {
            try {
                const img = await loadCanvasImage(`/api/drive/file/${fileId}?cors=1`);
                setCanvasLayers(prev => [...prev, makeCanvasLayer(img, `/api/drive/file/${fileId}?cors=1`, fileId, dropX, dropY)]);
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
                const { x, y } = clampMenuToViewport(e.clientX, e.clientY, 180, 240);
                setCanvasContextMenu({ x, y, layerId: canvasLayers[i].id });
                return;
            }
        }
    }

    function handleActivateCanvas(canvasId?: string) {
        if (canvasId) {
            setActiveCanvasId(canvasId);
        } else if (canvases.length > 0) {
            setActiveCanvasId(canvases[0].id);
        }
        setCanvasActive(true);
        setHasCanvas(true);
        setZoom(1);
        setPanX(0);
        setPanY(0);
        setCanvasSelectedId(null);
        setDrawMode('idle');
        setCropActive(false);
        setBrushMode(null);
        setHealMode(false);
    }

    async function handleNewCanvas() {
        const name = `Lienzo ${canvases.length + 1}`;
        try {
            const { createPatientCanvasAction } = await import('@/app/actions/patient-canvases');
            const { data, error } = await createPatientCanvasAction({ patientId, name, ratio: '1:1' });
            if (error || !data) {
                throw new Error(error || 'No data returned');
            }
            const newCanvas: CanvasDoc = { id: data.id, name: data.name, ratio: data.ratio as CanvasRatio, layers: [], bgColor: data.bg_color };
            setCanvases(prev => [...prev, newCanvas]);
            setActiveCanvasId(data.id);
        } catch (err) {
            console.error('[handleNewCanvas] error, falling back to local:', err);
            // Fallback: create locally with temp ID
            const tempId = 'temp-' + Date.now();
            const newCanvas: CanvasDoc = { id: tempId, name, ratio: '1:1', layers: [], bgColor: '#ffffff' };
            setCanvases(prev => [...prev, newCanvas]);
            setActiveCanvasId(tempId);
        }
        setCanvasActive(true);
        setHasCanvas(true);
        setZoom(1); setPanX(0); setPanY(0);
        setCanvasSelectedId(null);
        setDrawMode('idle');
        setCropActive(false);
        setBrushMode(null);
        setHealMode(false);
    }

    async function handleDeleteCanvas(canvasId: string) {
        try {
            const { deletePatientCanvasAction } = await import('@/app/actions/patient-canvases');
            await deletePatientCanvasAction(canvasId);
        } catch (err) {
            console.error('[handleDeleteCanvas] error deleting from DB:', err);
        }
        // Legacy canvases live in localStorage — clear the key or the photo
        // resurrects on the next mount via the localStorage fallback.
        if (canvasId.startsWith('legacy-') && patientId) {
            localStorage.removeItem(`am-clinica-canvas-${patientId}`);
        }
        setCanvases(prev => {
            const next = prev.filter(c => c.id !== canvasId);
            if (activeCanvasId === canvasId) {
                setActiveCanvasId(next[0]?.id ?? null);
                if (next.length === 0) { setCanvasActive(false); setHasCanvas(false); }
            }
            return next;
        });
    }

    async function handleCategorizeFile(file: DriveFile, category: string) {
        setThumbnailContextMenu(null);
        try {
            const ext = file.name.split('.').pop() || 'jpg';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
            const sanitizedPatient = patientName.replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const sanitizedCategory = category.replace(/\s*-\s*/g, '_').replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            const newName = `${sanitizedPatient}_${sanitizedCategory}_${timestamp}.${ext}`;
            
            const res = await renameDriveFileAction(file.id, newName);
            if (res.success) {
                toast.success(`Foto categorizada y renombrada`);
                onSaved();
            } else {
                toast.error(res.error || 'Error al categorizar');
            }
        } catch (err) {
            toast.error('Error al renombrar archivo');
        }
    }

    // ─── Duplicar foto via Context Menu ──────────────
    async function handleDuplicateFile(file: DriveFile) {
        setThumbnailContextMenu(null);
        setDuplicatingId(file.id);
        
        try {
            const namePart = file.name.split('.').slice(0, -1).join('.') || file.name;
            const extPart = file.name.split('.').slice(-1)[0] || 'jpg';
            const newName = `${namePart}_copia.${extPart}`;
            
            const result = await duplicateDriveFileAction(file.id, newName);
            
            if (result.fileId) {
                toast.success('Archivo duplicado');
                onSaved();
            } else {
                toast.error(result.error || 'No se pudo duplicar');
            }
        } catch (err) {
            console.error('[handleDuplicateFile] Error:', err);
            toast.error('Error inesperado al duplicar');
        } finally {
            setDuplicatingId(null);
        }
    }

    async function handleManualRename(file: DriveFile) {
        const namePart = file.name.split('.').slice(0, -1).join('.') || file.name;
        const extPart = file.name.split('.').slice(-1)[0] || 'jpg';
        const newNameResult = prompt('Nuevo nombre (sin extensión):', namePart);
        if (newNameResult && newNameResult !== namePart) {
            const res = await renameDriveFileAction(file.id, `${newNameResult}.${extPart}`);
            if (res.success) {
                toast.success('Archivo renombrado');
                onSaved();
            } else {
                toast.error(res.error || 'Error al renombrar');
            }
        }
    }

    async function handleAutoRenamingAll() {
        if (!confirm(`¿Estás seguro de que quieres renombrar las ${imageFiles.length} fotos de ${patientName}? Se les asignará el nombre del paciente y la fecha.`)) return;
        
        const tid = toast.loading('Renombrando lote de fotos...');
        let successCount = 0;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const sanitizedPatient = patientName.replace(/\s+/g, '_').normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        for (const file of imageFiles) {
            const ext = file.name.split('.').pop() || 'jpg';
            const categoryMatch = guessCategory(file.name);
            const categoryPart = categoryMatch ? categoryMatch.split(' - ').pop()?.replace(/\s+/g, '_') : 'Foto';
            const index = imageFiles.indexOf(file) + 1;
            const newName = `${sanitizedPatient}_${categoryPart}_${index}_${timestamp}.${ext}`;
            
            const res = await renameDriveFileAction(file.id, newName);
            if (res.success) successCount++;
        }
        
        toast.success(`Se renombraron ${successCount} fotos exitosamente`, { id: tid });
        onSaved();
    }

    function getDefaultTargetIds() {
        return currentTargetIds;
    }

    async function fetchOriginalAsFile(targetFile: DriveFile) {
        const response = await fetch(`/api/drive/file/${targetFile.id}`);
        const blob = await response.blob();
        return new File([blob], targetFile.name, { type: blob.type || targetFile.mimeType || 'image/jpeg' });
    }

    async function exportVisibleFiles(targetIds: string[]): Promise<ShareWithPatientItem[]> {
        const items: ShareWithPatientItem[] = [];
        for (const targetId of targetIds) {
            const targetFile = getFileById(targetId);
            if (!targetFile) continue;

            if (targetFile.id === activeFile?.id) {
                if (!isDirty && !canvasActive) {
                    items.push({
                        id: targetFile.id,
                        name: targetFile.name,
                        driveFileId: targetFile.id,
                    });
                    continue;
                }
                const blob = canvasActive ? await exportCanvasToBlob() : await exportToBlob();
                const baseName = targetFile.name.replace(/\.[^.]+$/, '');
                const ext = blob.type === 'image/png' ? 'png' : 'jpg';
                items.push({
                    id: targetFile.id,
                    name: `${baseName}.${ext}`,
                    file: new File([blob], `${baseName}.${ext}`, { type: blob.type }),
                });
                continue;
            }

            items.push({
                id: targetFile.id,
                name: targetFile.name,
                driveFileId: targetFile.id,
                file: await fetchOriginalAsFile(targetFile),
            });
        }
        return items;
    }

    async function exportCanvasToBlob(): Promise<Blob> {
        const r = CANVAS_RATIOS.find(r => r.value === canvasRatio)!;
        const shorter = Math.min(r.w, r.h);
        const expW = Math.round(1080 * r.w / shorter);
        const expH = Math.round(1080 * r.h / shorter);
        const off = document.createElement('canvas');
        off.width = expW; off.height = expH;
        const ctx = off.getContext('2d')!;
        const effectiveBg = canvasActive ? (activeCanvas?.bgColor ?? '#ffffff') : (bgDone ? bgColor : '#ffffff');
        const isTransparent = effectiveBg === 'transparent';
        if (isTransparent) {
            ctx.clearRect(0, 0, expW, expH);
        } else {
            ctx.fillStyle = effectiveBg === 'black' ? '#111111' : '#ffffff';
            ctx.fillRect(0, 0, expW, expH);
        }
        for (const layer of canvasLayers) {
            ctx.save();
            ctx.translate(layer.x * expW, layer.y * expH);
            ctx.rotate(layer.rotation * Math.PI / 180);
            // Safety check for export
            if (layer.img instanceof HTMLImageElement && layer.img.complete && layer.img.naturalWidth > 0) {
                ctx.drawImage(layer.img, -layer.w * expW / 2, -layer.h * expH / 2, layer.w * expW, layer.h * expH);
            }
            ctx.restore();
        }
        // Bake draw annotations on top if visible
        if (drawVisible && drawCanvasRef.current && drawCanvasRef.current.width > 0) {
            ctx.drawImage(drawCanvasRef.current, 0, 0, expW, expH);
        }
        return new Promise<Blob>((res, rej) =>
            off.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), isTransparent ? 'image/png' : 'image/jpeg', 0.92)
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
            x: l.x * oldR.w / newR.w,
            y: l.y * oldR.h / newR.h,
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
        const brushPx = Math.max(1, brushSize * scaleX);

        if (brushMode === 'erase') {
            octx.save();
            const grad = octx.createRadialGradient(x, y, 0, x, y, brushPx);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
            grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.8)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
            
            octx.globalCompositeOperation = 'destination-out';
            octx.fillStyle = grad;
            octx.beginPath();
            octx.arc(x, y, brushPx, 0, Math.PI * 2);
            octx.fill();
            octx.restore();
        } else {
            const origImg = originalImgForRestoreRef.current;
            if (!origImg?.complete) return;
            
            const size = Math.max(1, Math.ceil(brushPx * 2));
            const left = Math.floor(x - brushPx);
            const top = Math.floor(y - brushPx);

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = size;
            tempCanvas.height = size;
            const tempCtx = tempCanvas.getContext('2d')!;

            // Draw the soft brush in local coordinates
            const grad = tempCtx.createRadialGradient(brushPx, brushPx, 0, brushPx, brushPx, brushPx);
            grad.addColorStop(0, 'rgba(0, 0, 0, 1.0)');
            grad.addColorStop(0.75, 'rgba(0, 0, 0, 0.8)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');

            tempCtx.fillStyle = grad;
            tempCtx.beginPath();
            tempCtx.arc(brushPx, brushPx, brushPx, 0, Math.PI * 2);
            tempCtx.fill();

            // Draw original image cropped to the brush bounding box
            tempCtx.globalCompositeOperation = 'source-in';
            tempCtx.drawImage(origImg, -left, -top, oc.width, oc.height);

            // Draw the resulting soft patch back onto the offscreen canvas
            octx.save();
            octx.drawImage(tempCanvas, left, top);
            octx.restore();
        }

        const vctx = canvasEl.getContext('2d')!;
        vctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        vctx.drawImage(oc, 0, 0);
    }

    function applyHealToPhoto(canvasEl: HTMLCanvasElement, x: number, y: number) {
        const oc = offscreenCanvasRef.current;
        if (!oc || oc.width === 0) return;
        const scaleX = oc.width / canvasEl.getBoundingClientRect().width;
        const radius = healSize * scaleX;
        if (!shouldApplyHealPoint(x, y, radius, 'photo')) return;
        const octx = oc.getContext('2d')!;
        if (!applySpotHealAt(octx, x, y, radius)) return;
        const vctx = canvasEl.getContext('2d')!;
        vctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
        vctx.drawImage(oc, 0, 0);
    }

    function handleBrushDown(e: React.PointerEvent<HTMLCanvasElement>) {
        updateHealCursor(e.clientX, e.clientY);
        e.currentTarget.setPointerCapture(e.pointerId);
        brushDrawingRef.current = true;
        healLastPointRef.current = null;
        const { x, y } = getCanvasXY(e);
        if (healMode) {
            applyHealToPhoto(e.currentTarget, x, y);
            return;
        }
        applyBrushAt(e.currentTarget, x, y);
    }

    function handleBrushMove(e: React.PointerEvent<HTMLCanvasElement>) {
        updateHealCursor(e.clientX, e.clientY);
        if (!brushDrawingRef.current) return;
        const { x, y } = getCanvasXY(e);
        if (healMode) {
            applyHealToPhoto(e.currentTarget, x, y);
            return;
        }
        applyBrushAt(e.currentTarget, x, y);
    }

    function handleBrushUp(e: React.PointerEvent<HTMLCanvasElement>) {
        if (!brushDrawingRef.current) return;
        brushDrawingRef.current = false;
        healLastPointRef.current = null;
        hideHealCursor();
        pushHistory();
        preCropImageRef.current = null; // brush stroke changed the image — crop reference must be refreshed
        offscreenCanvasRef.current?.toBlob(blob => {
            if (!blob) return;
            const newUrl = URL.createObjectURL(blob);
            createdBlobUrlsRef.current.push(newUrl);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            if (healMode) setHealMode(false);
        }, 'image/png');
    }

    function handleMagicWandClick(e: React.PointerEvent<HTMLCanvasElement>) {
        const oc = offscreenCanvasRef.current;
        if (!oc || oc.width === 0) return;
        const { x, y } = getCanvasXY(e);
        pushHistory();
        
        const octx = oc.getContext('2d')!;
        const scaledTolerance = 10 * Math.pow(magicWandTolerance / 100, 2);
        const visited = scanlineFloodFillErase(octx, Math.round(x), Math.round(y), scaledTolerance);
        if (!visited) return;
        
        // Draw the current state with a temporary selection mask (bright red) on the visible canvas
        const canvasElement = e.currentTarget;
        const vctx = canvasElement.getContext('2d')!;
        vctx.clearRect(0, 0, canvasElement.width, canvasElement.height);
        vctx.drawImage(oc, 0, 0);
        
        const tempImgData = vctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const tempD = tempImgData.data;
        for (let i = 0; i < visited.length; i++) {
            if (visited[i] === 1) {
                const p = i * 4;
                tempD[p] = 239;
                tempD[p + 1] = 68;
                tempD[p + 2] = 68;
                tempD[p + 3] = 160; // 0.6 opacity
            }
        }
        vctx.putImageData(tempImgData, 0, 0);
        
        // Clear selection mask after 400ms to show the clean transparent output
        setTimeout(() => {
            if (offscreenCanvasRef.current === oc && canvasElement) {
                const currentCtx = canvasElement.getContext('2d');
                if (currentCtx) {
                    currentCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
                    currentCtx.drawImage(oc, 0, 0);
                }
            }
        }, 400);
        
        oc.toBlob(blob => {
            if (!blob) return;
            const newUrl = URL.createObjectURL(blob);
            createdBlobUrlsRef.current.push(newUrl);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            preCropImageRef.current = null;
        }, 'image/png');
        
        toast.success('Fondo removido en la zona seleccionada');
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
        const edited = textAnnotations.find(t => t.id === id);
        const hasContent = Boolean(edited?.text.trim());
        setTextAnnotations(prev => prev.filter(t => t.id !== id || t.text.trim() !== ''));
        setEditingTextId(null);
        setSelectedTextId(hasContent ? id : null); // keep visually selected so user can see + drag it
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
            } else {
                setSelectedTextId(null);
                const newId = `text-${Date.now()}`;
                const newTA: TextAnnotation = {
                    id: newId,
                    x: nx,
                    y: ny,
                    text: '',
                    color: drawColor,
                    width: getDefaultTextAnnotationWidth(nx),
                    fontSize: DEFAULT_TEXT_FONT_SIZE,
                    align: 'left',
                };
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
        const [nx, ny] = getDrawNormXY(e);
        const textHit = hitTestTextAnnotation(textAnnotations, nx, ny);
        if (textHit) {
            e.stopPropagation();
            setTextToolActive(true);
            setSelectedTextId(textHit.id);
            setEditingTextId(textHit.id);
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
            let delta = Math.atan2(ny - centerNy, nx - centerNx) - startAngle;
            
            // Shift held -> snap to nearest 15°
            if (e.shiftKey) {
                delta = Math.round((delta * 180 / Math.PI) / 15) * (15 * Math.PI / 180);
            }
            
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
            const { x, y } = clampMenuToViewport(e.clientX, e.clientY, 180, 170);
            setContextMenu({ x, y });
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
            if (imageUrl && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
                i.crossOrigin = 'anonymous';
            }
            i.onload = () => resolve(i);
            i.onerror = () => reject(new Error('No se pudo cargar la imagen para exportar'));
            i.src = imageUrl;
        });

        const outW = img.naturalWidth;
        const outH = img.naturalHeight;
        if (outW === 0 || outH === 0) throw new Error('Imagen vacía o sin dimensiones');

        const isPng = shouldExportPhotoAsPng({
            fileName: activeFile!.name,
            mimeType: activeFile!.mimeType,
            bgDone,
            bgColor,
            hasTransparentBg
        });
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
            const displayW = drawCanvasRef.current?.clientWidth || canvasW;
            ctx.textBaseline = 'top';
            for (const ta of textAnnotations) {
                if (!ta.text.trim()) continue;
                const tx = ta.x * canvasW;
                const ty = ta.y * canvasH;
                const maxWidthPx = ta.width * canvasW;
                const fontSize = ta.fontSize * (canvasW / displayW);
                const lineH = fontSize * TEXT_LINE_HEIGHT;
                ctx.font = `600 ${fontSize}px Inter, sans-serif`;
                ctx.textAlign = ta.align;
                const lines = wrapTextCanvas(ctx, ta.text, maxWidthPx);
                ctx.save();
                ctx.shadowColor = 'rgba(0,0,0,0.7)';
                ctx.shadowBlur = 5 * (canvasW / displayW);
                ctx.fillStyle = getDrawColorHex(ta.color);
                for (let i = 0; i < lines.length; i++) {
                    ctx.fillText(lines[i], getAlignedTextX(tx, maxWidthPx, ta.align), ty + i * lineH);
                }
                ctx.restore();
            }
        }

        return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob returned null')), mime, 0.95));
    }

    async function handleEnterCropMode() {
        setDrawMode('idle');
        setMousePos(null);
        setZoom(1);
        setPanX(0);
        setPanY(0);

        // Save rotation and imageUrl so we can restore them if the user cancels.
        cropEntryRotationRef.current = rotation;
        prevCroppedUrlRef.current = imageUrl;

        // If the user has rotated the image since the last crop reference was taken,
        // the preCropImageRef is now stale (points to the old, unrotated image).
        // In that case, skip the restore branch and bake the current rotation below.
        const hasStaleRef = preCropImageRef.current !== null && rotation !== 0;

        if (preCropImageRef.current && !hasStaleRef) {
            // Already have a valid, up-to-date full image reference → restore it
            // so the user crops from the full (pre-any-crop) image again.
            cropPreBakeRef.current = preCropImageRef.current; // base for rotation rebaking
            setImageUrl(preCropImageRef.current);
            objectUrlRef.current = preCropImageRef.current.startsWith('blob:') ? preCropImageRef.current : null;
            setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
            setCompletedCrop(null);
            setCropAspectPreset('free');
            cropJustEnteredRef.current = true;
            setCropActive(true);
            return;
        }

        if (rotation === 0) {
            // No rotation to bake — remember the current image as pre-crop reference
            cropPreBakeRef.current = imageUrl;
            preCropImageRef.current = imageUrl;
            setCropAspectPreset('free');
            cropJustEnteredRef.current = true;
            setCropActive(true);
            return;
        }

        // Bake the current rotation into a new blob so the user sees the straightened
        // image while drawing the crop selection, and coordinates are correct.
        // cropPreBakeRef stores the un-rotated source so the user can re-adjust
        // rotation from the slider while in crop mode (useEffect handles rebaking).
        cropPreBakeRef.current = imageUrl; // un-rotated base for future rebakes
        try {
            const img = await new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                if (imageUrl && !imageUrl.startsWith('blob:') && !imageUrl.startsWith('data:')) {
                    i.crossOrigin = 'anonymous';
                }
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
            // Keep alpha while the cutout is active (bg color is preview-only until export)
            const isPng = bgDone || shouldExportPhotoAsPng({
                fileName: activeFile!.name,
                mimeType: activeFile!.mimeType,
                bgDone,
                bgColor,
                hasTransparentBg
            });
            const blob = await new Promise<Blob>((res, rej) =>
                canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob null')), isPng ? 'image/png' : 'image/jpeg', 0.95)
            );
            const newUrl = URL.createObjectURL(blob);
            createdBlobUrlsRef.current.push(newUrl);
            objectUrlRef.current = newUrl;
            preCropImageRef.current = newUrl; // full baked image shown in crop mode
            setImageUrl(newUrl);
            // Keep rotation state as-is — slider still shows the correct value so the user
            // can fine-tune from here. The rotation will be reset to 0 on confirm (baked).
        } catch {
            preCropImageRef.current = imageUrl; // fallback: bake failed
        }
        setCropAspectPreset('free');
        cropJustEnteredRef.current = true;
        setCropActive(true);
    }

    async function handleConfirmCrop() {
        if (!completedCrop || completedCrop.width === 0) {
            // If there's an active crop mode but no selection drawn, warn the user
            // instead of silently exiting (which looks like the crop was applied)
            if (!prevCroppedUrlRef.current) {
                toast.error('Dibujá el área de recorte antes de confirmar');
                return;
            }
            // Re-crop cancelled with no new selection → restore previous crop
            setImageUrl(prevCroppedUrlRef.current);
            objectUrlRef.current = prevCroppedUrlRef.current.startsWith('blob:') ? prevCroppedUrlRef.current : null;
            prevCroppedUrlRef.current = null;
            setCropActive(false);
            return;
        }

        const sourceUrl = preCropImageRef.current ?? imageUrl;
        try {
            pushHistory();
            const img = await new Promise<HTMLImageElement>((res, rej) => {
                const i = new Image();
                if (sourceUrl && !sourceUrl.startsWith('blob:') && !sourceUrl.startsWith('data:')) {
                    i.crossOrigin = 'anonymous';
                }
                i.onload = () => res(i);
                i.onerror = () => rej(new Error('load failed'));
                i.src = sourceUrl;
            });
            // Without objectFit:contain on the crop <img>, the element size == rendered image
            // size so img.width/.height give the correct rendered pixel dimensions.
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

            // Keep alpha while the cutout is active (bg color is preview-only until export)
            const isPng = bgDone || shouldExportPhotoAsPng({
                fileName: activeFile!.name,
                mimeType: activeFile!.mimeType,
                bgDone,
                bgColor,
                hasTransparentBg
            });
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
            // Update preCropImageRef so that re-entering crop mode shows the current
            // (already-cropped) image instead of jumping back to the full original.
            preCropImageRef.current = newUrl;
            setImageUrl(newUrl);
            setCompletedCrop(null);
            setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
            setCropAspectPreset('free');
            // Rotation was baked into the crop source image; reset so it isn't applied twice
            setRotation(0);
        } catch {
            toast.error('No se pudo aplicar el recorte');
            if (prevCroppedUrlRef.current) {
                setImageUrl(prevCroppedUrlRef.current);
                objectUrlRef.current = prevCroppedUrlRef.current.startsWith('blob:') ? prevCroppedUrlRef.current : null;
                prevCroppedUrlRef.current = null;
            }
        }
        cropPreBakeRef.current = null;
        setCropActive(false);
    }

    function handleCancelCrop() {
        if (prevCroppedUrlRef.current) {
            // Restore the previously-cropped image (user cancelled re-crop)
            setImageUrl(prevCroppedUrlRef.current);
            objectUrlRef.current = prevCroppedUrlRef.current.startsWith('blob:') ? prevCroppedUrlRef.current : null;
            prevCroppedUrlRef.current = null;
        }
        // Restore the rotation that was active when crop mode was entered
        setRotation(cropEntryRotationRef.current);
        cropPreBakeRef.current = null;
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        setCompletedCrop(null);
        setCropAspectPreset('free');
        setCropActive(false);
    }

    function handleDownload() {
        exportToBlob().then(blob => {
            const isPng = shouldExportPhotoAsPng({
                fileName: activeFile!.name,
                mimeType: activeFile!.mimeType,
                bgDone,
                bgColor,
                hasTransparentBg
            });
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

    async function triggerNativeShare() {
        if (!shareFile || !shareFile.rawFile) return;
        try {
            const files = [shareFile.rawFile];
            // Check navigator.canShare as well
            if (navigator.share) {
                await navigator.share({
                    files,
                    title: shareFile.name.replace(/\.[^.]+$/, ''),
                });
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError') {
                toast.error('No se pudo abrir el menú de compartir');
            }
        }
    }

    async function handleShare(targetIds = getDefaultTargetIds()) {
        if (targetIds.length === 0) return;
        setThumbnailContextMenu(null);
        setShareModalOpen(true);
        setShareLoading(true);
        setShareFile(null);
        try {
            const exportableFiles = await exportVisibleFiles(targetIds);
            const files = exportableFiles.map(item => item.file).filter((file): file is File => Boolean(file));
            if (files.length === 0) {
                setShareModalOpen(false);
                setShareLoading(false);
                return;
            }
            const file = files[0];
            const url = URL.createObjectURL(file);
            createdBlobUrlsRef.current.push(url);
            setShareFile({
                url,
                name: file.name,
                rawFile: file
            });
            setShareLoading(false);
        } catch (err) {
            console.error('Error exporting files for sharing:', err);
            setShareModalOpen(false);
            setShareLoading(false);
            toast.error('No se pudo preparar la imagen para compartir');
        }
    }

    async function handleShareWithPatient(targetIds = getDefaultTargetIds()) {
        if (targetIds.length === 0) return;
        try {
            const items = await exportVisibleFiles(targetIds);
            if (items.length === 0) return;
            setSharePatientItems(items);
            setThumbnailContextMenu(null);
        } catch {
            toast.error('No se pudieron preparar las fotos para compartir con el paciente');
        }
    }

    async function downloadBlob(blob: Blob, fileName: string) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }

    async function handleDownloadOriginal() {
        if (!activeFile) return;
        try {
            const response = await fetch(`/api/drive/file/${activeFile.id}`);
            const blob = await response.blob();
            const cleanPatientName = patientName.replace(/\s+/g, '_');
            const downloadName = `${cleanPatientName}_${activeFile.name}`;
            await downloadBlob(blob, downloadName);
            setDownloadMenuOpen(false);
        } catch {
            toast.error('No se pudo descargar la foto original');
        }
    }

    async function handleDownloadBatchOriginal() {
        const targetIds = getDefaultTargetIds();
        if (targetIds.length === 0) return;

        try {
            for (const targetId of targetIds) {
                const targetFile = getFileById(targetId);
                if (!targetFile) continue;
                const response = await fetch(`/api/drive/file/${targetFile.id}`);
                const blob = await response.blob();
                const cleanPatientName = patientName.replace(/\s+/g, '_');
                const downloadName = `${cleanPatientName}_${targetFile.name}`;
                await downloadBlob(blob, downloadName);
            }
            setDownloadMenuOpen(false);
            toast.success(`${targetIds.length} archivo${targetIds.length > 1 ? 's' : ''} original${targetIds.length > 1 ? 'es' : ''} descargado${targetIds.length > 1 ? 's' : ''}`);
        } catch {
            toast.error('No se pudo descargar el lote original');
        }
    }

    async function handleDownloadWebp() {
        if (!activeFile) return;
        try {
            const sourceBlob = canvasActive ? await exportCanvasToBlob() : await exportToBlob();
            const webpBlob = await convertBlobToWebp(sourceBlob);

            const baseName = activeFile.name.replace(/\.[^.]+$/, '');
            const cleanPatientName = patientName.replace(/\s+/g, '_');
            await downloadBlob(webpBlob, `${cleanPatientName}_${baseName}_web.webp`);
            setDownloadMenuOpen(false);
        } catch {
            toast.error('No se pudo generar la versión WebP');
        }
    }

    async function convertBlobToWebp(sourceBlob: Blob) {
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
            const url = URL.createObjectURL(sourceBlob);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve(img);
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('No se pudo preparar la imagen WebP'));
            };
            img.src = url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo crear el canvas WebP');
        ctx.drawImage(image, 0, 0);

        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('No se pudo generar la versión WebP'));
            }, 'image/webp', 0.72);
        });
    }

    async function handleDownloadBatchWebp() {
        const targetIds = getDefaultTargetIds();
        if (targetIds.length === 0) return;

        try {
            const exportableFiles = await exportVisibleFiles(targetIds);
            for (const item of exportableFiles) {
                let sourceBlob: Blob;
                if (item.file) {
                    sourceBlob = item.file;
                } else if (item.driveFileId) {
                    const response = await fetch(`/api/drive/file/${item.driveFileId}`);
                    sourceBlob = await response.blob();
                } else {
                    continue;
                }

                const webpBlob = await convertBlobToWebp(sourceBlob);
                const baseName = item.name.replace(/\.[^.]+$/, '');
                const cleanPatientName = patientName.replace(/\s+/g, '_');
                await downloadBlob(webpBlob, `${cleanPatientName}_${baseName}_web.webp`);
            }
            setDownloadMenuOpen(false);
            toast.success(`${targetIds.length} archivo${targetIds.length > 1 ? 's' : ''} WebP descargado${targetIds.length > 1 ? 's' : ''}`);
        } catch {
            toast.error('No se pudo descargar el lote en WebP');
        }
    }

    async function handleThumbnailReorder(fromId: string, toId: string, edge: 'top' | 'bottom' = 'top') {
        if (fromId === toId) return;
        const fromIndex = imageOrderIds.indexOf(fromId);
        const toIndex = imageOrderIds.indexOf(toId);
        if (fromIndex === -1 || toIndex === -1) return;

        const nextOrder = [...imageOrderIds];
        const [moved] = nextOrder.splice(fromIndex, 1);
        const targetIndex = nextOrder.indexOf(toId);
        const insertionIndex = edge === 'bottom' ? targetIndex + 1 : targetIndex;
        nextOrder.splice(insertionIndex, 0, moved);
        setImageOrderIds(nextOrder);
        setThumbnailDragId(null);
        setThumbnailDropIndicator(null);

        if (folderId) {
            const result = await saveFotosOrderAction(patientId, folderId, nextOrder);
            if (result.error) toast.error(result.error);
        }
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

    async function handleSaveToDrive(mode: 'replace' | 'copy', destinationOverride?: 'patient' | 'social') {
        if (!activeFile) return;
        const dest = destinationOverride ?? exportDestination;
        setSaving(mode);
        try {
            const blob = canvasActive ? await exportCanvasToBlob() : await exportToBlob();
            const isPng = blob.type === 'image/png';
            const ext = isPng ? 'png' : 'jpg';
            
            const customBase = exportFileName.trim() || activeFile.name.replace(/\.[^.]+$/, '');
            const filename = `${customBase}.${ext}`;

            if (dest === 'social') {
                const formData = new FormData();
                formData.append('file', blob, filename);
                const result = await uploadPhotoForSocialAction(folderId, filename, formData);
                if (result.error) {
                    toast.error(`Error al guardar en Selección: ${result.error}`);
                    return;
                }
                toast.success('Guardado en la carpeta de Selección');
            } else if (mode === 'replace') {
                // Update existing file content in-place (preserves file ID, no duplicate)
                const formData = new FormData();
                formData.append('file', blob, filename);
                const result = await replaceEditedPhotoAction(activeFile.id, formData);
                if (result.error) {
                    toast.error(`Error al reemplazar: ${result.error}`);
                    return;
                }
                toast.success('Foto reemplazada en Drive');
                markAsEdited(activeFile.id);
                setActiveFile(prev => prev ? { ...prev, mimeType: isPng ? 'image/png' : 'image/jpeg' } : null);
                // Reset edit state and reload fresh from Drive (cache-busted)
                setImageUrl(`/api/drive/file/${activeFile.id}?t=${Date.now()}`);
                setRotation(0);
                setBrightness(100);
                setBgDone(false);
                setHasTransparentBg(false);
                preCropImageRef.current = null;
                prevCroppedUrlRef.current = null;
                setHistory([]);
            } else {
                // Save as a new copy
                const formData = new FormData();
                formData.append('file', blob, filename);
                const result = await uploadEditedPhotoAction(folderId, filename, formData);
                if (result.error) {
                    toast.error(`Error al guardar copia: ${result.error}`);
                    return;
                }
                // Store the new file ID so the sync effect places it at the end of the filmstrip
                if (result.fileId) {
                    pendingCopyIdRef.current = result.fileId;
                    markAsEdited(result.fileId);
                }
                toast.success('Copia guardada en Drive');
            }

            setSaveDialogOpen(false);

            // For copies, wait a moment for Drive consistency before refreshing the list
            if (dest === 'social' || mode === 'copy') {
                const toastId = toast.loading('Sincronizando con Google Drive...');
                await new Promise(resolve => setTimeout(resolve, 2000));
                toast.dismiss(toastId);
            }

            onSaved(); // refresca la carpeta, pero nos quedamos en el estudio
        } catch (err) {
            const message = err instanceof Error ? err.message : '';
            toast.error(message ? `Error al guardar: ${message}` : 'Error inesperado al guardar');
            console.error('[PhotoStudio save]', err);
        } finally {
            setSaving(null);
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

    // Fast thumbnail shown as blurred placeholder while the full-res loads
    const thumbPlaceholderUrl = activeFile?.thumbnailLink
        ? activeFile.thumbnailLink.replace(/=s\d+(-[a-z])?$/i, '=s400')
        : null;

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
                        onClick={async () => {
                            if (isDirty && !confirm('Tenés cambios sin guardar. ¿Salir de todas formas?')) return;
                            await flushPhotoStateSave();
                            onClose();
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors flex-shrink-0 text-sm"
                    >
                        <ArrowLeft size={15} />
                        <span className="hidden sm:inline">Volver</span>
                    </button>
                    <div className="flex-1 flex flex-col justify-center gap-0.5 overflow-hidden border-l border-white/5 pl-4 ml-1">
                        <h1 className="text-[#C9A96E] text-xl sm:text-2xl font-black uppercase tracking-tight truncate leading-none drop-shadow-sm">
                            {patientName}
                        </h1>
                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-[0.2em] truncate flex items-center gap-2">
                            <span>SMILE DESIGN STUDIO</span>
                            <span className="w-1 h-1 bg-white/10 rounded-full" />
                            <span className="text-[#C9A96E]/50">{canvasActive ? `Lienzo ${canvasRatio}` : activeFile.name}</span>
                            {canvasSaving && (
                                <span className="text-[10px] text-white/30 flex items-center gap-1">
                                    <Loader2 size={10} className="animate-spin" /> guardando…
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Global Undo & Redo buttons */}
                        <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-0.5 mr-1 gap-0.5">
                            <button
                                onClick={handleUndo}
                                disabled={history.length === 0}
                                title="Deshacer (Ctrl+Z)"
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                                <Undo2 size={15} />
                            </button>
                            <button
                                onClick={handleRedo}
                                disabled={redoStack.length === 0}
                                title="Rehacer (Ctrl+Y)"
                                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                            >
                                <Redo2 size={15} />
                            </button>
                        </div>
                        {/* Canvas toggle */}
                        {canvasActive ? (
                            <div className="flex items-center gap-2">
                                {/* Canvas selector */}
                                {canvases.length > 0 && (
                                    <select
                                        value={activeCanvasId ?? ''}
                                        onChange={(e) => {
                                            handleActivateCanvas(e.target.value);
                                            clearMultiSelection();
                                        }}
                                        className="bg-white/10 text-white text-xs rounded-lg px-2.5 py-1.5 border border-white/10 outline-none font-medium cursor-pointer"
                                    >
                                        {canvases.map((cv) => (
                                            <option key={cv.id} value={cv.id} className="bg-gray-900 text-white">
                                                {cv.name} ({cv.layers.length} {cv.layers.length === 1 ? 'capa' : 'capas'})
                                            </option>
                                        ))}
                                    </select>
                                )}
                                {/* Create new canvas button */}
                                <button
                                    onClick={handleNewCanvas}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E]/80 text-black text-xs font-bold hover:bg-[#C9A96E] transition-colors"
                                    title="Nuevo lienzo"
                                >
                                    <Plus size={12} />
                                    <span>Lienzo</span>
                                </button>
                                {/* Exit canvas view */}
                                <button
                                    onClick={() => setCanvasActive(false)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs border border-white/10 hover:bg-white/15 transition-colors"
                                >
                                    ✕ Ver fotos
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                {canvases.length > 0 && (
                                    <button
                                        onClick={() => handleActivateCanvas()}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-sm border border-white/10 hover:bg-white/15 hover:text-white transition-colors"
                                    >
                                        ⊞ Lienzos ({canvases.length})
                                    </button>
                                )}
                                <button
                                    onClick={handleNewCanvas}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E]/80 text-black text-sm font-semibold hover:bg-[#C9A96E] transition-colors"
                                >
                                    + Nuevo Lienzo
                                </button>
                            </div>
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
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#C9A96E] text-black text-sm font-bold border border-[#C9A96E]/70 hover:bg-[#d9bb7d] transition-colors shadow-lg shadow-black/20"
                            >
                                <Play size={14} />
                                <span>Presentación</span>
                            </button>
                        )}
                        {!canvasActive && (
                            <button
                                onClick={async () => {
                                    if (smileMode) {
                                        smileDesign.reset();
                                        setSmileMode(false);
                                        setShowSmileGrid(false);
                                        setSmileSaved(false);
                                        return;
                                    }
                                    try {
                                        const res = await fetch(imageUrl);
                                        const blob = await res.blob();
                                        setSmileMode(true);
                                        setSmileSaved(false);
                                        setShowSmileGrid(false);
                                        setSmileProcessingTime(null);
                                        smileStartTimeRef.current = Date.now();
                                        await smileDesign.process(blob);
                                        if (smileStartTimeRef.current) {
                                            setSmileProcessingTime((Date.now() - smileStartTimeRef.current) / 1000);
                                        }
                                    } catch {
                                        toast.error('No se pudo iniciar Smile Design');
                                    }
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                                    smileMode
                                        ? 'bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20'
                                        : 'bg-purple-600/10 border-purple-500/20 text-purple-300 hover:bg-purple-600/20'
                                }`}
                            >
                                {smileMode ? <X size={14} /> : '✨'}
                                <span className="hidden sm:inline">{smileMode ? 'Salir Smile Design' : 'Smile Design'}</span>
                            </button>
                        )}
                        {!smileMode && canSave && (
                            <button
                                onClick={() => {
                                    if (cropActive) {
                                        toast.error('Confirmá o cancelá el recorte antes de guardar');
                                        return;
                                    }
                                    const baseName = activeFile?.name.replace(/\.[^.]+$/, '') ?? 'foto';
                                    const cleanPatientName = patientName.replace(/\s+/g, '_');
                                    setExportFileName(`${cleanPatientName}_${baseName}_editada`);
                                    setExportDestination('social');
                                    setSaveDialogOpen(true);
                                }}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A96E] text-black text-sm font-semibold hover:bg-[#b8924e] transition-colors"
                            >
                                <Save size={14} />
                                <span className="hidden sm:inline">Guardar en Drive</span>
                            </button>
                        )}
                        {!smileMode && (
                            <div ref={downloadMenuRef} className="relative">
                            <button
                                onClick={() => setDownloadMenuOpen(prev => !prev)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                            >
                                <Download size={14} />
                                <span className="hidden sm:inline">Descargar{currentTargetIds.length > 1 ? ` (${currentTargetIds.length})` : ''}</span>
                            </button>
                            {downloadMenuOpen && (
                                <div className="absolute right-0 top-full mt-2 z-20 w-52 rounded-xl border border-white/15 bg-[#1A1A24] p-1.5 shadow-xl">
                                    {currentTargetIds.length > 1 && (
                                        <button
                                            onClick={handleDownloadBatchOriginal}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                                        >
                                            Descargar lote original ({currentTargetIds.length})
                                        </button>
                                    )}
                                    <button
                                        onClick={handleDownloadOriginal}
                                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                                    >
                                        Descargar original
                                    </button>
                                    <button
                                        onClick={handleDownloadWebp}
                                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                                    >
                                        Descargar WebP comprimida
                                    </button>
                                    {currentTargetIds.length > 1 && (
                                        <button
                                            onClick={handleDownloadBatchWebp}
                                            className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                                        >
                                            Descargar lote WebP ({currentTargetIds.length})
                                        </button>
                                    )}
                                    <button
                                        onClick={() => {
                                            setDownloadMenuOpen(false);
                                            handleDownload();
                                        }}
                                        className="w-full rounded-lg px-3 py-2 text-left text-sm text-white hover:bg-white/10"
                                    >
                                        Descargar editada
                                    </button>
                                </div>
                            )}
                         </div>
                         )}
                         {!smileMode && (
                         <button
                             onClick={() => handleShareWithPatient()}
                             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/85 text-white text-sm font-semibold border border-emerald-400/20 hover:bg-emerald-600 transition-colors"
                             title={currentTargetIds.length > 1 ? `Compartir ${currentTargetIds.length} fotos con el paciente` : 'Compartir con paciente'}
                         >
                             <MessageCircle size={14} />
                             <span className="hidden sm:inline">Paciente{currentTargetIds.length > 1 ? ` (${currentTargetIds.length})` : ''}</span>
                         </button>
                         )}
                         {!smileMode && (
                         <button
                             onClick={() => handleShare()}
                             className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors"
                             title="Compartir / AirDrop"
                         >
                             <Globe2 size={14} />
                             <span className="hidden sm:inline">AirDrop{currentTargetIds.length > 1 ? ` (${currentTargetIds.length})` : ''}</span>
                         </button>
                         )}
                    </div>
                </div>

                {/* ── Body ───────────────────────────────────────────────── */}
                <div className="flex-1 flex overflow-hidden min-h-0">

                    {/* Thumbnail strip — vertical on desktop */}
                    <div className="hidden md:flex flex-col w-[72px] border-r border-white/10 flex-shrink-0 bg-black/20">
                        {imageFiles.length > 1 && (
                            <button
                                onClick={() => {
                                    if (multiSelectMode) clearMultiSelection();
                                    else setMultiSelectMode(true);
                                }}
                                title={multiSelectMode ? 'Cancelar selección' : 'Seleccionar varias fotos'}
                                className={`flex-shrink-0 flex items-center justify-center h-8 border-b border-white/10 transition-colors ${
                                    multiSelectMode ? 'bg-[#C9A96E]/20 text-[#C9A96E]' : 'text-white/30 hover:text-white/60'
                                }`}
                            >
                                <CheckSquare2 size={14} />
                            </button>
                        )}
                        <button
                            onClick={handleAutoRenamingAll}
                            title="Renombrar todas las fotos (Pro)"
                            className="flex-shrink-0 flex items-center justify-center h-8 border-b border-white/10 text-white/30 hover:text-emerald-400/70 transition-colors"
                        >
                            <Tag size={13} />
                        </button>
                        {selectedIds.size > 1 && (
                            <div className="flex items-center justify-center h-7 border-b border-white/10 text-[10px] font-semibold tracking-wide text-[#C9A96E] bg-[#C9A96E]/10">
                                {selectedIds.size} seleccionadas
                            </div>
                        )}
                        <div className="flex flex-col gap-1 p-1 overflow-y-auto flex-1 thin-scrollbar">
                            {imageFiles.map(f => {
                                const isSelected = selectedIds.has(f.id);
                                const isDuplicating = duplicatingId === f.id;
                                const showDropTop = thumbnailDropIndicator?.id === f.id && thumbnailDropIndicator.edge === 'top';
                                const showDropBottom = thumbnailDropIndicator?.id === f.id && thumbnailDropIndicator.edge === 'bottom';
                                return (
                                    <button
                                        key={f.id}
                                        draggable
                                        onContextMenu={(e) => openThumbnailContextMenu(e, f)}
                                        onDragStart={(e) => {
                                            if (canvasActive) {
                                                e.dataTransfer.setData('driveFileId', f.id);
                                                e.dataTransfer.effectAllowed = 'copy';
                                                return;
                                            }
                                            setThumbnailDragId(f.id);
                                            e.dataTransfer.effectAllowed = 'move';
                                            e.dataTransfer.setData('thumbnailReorderId', f.id);
                                        }}
                                        onDragOver={(e) => {
                                            if (canvasActive) return;
                                            e.preventDefault();
                                            e.dataTransfer.dropEffect = 'move';
                                            const rect = e.currentTarget.getBoundingClientRect();
                                            const edge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
                                            setThumbnailDropIndicator({ id: f.id, edge });
                                        }}
                                        onDrop={(e) => {
                                            if (canvasActive) return;
                                            e.preventDefault();
                                            const draggedId = e.dataTransfer.getData('thumbnailReorderId') || thumbnailDragId;
                                            if (!draggedId) return;
                                            void handleThumbnailReorder(draggedId, f.id, thumbnailDropIndicator?.id === f.id ? thumbnailDropIndicator.edge : 'top');
                                        }}
                                        onDragLeave={() => {
                                            setThumbnailDropIndicator((prev) => prev?.id === f.id ? null : prev);
                                        }}
                                        onDragEnd={() => {
                                            setThumbnailDragId(null);
                                            setThumbnailDropIndicator(null);
                                        }}
                                        onClick={(e) => handleThumbnailSelect(f, e)}
                                        className={`relative aspect-square rounded-md overflow-hidden flex-shrink-0 border-2 transition-all ${
                                            canvasActive ? 'cursor-grab active:cursor-grabbing' : 'cursor-grab active:cursor-grabbing'
                                        } ${
                                            isSelected
                                                ? 'border-[#C9A96E]'
                                                : !canvasActive && f.id === activeFile?.id
                                                    ? 'border-[#C9A96E]'
                                                    : 'border-transparent hover:border-white/30'
                                        } ${thumbnailDragId === f.id ? 'opacity-60 scale-95' : ''}`}
                                    >
                                        {f.thumbnailLink ? (
                                            <img src={f.thumbnailLink} alt={f.name} referrerPolicy="no-referrer" className={`w-full h-full object-cover ${isDuplicating ? 'opacity-30' : ''}`} />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-white/5">
                                                <ImageIcon size={16} className="text-white/30" />
                                            </div>
                                        )}
                                        {isDuplicating && (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Loader2 size={16} className="text-[#C9A96E] animate-spin" />
                                            </div>
                                        )}
                                        {isSelected && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-[#C9A96E]/30">
                                                <Check size={16} className="text-white drop-shadow" />
                                            </div>
                                        )}
                                        {(editedFileIds.has(f.id) || f.name.includes('_editada')) && (
                                            <div className="absolute bottom-0.5 right-0.5 w-[15px] h-[15px] rounded-full bg-[#C9A96E] flex items-center justify-center shadow z-10" title="Foto editada">
                                                <Sparkles size={8} className="text-black" />
                                            </div>
                                        )}
                                        {showDropTop && <div className="absolute -top-0.5 left-1 right-1 h-1 rounded-full bg-[#C9A96E] shadow-[0_0_10px_rgba(201,169,110,0.7)]" />}
                                        {showDropBottom && <div className="absolute -bottom-0.5 left-1 right-1 h-1 rounded-full bg-[#C9A96E] shadow-[0_0_10px_rgba(201,169,110,0.7)]" />}
                                    </button>
                                );
                            })}

                            {/* Multi-canvas thumbnails */}
                            {canvases.map((cv) => (
                                <div key={cv.id} className="relative flex-shrink-0 group">
                                    <button
                                        onClick={() => { handleActivateCanvas(cv.id); clearMultiSelection(); }}
                                        className={`relative aspect-square w-[56px] rounded-lg overflow-hidden border-2 transition-all flex flex-col items-center justify-center p-1 ${
                                            canvasActive && activeCanvasId === cv.id
                                                ? 'border-[#C9A96E] bg-white shadow-[0_0_15px_rgba(201,169,110,0.3)]'
                                                : 'border-white/10 bg-white/5 hover:border-white/30 hover:bg-white/10'
                                        }`}
                                        title={cv.name}
                                    >
                                        <CanvasThumbnailPreview
                                            layers={cv.layers}
                                            bgColor={cv.bgColor}
                                            ratio={cv.ratio}
                                        />
                                        {cv.layers.length > 0 && (
                                            <span className="absolute top-0.5 right-0.5 text-[7px] bg-[#C9A96E]/80 text-black rounded px-0.5 font-bold">
                                                {cv.layers.length}
                                            </span>
                                        )}
                                    </button>
                                    {/* Delete button — always visible so it works on touch and with a single canvas */}
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteCanvas(cv.id); }}
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center z-10"
                                        title="Eliminar lienzo"
                                    >
                                        <X size={8} />
                                    </button>
                                </div>
                            ))}

                            {/* Add new canvas button */}
                            <button
                                onClick={handleNewCanvas}
                                className="flex-shrink-0 aspect-square w-[56px] rounded-lg border-2 border-dashed border-white/20 hover:border-[#C9A96E]/60 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-0.5"
                                title="Nuevo lienzo"
                            >
                                <Plus size={14} className="text-white/40 group-hover:text-[#C9A96E]" />
                                <span className="text-[8px] text-white/30 uppercase tracking-wider">Nuevo</span>
                            </button>
                        </div>
                    </div>

                    {/* Canvas area */}
                    <div
                        ref={canvasContainerRef}
                        className="relative flex-1 flex items-center justify-center overflow-hidden p-4 bg-[#0D0D12]"
                        onMouseDown={canvasActive || cropActive ? undefined : handleMouseDown}
                        onMouseMove={canvasActive ? undefined : handleMouseMove}
                        onMouseUp={canvasActive ? undefined : handleMouseUp}
                        onMouseLeave={canvasActive ? undefined : handleMouseUp}
                        onTouchStart={canvasActive || cropActive ? undefined : handleTouchStart}
                        onTouchMove={canvasActive || cropActive ? undefined : handleTouchMove}
                        onTouchEnd={canvasActive ? undefined : handleTouchEnd}
                        onDoubleClick={canvasActive || cropActive ? undefined : () => { setZoom(1); setPanX(0); setPanY(0); }}
                        style={{ cursor: (!canvasActive && zoom > 1) ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                    >
                        {!canvasActive && selectedText && (
                            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 rounded-xl border border-white/10 bg-[#12121A]/95 px-2 py-1.5 shadow-lg backdrop-blur-sm">
                                <button
                                    onClick={() => setTextAnnotations(prev => prev.map(t => t.id === selectedText.id ? { ...t, fontSize: Math.max(14, t.fontSize - 2) } : t))}
                                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                    title="Reducir tamaño"
                                >
                                    <Minus size={14} />
                                </button>
                                <span className="min-w-10 text-center text-xs font-semibold text-white/80">{selectedText.fontSize}px</span>
                                <button
                                    onClick={() => setTextAnnotations(prev => prev.map(t => t.id === selectedText.id ? { ...t, fontSize: Math.min(72, t.fontSize + 2) } : t))}
                                    className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                                    title="Aumentar tamaño"
                                >
                                    <Plus size={14} />
                                </button>
                                <div className="mx-1 h-5 w-px bg-white/10" />
                                {([
                                    { id: 'left', icon: AlignLeft, label: 'Alinear izquierda' },
                                    { id: 'center', icon: AlignCenter, label: 'Alinear centro' },
                                    { id: 'right', icon: AlignRight, label: 'Alinear derecha' },
                                ] as const).map(opt => {
                                    const Icon = opt.icon;
                                    return (
                                        <button
                                            key={opt.id}
                                            onClick={() => setTextAnnotations(prev => prev.map(t => t.id === selectedText.id ? { ...t, align: opt.id } : t))}
                                            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                                selectedText.align === opt.id
                                                    ? 'bg-[#C9A96E]/20 text-[#C9A96E]'
                                                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                                            }`}
                                            title={opt.label}
                                        >
                                            <Icon size={14} />
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        {/* scale() then translate(): translates happen in pre-scale space; handleMouseMove divides by zoom to compensate */}
                        <div style={{
                            transform: isCropActive ? 'none' : `scale(${zoom}) translate(${panX}px, ${panY}px)`,
                            transformOrigin: 'center',
                            transition: isDragging || isCropActive ? 'none' : 'transform 0.05s ease-out',
                        }}>
                            {!canvasActive && (brushMode !== null || healMode || magicWandActive) ? (
                                <canvas
                                    ref={brushCanvasRef}
                                    className={canvasBg}
                                    style={{ ...imageStyle, cursor: 'crosshair' }}
                                    onPointerDown={magicWandActive ? handleMagicWandClick : handleBrushDown}
                                    onPointerMove={magicWandActive ? undefined : handleBrushMove}
                                    onPointerUp={magicWandActive ? undefined : handleBrushUp}
                                    onPointerLeave={magicWandActive ? undefined : (e) => { handleBrushUp(e); hideHealCursor(); }}
                                />
                            ) : cropActive ? (
                                <div className={canvasBg} style={{ display: 'inline-block', lineHeight: 0 }}>
                                    <ReactCrop
                                        crop={crop}
                                        aspect={activeCropAspect}
                                        onChange={c => setCrop(c)}
                                        onComplete={c => setCompletedCrop(c)}
                                    >
                                        {/*
                                          No objectFit:contain — the element must equal the rendered image size.
                                          No inline-block on img needed; the wrapper div handles containment.
                                        */}
                                        <img
                                            ref={imgRef}
                                            src={imageUrl}
                                            alt={activeFile.name}
                                            crossOrigin={imageUrl.startsWith('blob:') || imageUrl.startsWith('data:') ? undefined : 'anonymous'}
                                            onLoad={(event) => {
                                                setImgLoaded(true);
                                                if (activeCropAspect) {
                                                    applyCropAspectPreset(cropAspectPreset, event.currentTarget);
                                                }
                                            }}
                                            style={{
                                                display: 'block',
                                                maxWidth: '100%',
                                                maxHeight: imageStyle.maxHeight,
                                                transform: 'none',
                                            }}
                                        />
                                    </ReactCrop>
                                </div>
                            ) : (
                                <div className={`relative inline-block ${canvasBg}`}>
                                    {canvasActive ? (
                                        <>
                                        <canvas
                                            ref={canvasLayersRef}
                                            tabIndex={0}
                                            style={{
                                                ...getCanvasRatioStyle(),
                                                outline: 'none', // avoid focus ring on canvas
                                                cursor: healMode ? 'crosshair' : 'default',
                                            }}
                                            onPointerDown={handleCanvasLayerPointerDown}
                                            onPointerMove={handleCanvasLayerPointerMove}
                                            onPointerUp={handleCanvasLayerPointerUp}
                                            onPointerLeave={() => { handleCanvasLayerPointerUp(); hideHealCursor(); }}
                                            onDoubleClick={handleCanvasLayerDoubleClick}
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={handleCanvasLayerDrop}
                                            onContextMenu={handleCanvasLayerContextMenu}
                                        />
                                        {/* Layer crop overlay — activado con doble clic */}
                                        {canvasLayerCropId && (() => {
                                            const layer = canvasLayers.find(l => l.id === canvasLayerCropId);
                                            if (!layer) return null;
                                            // Show the baked (rotation-applied) image if available, otherwise raw src
                                            const cropSrc = canvasLayerCropBakedSrc ?? layer.src;
                                            return (
                                                <div className="absolute inset-0 bg-black/85 flex flex-col z-20 rounded-lg overflow-hidden">
                                                    <div className="flex items-center justify-between px-3 py-2 bg-black/60 border-b border-white/10 shrink-0">
                                                        <span className="text-white/70 text-xs">Recortá la foto — ajustá rotación y área</span>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={handleConfirmCanvasLayerCrop}
                                                                className="flex items-center gap-1 px-3 py-1 rounded-md text-xs bg-blue-600 text-white font-medium hover:bg-blue-500 transition-colors"
                                                            >
                                                                <Check size={12} /> Aplicar
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setCanvasLayerCropBakedSrc(prev => {
                                                                        if (prev && prev !== canvasLayerCropPreBakeRef.current) URL.revokeObjectURL(prev);
                                                                        return null;
                                                                    });
                                                                    canvasLayerCropPreBakeRef.current = null;
                                                                    setCanvasLayerCropId(null);
                                                                }}
                                                                className="flex items-center gap-1 px-3 py-1 rounded-md text-xs bg-white/10 text-white/60 hover:bg-white/20 transition-colors"
                                                            >
                                                                <X size={12} /> Cancelar
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                                                        {/*
                                                          CRITICAL: wrap ReactCrop in inline-block so its container
                                                          collapses to the image's actual rendered size.
                                                        */}
                                                        <div style={{ display: 'inline-block', lineHeight: 0 }}>
                                                            <ReactCrop
                                                                crop={canvasLayerCropSel}
                                                                onChange={c => setCanvasLayerCropSel(c)}
                                                                onComplete={c => setCanvasLayerCompletedCrop(c)}
                                                            >
                                                                <img
                                                                    ref={canvasLayerCropImgRef}
                                                                    src={cropSrc}
                                                                    alt="recorte"
                                                                    style={{
                                                                        display: 'block',
                                                                        maxWidth: 'min(100%, calc(100vw - 100px))',
                                                                        maxHeight: 'calc(60vh - 120px)',
                                                                    }}
                                                                    crossOrigin={cropSrc.startsWith('blob:') || cropSrc.startsWith('data:') ? undefined : 'anonymous'}
                                                                />
                                                            </ReactCrop>
                                                        </div>
                                                    </div>
                                                    {/* Inline rotation strip — same UX as photo crop mode */}
                                                    <div className="flex items-center justify-center gap-3 px-4 py-2.5 bg-black/60 border-t border-white/10 shrink-0">
                                                        <button
                                                            onClick={() => setCanvasLayerCropRotation(r => { const n = r - 0.5; return n < -180 ? n + 360 : n; })}
                                                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-all flex-shrink-0"
                                                        >
                                                            <RotateCcw size={13} />
                                                        </button>
                                                        <input
                                                            type="range" min={-180} max={180} step={0.5}
                                                            value={canvasLayerCropRotation}
                                                            onChange={e => setCanvasLayerCropRotation(Number(e.target.value))}
                                                            className="flex-1 accent-white/70 h-1.5 rounded-lg appearance-none bg-white/20 cursor-pointer"
                                                        />
                                                        <button
                                                            onClick={() => setCanvasLayerCropRotation(r => { const n = r + 0.5; return n > 180 ? n - 360 : n; })}
                                                            className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-all flex-shrink-0"
                                                        >
                                                            <RotateCw size={13} />
                                                        </button>
                                                        <span className="text-white/50 font-mono text-xs w-14 text-center flex-shrink-0">
                                                            {canvasLayerCropRotation > 0 ? `+${canvasLayerCropRotation.toFixed(1)}°` : `${canvasLayerCropRotation.toFixed(1)}°`}
                                                        </span>
                                                        {canvasLayerCropRotation !== 0 && (
                                                            <button
                                                                onClick={() => setCanvasLayerCropRotation(0)}
                                                                className="text-[10px] text-[#C9A96E] hover:text-[#C9A96E]/80 transition-colors font-bold uppercase flex-shrink-0"
                                                            >
                                                                Reset
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                        </>
                                    ) : (
                                    <div className="relative" style={{ lineHeight: 0 }}>
                                        {!imgLoaded && thumbPlaceholderUrl && (
                                            <img
                                                src={thumbPlaceholderUrl}
                                                aria-hidden="true"
                                                alt=""
                                                style={{
                                                    ...imageStyle,
                                                    position: 'absolute',
                                                    inset: 0,
                                                    filter: 'blur(8px)',
                                                    transform: imageStyle.transform,
                                                    opacity: 0.7,
                                                    pointerEvents: 'none',
                                                }}
                                            />
                                        )}
                                        <img
                                            ref={imgRef}
                                            src={imageUrl}
                                            alt={activeFile.name}
                                            crossOrigin="anonymous"
                                            onLoad={() => setImgLoaded(true)}
                                            style={{
                                                ...imageStyle,
                                                opacity: imgLoaded ? 1 : 0,
                                                transition: imgLoaded ? 'opacity 0.2s ease' : 'none',
                                            }}
                                        />
                                    </div>
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
                                            pointerEvents: (!healMode && (drawMode !== 'idle' || drawShapes.length > 0 || textToolActive || textAnnotations.length > 0)) ? 'auto' : 'none',
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
                                                    width: `${ta.width * 100}%`,
                                                    maxWidth: `${Math.max(18, (0.95 - ta.x) * 100)}%`,
                                                    zIndex: 20,
                                                    pointerEvents: 'auto',
                                                }}
                                            >
                                                <textarea
                                                    ref={el => {
                                                        if (el) {
                                                            el.style.height = 'auto';
                                                            el.style.height = `${el.scrollHeight}px`;
                                                        }
                                                    }}
                                                    autoFocus
                                                    value={ta.text}
                                                    placeholder="Texto..."
                                                    rows={1}
                                                    onChange={e => {
                                                        const canvasWidthPx = drawCanvasRef.current?.clientWidth ?? 0;
                                                        setTextAnnotations(prev => prev.map(t => {
                                                            if (t.id !== ta.id) return t;
                                                            return {
                                                                ...t,
                                                                text: e.target.value,
                                                                width: measureTextAnnotationWidth(e.target.value, t.width, t.x, canvasWidthPx, t.fontSize),
                                                            };
                                                        }));
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
                                                        width: '100%',
                                                        maxWidth: '100%',
                                                        boxSizing: 'border-box',
                                                        background: 'transparent',
                                                        border: 'none',
                                                        outline: 'none',
                                                        resize: 'none',
                                                        overflow: 'hidden',
                                                        padding: 0,
                                                        display: 'block',
                                                        fontFamily: 'Inter, sans-serif',
                                                        fontWeight: 600,
                                                        fontSize: `${ta.fontSize}px`,
                                                        lineHeight: TEXT_LINE_HEIGHT,
                                                        textAlign: ta.align,
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

                        {healMode && healCursor.visible && (
                            <div
                                className="pointer-events-none absolute rounded-full border border-cyan-300/90 bg-cyan-200/10 shadow-[0_0_0_1px_rgba(0,0,0,0.45)] z-20"
                                style={{
                                    width: `${healCursor.size}px`,
                                    height: `${healCursor.size}px`,
                                    left: `${healCursor.x - healCursor.size / 2}px`,
                                    top: `${healCursor.y - healCursor.size / 2}px`,
                                }}
                            />
                        )}

                        {brushMode !== null && healCursor.visible && (
                            <div
                                className={`pointer-events-none absolute rounded-full border shadow-[0_0_0_1px_rgba(0,0,0,0.45)] z-20 ${
                                    brushMode === 'erase'
                                        ? 'border-red-500 bg-red-500/15'
                                        : 'border-emerald-500 bg-emerald-500/15'
                                }`}
                                style={{
                                    width: `${healCursor.size}px`,
                                    height: `${healCursor.size}px`,
                                    left: `${healCursor.x - healCursor.size / 2}px`,
                                    top: `${healCursor.y - healCursor.size / 2}px`,
                                }}
                            />
                        )}

                        {/* Smile Design before/after overlay */}
                        {smileMode && smileDesign.result && (
                            <div className="absolute inset-0 flex items-center justify-center p-4 bg-[#0D0D12] z-10">
                                <div className="relative w-full h-full">
                                    <BeforeAfterSlider
                                        beforeSrc={smileDesign.result.beforeDataUrl}
                                        afterSrc={smileDesign.result.afterDataUrl}
                                        className="w-full h-full"
                                        onPosChange={(p) => { slicePosRef.current = p; }}
                                    />
                                    {showSmileGrid && smileDesign.gridData && (
                                        <svg className="absolute inset-0 w-full h-full pointer-events-none z-20" xmlns="http://www.w3.org/2000/svg">
                                            <defs>
                                                <pattern id="fineGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                                                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="white" strokeWidth="0.5" opacity="0.1" />
                                                </pattern>
                                                <pattern id="largeGrid" width="100" height="100" patternUnits="userSpaceOnUse">
                                                    <rect width="100" height="100" fill="url(#fineGrid)" />
                                                    <path d="M 100 0 L 0 0 0 100" fill="none" stroke="white" strokeWidth="1" opacity="0.2" />
                                                </pattern>
                                            </defs>
                                            <rect width="100%" height="100%" fill="url(#largeGrid)" />
                                            {smileDesign.gridData.bipupilarY != null && (
                                                <g>
                                                    <line x1="0" y1={`${smileDesign.gridData.bipupilarY * 100}%`} x2="100%" y2={`${smileDesign.gridData.bipupilarY * 100}%`} stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.9" />
                                                    <text x="10" y={`calc(${smileDesign.gridData.bipupilarY * 100}% - 5px)`} fill="#fbbf24" fontSize="10" fontWeight="bold" opacity="0.9">Línea Bipupilar</text>
                                                </g>
                                            )}
                                            {smileDesign.gridData.smileLineY != null && (
                                                <g>
                                                    <line x1="0" y1={`${smileDesign.gridData.smileLineY * 100}%`} x2="100%" y2={`${smileDesign.gridData.smileLineY * 100}%`} stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.9" />
                                                    <text x="10" y={`calc(${smileDesign.gridData.smileLineY * 100}% - 5px)`} fill="#34d399" fontSize="10" fontWeight="bold" opacity="0.9">Línea de Sonrisa</text>
                                                </g>
                                            )}
                                            {smileDesign.gridData.midlineX != null && (
                                                <g>
                                                    <line x1={`${smileDesign.gridData.midlineX * 100}%`} y1="0" x2={`${smileDesign.gridData.midlineX * 100}%`} y2="100%" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="6 3" opacity="0.9" />
                                                    <text x={`calc(${smileDesign.gridData.midlineX * 100}% + 5px)`} y="20" fill="#60a5fa" fontSize="10" fontWeight="bold" opacity="0.9">Línea Media</text>
                                                </g>
                                            )}
                                        </svg>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* Smile Design processing overlay */}
                        {smileMode && (smileDesign.state === 'aligning' || smileDesign.state === 'enhancing') && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0D0D12]/90 z-20">
                                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mb-3" />
                                <p className="text-white/70 text-sm">
                                    {smileDesign.state === 'aligning' ? 'Auto-alineando...' : 'Generando smile design...'}
                                </p>
                            </div>
                        )}

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

                    {/* Inline rotation strip — shown while in crop mode so the user can
                        straighten the image without leaving the crop view */}
                    {cropActive && (
                        <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-center gap-3 px-4 py-2.5 bg-black/70 backdrop-blur-sm border-t border-white/10">
                            <button
                                onClick={() => setRotation((r: number) => { const n = r - 0.5; return n < -180 ? n + 360 : n; })}
                                className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-all flex-shrink-0"
                                title="-0.5°"
                            >
                                <RotateCcw size={13} />
                            </button>
                            <input
                                type="range" min={-180} max={180} step={0.5}
                                value={rotation}
                                onChange={e => setRotation(Number(e.target.value))}
                                className="w-48 md:w-64 accent-white/70 h-1.5 rounded-lg appearance-none bg-white/20 cursor-pointer"
                            />
                            <button
                                onClick={() => setRotation((r: number) => { const n = r + 0.5; return n > 180 ? n - 360 : n; })}
                                className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10 text-white/60 hover:bg-white/20 hover:text-white transition-all flex-shrink-0"
                                title="+0.5°"
                            >
                                <RotateCw size={13} />
                            </button>
                            <span className="text-white/50 font-mono text-xs w-14 text-center flex-shrink-0">
                                {rotation > 0 ? `+${rotation.toFixed(1)}°` : `${rotation.toFixed(1)}°`}
                            </span>
                            {rotation !== 0 && (
                                <button
                                    onClick={() => setRotation(0)}
                                    className="text-[10px] text-[#C9A96E] hover:text-[#C9A96E]/80 transition-colors font-bold uppercase flex-shrink-0"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    )}

                    {/* Tab to restore panel when hidden */}
                    {toolsHidden && (
                        <button
                            onClick={() => setToolsHidden(false)}
                            title="Mostrar herramientas"
                            className="hidden md:flex items-center justify-center w-8 border-l border-white/10 bg-black/20 hover:bg-white/5 transition-colors flex-shrink-0 text-white/30 hover:text-white/60"
                        >
                            <PanelRightOpen size={18} />
                        </button>
                    )}

                    {/* Tools panel — right side on desktop */}
                    <div className={`${toolsHidden ? '!hidden' : ''} hidden md:flex flex-col w-80 2xl:w-96 border-l border-white/10 overflow-y-auto flex-shrink-0 bg-black/20`}>
                        {smileMode ? (
                            <SmileDesignPanel
                                state={smileDesign.state}
                                result={smileDesign.result}
                                gridData={smileDesign.gridData}
                                settings={smileDesign.settings}
                                onSettingsChange={smileDesign.setSettings}
                                onRegenerate={async () => {
                                    smileStartTimeRef.current = Date.now();
                                    smileMotion.reset();
                                    await smileDesign.regenerate();
                                    if (smileStartTimeRef.current) {
                                        setSmileProcessingTime((Date.now() - smileStartTimeRef.current) / 1000);
                                    }
                                }}
                                onSave={async () => {
                                    if (!smileDesign.result) return;
                                    const saveToastId = toast.loading("Guardando Smile Design...", {
                                        description: "Generando imágenes comparativas..."
                                    });
                                    
                                    try {
                                        const [comparisonBase64, sliceBase64] = await Promise.all([
                                            generateComparisonBase64(
                                                smileDesign.result.beforeDataUrl,
                                                smileDesign.result.afterDataUrl
                                            ),
                                            generateSliceBase64(
                                                smileDesign.result.beforeDataUrl,
                                                smileDesign.result.afterDataUrl,
                                                50
                                            )
                                        ]);
                                        
                                        // saveSmileDesignResult handles uploads to Drive AND DB records
                                        const saveResult = await saveSmileDesignResult({
                                            patientId: patientId || '',
                                            folderId: folderId || '',
                                            beforeDataUrl: smileDesign.result.beforeDataUrl,
                                            afterBase64: smileDesign.result.afterBase64,
                                            afterMime: smileDesign.result.afterMime,
                                            comparisonBase64: comparisonBase64 || undefined,
                                            sliceBase64: sliceBase64 || undefined,
                                            settings: smileDesign.settings,
                                        });
                                        
                                        if (saveResult.success) {
                                            toast.success("Smile Design guardado exitosamente", { id: saveToastId });
                                            // Delay slightly to ensure Drive indexing is done before UI reloads
                                            setTimeout(() => onSaved(), 2000);
                                        } else {
                                            toast.error(saveResult.error || "Error al persistir cambios", { id: saveToastId });
                                        }
                                    } catch (err) {
                                        console.error("[onSave] Smile Design error:", err);
                                        toast.error("Error al generar imágenes del Smile Design", { id: saveToastId });
                                    }
                                }}
                                onGenerateMotion={async () => {
                                    if (!smileDesign.result) return;
                                    if (!patientId) {
                                        toast.error('No se encontró el paciente para generar el video');
                                        return;
                                    }
                                    const cleanPatientName = patientName.replace(/\s+/g, '_');
                                    const dotIndex = activeFile.name.lastIndexOf('.');
                                    const baseName = dotIndex > 0 ? activeFile.name.slice(0, dotIndex) : activeFile.name;
                                    const motionBaseName = `${cleanPatientName}_${baseName}`;
                                    
                                    await smileMotion.generate(
                                        smileDesign.result.beforeDataUrl,
                                        smileDesign.result.afterDataUrl,
                                        patientId,
                                        motionBaseName
                                    );
                                }}
                                onSaveMotion={async () => {
                                    if (!smileMotion.result) return;
                                    if (!folderId) {
                                        toast.error('No se encontró la carpeta de Drive del paciente');
                                        return;
                                    }
                                    const tId = toast.loading("Subiendo videos a Drive...");
                                    try {
                                        const cleanPatientName = patientName.replace(/\s+/g, '_');
                                        const dotIndex = activeFile.name.lastIndexOf('.');
                                        const baseName = dotIndex > 0 ? activeFile.name.slice(0, dotIndex) : activeFile.name;
                                        const motionBaseName = `${cleanPatientName}_${baseName}`;

                                        // Upload before video to Drive
                                        const resB = await fetch(smileMotion.result.beforeVideoUrl);
                                        const blobB = await resB.blob();
                                        const fdB = new FormData();
                                        fdB.append('file', blobB, `${motionBaseName}_motion_antes.mp4`);
                                        await uploadEditedPhotoAction(folderId, `${motionBaseName}_motion_antes.mp4`, fdB);

                                        // Upload after video to Drive
                                        const resA = await fetch(smileMotion.result.afterVideoUrl);
                                        const blobA = await resA.blob();
                                        const fdA = new FormData();
                                        fdA.append('file', blobA, `${motionBaseName}_motion_despues.mp4`);
                                        await uploadEditedPhotoAction(folderId, `${motionBaseName}_motion_despues.mp4`, fdA);

                                        // Save records to patient_files for portal visibility
                                        if (patientId) {
                                            const saveResult = await saveSmileMotionVideos({
                                                patientId,
                                                beforeVideoUrl: smileMotion.result.beforeVideoUrl,
                                                afterVideoUrl: smileMotion.result.afterVideoUrl,
                                                baseName: motionBaseName,
                                            });
                                            if (saveResult.error) {
                                                console.error('[onSaveMotion] patient_files insert:', saveResult.error);
                                            }
                                        }

                                        toast.success("Videos guardados en Drive y portal", { id: tId });
                                        onSaved();
                                    } catch (err) {
                                        toast.error("Error al guardar videos", { id: tId });
                                    }
                                }}
                                motionState={smileMotion.state}
                                motionError={smileMotion.error}
                                onShareLink={async () => {
                                    if (!patientId) {
                                        toast.error('No se encontró el paciente para generar el link');
                                        return;
                                    }

                                    const tId = toast.loading('Generando link para paciente...');
                                    const result = await getSmileShareUrl(patientId);
                                    if (!result.success || !result.url) {
                                        toast.error(result.error || 'No se pudo generar el link', { id: tId });
                                        return;
                                    }

                                    try {
                                        await navigator.clipboard.writeText(result.url);
                                        toast.success('Link copiado al portapapeles', {
                                            id: tId,
                                            description: result.url,
                                        });
                                    } catch {
                                        toast.success('Link generado', {
                                            id: tId,
                                            description: result.url,
                                        });
                                    }
                                }}
                                onExit={() => setSmileMode(false)}
                                showGrid={showGrid}
                                onToggleGrid={() => setShowGrid(!showGrid)}
                                canShare={!!smileDesign.result}
                                error={smileDesign.state === 'error' ? 'Error en el procesamiento' : null}
                                processingTime={smileProcessingTime}
                            />
                        ) : (
                        <>
                        {/* Panel header — just the hide button, title is already inside ToolsPanel */}
	                        <div className="flex items-center justify-end px-5 pt-4 pb-0 flex-shrink-0">
	                            <button
	                                onClick={() => setToolsHidden(true)}
	                                className="flex items-center gap-1.5 text-white/40 hover:text-white/80 text-sm font-medium transition-colors"
	                            >
	                                <PanelRightClose size={18} />
	                                Ocultar
	                            </button>
	                        </div>
	                        <div className="flex flex-col gap-6 p-5 pt-3 overflow-y-auto flex-1">
                        <ToolsPanel
                            rotation={canvasActive && canvasSelectedId
                                ? (canvasLayers.find(l => l.id === canvasSelectedId)?.rotation ?? 0)
                                : rotation}
                            setRotation={canvasActive && canvasSelectedId
                                ? (v) => setCanvasLayers(prev => prev.map(l => l.id === canvasSelectedId ? { ...l, rotation: typeof v === 'function' ? (v as any)(l.rotation) : v } : l))
                                : setRotation}
                            brightness={canvasActive && canvasSelectedId
                                ? (canvasLayers.find(l => l.id === canvasSelectedId)?.brightness ?? 100)
                                : brightness}
                            setBrightness={canvasActive && canvasSelectedId
                                ? (v) => setCanvasLayers(prev => prev.map(l => l.id === canvasSelectedId ? { ...l, brightness: typeof v === 'function' ? (v as any)(l.brightness) : v } : l))
                                : setBrightness}
                            cropActive={cropActive || !!canvasLayerCropId}
                            setCropActive={canvasLayerCropId ? () => {} : setCropActive}
                            cropAspectPreset={canvasLayerCropId ? canvasLayerCropAspectPreset : cropAspectPreset}
                            onCropAspectPresetChange={canvasLayerCropId ? applyCanvasLayerCropAspectPreset : applyCropAspectPreset}
                            hasPriorCrop={canvasLayerCropId ? (canvasLayerCropPreBakeRef.current !== null) : (preCropImageRef.current !== null)}
                            onEnterCropMode={canvasActive && canvasSelectedId
                                // When a canvas layer is selected, crop that layer (not the main photo)
                                ? () => {
                                    const layer = canvasLayers.find(l => l.id === canvasSelectedId);
                                    const initialRot = layer?.rotation ?? 0;
                                    canvasLayerCropPreBakeRef.current = layer?.src ?? null;
                                    setCanvasLayerCropRotation(initialRot);
                                    setCanvasLayerCropBakedSrc(initialRot === 0 ? (layer?.src ?? null) : null);
                                    setCanvasLayerCropId(canvasSelectedId);
                                    const initialCrop: Crop = { unit: '%', width: 100, height: 100, x: 0, y: 0 };
                                    setCanvasLayerCropSel(initialCrop);
                                    setCanvasLayerCompletedCrop(initialCrop as any);
                                    setCanvasLayerCropAspectPreset('free');
                                    setCanvasSelectedId(null);
                                }
                                : handleEnterCropMode}
                            onConfirmCrop={canvasLayerCropId ? handleConfirmCanvasLayerCrop : handleConfirmCrop}
                            onCancelCrop={canvasLayerCropId ? () => {
                                setCanvasLayerCropBakedSrc(prev => {
                                    if (prev && prev !== canvasLayerCropPreBakeRef.current) URL.revokeObjectURL(prev);
                                    return null;
                                });
                                canvasLayerCropPreBakeRef.current = null;
                                setCanvasLayerCropId(null);
                            } : handleCancelCrop}
                            bgProcessing={bgProcessing} bgDone={bgDone}
                            bgColor={bgColor} setBgColor={setBgColor}
                            onRemoveBg={handleRemoveBackground}
                            onUndoBg={handleUndoBgRemoval}
                            onCancelBg={handleCancelBgProcessing}
                            onMoveSubject={() => setSubjectTransformOpen(true)}
                            brushMode={brushMode}
                            onSetBrushMode={(mode) => {
                                setBrushMode(mode);
                                if (mode !== null) {
                                    setHealMode(false);
                                    setDrawMode('idle');
                                    setMousePos(null);
                                    setMagicWandActive(false);
                                }
                            }}
                            brushSize={brushSize}
                            onSetBrushSize={setBrushSize}
                            magicWandActive={magicWandActive}
                            onSetMagicWandActive={(active) => {
                                setMagicWandActive(active);
                                if (active) {
                                    setBrushMode(null);
                                    setHealMode(false);
                                    setDrawMode('idle');
                                    setMousePos(null);
                                }
                            }}
                            magicWandTolerance={magicWandTolerance}
                            onSetMagicWandTolerance={setMagicWandTolerance}
                            onStartManualEraser={startManualEraser}
                            healMode={healMode}
                            onSetHealMode={(next) => {
                                if (next) {
                                    void getOpenCv().catch(() => {
                                        toast.error('No se pudo cargar el corrector');
                                        setHealMode(false);
                                    });
                                }
                                setHealMode(next);
                                if (next) {
                                    setBrushMode(null);
                                    setDrawMode('idle');
                                    setMousePos(null);
                                } else {
                                    hideHealCursor();
                                    healLastPointRef.current = null;
                                    canvasHealPreviewRef.current = null;
                                    canvasHealSessionRef.current = null;
                                    setHealPreviewNonce(v => v + 1);
                                }
                            }}
                            healSize={healSize}
                            onSetHealSize={setHealSize}
                            onReset={() => {
                                resetEdits();
                                setImageUrl(`/api/drive/file/${activeFile.id}?cors=1`);
                            }}
                            onUndo={handleUndo}
                            onRedo={handleRedo}
                            onPushHistory={pushHistory}
                            historyCount={history.length}
                            redoCount={redoStack.length}
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
                            canvasSelectedId={canvasSelectedId}
                            canvasRatio={canvasRatio}
                            onCanvasRatioChange={handleCanvasRatioChange}
                            canvasLayerCount={canvasLayers.length}
                            onClearCanvasLayers={() => {
                                setCanvasLayers([]);
                                setCanvasSelectedId(null);
                                if (patientId) localStorage.removeItem(`am-clinica-canvas-${patientId}`);
                            }}
                            onDeleteActiveCanvas={activeCanvasId ? () => handleDeleteCanvas(activeCanvasId) : undefined}
                            onDeleteSelection={handleDeleteSelection}
                            canvasBgColor={activeCanvas?.bgColor}
                            onSetCanvasBgColor={setActiveCanvasBgColor}
                        />
                        </div>
                        </>
                        )}
                    </div>
                </div>

                {/* Tools — bottom strip on mobile */}
                <div className={`${toolsHidden ? 'hidden' : ''} md:hidden border-t border-white/10 px-3 py-2 overflow-x-auto flex-shrink-0`}>
                    <div className="flex items-center gap-4 min-w-max">
                        {/* Rotate */}
                        <div className="flex items-center gap-1.5">
                            <RotateCcw size={13} className="text-white/50" />
                            <input
                                type="range" min={-180} max={180} step={0.5}
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
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={handleConfirmCrop}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-blue-600 text-white transition-colors"
                                >
                                    <Check size={13} /> Confirmar
                                </button>
                                {CROP_ASPECT_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        onClick={() => applyCropAspectPreset(preset.id)}
                                        className={`px-2 py-1 rounded-md text-xs border transition-colors ${
                                            cropAspectPreset === preset.id
                                                ? 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/30'
                                                : 'bg-white/10 text-white/55 border-white/10'
                                        }`}
                                        title={preset.title}
                                    >
                                        {preset.label}
                                    </button>
                                ))}
                                <button
                                    onClick={handleCancelCrop}
                                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/50 transition-colors"
                                >
                                    <X size={13} /> Cancelar
                                </button>
                            </div>
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
                        {/* Mover sujeto — mobile */}
                        {bgDone && (
                            <button
                                onClick={() => setSubjectTransformOpen(true)}
                                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/10 text-white/70 transition-colors"
                            >
                                <ArrowLeftRight size={13} /> Mover
                            </button>
                        )}
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

                {/* ── Mover/escalar sujeto (Canva-style) ──────────────────── */}
                {subjectTransformOpen && (
                    <SubjectTransformOverlay
                        cutoutUrl={imageUrl}
                        bgPreview={
                            bgColor === 'white'
                                ? '#fff'
                                : bgColor === 'black'
                                    ? '#111'
                                    : 'repeating-conic-gradient(#bbb 0% 25%, #e5e5e5 0% 50%) 0 / 16px 16px'
                        }
                        onApply={handleSubjectTransformApply}
                        onClose={() => setSubjectTransformOpen(false)}
                    />
                )}

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
                                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                                className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                            >
                                <h3 className="text-white font-semibold text-lg mb-2">Guardar cambios</h3>
                                
                                {/* 1. Filename field */}
                                <div className="space-y-1.5 mb-5">
                                    <label className="text-xs text-white/50 font-bold uppercase tracking-wider">
                                        Nombre del archivo (SEO / Metadatos)
                                    </label>
                                    <div className="relative flex items-center bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 focus-within:border-[#C9A96E]/50 focus-within:ring-1 focus-within:ring-[#C9A96E]/30 transition-all">
                                        <PenLine size={16} className="text-white/40 mr-2" />
                                        <input
                                            type="text"
                                            value={exportFileName}
                                            onChange={(e) => setExportFileName(e.target.value.replace(/[^a-zA-Z0-9_\-]/g, '_'))}
                                            className="bg-transparent border-none outline-none text-white text-sm w-full font-medium"
                                            placeholder="Nombre del archivo"
                                            disabled={!!saving}
                                        />
                                        <span className="text-xs text-white/35 font-mono ml-2 select-none">
                                            {bgDone || canvasActive ? '.png' : '.jpg'}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-white/40 leading-relaxed">
                                        Se recomienda un nombre descriptivo para optimizar el posicionamiento y búsqueda (evitar espacios).
                                    </p>
                                </div>

                                {/* Informative metadata cleanup warning */}
                                <div className="bg-purple-950/20 border border-purple-500/20 rounded-xl p-3.5 text-[11px] text-purple-300/95 leading-relaxed flex gap-2.5 mb-6">
                                    <Globe2 size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
                                    <span>
                                        Las fotos editadas se guardan automáticamente en la subcarpeta <strong>Selección</strong>, optimizadas y sin metadatos (GPS, EXIF, datos de cámara) para proteger la privacidad al publicarse.
                                    </span>
                                </div>

                                {/* 2. Actions */}
                                <div className="flex flex-col gap-3">
                                    <button
                                        onClick={() => handleSaveToDrive('replace', 'patient')}
                                        disabled={!!saving}
                                        className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/10 active:scale-[0.98]"
                                    >
                                        {saving === 'replace' ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                        Reemplazar foto original
                                    </button>

                                    <button
                                        onClick={() => handleSaveToDrive('copy', 'social')}
                                        disabled={!!saving}
                                        className="w-full py-3 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-purple-600/10 active:scale-[0.98]"
                                    >
                                        {saving === 'copy' ? <Loader2 size={16} className="animate-spin" /> : <Copy size={16} />}
                                        Guardar copia en Selección (Redes)
                                    </button>

                                    <button
                                        onClick={() => handleSaveToDrive('copy', 'patient')}
                                        disabled={!!saving}
                                        className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/15 border border-white/10 transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        {saving === 'copy' ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                        Guardar copia nueva en el Drive
                                    </button>

                                    <button
                                        onClick={() => setSaveDialogOpen(false)}
                                        disabled={!!saving}
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
                    className="fixed inset-0 z-[70] bg-black flex flex-col select-none outline-none"
                    tabIndex={-1}
                    // eslint-disable-next-line jsx-a11y/no-autofocus
                    autoFocus
                    onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === 'Escape') { e.stopPropagation(); setPresentationMode(false); }
                        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.stopPropagation(); setPresentationIdx(i => Math.min(i + 1, imageFiles.length - 1)); }
                        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.stopPropagation(); setPresentationIdx(i => Math.max(i - 1, 0)); }
                    }}
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
                    <div
                        className="flex-1 flex items-center justify-center relative cursor-pointer"
                        onClick={() => setPresentationIdx(i => Math.min(imageFiles.length - 1, i + 1))}
                    >
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

                        {/* Prev — full-height zone */}
                        <button
                            onClick={() => setPresentationIdx(i => Math.max(0, i - 1))}
                            disabled={presentationIdx === 0}
                            className="absolute left-0 top-0 bottom-0 w-24 flex items-center justify-start pl-3 group transition-all disabled:opacity-0 disabled:pointer-events-none"
                            style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.35) 0%, transparent 100%)' }}
                        >
                            <ChevronLeft size={52} className="text-white/60 group-hover:text-white group-hover:scale-110 transition-all drop-shadow-xl" strokeWidth={1.5} />
                        </button>
                        {/* Next — full-height zone */}
                        <button
                            onClick={() => setPresentationIdx(i => Math.min(imageFiles.length - 1, i + 1))}
                            disabled={presentationIdx === imageFiles.length - 1}
                            className="absolute right-0 top-0 bottom-0 w-24 flex items-center justify-end pr-3 group transition-all disabled:opacity-0 disabled:pointer-events-none"
                            style={{ background: 'linear-gradient(to left, rgba(0,0,0,0.35) 0%, transparent 100%)' }}
                        >
                            <ChevronRight size={52} className="text-white/60 group-hover:text-white group-hover:scale-110 transition-all drop-shadow-xl" strokeWidth={1.5} />
                        </button>
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

                    <button
                        type="button"
                        onClick={() => setPresentationMode(false)}
                        className="absolute bottom-7 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-white px-5 py-3 text-sm font-bold text-black shadow-2xl md:hidden"
                    >
                        <Edit2 size={16} />
                        Editar foto
                    </button>
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
                    {/* Traer al frente (index +1, hacia el final del array = encima) */}
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
                        <span className="text-[#C9A96E]">↑</span> Traer al frente
                    </button>
                    {/* Traer completamente al frente */}
                    <button
                        onClick={() => {
                            setCanvasLayers(prev => {
                                const idx = prev.findIndex(l => l.id === canvasContextMenu.layerId);
                                if (idx < 0 || idx >= prev.length - 1) return prev;
                                const next = [...prev];
                                const [item] = next.splice(idx, 1);
                                next.push(item);
                                return next;
                            });
                            setCanvasContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <span className="text-[#C9A96E]">⇑</span> Al frente del todo
                    </button>
                    {/* Enviar atrás (index -1, hacia el inicio del array = debajo) */}
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
                        <span className="text-white/50">↓</span> Enviar atrás
                    </button>
                    {/* Enviar completamente al fondo */}
                    <button
                        onClick={() => {
                            setCanvasLayers(prev => {
                                const idx = prev.findIndex(l => l.id === canvasContextMenu.layerId);
                                if (idx <= 0) return prev;
                                const next = [...prev];
                                const [item] = next.splice(idx, 1);
                                next.unshift(item);
                                return next;
                            });
                            setCanvasContextMenu(null);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors flex items-center gap-2"
                    >
                        <span className="text-white/50">⇓</span> Al fondo del todo
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

        {/* ── Thumbnail Context Menu ───────────────────────────────────── */}
        {thumbnailContextMenu && typeof document !== 'undefined' && createPortal(
            <>
                <div
                    className="fixed inset-0 z-[90]"
                    onClick={() => setThumbnailContextMenu(null)}
                    onContextMenu={e => { e.preventDefault(); setThumbnailContextMenu(null); }}
                />
                <div
                    className="fixed z-[91] bg-[#1A1A24] border border-white/15 rounded-xl shadow-2xl py-1.5 w-[240px] backdrop-blur-md"
                    style={{ left: thumbnailContextMenu.x, top: thumbnailContextMenu.y }}
                >
                    {menuView === 'main' ? (
                        <>
                            <button
                                onClick={() => handleDuplicateFile(thumbnailContextMenu.file)}
                                className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-[#C9A96E]/20 transition-all flex items-center gap-2.5 group whitespace-nowrap"
                            >
                                <Copy size={16} className="text-[#C9A96E] group-hover:scale-110 transition-transform" />
                                <span>Duplicar foto</span>
                            </button>
                            <button
                                onClick={() => {
                                    handleManualRename(thumbnailContextMenu.file);
                                    setThumbnailContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-[#C9A96E]/20 transition-all flex items-center gap-2.5 group whitespace-nowrap"
                            >
                                <Edit2 size={16} className="text-[#C9A96E] group-hover:scale-110 transition-transform" />
                                <span>Cambiar nombre</span>
                            </button>
                            <button
                                onClick={() => {
                                    const guessed = guessCategory(thumbnailContextMenu.file.name);
                                    if (guessed) {
                                        handleCategorizeFile(thumbnailContextMenu.file, guessed);
                                    } else {
                                        toast.error('No se pudo identificar la categoría automáticamente');
                                    }
                                    setThumbnailContextMenu(null);
                                }}
                                className="w-full text-left px-4 py-2.5 text-sm text-[#C9A96E] font-medium hover:bg-[#C9A96E]/20 transition-all flex items-center gap-2.5 group whitespace-nowrap"
                            >
                                <Zap size={16} className="group-hover:scale-110 transition-transform" />
                                <span>Identificar automáticamente</span>
                            </button>
                            <div className="h-px bg-white/5 my-1" />
                            <button
                                onClick={() => setMenuView('categories')}
                                className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-[#C9A96E]/20 transition-all flex items-center gap-2.5 group whitespace-nowrap justify-between"
                            >
                                <div className="flex items-center gap-2.5">
                                    <Tag className="text-[#C9A96E] group-hover:scale-110 transition-transform" size={16} />
                                    <span>Categoría manual</span>
                                </div>
                                <ChevronRight size={14} className="opacity-40" />
                            </button>
                            <button
                                onClick={() => handleShare(thumbnailContextMenu.targetIds)}
                                className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-all flex items-center gap-2.5 group whitespace-nowrap"
                            >
                                <AirDropIcon size={16} className="text-sky-400 group-hover:scale-110 transition-transform" />
                                <span>Compartir por AirDrop</span>
                            </button>
                            <button
                                onClick={() => handleShareWithPatient(thumbnailContextMenu.targetIds)}
                                className="w-full text-left px-4 py-2.5 text-sm text-white hover:bg-white/10 transition-all flex items-center gap-2.5 group whitespace-nowrap"
                            >
                                <MessageCircle size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                                <span>Compartir con paciente</span>
                            </button>
                            <div className="h-px bg-white/5 my-1" />
                            <button
                                onClick={() => setThumbnailContextMenu(null)}
                                className="w-full text-left px-4 py-2 text-sm text-white/40 hover:text-white/70 hover:bg-white/5 transition-colors"
                            >
                                Cancelar
                            </button>
                        </>
                    ) : (
                        <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
                            <button
                                onClick={() => setMenuView('main')}
                                className="w-full text-left px-4 py-2 text-[10px] font-bold text-white/30 uppercase tracking-[0.1em] flex items-center gap-2 hover:text-white transition-colors sticky top-0 bg-[#1A1A24] z-10 py-2.5 border-b border-white/5"
                            >
                                <ArrowLeft size={12} /> Volver
                            </button>
                            <div className="py-2">
                                {PHOTO_CATEGORIES.map(group => (
                                    <div key={group.group} className="mb-3 px-1.5">
                                        <div className="px-2.5 py-1 text-[9px] uppercase tracking-wider text-[#C9A96E] font-black opacity-50 mb-1">
                                            {group.group}
                                        </div>
                                        {group.items.map(item => (
                                            <button
                                                key={item}
                                                onClick={() => handleCategorizeFile(thumbnailContextMenu.file, `${group.group} - ${item}`)}
                                                className="w-full text-left px-2.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-[#C9A96E]/20 rounded-md transition-all flex items-center gap-2.5 group"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#C9A96E] opacity-0 group-hover:opacity-100 transition-opacity" />
                                                <span>{item}</span>
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </>,
            document.body,
        )}
        {showWarpBrush && smileDesign.result && (
            <WarpBrush
                imageSrc={smileDesign.result.afterDataUrl}
                onSave={(warped) => {
                    const base64 = warped.split(',')[1];
                    smileDesign.setWarpedAfter(warped, base64);
                    setShowWarpBrush(false);
                    toast.success('Corrección aplicada');
                }}
                onCancel={() => setShowWarpBrush(false)}
                patientName={patientName}
            />
        )}
        {sharePatientItems && (
            <ShareWithPatientModal
                files={sharePatientItems}
                folderId={folderId}
                patientId={patientId}
                patientName={patientName}
                onClose={() => setSharePatientItems(null)}
            />
        )}
        {shareModalOpen && (
            <div className="fixed inset-0 z-[99] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
                <div className="bg-[#1A1A24] border border-white/10 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
                        <span className="font-semibold text-white text-sm">Compartir foto</span>
                        <button
                            onClick={() => {
                                if (shareFile) URL.revokeObjectURL(shareFile.url);
                                setShareFile(null);
                                setShareModalOpen(false);
                            }}
                            className="p-1 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    {/* Body */}
                    <div className="p-5 space-y-4 overflow-y-auto flex-1 text-center flex flex-col items-center justify-center custom-scrollbar">
                        {shareLoading ? (
                            <div className="py-8 flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-4 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
                                <p className="text-sm text-white/70">Preparando imagen...</p>
                            </div>
                        ) : shareFile ? (
                            <>
                                <p className="text-xs text-white/60 leading-relaxed">
                                    La imagen está lista. Elegí cómo compartirla:
                                </p>
                                
                                {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
                                    <button
                                        onClick={triggerNativeShare}
                                        className="w-full py-3 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-bold text-sm transition-colors flex items-center justify-center gap-2 flex-shrink-0 shadow-lg"
                                    >
                                        <Globe2 size={16} /> Compartir por WhatsApp / Instagram / AirDrop
                                    </button>
                                )}

                                <div className="bg-white/5 p-3 rounded-xl space-y-2 text-left w-full text-xs text-white/80">
                                    <p className="font-semibold text-[#C9A96E]">Opciones manuales (Instagram / WhatsApp):</p>
                                    <p><strong>1.</strong> Mantén presionada la imagen de abajo.</p>
                                    <p><strong>2.</strong> Selecciona <strong>"Guardar en Fotos"</strong> o <strong>"Descargar"</strong>.</p>
                                    <p><strong>3.</strong> Súbela a tu Historia de Instagram o compártela directamente.</p>
                                </div>

                                <div className="relative group border border-white/10 rounded-lg overflow-hidden max-h-[30vh] w-auto flex justify-center bg-black/40 flex-shrink-0">
                                    <img
                                        src={shareFile.url}
                                        alt="Compartir"
                                        className="max-h-[30vh] max-w-full object-contain pointer-events-auto"
                                    />
                                </div>

                                <a
                                    href={shareFile.url}
                                    download={shareFile.name}
                                    className="w-full py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white font-bold text-xs transition-colors block text-center flex-shrink-0"
                                >
                                    Descargar archivo
                                </a>
                            </>
                        ) : null}
                    </div>
                </div>
            </div>
        )}
        </>
    );
}

// ─── Tools Panel (desktop right sidebar) ──────────────────────────────────────

interface ToolsPanelProps {
    rotation: number; setRotation: (v: number | ((prev: number) => number)) => void;
    brightness: number; setBrightness: (v: number | ((prev: number) => number)) => void;
    cropActive: boolean; setCropActive: (v: boolean | ((prev: boolean) => boolean)) => void;
    cropAspectPreset: CropAspectPresetId;
    onCropAspectPresetChange: (presetId: CropAspectPresetId) => void;
    hasPriorCrop: boolean;
    onEnterCropMode: () => void;
    onConfirmCrop: () => void;
    onCancelCrop: () => void;
    bgProcessing: boolean; bgDone: boolean;
    bgColor: BgColor; setBgColor: (v: BgColor) => void;
    onRemoveBg: () => void;
    onUndoBg: () => void;
    onCancelBg: () => void;
    onMoveSubject: () => void;
    brushMode: 'restore' | 'erase' | null;
    onSetBrushMode: (mode: 'restore' | 'erase' | null) => void;
    brushSize: number;
    onSetBrushSize: (v: number) => void;
    magicWandActive: boolean;
    onSetMagicWandActive: (active: boolean) => void;
    magicWandTolerance: number;
    onSetMagicWandTolerance: (v: number) => void;
    onStartManualEraser: (mode: 'restore' | 'erase' | 'magic') => void;
    healMode: boolean;
    onSetHealMode: (v: boolean) => void;
    healSize: number;
    onSetHealSize: (v: number) => void;
    onReset: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onPushHistory: () => void;
    historyCount: number;
    redoCount: number;
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
    canvasSelectedId: string | null;
    canvasRatio: CanvasRatio;
    onCanvasRatioChange: (r: CanvasRatio) => void;
    canvasLayerCount: number;
    onClearCanvasLayers: () => void;
    onDeleteActiveCanvas?: () => void;
    onDeleteSelection: () => void;
    canvasBgColor?: string;
    onSetCanvasBgColor?: (color: string) => void;
}

function ToolsPanel({
    rotation, setRotation,
    brightness, setBrightness,
    cropActive, setCropActive,
    cropAspectPreset, onCropAspectPresetChange,
    hasPriorCrop,
    onEnterCropMode,
    onConfirmCrop,
    onCancelCrop,
    bgProcessing, bgDone,
    bgColor, setBgColor,
    onRemoveBg,
    onUndoBg,
    onCancelBg,
    onMoveSubject,
    brushMode,
    onSetBrushMode,
    brushSize,
    onSetBrushSize,
    magicWandActive,
    onSetMagicWandActive,
    magicWandTolerance,
    onSetMagicWandTolerance,
    onStartManualEraser,
    healMode,
    onSetHealMode,
    healSize,
    onSetHealSize,
    onReset,
    onUndo,
    onRedo,
    onPushHistory,
    historyCount,
    redoCount,
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
    canvasActive, canvasSelectedId, canvasRatio, onCanvasRatioChange,
    canvasLayerCount, onClearCanvasLayers,
    onDeleteActiveCanvas,
    onDeleteSelection,
    canvasBgColor, onSetCanvasBgColor,
}: ToolsPanelProps) {
    return (
        <>
            <div className="flex items-center justify-between mb-2">
                <p className="text-white/45 text-sm font-bold uppercase tracking-wider">Herramientas</p>
                {(canvasSelectedId || drawMode === 'selected' || drawMode === 'editing' || multiSelectedCount > 0) && (
                    <button
                        onClick={onDeleteSelection}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-xs font-bold uppercase"
                        title="Eliminar selección"
                    >
                        <Trash2 size={16} /> Eliminar
                    </button>
                )}
            </div>

            {/* Rotate */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/75 text-sm font-bold uppercase tracking-wider">
                        <RotateCcw size={18} />
                        Rotación
                    </div>
                    <span className="bg-white/10 px-2 py-1 rounded font-mono text-xs text-white/75">
                        {rotation > 0 ? `+${rotation.toFixed(1)}°` : `${rotation.toFixed(1)}°`}
                    </span>
                </div>

                <div className="space-y-4 bg-white/5 p-4 rounded-xl border border-white/5">
                    {/* Fine adjustment */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <p className="text-xs text-white/45 uppercase tracking-wide font-semibold">Ajuste fino</p>
                            {rotation !== 0 && (
                                <button
                                    onClick={() => setRotation(0)}
                                    className="text-xs text-[#C9A96E] hover:text-[#C9A96E]/80 transition-colors font-bold uppercase"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                        <input
                            type="range" min={-180} max={180} step={0.5}
                            value={rotation}
                            onPointerDown={() => onPushHistory()}
                            onChange={(e) => setRotation(Number(e.target.value))}
                            className="w-full accent-white/70 h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer"
                        />
                    </div>

                    {/* Presets */}
                    <div className="space-y-2">
                        <p className="text-xs text-white/45 uppercase tracking-wide font-semibold">Presets rápidos</p>
                        <div className="grid grid-cols-3 gap-1.5">
                            <button
                                onClick={() => { onPushHistory(); setRotation((r: number) => { const n = r - 90; return n < -180 ? n + 360 : n; }); }}
                                className="flex flex-col items-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                                title="Rotar -90°"
                            >
                                <RotateCcw size={18} className="text-white/50 group-hover:text-white" />
                                <span className="text-xs text-white/40 group-hover:text-white font-bold">-90°</span>
                            </button>
                            <button
                                onClick={() => { onPushHistory(); setRotation((r: number) => { const n = r + 90; return n > 180 ? n - 360 : n; }); }}
                                className="flex flex-col items-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                                title="Rotar +90°"
                            >
                                <RotateCw size={18} className="text-white/50 group-hover:text-white" />
                                <span className="text-xs text-white/40 group-hover:text-white font-bold">+90°</span>
                            </button>
                            <button
                                onClick={() => { onPushHistory(); setRotation((r: number) => (r > 0 ? r - 180 : r + 180)); }}
                                className="flex flex-col items-center gap-1.5 py-2 rounded-lg bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all group"
                                title="Voltear 180°"
                            >
                                <ArrowLeftRight size={18} className="rotate-90 text-white/50 group-hover:text-white" />
                                <span className="text-xs text-white/40 group-hover:text-white font-bold">180°</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center">
                    <button
                        onClick={() => setShowGrid(v => !v)}
                        className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl transition-all text-sm font-semibold border ${
                            isGridVisible
                                ? 'bg-[#C9A96E]/10 text-[#C9A96E] border-[#C9A96E]/30 shadow-lg shadow-[#C9A96E]/10'
                                : 'bg-white/5 text-white/40 hover:text-white/60 border-white/5 hover:bg-white/10'
                        }`}
                    >
                        <Grid size={18} />
                        {isGridVisible ? 'Ocultar Grilla' : 'Alinear con Grilla'}
                    </button>
                </div>
            </div>

            {/* Brightness */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/75 text-sm font-semibold">
                        <Sun size={18} className="text-yellow-400" />
                        Brillo
                    </div>
                    <span className="text-white/50 text-sm">{brightness}%</span>
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
                <p className="flex items-center gap-2 text-white/75 text-sm font-semibold">
                    <CropIcon size={18} /> Recortar
                </p>
                {cropActive ? (
                    <>
                        <p className="text-white/45 text-sm">
                            Seleccioná el área a conservar.
                        </p>
                        <button
                            onClick={onConfirmCrop}
                            className="w-full py-3 rounded-xl bg-blue-600 text-white text-base font-semibold transition-colors hover:bg-blue-500 flex items-center justify-center gap-2"
                        >
                            <Check size={20} /> Confirmar recorte
                        </button>
                        <div className="grid grid-cols-3 gap-2">
                            {CROP_ASPECT_PRESETS.map((preset) => (
                                <button
                                    key={preset.id}
                                    type="button"
                                    onClick={() => onCropAspectPresetChange(preset.id)}
                                    className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${
                                        cropAspectPreset === preset.id
                                            ? 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/30'
                                            : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80 hover:bg-white/10'
                                    }`}
                                    title={preset.title}
                                >
                                    {preset.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={onCancelCrop}
                            className="w-full py-2 rounded-lg text-white/50 text-sm hover:text-white/80 transition-colors"
                        >
                            Cancelar
                        </button>
                    </>
                ) : canvasActive ? (
                    // Canvas mode: crop operates on the selected layer, not the main photo
                    canvasSelectedId ? (
                        <button
                            onClick={onEnterCropMode}
                            className="w-full py-3 rounded-xl bg-white/10 text-white/80 text-base font-semibold hover:bg-white/15 transition-colors flex items-center justify-center gap-2"
                        >
                            <CropIcon size={20} /> Recortar capa seleccionada
                        </button>
                    ) : (
                        <p className="text-white/45 text-sm text-center py-2">
                            Seleccioná una foto del lienzo para recortarla
                        </p>
                    )
                ) : (
                    <button
                        onClick={onEnterCropMode}
                        className="w-full py-3 rounded-xl bg-white/10 text-white/80 text-base font-semibold hover:bg-white/15 transition-colors flex items-center justify-center gap-2"
                    >
                        <CropIcon size={20} />
                        {hasPriorCrop ? 'Reajustar recorte' : 'Activar recorte'}
                    </button>
                )}
            </div>

            {/* Spot healing */}
            <div className="space-y-2">
                <p className="flex items-center gap-2 text-white/75 text-sm font-semibold">
                    <Zap size={18} className="text-cyan-300" /> Corrector
                </p>
                <button
                    onClick={() => onSetHealMode(!healMode)}
                    disabled={canvasActive && !canvasSelectedId}
                    className={`w-full py-3 rounded-xl text-base font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                        healMode
                            ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/30'
                            : 'bg-white/10 text-white/70 hover:bg-white/15'
                    }`}
                >
                    <Zap size={20} /> {healMode ? 'Corrector activo' : 'Activar corrector'}
                </button>
                {canvasActive && !canvasSelectedId && (
                    <p className="text-white/45 text-sm text-center py-2">
                        Seleccioná una foto del lienzo para corregirla
                    </p>
                )}
                {healMode && (
                    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-white/45 text-xs uppercase tracking-wider">Tamaño</p>
                        <div className="flex items-center gap-2">
                            <input
                                type="range" min={6} max={90} step={2}
                                value={healSize}
                                onChange={e => onSetHealSize(Number(e.target.value))}
                                className="flex-1 accent-cyan-300"
                            />
                            <span className="text-white/50 text-sm w-8">{healSize}</span>
                        </div>
                        <p className="text-white/35 text-xs">
                            Pintá sobre lunares, bordes o manchas para mimetizar con el entorno.
                        </p>
                    </div>
                )}
            </div>

            {/* Background removal */}
            <div className="space-y-2">
                <p className="flex items-center gap-2 text-white/75 text-sm font-semibold">
                    <Wand2 size={18} className="text-violet-400" /> Fondo y Recortes
                </p>
                {bgProcessing ? (
                    <>
                        <div className="flex items-center gap-2 text-violet-300 text-sm bg-violet-950/20 border border-violet-500/20 p-3 rounded-xl">
                            <Loader2 size={18} className="animate-spin text-purple-400" /> Removiendo fondo por IA...
                        </div>
                        <button
                            onClick={onCancelBg}
                            className="w-full py-2 rounded-lg bg-white/10 text-white/60 text-sm hover:text-white/80 transition-colors"
                        >
                            Cancelar IA
                        </button>
                    </>
                ) : (
                    <div className="space-y-3 bg-white/5 p-4 rounded-xl border border-white/5">
                        {/* Undo / Redo controls for Background Tools */}
                        {(brushMode !== null || magicWandActive || bgDone) && (
                            <div className="flex gap-2 pb-2.5 border-b border-white/5">
                                <button
                                    onClick={onUndo}
                                    disabled={historyCount === 0}
                                    title="Deshacer (Ctrl+Z)"
                                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                    <Undo2 size={13} /> Deshacer
                                </button>
                                <button
                                    onClick={onRedo}
                                    disabled={redoCount === 0}
                                    title="Rehacer (Ctrl+Y)"
                                    className="flex-1 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                    <Redo2 size={13} /> Rehacer
                                </button>
                            </div>
                        )}

                        {/* IA BG removal button - only if not done */}
                        {!bgDone && (
                            <div className="space-y-1">
                                <button
                                    onClick={onRemoveBg}
                                    disabled={canvasActive && !canvasSelectedId}
                                    className="w-full py-3 rounded-xl bg-violet-600/30 text-violet-200 text-sm font-semibold hover:bg-violet-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <Wand2 size={18} /> Remoción de fondo facial (IA)
                                </button>
                                <p className="text-[10px] text-white/35 text-center leading-normal">
                                    Recomendado únicamente para retratos y fotos de rostro.
                                </p>
                            </div>
                        )}

                        {/* Manual Clipping Tools Selector */}
                        <div className="space-y-2">
                            <p className="text-xs text-white/45 uppercase tracking-wider font-semibold">Recorte Manual</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onStartManualEraser('magic')}
                                    className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                                        magicWandActive
                                            ? 'bg-purple-600/20 border-purple-500 text-purple-200 shadow-md'
                                            : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:border-white/10'
                                    }`}
                                >
                                    <Sparkles size={14} /> Varita Mágica
                                </button>
                                <button
                                    onClick={() => onStartManualEraser(brushMode === 'erase' ? 'restore' : 'erase')}
                                    className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                                        brushMode !== null
                                            ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200 shadow-md'
                                            : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10 hover:border-white/10'
                                    }`}
                                >
                                    <Eraser size={14} /> Pincel
                                </button>
                            </div>
                        </div>

                        {/* Brush controls when active */}
                        {brushMode !== null && (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => onSetBrushMode('erase')}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                            brushMode === 'erase' ? 'bg-[#C9A96E] text-black' : 'bg-white/10 text-white/70 hover:bg-white/15'
                                        }`}
                                    >
                                        Borrar fondo
                                    </button>
                                    <button
                                        onClick={() => onSetBrushMode('restore')}
                                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                            brushMode === 'restore' ? 'bg-emerald-600 text-white' : 'bg-white/10 text-white/70 hover:bg-white/15'
                                        }`}
                                    >
                                        Restaurar original
                                    </button>
                                </div>
                                <div className="flex items-center gap-2 pt-1">
                                    <span className="text-white/50 text-xs w-16">Tamaño</span>
                                    <input
                                        type="range" min={5} max={120} step={5}
                                        value={brushSize}
                                        onChange={e => onSetBrushSize(Number(e.target.value))}
                                        className="flex-1 accent-white/70"
                                    />
                                    <span className="text-white/50 text-xs w-8 text-right">{brushSize}</span>
                                </div>
                            </div>
                        )}

                        {/* Magic Wand controls when active */}
                        {magicWandActive && (
                            <div className="space-y-2 pt-2 border-t border-white/5">
                                <div className="flex items-center gap-2">
                                    <span className="text-white/50 text-xs w-16">Tolerancia</span>
                                    <input
                                        type="range" min={1} max={100} step={1}
                                        value={magicWandTolerance}
                                        onChange={e => onSetMagicWandTolerance(Number(e.target.value))}
                                        className="flex-1 accent-purple-500"
                                    />
                                    <span className="text-purple-300 text-xs w-8 text-right">{magicWandTolerance}%</span>
                                </div>
                                <p className="text-[10px] text-purple-200/50 leading-normal">
                                    Hacé clic en un color de la imagen (ej: los bordes negros de fotos intraorales) para borrar esa área contigua. Ajustá la tolerancia si borra de más o de menos.
                                </p>
                            </div>
                        )}

                        {/* Close manual tools when either is active */}
                        {(brushMode !== null || magicWandActive) && (
                            <button
                                onClick={() => {
                                    onSetBrushMode(null);
                                    onSetMagicWandActive(false);
                                }}
                                className="w-full py-2 mt-1 rounded-lg bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/15 transition-colors"
                            >
                                Terminar edición manual
                            </button>
                        )}
                    </div>
                )}

                {/* Move/scale subject (Canva-style) */}
                {bgDone && !bgProcessing && (
                    <button
                        onClick={onMoveSubject}
                        className="w-full py-3 rounded-xl bg-white/10 text-white/80 text-sm font-semibold hover:bg-white/15 transition-colors flex items-center justify-center gap-2"
                    >
                        <ArrowLeftRight size={16} /> Mover / escalar sujeto
                    </button>
                )}

                {/* Background color selector — only visible after bg removed */}
                {bgDone && !bgProcessing && (
                    <div className="space-y-1.5">
                        <p className="text-white/50 text-sm">Reemplazar con:</p>
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
                                    className={`flex-1 py-3 rounded-lg text-base border-2 transition-all ${opt.cls} ${
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
                                className="flex-1 py-3 rounded-xl bg-white/10 text-white/70 text-sm font-semibold hover:bg-white/20 transition-colors flex items-center justify-center gap-2"
                            >
                                <X size={18} /> Cancelar
                            </button>
                            <button
                                onClick={onConfirmBg}
                                className="flex-1 py-3 rounded-xl bg-blue-600/80 text-white text-sm font-semibold hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                            >
                                <Check size={18} /> Confirmar
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Trazo (Smile Design) ── */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white/75 text-sm font-semibold">
                        <PenLine size={18} />
                        Trazo
                    </div>
                    <button
                        onClick={onToggleDrawVisible}
                        title={drawVisible ? 'Ocultar trazo' : 'Mostrar trazo'}
                        className="p-1.5 rounded text-white/50 hover:text-white/80 transition-colors"
                    >
                        {drawVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                </div>

                <button
                    onClick={() => onSetDrawMode(drawMode === 'idle' ? 'drawing' : 'idle')}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-base font-semibold transition-colors ${
                        drawMode !== 'idle'
                            ? 'bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/30'
                            : 'bg-white/5 text-white/50 hover:text-white/80 border border-white/10'
                    }`}
                >
                    <PenLine size={20} />
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
                                    className={`w-8 h-8 rounded-full border-2 transition-all ${
                                        drawColor === c ? 'border-white scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                                    }`}
                                    style={{ backgroundColor: hex }}
                                />
                            );
                        })}
                    </div>
                )}

                {/* Stroke style selector */}
                <div className="grid grid-cols-5 gap-1.5">
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
                            className={`py-2 rounded-lg text-xs font-semibold transition-all border ${
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
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-white/90 transition-colors border border-white/10"
                        >
                            <Undo2 size={16} /> Deshacer
                        </button>
                        <button
                            onClick={onClearDraw}
                            className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-red-400 transition-colors border border-white/10"
                        >
                            <X size={16} /> Borrar todo
                        </button>
                    </div>
                )}

                {/* Multi-select group button */}
                {multiSelectedCount >= 2 && (
                    <button
                        onClick={onGroupShapes}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/40 hover:bg-[#C9A96E]/30 transition-colors"
                    >
                        Agrupar {multiSelectedCount} formas
                    </button>
                )}
                {multiSelectedCount >= 1 && multiSelectedCount < 2 && (
                    <p className="text-white/40 text-xs">Cmd+clic en más formas para seleccionar</p>
                )}

                {/* Ungroup button */}
                {selectedShapeIsGroup && (
                    <button
                        onClick={onUngroupShape}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white/5 text-white/60 hover:text-white/90 border border-white/10 transition-colors"
                    >
                        Desagrupar
                    </button>
                )}

                {drawMode === 'drawing' && currentPointCount > 0 && (
                    <p className="text-white/35 text-xs">
                        {currentPointCount} punto{currentPointCount !== 1 ? 's' : ''} — doble clic para terminar abierto · clic en el primer punto para cerrar
                    </p>
                )}
                {(drawMode === 'selected' || drawMode === 'editing') && (
                    <button
                        onClick={onFlipHorizontal}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-white/5 text-white/70 hover:text-white/90 border border-white/10 hover:border-white/20 transition-colors"
                    >
                        <ArrowLeftRight size={18} /> Voltear horizontal
                    </button>
                )}
                {drawMode === 'selected' && (
                    <p className="text-white/35 text-xs">
                        Esquinas: arrastrar=escalar · Cmd+arrastrar=rotar · mover · doble clic=editar · Cmd+C/V=copiar
                    </p>
                )}
                {drawMode === 'editing' && (
                    <p className="text-white/35 text-xs">
                        Arrastrá puntos · doble clic en punto para curva/esquina · doble clic afuera para salir
                    </p>
                )}
            </div>

            {/* ── Texto ── */}
            <div className="space-y-2">
                <div className="flex items-center gap-2 text-white/75 text-sm font-semibold">
                    <Type size={18} />
                    Texto
                </div>
                <button
                    onClick={onToggleTextTool}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-base font-semibold transition-colors ${
                        textToolActive
                            ? 'bg-[#C9A96E]/20 text-[#C9A96E] border border-[#C9A96E]/30'
                            : 'bg-white/5 text-white/50 hover:text-white/80 border border-white/10'
                    }`}
                >
                    <Type size={20} />
                    {textToolActive ? 'Texto activo — clic para escribir' : 'Agregar texto'}
                </button>
                {textToolActive && (
                    <p className="text-white/40 text-xs">
                        Clic = crear · clic en texto = editar · mantener+arrastrar = mover · Enter o Esc = confirmar
                    </p>
                )}
                {textAnnotationCount > 0 && (
                    <p className="text-white/45 text-xs">
                        {textAnnotationCount} texto{textAnnotationCount !== 1 ? 's' : ''}
                    </p>
                )}
            </div>

            {/* ── Lienzo (Canvas mode) ── */}
            {canvasActive && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2 text-[#C9A96E] text-sm font-semibold uppercase tracking-widest">
                        <span>⊞</span> Lienzo
                    </div>
                    <p className="text-white/45 text-xs">Proporción</p>
                    <div className="grid grid-cols-2 gap-1.5">
                        {([
                            { value: '1:1', label: '1:1', sub: 'Instagram' },
                            { value: '4:5', label: '4:5', sub: 'Portrait' },
                            { value: '9:16', label: '9:16', sub: 'Stories' },
                            { value: '16:9', label: '16:9', sub: 'Slides' },
                        ] as const).map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => onCanvasRatioChange(opt.value)}
                                className={`flex flex-col items-center py-2 rounded-lg border text-sm transition-all ${
                                    canvasRatio === opt.value
                                        ? 'bg-[#C9A96E]/20 text-[#C9A96E] border-[#C9A96E]/40'
                                        : 'bg-white/5 text-white/50 border-white/10 hover:text-white/80'
                                }`}
                            >
                                <span className="font-semibold">{opt.label}</span>
                                <span className="text-xs opacity-65">{opt.sub}</span>
                            </button>
                        ))}
                    </div>
                    {canvasLayerCount > 0 && (
                        <div className="flex items-center justify-between text-xs text-white/45 mt-1">
                            <span>{canvasLayerCount} capa{canvasLayerCount !== 1 ? 's' : ''}</span>
                            <button
                                onClick={onClearCanvasLayers}
                                className="text-red-400/60 hover:text-red-400 transition-colors"
                            >
                                Vaciar lienzo
                            </button>
                        </div>
                    )}
                    {onDeleteActiveCanvas && (
                        <button
                            onClick={onDeleteActiveCanvas}
                            className="w-full py-2 rounded-lg border border-red-500/20 text-red-400/70 text-xs font-semibold hover:text-red-400 hover:border-red-500/40 transition-colors flex items-center justify-center gap-1.5"
                        >
                            <X size={12} /> Eliminar este lienzo
                        </button>
                    )}
                    {/* Canvas background color */}
                    {onSetCanvasBgColor && (
                        <div className="mb-3">
                            <p className="text-white/50 text-xs uppercase tracking-wider mb-1.5">Fondo</p>
                            <div className="flex gap-1.5">
                                {[
                                    { value: '#ffffff', label: '⬜', title: 'Blanco' },
                                    { value: 'black', label: '⬛', title: 'Negro' },
                                    { value: 'transparent', label: '◻', title: 'Transparente' },
                                ].map(opt => (
                                    <button
                                        key={opt.value}
                                        onClick={() => onSetCanvasBgColor(opt.value)}
                                        title={opt.title}
                                        className={`flex-1 py-2 rounded-lg text-base border transition-all ${
                                            (canvasBgColor ?? '#ffffff') === opt.value
                                                ? 'border-[#C9A96E] bg-white/10'
                                                : 'border-white/10 hover:border-white/30'
                                        }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-white/35 text-xs">Arrastrá fotos al lienzo · clic derecho en capa para opciones</p>
                </div>
            )}

            {/* Spacer + Undo + Reset */}
            <div className="flex-1" />
            <button
                onClick={onUndo}
                disabled={historyCount === 0}
                className="w-full py-3 rounded-xl border border-white/10 text-white/70 text-sm font-semibold hover:text-white/90 hover:border-white/20 transition-colors disabled:opacity-25 flex items-center justify-center gap-2"
            >
                <Undo2 size={18} /> Deshacer (Ctrl+Z)
            </button>
            <button
                onClick={onReset}
                className="w-full py-3 rounded-xl border border-white/10 text-white/55 text-sm font-semibold hover:text-white/80 hover:border-white/20 transition-colors"
            >
                Resetear todo
            </button>
        </>
    );
}
