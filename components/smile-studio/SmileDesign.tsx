'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';
import { Loader2, Save, Sparkles, RotateCcw } from 'lucide-react';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_WIDTH_PX = 1920;
const WEBP_QUALITY = 0.82;

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'drop' | 'preview' | 'processing' | 'result';

interface Props {
    patientId: string;
    onSaved?: () => void;
}

// ─── Canvas helpers ────────────────────────────────────────────────────────────

/** Compress + downscale any image file to WebP */
async function compressToWebP(file: Blob, maxW = MAX_WIDTH_PX, quality = WEBP_QUALITY): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            const scale = img.width > maxW ? maxW / img.width : 1;
            const w = Math.round(img.width * scale);
            const h = Math.round(img.height * scale);
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, w, h);
            canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/webp', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
        img.src = url;
    });
}

/**
 * Apply teeth-whitening effect purely on the Canvas:
 * – brightness boost on the lightest pixels (teeth area heuristic)
 * – desaturate warm yellows
 * – level: 0 (no change) → 100 (max white)
 */
function applyWhiteningToCanvas(
    sourceBitmap: ImageBitmap,
    canvas: HTMLCanvasElement,
    level: number,           // 0‒100
) {
    const w = sourceBitmap.width;
    const h = sourceBitmap.height;
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(sourceBitmap, 0, 0);

    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    const strength = level / 100;

    for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        // Lightness (perceived)
        const L = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        // Only affect pixels that are already fairly bright (teeth / smile zone)
        if (L > 0.45) {
            // How "yellow" is this pixel? (high R+G, low B)
            const yellowness = Math.max(0, Math.min(1, ((r + g) / 2 - b) / 128));
            const factor = strength * yellowness * L;
            // Shift toward white: boost blue, slightly reduce red/green yellow cast
            d[i] = Math.min(255, r + factor * (255 - r) * 0.4);
            d[i + 1] = Math.min(255, g + factor * (255 - g) * 0.4);
            d[i + 2] = Math.min(255, b + factor * (255 - b) * 0.85);
        }
    }
    ctx.putImageData(imageData, 0, 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SmileDesign({ patientId, onSaved }: Props) {
    const [phase, setPhase] = useState<Phase>('drop');
    const [isDragging, setIsDragging] = useState(false);
    const [originBitmap, setOriginBitmap] = useState<ImageBitmap | null>(null);
    const [originObjectUrl, setOriginObjectUrl] = useState<string | null>(null);      // "Before" permanent URL (Supabase)
    const [resultObjectUrl, setResultObjectUrl] = useState<string | null>(null);      // "After" processed
    const [sliderPos, setSliderPos] = useState(50);                                   // Before/After divider
    const [whiteLevel, setWhiteLevel] = useState(30);                                 // AI whitening level
    const [isSaving, setIsSaving] = useState(false);

    // Canvas refs
    const previewCanvasRef = useRef<HTMLCanvasElement>(null);
    const compareRef = useRef<HTMLDivElement>(null);
    const draggingCompare = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── Prevent browser default drag behavior globally while mounted ──────────
    useEffect(() => {
        const prevent = (e: DragEvent) => e.preventDefault();
        window.addEventListener('dragover', prevent);
        window.addEventListener('drop', prevent);
        return () => {
            window.removeEventListener('dragover', prevent);
            window.removeEventListener('drop', prevent);
        };
    }, []);

    // ── Redraw preview canvas when whiteLevel changes ─────────────────────────
    useEffect(() => {
        if (!originBitmap || !previewCanvasRef.current || phase !== 'preview') return;
        applyWhiteningToCanvas(originBitmap, previewCanvasRef.current, whiteLevel);
    }, [whiteLevel, originBitmap, phase]);

    // ── Ingest dropped / selected file ───────────────────────────────────────
    const ingestFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) { toast.error('Solo imágenes JPG / PNG / WebP'); return; }
        const bitmap = await createImageBitmap(file);
        setOriginBitmap(bitmap);
        setPhase('preview');
        // Draw initial preview with current whitening
        requestAnimationFrame(() => {
            if (previewCanvasRef.current)
                applyWhiteningToCanvas(bitmap, previewCanvasRef.current, whiteLevel);
        });
    }, [whiteLevel]);

    // ── Drop handlers ─────────────────────────────────────────────────────────
    const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
    const onDrop = async (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) await ingestFile(file);
    };
    const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await ingestFile(file);
    };

    // ── Process: render final whitened canvas → Blob → Supabase ──────────────
    const handleProcess = async () => {
        if (!originBitmap || !previewCanvasRef.current) return;
        setPhase('processing');

        try {
            // 1. Render whitened result into a canvas blob
            const resultCanvas = document.createElement('canvas');
            applyWhiteningToCanvas(originBitmap, resultCanvas, whiteLevel);
            const resultBlob: Blob = await new Promise((res, rej) =>
                resultCanvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/webp', WEBP_QUALITY)
            );

            // 2. Upload "after" (result) image
            const ts = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const path = `portal/${patientId}/smile_design_${ts}.webp`;
            const { data: stored, error: storeErr } = await supabase.storage
                .from('patient-portal-files')
                .upload(path, resultBlob, { upsert: true, contentType: 'image/webp' });
            if (storeErr) throw storeErr;

            const { data: { publicUrl } } = supabase.storage
                .from('patient-portal-files')
                .getPublicUrl(stored.path);

            setResultObjectUrl(publicUrl);

            // 3. Upload "before" (original) for comparison reference
            const origBlob = await compressToWebP(
                await (async () => {
                    const c = document.createElement('canvas');
                    c.width = originBitmap.width; c.height = originBitmap.height;
                    c.getContext('2d')!.drawImage(originBitmap, 0, 0);
                    return new Promise<Blob>((r, rj) => c.toBlob(b => b ? r(b) : rj(), 'image/webp', 0.8))
                })()
            );
            const origPath = `portal/${patientId}/smile_before_${ts}.webp`;
            const { data: origStored } = await supabase.storage
                .from('patient-portal-files')
                .upload(origPath, origBlob, { upsert: true, contentType: 'image/webp' });

            const { data: { publicUrl: beforeUrl } } = supabase.storage
                .from('patient-portal-files')
                .getPublicUrl(origStored!.path);

            setOriginObjectUrl(beforeUrl);
            setSliderPos(50);
            setPhase('result');
        } catch (err) {
            console.error('[SmileDesign] process error:', err);
            toast.error('Error al procesar la imagen');
            setPhase('preview');
        }
    };

    // ── Save to patient record ────────────────────────────────────────────────
    const handleSave = async () => {
        if (!resultObjectUrl || !originObjectUrl) return;
        setIsSaving(true);
        try {
            const ts = new Date().toISOString().split('T')[0];
            const label = `Smile Design ${ts}`;

            await Promise.all([
                supabase.from('patient_files').insert({
                    patient_id: patientId, file_type: 'photo_before',
                    label: `${label} (Antes)`, file_url: originObjectUrl, is_visible_to_patient: true,
                }),
                supabase.from('patient_files').insert({
                    patient_id: patientId, file_type: 'smile_design',
                    label, file_url: resultObjectUrl, is_visible_to_patient: true,
                }),
            ]);

            toast.success('✨ Diseño guardado en la ficha del paciente');
            onSaved?.();
        } catch (err) {
            console.error('[SmileDesign] save error:', err);
            toast.error('Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    // ── Before/After compare slider ───────────────────────────────────────────
    function updateCompare(clientX: number) {
        if (!compareRef.current) return;
        const { left, width } = compareRef.current.getBoundingClientRect();
        setSliderPos(Math.max(5, Math.min(95, ((clientX - left) / width) * 100)));
    }

    const reset = () => {
        setPhase('drop');
        setOriginBitmap(null);
        setOriginObjectUrl(null);
        setResultObjectUrl(null);
        setWhiteLevel(30);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ─────────────────────────────────────────────────────────────────────────

    return (
        <div className="min-h-[600px] flex flex-col gap-0 select-none">

            {/* ── Header ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-3xl font-black tracking-tighter text-gray-900 dark:text-white">
                        SMILE<span className="text-violet-500"> DESIGN</span>
                    </h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                        Arrastrar · Ajustar · Procesar · Guardar
                    </p>
                </div>
                {phase !== 'drop' && (
                    <motion.button
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={reset}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-white border border-gray-200 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                    >
                        <RotateCcw size={12} /> Nueva foto
                    </motion.button>
                )}
            </div>

            {/* ── DROP ZONE ─────────────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {phase === 'drop' && (
                    <motion.div
                        key="drop"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.97 }}
                        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className="relative flex-1 min-h-[480px] rounded-3xl cursor-pointer overflow-hidden group transition-all duration-300"
                        style={{
                            background: isDragging
                                ? 'linear-gradient(135deg,#7c3aed11,#a78bfa18)'
                                : 'linear-gradient(135deg,#f8f8fc,#f0f0fb)',
                            border: isDragging ? '2px dashed #7c3aed' : '2px dashed #d1d5db',
                        }}
                    >
                        {/* Dark mode gradient */}
                        <div className="absolute inset-0 hidden dark:block"
                            style={{
                                background: isDragging
                                    ? 'linear-gradient(135deg,#7c3aed18,#4c1d9530)'
                                    : 'linear-gradient(135deg,#0f0f18,#14141e)',
                                border: isDragging ? '2px dashed #7c3aed' : '2px dashed #ffffff0f',
                            }}
                        />

                        {/* Animated ring when dragging */}
                        <AnimatePresence>
                            {isDragging && (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.8, opacity: 0 }}
                                    className="absolute inset-8 rounded-2xl border-2 border-violet-400/40"
                                />
                            )}
                        </AnimatePresence>

                        {/* Content */}
                        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-8 py-20">
                            {/* Icon */}
                            <motion.div
                                animate={isDragging
                                    ? { scale: [1, 1.08, 1], transition: { repeat: Infinity, duration: 1.2 } }
                                    : { scale: 1 }
                                }
                                className="relative"
                            >
                                <div className={`w-32 h-32 rounded-3xl flex items-center justify-center transition-all duration-300 ${isDragging
                                        ? 'bg-violet-500/20 shadow-[0_0_60px_rgba(124,58,237,0.3)]'
                                        : 'bg-gray-100 dark:bg-white/5 group-hover:bg-violet-50 dark:group-hover:bg-violet-900/10'
                                    }`}>
                                    {/* Tooth SVG */}
                                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className={`transition-colors duration-300 ${isDragging ? 'text-violet-500' : 'text-gray-300 dark:text-white/20 group-hover:text-violet-400'}`}>
                                        <path d="M22 8c-5 0-11 4-11 14 0 7 2 13 4 18 1 3 2 6 4 8 1 2 3 3 5 3 3 0 4-3 5-6l1-4c0-2 1-3 2-3s2 1 2 3l1 4c1 3 2 6 5 6 2 0 4-1 5-3 2-2 3-5 4-8 2-5 4-11 4-18 0-10-6-14-11-14-3 0-5 1-7 2-2 1-3 2-3 2s-1-1-3-2c-2-1-4-2-7-2z"
                                            fill="currentColor" stroke="none" />
                                    </svg>
                                </div>
                                {/* Sparkle */}
                                <motion.div
                                    animate={{ rotate: 360 }}
                                    transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
                                    className="absolute -top-2 -right-2"
                                >
                                    <Sparkles size={18} className={`transition-colors ${isDragging ? 'text-violet-400' : 'text-gray-300 dark:text-white/20'}`} />
                                </motion.div>
                            </motion.div>

                            <div className="text-center space-y-2">
                                <p className={`text-2xl font-bold tracking-tight transition-colors duration-200 ${isDragging ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-white/30'
                                    }`}>
                                    {isDragging ? 'Suelta la foto aquí' : 'Arrastrá o tocá para subir'}
                                </p>
                                <p className="text-sm text-gray-400 dark:text-white/20">
                                    JPG · PNG · WebP · hasta 50 MB
                                </p>
                            </div>
                        </div>

                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                    </motion.div>
                )}

                {/* ── PREVIEW + WHITENING ────────────────────────────────────── */}
                {(phase === 'preview' || phase === 'processing') && (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-6"
                    >
                        {/* Canvas preview */}
                        <div className="relative w-full rounded-3xl overflow-hidden bg-black shadow-2xl"
                            style={{ aspectRatio: originBitmap ? `${originBitmap.width}/${originBitmap.height}` : '16/9', maxHeight: '60vh' }}>
                            <canvas
                                ref={previewCanvasRef}
                                className="w-full h-full object-contain"
                                style={{ display: 'block' }}
                            />
                            {phase === 'processing' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-4"
                                >
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                                        className="w-16 h-16 rounded-full border-2 border-violet-400/30 border-t-violet-400"
                                    />
                                    <p className="text-white/70 text-sm">Procesando con IA…</p>
                                </motion.div>
                            )}
                        </div>

                        {/* Whitening slider */}
                        {phase === 'preview' && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.15 }}
                                className="rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/5 p-5 space-y-4"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800 dark:text-white">
                                            Nivel de Blanco
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            Intensidad de blanqueamiento dental
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-3xl font-black text-violet-500 tabular-nums">
                                            {whiteLevel}
                                        </span>
                                        <span className="text-gray-400 text-sm">%</span>
                                    </div>
                                </div>

                                {/* Custom slider */}
                                <div className="relative h-10 flex items-center">
                                    {/* Track background */}
                                    <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                                        <div className="w-full h-2 rounded-full overflow-hidden"
                                            style={{ background: 'linear-gradient(to right,#ede9fe,#7c3aed)' }}>
                                        </div>
                                    </div>
                                    <input
                                        type="range"
                                        min={0} max={100}
                                        value={whiteLevel}
                                        onChange={e => setWhiteLevel(Number(e.target.value))}
                                        className="relative w-full h-2 appearance-none bg-transparent cursor-pointer
                                                   [&::-webkit-slider-thumb]:appearance-none
                                                   [&::-webkit-slider-thumb]:h-7
                                                   [&::-webkit-slider-thumb]:w-7
                                                   [&::-webkit-slider-thumb]:rounded-full
                                                   [&::-webkit-slider-thumb]:bg-white
                                                   [&::-webkit-slider-thumb]:shadow-lg
                                                   [&::-webkit-slider-thumb]:shadow-violet-300/50
                                                   [&::-webkit-slider-thumb]:border-2
                                                   [&::-webkit-slider-thumb]:border-violet-400
                                                   [&::-webkit-slider-thumb]:transition-transform
                                                   [&::-webkit-slider-thumb]:hover:scale-110"
                                    />
                                </div>

                                {/* Scale labels */}
                                <div className="flex justify-between text-[10px] text-gray-400 dark:text-white/25 px-1 -mt-2">
                                    <span>Natural</span>
                                    <span>Hollywood</span>
                                </div>

                                {/* Process button */}
                                <button
                                    onClick={handleProcess}
                                    className="w-full mt-2 py-4 rounded-2xl font-bold text-sm text-white transition-all
                                               bg-gradient-to-r from-violet-600 to-purple-600
                                               hover:from-violet-500 hover:to-purple-500
                                               active:scale-[0.98] shadow-lg shadow-violet-500/20"
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <Sparkles size={16} />
                                        Procesar con IA
                                    </span>
                                </button>
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* ── RESULT: Before/After comparator ───────────────────────── */}
                {phase === 'result' && originObjectUrl && resultObjectUrl && (
                    <motion.div
                        key="result"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-6"
                    >
                        {/* Comparator */}
                        <div
                            ref={compareRef}
                            className="relative w-full rounded-3xl overflow-hidden cursor-ew-resize shadow-2xl"
                            style={{ aspectRatio: '16/9', maxHeight: '60vh', minHeight: 280 }}
                            onMouseDown={e => { draggingCompare.current = true; updateCompare(e.clientX); }}
                            onMouseMove={e => { if (draggingCompare.current) updateCompare(e.clientX); }}
                            onMouseUp={() => { draggingCompare.current = false; }}
                            onMouseLeave={() => { draggingCompare.current = false; }}
                            onTouchStart={e => { draggingCompare.current = true; updateCompare(e.touches[0].clientX); }}
                            onTouchMove={e => { if (draggingCompare.current) updateCompare(e.touches[0].clientX); }}
                            onTouchEnd={() => { draggingCompare.current = false; }}
                        >
                            {/* AFTER (full width, behind) */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={resultObjectUrl}
                                alt="Después"
                                className="absolute inset-0 w-full h-full object-contain bg-black"
                                draggable={false}
                            />

                            {/* BEFORE (clipped on the right) */}
                            <div
                                className="absolute inset-0 overflow-hidden"
                                style={{ width: `${sliderPos}%` }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={originObjectUrl}
                                    alt="Antes"
                                    className="absolute inset-0 h-full object-contain bg-black"
                                    draggable={false}
                                    style={{ width: `${10000 / sliderPos}%` }}
                                />
                            </div>

                            {/* Divider */}
                            <div
                                className="absolute top-0 bottom-0 w-0.5 bg-white/90"
                                style={{ left: `${sliderPos}%` }}
                            >
                                {/* Handle */}
                                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-white shadow-2xl flex items-center justify-center">
                                    <span className="text-gray-600 font-bold text-sm select-none">↔</span>
                                </div>
                            </div>

                            {/* Labels */}
                            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur text-white text-xs font-semibold">
                                ANTES
                            </div>
                            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-violet-600/80 backdrop-blur text-white text-xs font-semibold">
                                DESPUÉS
                            </div>

                            {/* Whitening badge */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white/70 text-xs">
                                Blanqueamiento {whiteLevel}%
                            </div>
                        </div>

                        {/* Adjust + Save */}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setPhase('preview')}
                                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-all"
                            >
                                Ajustar nivel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white transition-all
                                           bg-gradient-to-r from-violet-600 to-purple-600
                                           hover:from-violet-500 hover:to-purple-500
                                           disabled:opacity-50 disabled:cursor-not-allowed
                                           active:scale-[0.98] shadow-lg shadow-violet-500/20"
                            >
                                {isSaving
                                    ? <Loader2 size={16} className="animate-spin inline mr-2" />
                                    : <Save size={16} className="inline mr-2" />
                                }
                                Guardar en Ficha
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
