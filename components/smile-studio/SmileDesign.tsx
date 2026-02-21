'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';
import {
    Loader2, Save, Sparkles, RotateCcw, Download,
    ScanFace, Wand2, AlertCircle, Camera, CheckCircle2, ChevronRight, Share2
} from 'lucide-react';
import { ImageComparator } from '../patients/ImageComparator';
import { IntensitySlider } from '../patients/IntensitySlider';


// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// ─── Types ────────────────────────────────────────────────────────────────────
type Phase = 'drop' | 'aligning' | 'preview' | 'processing' | 'result';

interface Props {
    patientId: string;
    onSaved?: () => void;
}

// ─── Image utilities ──────────────────────────────────────────────────────────

/** File → base64 string (no data: prefix) + mimeType */
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const comma = result.indexOf(',');
            const mimeMatch = result.match(/:(.*?);/);
            resolve({
                base64: result.slice(comma + 1),
                mimeType: mimeMatch?.[1] || file.type || 'image/jpeg',
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

/** Compress image to max width, returns { base64, mimeType, dataUrl } */
async function compressImage(
    file: File,
    maxW = 2000,
    quality = 0.75
): Promise<{ base64: string; mimeType: string; dataUrl: string; width: number; height: number }> {
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
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
            canvas.toBlob(blob => {
                if (!blob) { reject(new Error('compression failed')); return; }
                const reader = new FileReader();
                reader.onload = () => {
                    const dataUrl = reader.result as string;
                    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
                    resolve({ base64, mimeType: 'image/webp', dataUrl, width: w, height: h });
                };
                reader.readAsDataURL(blob);
            }, 'image/webp', quality);
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
        img.src = url;
    });
}

/** Rotate a base64 image by angleDeg degrees, returns new dataUrl */
async function rotateBase64(base64: string, mimeType: string, angleDeg: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
            const rad = (angleDeg * Math.PI) / 180;
            const cos = Math.abs(Math.cos(rad));
            const sin = Math.abs(Math.sin(rad));
            const newW = Math.round(img.width * cos + img.height * sin);
            const newH = Math.round(img.width * sin + img.height * cos);
            const canvas = document.createElement('canvas');
            canvas.width = newW; canvas.height = newH;
            const ctx = canvas.getContext('2d')!;
            ctx.translate(newW / 2, newH / 2);
            ctx.rotate(rad);
            ctx.drawImage(img, -img.width / 2, -img.height / 2);
            resolve(canvas.toDataURL(mimeType, 0.92));
        };
        img.onerror = reject;
        img.src = `data:${mimeType};base64,${base64}`;
    });
}

/** Load an HTMLImageElement from a URL */
function loadImg(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new window.Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = src;
    });
}

/** Create and download a branded 1080px before/after comparison image */
async function downloadComparison(beforeUrl: string, afterUrl: string, intensity: number) {
    const [before, after] = await Promise.all([loadImg(beforeUrl), loadImg(afterUrl)]);

    const W = 1080;
    const HEADER = 90;
    const FOOTER = 70;
    const GAP = 16;
    const PADDING = 24;
    const imgW = W - PADDING * 2;
    const imgH = Math.round(imgW * (before.naturalHeight / before.naturalWidth));
    const totalH = HEADER + imgH * 2 + GAP * 3 + FOOTER;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d')!;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, totalH);
    bg.addColorStop(0, '#0f0f18');
    bg.addColorStop(1, '#1a1a2e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, totalH);

    // Header
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 0, W, HEADER);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px -apple-system, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SMILE DESIGN · AM Clínica', W / 2, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '15px Arial';
    ctx.fillText(`Intensidad ${intensity}/10 · Puerto Madero, CABA`, W / 2, 62);

    // ANTES label + image
    const y1 = HEADER + GAP;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = 'bold 13px Arial';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('ANTES', PADDING, y1 - 6);
    ctx.drawImage(before, PADDING, y1, imgW, imgH);

    // DESPUÉS label + image
    const y2 = y1 + imgH + GAP;
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('DESPUÉS', PADDING, y2 - 6);
    ctx.drawImage(after, PADDING, y2, imgW, imgH);

    // Footer
    const yFoot = y2 + imgH + GAP;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, yFoot, W, FOOTER);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Simulación generada con IA · AM Clínica · amclinica.com.ar', W / 2, yFoot + 28);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '11px Arial';
    ctx.fillText('Este resultado es una simulación. Los resultados reales pueden variar.', W / 2, yFoot + 50);

    // Download
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `smile_design_am_${new Date().toISOString().split('T')[0]}.png`;
    link.click();
}

