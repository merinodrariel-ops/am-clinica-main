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
                    resolve({ base64, mimeType: 'image/jpeg', dataUrl, width: w, height: h });
                };
                reader.readAsDataURL(blob);
            }, 'image/jpeg', quality);
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
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        onDragOver={onDragOver}
                        onDragLeave={onDragLeave}
                        onDrop={onDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`relative flex-1 min-h-[500px] rounded-[2rem] cursor-pointer overflow-hidden border-2 transition-all duration-500 group flex flex-col items-center justify-center gap-8 ${isDragging
                            ? 'border-violet-500 bg-violet-500/10 shadow-[0_0_80px_rgba(124,58,237,0.15)] ring-4 ring-violet-500/10'
                            : 'border-white/5 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10'
                            }`}
                    >
                        {/* Interactive Grid Background */}
                        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
                            style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }} />

                        <div className="relative z-10 flex flex-col items-center text-center px-10">
                            <motion.div
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="relative mb-6"
                            >
                                <div className={`w-32 h-32 rounded-[2.5rem] flex items-center justify-center transition-all duration-500 ${isDragging ? 'bg-violet-500 scale-110' : 'bg-slate-900 border border-white/10 group-hover:border-violet-500/50'
                                    }`}>
                                    <Camera size={48} className={`transition-all duration-500 ${isDragging ? 'text-white' : 'text-slate-700 group-hover:text-violet-400'}`} />
                                </div>
                                <div className="absolute -top-4 -right-4 w-12 h-12 rounded-2xl bg-teal-500/20 backdrop-blur-xl border border-teal-500/30 flex items-center justify-center shadow-lg">
                                    <Sparkles size={20} className="text-teal-400" />
                                </div>
                            </motion.div>

                            <h3 className="text-2xl font-bold text-white mb-2 leading-tight">
                                {isDragging ? '¡Soltala ahora!' : 'Subí una foto de rostro'}
                            </h3>
                            <p className="text-slate-500 text-sm max-w-[280px] leading-relaxed">
                                Arrastrá el archivo o hacé click para seleccionar de tu galería.
                            </p>

                            <div className="mt-10 flex flex-wrap justify-center gap-3">
                                <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">JPG</span>
                                <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">PNG</span>
                                <span className="px-4 py-1.5 rounded-full bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">WEBP</span>
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
                        className="flex-1 min-h-[500px] rounded-[2rem] bg-white/[0.02] border border-white/5 flex flex-col items-center justify-center gap-10"
                    >
                        <div className="relative">
                            <div className="w-32 h-32 rounded-[2.5rem] bg-violet-500/10 flex items-center justify-center relative overflow-hidden">
                                <ScanFace size={54} className="text-violet-400" />
                                <motion.div
                                    animate={{
                                        top: ['0%', '100%', '0%'],
                                    }}
                                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                    className="absolute left-0 right-0 h-0.5 bg-violet-400/50 shadow-[0_0_15px_rgba(167,139,250,0.5)] z-20"
                                />
                            </div>
                            <svg className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] animate-[spin_8s_linear_infinite]">
                                <circle cx="50%" cy="50%" r="48%" stroke="rgba(167,139,250,0.15)" strokeWidth="1" fill="none" strokeDasharray="10 10" />
                            </svg>
                        </div>
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-white">Escaneando Biometría Facial</h3>
                            <p className="text-slate-500 text-sm">Alineando los ejes pupilares con Gemini 2.5 Flash</p>
                        </div>
                    </motion.div>
                )}

                {/* ── PREVIEW + INTENSITY ───────────────────────────────────── */}
                {(phase === 'preview' || phase === 'processing') && beforeDataUrl && (
                    <motion.div
                        key="preview"
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col lg:flex-row gap-8 items-start"
                    >
                        {/* Left Column: Image */}
                        <div className="flex-1 w-full rounded-[2rem] overflow-hidden bg-slate-900 border border-white/5 shadow-2xl relative aspect-[3/4] lg:aspect-auto">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={beforeDataUrl}
                                alt="Original alineada"
                                className="w-full h-full object-cover lg:max-h-[600px]"
                            />

                            {/* Overlay Info */}
                            <div className="absolute top-4 left-4 flex gap-2">
                                <div className="px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50">
                                    Original Alineada
                                </div>
                            </div>

                            {phase === 'processing' && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center gap-8"
                                >
                                    <div className="relative">
                                        <div className="w-24 h-24 rounded-[2rem] bg-teal-500/10 flex items-center justify-center">
                                            <Wand2 size={40} className="text-teal-400" />
                                        </div>
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
                                            className="absolute -inset-3 rounded-[2.5rem] border border-transparent border-t-teal-400"
                                        />
                                    </div>
                                    <div className="text-center space-y-2 px-10">
                                        <h3 className="text-xl font-bold text-white">Reconstruyendo Sonrisa</h3>
                                        <p className="text-slate-500 text-sm max-w-[240px]">Gemini Vision está analizando la estructura dental para una simulación orgánica.</p>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Right Column: Controls */}
                        <div className="w-full lg:w-[350px] space-y-6">
                            <div className="p-8 rounded-[2rem] bg-white/[0.03] border border-white/5 space-y-8 relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 blur-[40px] rounded-full -mr-16 -mt-16" />

                                <IntensitySlider
                                    label="Intensidad de Blanqueamiento"
                                    value={intensity}
                                    onChange={setIntensity}
                                />

                                <div className="space-y-4 pt-4">
                                    <h4 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-2">Características</h4>
                                    <div className="grid grid-cols-1 gap-3">
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                            <div className="w-6 h-6 rounded bg-teal-500/20 flex items-center justify-center">
                                                <CheckCircle2 size={12} className="text-teal-400" />
                                            </div>
                                            <span className="text-xs font-medium text-slate-300">Alineación Dentaria</span>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5">
                                            <div className="w-6 h-6 rounded bg-teal-500/20 flex items-center justify-center">
                                                <CheckCircle2 size={12} className="text-teal-400" />
                                            </div>
                                            <span className="text-xs font-medium text-slate-300">Textura Esmalte Real</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={handleProcess}
                                    disabled={phase === 'processing'}
                                    className="group w-full py-5 rounded-2xl font-black text-xs uppercase tracking-widest text-white transition-all duration-300
                                               bg-gradient-to-r from-violet-600 to-indigo-600
                                               hover:from-violet-500 hover:to-indigo-500
                                               active:scale-[0.98] shadow-xl shadow-violet-500/25 flex items-center justify-center gap-3"
                                >
                                    <Wand2 size={16} />
                                    Generar Sonrisa
                                    <ChevronRight size={14} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            </div>

                            {errorMsg && (
                                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                                    className="flex items-start gap-4 p-5 bg-red-500/10 border border-red-200 dark:border-red-800/50 rounded-2xl">
                                    <AlertCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-red-400 text-xs font-medium leading-relaxed">{errorMsg}</p>
                                </motion.div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* ── RESULT: Before/After comparator ───────────────────────── */}
                {phase === 'result' && beforeStoredUrl && afterStoredUrl && (
                    <motion.div
                        key="result"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                        className="flex flex-col gap-10"
                    >
                        <div className="relative group">
                            {/* Decorative Glow behind comparator */}
                            <div className="absolute -inset-4 bg-teal-500/5 blur-3xl rounded-[3rem] opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />

                            <ImageComparator
                                beforeImage={beforeStoredUrl}
                                afterImage={afterStoredUrl}
                                orientation="horizontal"
                            />

                            {/* Corner Labels - Floating */}
                            <div className="absolute top-6 left-6 pointer-events-none">
                                <div className="px-5 py-2 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Original</span>
                                </div>
                            </div>
                            <div className="absolute top-6 right-6 pointer-events-none">
                                <div className="px-5 py-2 rounded-2xl bg-teal-500/20 backdrop-blur-xl border border-teal-500/30 shadow-2xl shadow-teal-500/20">
                                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-300">Smile Design AI</span>
                                </div>
                            </div>

                            {/* Metadata Badge */}
                            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl bg-slate-900/80 backdrop-blur-xl border border-white/5 text-white/70 text-[10px] font-bold uppercase tracking-widest flex items-center gap-3 shadow-2xl">
                                <Sparkles size={14} className="text-teal-400" />
                                Nivel {intensity}/10 · Generado por Gemini
                            </div>
                        </div>

                        {/* Premium Action Bar */}
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => setPhase('preview')}
                                className="flex-1 py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest border border-white/5 text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                            >
                                Ajustar Nivel
                            </button>

                            <button
                                onClick={handleDownload}
                                disabled={isDownloading}
                                className="flex items-center justify-center gap-3 px-8 py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest border border-white/5 text-slate-300 hover:bg-white/5 transition-all disabled:opacity-30"
                            >
                                {isDownloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                                Descargar
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-[1.5] py-5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest text-white transition-all duration-500
                                           bg-gradient-to-r from-teal-600 to-emerald-600
                                           hover:from-teal-500 hover:to-emerald-500
                                           disabled:opacity-40 disabled:cursor-not-allowed
                                           active:scale-[0.98] shadow-2xl shadow-teal-500/20 flex items-center justify-center gap-3"
                            >
                                {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                                Finalizar y Guardar
                            </button>
                        </div>
                    </motion.div>
                )}

            </AnimatePresence>
        </div>
    );
}
