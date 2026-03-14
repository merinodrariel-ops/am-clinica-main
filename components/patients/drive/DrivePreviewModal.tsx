'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ExternalLink, RotateCcw, Sun, Wand2, Loader2, Check } from 'lucide-react';
import dynamic from 'next/dynamic';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';

const STLViewer = dynamic(() => import('@/components/portal-paciente/STLViewer'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

interface DrivePreviewModalProps {
    file: DriveFile | null;
    onClose: () => void;
}

function getPreviewType(file: DriveFile): 'image' | 'video' | '3d' | null {
    const mime = file.mimeType.toLowerCase();
    const name = file.name.toLowerCase();
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (name.endsWith('.stl') || name.endsWith('.ply') || mime === 'application/sla' || mime === 'model/stl') return '3d';
    return null;
}

function get3DFormat(file: DriveFile): 'stl' | 'ply' {
    return file.name.toLowerCase().endsWith('.ply') ? 'ply' : 'stl';
}

export default function DrivePreviewModal({ file, onClose }: DrivePreviewModalProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const objectUrlRef = useRef<string | null>(null);

    // Editing state — only used when previewType === 'image'
    const [imageUrl, setImageUrl] = useState('');
    const [rotation, setRotation] = useState(0);        // -45 to +45, subtle correction
    const [brightness, setBrightness] = useState(100);  // 0–200
    const [bgProcessing, setBgProcessing] = useState(false);
    const [bgDone, setBgDone] = useState(false);
    const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

    // Reset editing state whenever a new file opens, and clean up object URL on close
    useEffect(() => {
        if (file) {
            setImageUrl(`/api/drive/file/${file.id}`);
            setRotation(0);
            setBrightness(100);
            setBgDone(false);
            setBgProcessing(false);
            setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
            setCompletedCrop(null);
        }
        return () => {
            if (objectUrlRef.current) {
                URL.revokeObjectURL(objectUrlRef.current);
                objectUrlRef.current = null;
            }
        };
    }, [file?.id]);

    async function handleRemoveBackground() {
        setBgProcessing(true);
        try {
            const { removeBackground: removeBg } = await import('@imgly/background-removal');
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const resultBlob = await removeBg(blob);
            const newUrl = URL.createObjectURL(resultBlob);
            objectUrlRef.current = newUrl;
            setImageUrl(newUrl);
            setBgDone(true);
        } catch (err) {
            console.error('[bg-removal]', err);
            toast.error('Error al remover fondo');
        } finally {
            setBgProcessing(false);
        }
    }

    function downloadCanvas(canvas: HTMLCanvasElement, name: string) {
        const a = document.createElement('a');
        const isPng = name.toLowerCase().endsWith('.png') || bgDone;
        a.href = canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.95);
        a.download = name.replace(/\.[^.]+$/, '') + '_editada.' + (isPng ? 'png' : 'jpg');
        a.click();
    }

    function handleDownload() {
        const img = imgRef.current;
        if (!img) return;

        const radians = (rotation * Math.PI) / 180;
        // When rotation is small (±45°), dimensions don't swap — use natural size
        const outW = img.naturalWidth;
        const outH = img.naturalHeight;

        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = outW;
        fullCanvas.height = outH;
        const fullCtx = fullCanvas.getContext('2d')!;
        fullCtx.filter = `brightness(${brightness}%)`;
        fullCtx.translate(outW / 2, outH / 2);
        fullCtx.rotate(radians);
        fullCtx.drawImage(img, -outW / 2, -outH / 2);
        fullCtx.setTransform(1, 0, 0, 1, 0, 0);

        if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
            downloadCanvas(fullCanvas, file!.name);
            return;
        }

        const scaleX = outW / img.width;
        const scaleY = outH / img.height;

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = completedCrop.width * scaleX;
        cropCanvas.height = completedCrop.height * scaleY;
        const cropCtx = cropCanvas.getContext('2d')!;
        cropCtx.drawImage(
            fullCanvas,
            completedCrop.x * scaleX, completedCrop.y * scaleY,
            cropCanvas.width, cropCanvas.height,
            0, 0, cropCanvas.width, cropCanvas.height
        );
        downloadCanvas(cropCanvas, file!.name);
    }

    if (!file) return null;

    const previewType = getPreviewType(file);
    const proxyUrl = `/api/drive/file/${file.id}`;

    return (
        <AnimatePresence>
            {file && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col"
                    onClick={onClose}
                >
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10 flex-shrink-0"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="min-w-0 flex-1 mr-4">
                            <p className="text-white font-semibold truncate">{file.name}</p>
                            {previewType === '3d' && (
                                <p className="text-white/40 text-xs mt-0.5">
                                    Arrastrá para rotar · Scroll para zoom
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                            >
                                <ExternalLink size={14} />
                                <span className="hidden sm:inline">Drive</span>
                            </a>
                            {previewType === 'image' ? (
                                <button
                                    onClick={handleDownload}
                                    className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                                >
                                    <Download size={14} />
                                    <span className="hidden sm:inline">Descargar</span>
                                </button>
                            ) : previewType !== '3d' ? (
                                <a
                                    href={proxyUrl}
                                    download={file.name}
                                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Download size={14} />
                                    <span className="hidden sm:inline">Descargar</span>
                                </a>
                            ) : null}
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

                        {/* IMAGE — inline editor */}
                        {previewType === 'image' && (
                            <>
                                <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                                    <ReactCrop
                                        crop={crop}
                                        onChange={c => setCrop(c)}
                                        onComplete={c => setCompletedCrop(c)}
                                    >
                                        <img
                                            ref={imgRef}
                                            src={imageUrl}
                                            alt={file.name}
                                            crossOrigin="anonymous"
                                            style={{
                                                transform: `rotate(${rotation}deg)`,
                                                filter: `brightness(${brightness}%)`,
                                                maxHeight: '60vh',
                                                maxWidth: '100%',
                                                objectFit: 'contain',
                                                display: 'block',
                                                transition: 'filter 0.1s ease',
                                            }}
                                        />
                                    </ReactCrop>
                                </div>

                                {/* Editing toolbar */}
                                <div
                                    className="flex-shrink-0 px-4 py-3 border-t border-white/10 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center"
                                    onClick={e => e.stopPropagation()}
                                >
                                    {/* Rotation — smooth slider */}
                                    <div className="flex items-center gap-2">
                                        <RotateCcw size={15} className="text-white/50 flex-shrink-0" />
                                        <input
                                            type="range"
                                            min={-45}
                                            max={45}
                                            step={0.5}
                                            value={rotation}
                                            onChange={e => setRotation(Number(e.target.value))}
                                            className="w-28 accent-white/70"
                                        />
                                        <span className="text-white/40 text-xs w-10 text-right">
                                            {rotation > 0 ? `+${rotation}°` : `${rotation}°`}
                                        </span>
                                    </div>

                                    {/* Brightness */}
                                    <div className="flex items-center gap-2">
                                        <Sun size={15} className="text-yellow-400 flex-shrink-0" />
                                        <input
                                            type="range"
                                            min={0}
                                            max={200}
                                            step={1}
                                            value={brightness}
                                            onChange={e => setBrightness(Number(e.target.value))}
                                            className="w-28 accent-yellow-400"
                                        />
                                        <span className="text-white/40 text-xs w-10 text-right">{brightness}%</span>
                                    </div>

                                    {/* Background removal */}
                                    <button
                                        onClick={handleRemoveBackground}
                                        disabled={bgProcessing || bgDone}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/30 text-violet-300 text-sm hover:bg-violet-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {bgProcessing ? (
                                            <><Loader2 size={14} className="animate-spin" /> Procesando...</>
                                        ) : bgDone ? (
                                            <><Check size={14} /> Sin fondo</>
                                        ) : (
                                            <><Wand2 size={14} /> Remover fondo</>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}

                        {/* VIDEO */}
                        {previewType === 'video' && (
                            <div className="flex-1 flex items-center justify-center p-4">
                                <video
                                    src={proxyUrl}
                                    controls
                                    autoPlay
                                    className="max-h-full max-w-full rounded-lg"
                                >
                                    Tu navegador no soporta video HTML5.
                                </video>
                            </div>
                        )}

                        {/* 3D */}
                        {previewType === '3d' && (
                            <div className="flex-1">
                                <STLViewer url={proxyUrl} format={get3DFormat(file)} />
                            </div>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