/** base64 string → Blob */
function base64ToBlob(base64: string, mimeType: string): Blob {
    const bytes = atob(base64);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mimeType });
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SmileDesign({ patientId, onSaved }: Props) {
    const [phase, setPhase] = useState<Phase>('drop');
    const [isDragging, setIsDragging] = useState(false);
    const [intensity, setIntensity] = useState(5);
    const [isSaving, setIsSaving] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    // Image data
    const [beforeDataUrl, setBeforeDataUrl] = useState<string | null>(null);     // aligned original
    const [afterDataUrl, setAfterDataUrl] = useState<string | null>(null);       // Gemini enhanced
    const [beforeBase64, setBeforeBase64] = useState<string | null>(null);       // for API calls
    const [beforeMime, setBeforeMime] = useState<string>('image/jpeg');

    // Stored Supabase URLs (set after upload)
    const [beforeStoredUrl, setBeforeStoredUrl] = useState<string | null>(null);
    const [afterStoredUrl, setAfterStoredUrl] = useState<string | null>(null);

    // Before/After slider
    const [sliderPos, setSliderPos] = useState(50);
    const compareRef = useRef<HTMLDivElement>(null);
    const draggingCompare = useRef(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Prevent browser default drag
    useEffect(() => {
        const prevent = (e: DragEvent) => e.preventDefault();
        window.addEventListener('dragover', prevent);
        window.addEventListener('drop', prevent);
        return () => {
            window.removeEventListener('dragover', prevent);
            window.removeEventListener('drop', prevent);
        };
    }, []);

    // ── Ingest + Auto-align ───────────────────────────────────────────────────
    const ingestFile = useCallback(async (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error('Solo imágenes JPG / PNG / WebP');
            return;
        }
        setPhase('aligning');
        setErrorMsg(null);

        try {
            // 1. Compress first
            const compressed = await compressImage(file);

            // 2. Detect pupils for auto-alignment
            let alignedDataUrl = compressed.dataUrl;
            let alignedBase64 = compressed.base64;

            try {
                const alignRes = await fetch('/api/smile-design/align', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: compressed.base64, mimeType: compressed.mimeType }),
                });
                const alignData = await alignRes.json();

                if (alignData.leftPupil && alignData.rightPupil) {
                    const dx = alignData.rightPupil.x - alignData.leftPupil.x;
                    const dy = alignData.rightPupil.y - alignData.leftPupil.y;
                    const angleDeg = -(Math.atan2(dy, dx) * 180) / Math.PI;

                    if (Math.abs(angleDeg) > 0.5) {
                        alignedDataUrl = await rotateBase64(compressed.base64, compressed.mimeType, angleDeg);
                        alignedBase64 = alignedDataUrl.slice(alignedDataUrl.indexOf(',') + 1);
                    }
                }
            } catch {
                // Alignment failure is non-fatal — use original
                console.warn('[SmileDesign] alignment skipped');
            }

            setBeforeDataUrl(alignedDataUrl);
            setBeforeBase64(alignedBase64);
            setBeforeMime(compressed.mimeType);
            setPhase('preview');
        } catch (err) {
            console.error('[SmileDesign] ingest error:', err);
            toast.error('Error al cargar la imagen');
            setPhase('drop');
        }
    }, []);

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

    // ── Process with Gemini ───────────────────────────────────────────────────
    const handleProcess = async () => {
        if (!beforeBase64 || !beforeDataUrl) return;
        setPhase('processing');
        setErrorMsg(null);

        try {
            // 1. Call Gemini enhancement API
            const enhRes = await fetch('/api/smile-design/enhance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: beforeBase64, mimeType: beforeMime, intensity }),
            });

            const enhData = await enhRes.json();
            if (!enhRes.ok || !enhData.imageBase64) {
                throw new Error(enhData.error || 'No image returned');
            }

            const afterDataUrlResult = `data:${enhData.mimeType};base64,${enhData.imageBase64}`;
            setAfterDataUrl(afterDataUrlResult);

            // 2. Upload both images to Supabase Storage
            const ts = new Date().toISOString().split('T')[0].replace(/-/g, '');

            const beforeBlob = base64ToBlob(beforeBase64, beforeMime);
            const afterBlob = base64ToBlob(enhData.imageBase64, enhData.mimeType);
            const ext = enhData.mimeType.includes('png') ? 'png' : 'jpg';

            const [beforeUpload, afterUpload] = await Promise.all([
                supabase.storage
                    .from('patient-portal-files')
                    .upload(`portal/${patientId}/smile_before_${ts}.${beforeMime.includes('png') ? 'png' : 'jpg'}`,
                        beforeBlob, { upsert: true, contentType: beforeMime }),
                supabase.storage
                    .from('patient-portal-files')
                    .upload(`portal/${patientId}/smile_design_${ts}.${ext}`,
                        afterBlob, { upsert: true, contentType: enhData.mimeType }),
            ]);

            if (beforeUpload.error) throw beforeUpload.error;
            if (afterUpload.error) throw afterUpload.error;

            const { data: { publicUrl: bUrl } } = supabase.storage
                .from('patient-portal-files').getPublicUrl(beforeUpload.data.path);
            const { data: { publicUrl: aUrl } } = supabase.storage
                .from('patient-portal-files').getPublicUrl(afterUpload.data.path);

            setBeforeStoredUrl(bUrl);
            setAfterStoredUrl(aUrl);
            setSliderPos(50);
            setPhase('result');
        } catch (err) {
            console.error('[SmileDesign] process error:', err);
            const msg = err instanceof Error ? err.message : 'Error al procesar';
            setErrorMsg(msg);
            setPhase('preview');
        }
    };

    // ── Save to patient record ────────────────────────────────────────────────
    const handleSave = async () => {
        if (!beforeStoredUrl || !afterStoredUrl) return;
        setIsSaving(true);
        try {
            const ts = new Date().toISOString().split('T')[0];
            const label = `Smile Design ${ts} (Intensidad ${intensity}/10)`;

            await Promise.all([
                supabase.from('patient_files').insert({
                    patient_id: patientId, file_type: 'photo_before',
                    label: `${label} – Antes`, file_url: beforeStoredUrl, is_visible_to_patient: true,
                }),
                supabase.from('patient_files').insert({
                    patient_id: patientId, file_type: 'smile_design',
                    label, file_url: afterStoredUrl, is_visible_to_patient: true,
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

    // ── Download comparison ───────────────────────────────────────────────────
    const handleDownload = async () => {
        if (!beforeStoredUrl || !afterStoredUrl) return;
        setIsDownloading(true);
        try {
            await downloadComparison(beforeStoredUrl, afterStoredUrl, intensity);
        } catch {
            toast.error('Error al generar imagen compartible');
        } finally {
            setIsDownloading(false);
        }
    };


    const reset = () => {
        setPhase('drop');
        setBeforeDataUrl(null); setAfterDataUrl(null);
        setBeforeBase64(null); setBeforeStoredUrl(null); setAfterStoredUrl(null);
        setIntensity(5); setErrorMsg(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-[700px] flex flex-col gap-0 select-none bg-slate-950 p-6 md:p-8 rounded-[2.5rem] border border-white/5 shadow-3xl overflow-hidden relative">

            {/* Background Glow */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-violet-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-teal-600/10 blur-[120px] rounded-full pointer-events-none" />

            {/* ── Header ──────────────────────────────────────────────────────── */}
            <div className="relative z-10 flex items-center justify-between mb-10">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                            <Sparkles className="text-white w-5 h-5" />
                        </div>
                        <h2 className="text-3xl font-black tracking-tighter text-white uppercase">
                            Smile<span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-teal-300"> Studio</span>
                        </h2>
                    </div>
                    <p className="text-xs uppercase tracking-[0.2em] font-bold text-slate-500 flex items-center gap-2">
                        Powered by Gemini AI <span className="w-1 h-1 rounded-full bg-slate-700" /> Professional Design
                    </p>
                </div>
                {phase !== 'drop' && (
                    <motion.button
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        onClick={reset}
                        className="group flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold text-slate-400 hover:text-white border border-white/10 hover:bg-white/5 transition-all duration-300 backdrop-blur-md"
                    >
                        <RotateCcw size={14} className="group-hover:rotate-180 transition-transform duration-500" />
                        Reiniciar
                    </motion.button>
                )}
            </div>

            <AnimatePresence mode="wait">

                {/* ── DROP ZONE ─────────────────────────────────────────────── */}
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
                        <div className="absolute inset-0 hidden dark:block"
                            style={{
                                background: isDragging
                                    ? 'linear-gradient(135deg,#7c3aed18,#4c1d9530)'
                                    : 'linear-gradient(135deg,#0f0f18,#14141e)',
                                border: isDragging ? '2px dashed #7c3aed' : '2px dashed #ffffff0f',
                            }}
                        />
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

                        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-8 py-20">
                            <motion.div
                                animate={isDragging ? { scale: [1, 1.08, 1], transition: { repeat: Infinity, duration: 1.2 } } : { scale: 1 }}
                                className="relative"
                            >
                                <div className={`w-32 h-32 rounded-3xl flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-violet-500/20 shadow-[0_0_60px_rgba(124,58,237,0.3)]' : 'bg-gray-100 dark:bg-white/5 group-hover:bg-violet-50 dark:group-hover:bg-violet-900/10'}`}>
                                    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" className={`transition-colors duration-300 ${isDragging ? 'text-violet-500' : 'text-gray-300 dark:text-white/20 group-hover:text-violet-400'}`}>
                                        <path d="M22 8c-5 0-11 4-11 14 0 7 2 13 4 18 1 3 2 6 4 8 1 2 3 3 5 3 3 0 4-3 5-6l1-4c0-2 1-3 2-3s2 1 2 3l1 4c1 3 2 6 5 6 2 0 4-1 5-3 2-2 3-5 4-8 2-5 4-11 4-18 0-10-6-14-11-14-3 0-5 1-7 2-2 1-3 2-3 2s-1-1-3-2c-2-1-4-2-7-2z"
                                            fill="currentColor" stroke="none" />
                                    </svg>
                                </div>
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 8, repeat: Infinity, ease: 'linear' }} className="absolute -top-2 -right-2">
                                    <Sparkles size={18} className={`transition-colors ${isDragging ? 'text-violet-400' : 'text-gray-300 dark:text-white/20'}`} />
                                </motion.div>
                            </motion.div>

                            <div className="text-center space-y-2">
                                <p className={`text-2xl font-bold tracking-tight transition-colors duration-200 ${isDragging ? 'text-violet-600 dark:text-violet-400' : 'text-gray-400 dark:text-white/30'}`}>
                                    {isDragging ? 'Suelta la foto aquí' : 'Arrastrá o tocá para subir'}
                                </p>
                                <p className="text-sm text-gray-400 dark:text-white/20">
                                    JPG · PNG · WebP · hasta 50 MB
                                </p>
                                <p className="text-xs text-violet-400/60 dark:text-violet-400/40 mt-2">
                                    ✦ Se auto-alinea con IA antes de procesar
                                </p>
                            </div>
                        </div>

                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
                    </motion.div>
                )}

                {/* ── AUTO-ALIGNING ─────────────────────────────────────────── */}
                {phase === 'aligning' && (
                    <motion.div
                        key="aligning"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex-1 min-h-[480px] rounded-3xl bg-gray-50 dark:bg-white/[0.03] border border-gray-100 dark:border-white/5 flex flex-col items-center justify-center gap-6"
                    >
                        <div className="relative">
                            <div className="w-20 h-20 rounded-2xl bg-violet-500/10 flex items-center justify-center">
                                <ScanFace size={36} className="text-violet-400" />
                            </div>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-violet-500"
                            />
                        </div>
                        <div className="text-center">
                            <p className="text-lg font-semibold text-gray-800 dark:text-white mb-1">
                                Detectando línea pupilar…
                            </p>
                            <p className="text-sm text-gray-400">Alineando imagen automáticamente con Gemini</p>
                        </div>
                    </motion.div>
                )}

                {/* ── PREVIEW + INTENSITY ───────────────────────────────────── */}
                {(phase === 'preview' || phase === 'processing') && beforeDataUrl && (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-6"
                    >
                        {/* Image preview */}
                        <div className="relative w-full rounded-3xl overflow-hidden bg-black shadow-2xl" style={{ maxHeight: '55vh' }}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={beforeDataUrl}
                                alt="Original alineada"
                                className="w-full h-full object-contain block"
                                style={{ maxHeight: '55vh' }}
                            />
                            {phase === 'processing' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-5"
                                >
                                    <div className="relative">
                                        <div className="w-20 h-20 rounded-full bg-violet-500/10 flex items-center justify-center">
                                            <Wand2 size={32} className="text-violet-400" />
                                        </div>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                                            className="absolute inset-0 rounded-full border-2 border-transparent border-t-violet-400"
                                        />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-white font-semibold text-lg">Gemini está diseñando tu sonrisa…</p>
                                        <p className="text-white/50 text-sm mt-1">Esto puede tomar 10-20 segundos</p>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Error */}
                        {errorMsg && phase === 'preview' && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                                className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl">
                                <AlertCircle size={18} className="text-red-500 shrink-0" />
                                <p className="text-red-700 dark:text-red-300 text-sm">{errorMsg}</p>
                            </motion.div>
                        )}

                        {/* Intensity slider */}
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
                                            Intensidad de Blanqueamiento
                                        </p>
                                        <p className="text-xs text-gray-400 mt-0.5">
                                            {intensity <= 3 ? 'Resultado natural' : intensity <= 6 ? 'Resultado cosmético' : 'Hollywood smile'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-3xl font-black text-violet-500 tabular-nums">{intensity}</span>
                                        <span className="text-gray-400 text-sm">/10</span>
                                    </div>
                                </div>

                                <div className="relative h-10 flex items-center">
                                    <div className="absolute inset-y-0 left-0 right-0 flex items-center">
                                        <div className="w-full h-2 rounded-full overflow-hidden"
                                            style={{ background: 'linear-gradient(to right,#ede9fe,#7c3aed)' }} />
                                    </div>
                                    <input
                                        type="range" min={1} max={10} step={1}
                                        value={intensity}
                                        onChange={e => setIntensity(Number(e.target.value))}
                                        className="relative w-full h-2 appearance-none bg-transparent cursor-pointer
                                                   [&::-webkit-slider-thumb]:appearance-none
                                                   [&::-webkit-slider-thumb]:h-7 [&::-webkit-slider-thumb]:w-7
                                                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white
                                                   [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-300/50
                                                   [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-violet-400
                                                   [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] text-gray-400 dark:text-white/25 px-1 -mt-2">
                                    <span>Natural</span>
                                    <span>Hollywood</span>
                                </div>

                                <button
                                    onClick={handleProcess}
                                    className="w-full mt-2 py-4 rounded-2xl font-bold text-sm text-white transition-all
                                               bg-gradient-to-r from-violet-600 to-purple-600
                                               hover:from-violet-500 hover:to-purple-500
                                               active:scale-[0.98] shadow-lg shadow-violet-500/20"
                                >
                                    <span className="flex items-center justify-center gap-2">
                                        <Wand2 size={16} />
                                        Generar con Gemini AI
                                    </span>
                                </button>
                            </motion.div>
                        )}
                    </motion.div>
                )}

                {/* ── RESULT: Before/After comparator ───────────────────────── */}
                {phase === 'result' && beforeStoredUrl && afterStoredUrl && (
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
                            className="relative w-full rounded-3xl overflow-hidden cursor-ew-resize shadow-2xl bg-black"
                            style={{ maxHeight: '60vh', minHeight: 300 }}
                            onMouseDown={e => { draggingCompare.current = true; updateCompare(e.clientX); }}
                            onMouseMove={e => { if (draggingCompare.current) updateCompare(e.clientX); }}
                            onMouseUp={() => { draggingCompare.current = false; }}
                            onMouseLeave={() => { draggingCompare.current = false; }}
                            onTouchStart={e => { draggingCompare.current = true; updateCompare(e.touches[0].clientX); }}
                            onTouchMove={e => { if (draggingCompare.current) updateCompare(e.touches[0].clientX); }}
                            onTouchEnd={() => { draggingCompare.current = false; }}
                        >
                            {/* AFTER (full, behind) */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={afterStoredUrl} alt="Después" className="absolute inset-0 w-full h-full object-contain" draggable={false} />

                            {/* BEFORE (clipped) */}
                            <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={beforeStoredUrl} alt="Antes" className="absolute inset-0 h-full object-contain" draggable={false} style={{ width: `${10000 / sliderPos}%` }} />
                            </div>

                            {/* Divider */}
                            <div className="absolute top-0 bottom-0 w-0.5 bg-white/90" style={{ left: `${sliderPos}%` }}>
                                <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-white shadow-2xl flex items-center justify-center">
                                    <span className="text-gray-600 font-bold text-sm select-none">↔</span>
                                </div>
                            </div>

                            {/* Labels */}
                            <div className="absolute top-4 left-4 px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur text-white text-xs font-semibold">ANTES</div>
                            <div className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-violet-600/80 backdrop-blur text-white text-xs font-semibold">DESPUÉS</div>

                            {/* Badge */}
                            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white/70 text-xs flex items-center gap-1.5">
                                <Sparkles size={12} className="text-violet-400" />
                                Intensidad {intensity}/10 · Generado con Gemini AI
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 flex-wrap">
                            <button
                                onClick={() => setPhase('preview')}
                                className="flex-1 py-3.5 rounded-2xl text-sm font-semibold border border-gray-200 dark:border-white/10 text-gray-600 dark:text-white/60 hover:bg-gray-50 dark:hover:bg-white/5 transition-all min-w-[120px]"
                            >
                                Ajustar nivel
                            </button>

                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl text-sm font-semibold border border-violet-200 dark:border-violet-800/50 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all disabled:opacity-50"
                            >
                                {isDownloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                                Descargar
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 py-3.5 rounded-2xl text-sm font-bold text-white transition-all
                                           bg-gradient-to-r from-violet-600 to-purple-600
                                           hover:from-violet-500 hover:to-purple-500
                                           disabled:opacity-50 disabled:cursor-not-allowed
                                           active:scale-[0.98] shadow-lg shadow-violet-500/20 min-w-[140px]"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin inline mr-2" /> : <Save size={16} className="inline mr-2" />}
                                Guardar en Ficha
                            </button>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
}
