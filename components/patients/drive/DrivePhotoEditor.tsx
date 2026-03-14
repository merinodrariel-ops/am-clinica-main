'use client';
import { useRef, useState, useEffect } from 'react';
import ReactCrop, { type Crop, type PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { X, Download, RotateCw, Sun, Wand2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import type { DriveFile } from '@/app/actions/patient-files-drive';

interface DrivePhotoEditorProps {
    file: DriveFile;
    onClose: () => void;
}

export default function DrivePhotoEditor({ file, onClose }: DrivePhotoEditorProps) {
    const imgRef = useRef<HTMLImageElement>(null);
    const objectUrlRef = useRef<string | null>(null);
    const [imageUrl, setImageUrl] = useState(`/api/drive/file/${file.id}`);
    const [rotation, setRotation] = useState(0);
    const [brightness, setBrightness] = useState(100);
    const [bgProcessing, setBgProcessing] = useState(false);
    const [bgDone, setBgDone] = useState(false);
    const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
    const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);

    useEffect(() => {
        return () => {
            if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
        };
    }, []);

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

    function handleRotate() {
        setRotation(r => (r + 90) % 360);
        // Reset crop when rotating — coordinates no longer valid
        setCrop({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
        setCompletedCrop(null);
    }

    function download(canvas: HTMLCanvasElement, name: string) {
        const a = document.createElement('a');
        const ext = name.toLowerCase().endsWith('.png') ? 'png' : 'jpeg';
        a.href = canvas.toDataURL(ext === 'png' ? 'image/png' : 'image/jpeg', 0.95);
        a.download = name.replace(/\.[^.]+$/, '') + '_editada.' + ext;
        a.click();
    }

    async function handleDownload() {
        const img = imgRef.current;
        if (!img) return;

        const radians = (rotation * Math.PI) / 180;
        const rotated = rotation % 180 !== 0;
        const outW = rotated ? img.naturalHeight : img.naturalWidth;
        const outH = rotated ? img.naturalWidth : img.naturalHeight;

        // Step 1: full canvas with rotation + brightness
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = outW;
        fullCanvas.height = outH;
        const fullCtx = fullCanvas.getContext('2d')!;
        fullCtx.filter = `brightness(${brightness}%)`;
        fullCtx.translate(outW / 2, outH / 2);
        fullCtx.rotate(radians);
        fullCtx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
        fullCtx.setTransform(1, 0, 0, 1, 0, 0);

        // Step 2: crop if user defined a crop
        if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
            download(fullCanvas, file.name);
            return;
        }

        // Note: completedCrop coords are in rendered (CSS) space. CSS rotation does not
        // change img.width/img.height layout dimensions, so crops on rotated images may
        // be slightly off if the rendered element is not square. handleRotate() resets
        // completedCrop to prevent stale crop coordinates across rotations.
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
        download(cropCanvas, file.name);
    }

    return (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-md flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 flex-shrink-0">
                <p className="text-white font-semibold truncate flex-1 mr-4">{file.name}</p>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleDownload}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm flex items-center gap-1.5 hover:bg-blue-700 transition-colors"
                    >
                        <Download size={14} /> Descargar
                    </button>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Image area */}
            <div className="flex-1 overflow-auto flex items-center justify-center p-4">
                <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                >
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        alt={file.name}
                        crossOrigin="anonymous"
                        style={{
                            transform: `rotate(${rotation}deg)`,
                            filter: `brightness(${brightness}%)`,
                            maxHeight: '65vh',
                            maxWidth: '100%',
                            objectFit: 'contain',
                            transition: 'transform 0.2s ease',
                            display: 'block',
                        }}
                    />
                </ReactCrop>
            </div>

            {/* Bottom toolbar */}
            <div className="flex-shrink-0 px-4 py-3 border-t border-white/10 flex flex-wrap items-center gap-3 justify-center">
                <button
                    onClick={handleRotate}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/10 text-white text-sm hover:bg-white/20 transition-colors"
                >
                    <RotateCw size={16} /> Rotar 90°
                </button>

                <div className="flex items-center gap-2">
                    <Sun size={16} className="text-yellow-400 flex-shrink-0" />
                    <input
                        type="range"
                        min={0}
                        max={200}
                        value={brightness}
                        onChange={e => setBrightness(Number(e.target.value))}
                        className="w-28 accent-yellow-400"
                    />
                    <span className="text-white/50 text-xs w-10 text-right">{brightness}%</span>
                </div>

                <button
                    onClick={handleRemoveBackground}
                    disabled={bgProcessing || bgDone}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-violet-600/30 text-violet-300 text-sm hover:bg-violet-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {bgProcessing ? (
                        <><Loader2 size={16} className="animate-spin" /> Procesando...</>
                    ) : bgDone ? (
                        <><Check size={16} /> Sin fondo</>
                    ) : (
                        <><Wand2 size={16} /> Remover fondo</>
                    )}
                </button>
            </div>
        </div>
    );
}
