'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SubirFotoInventarioProps {
    /** ID del producto en la tabla inventario_items */
    itemId: string;
    /** Callback opcional que se llama con la nueva URL pública tras subida exitosa */
    onSuccess?: (publicUrl: string) => void;
}

type UploadStatus = 'idle' | 'compressing' | 'uploading' | 'success' | 'error';

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_WIDTH_PX = 800;
const WEBP_QUALITY = 0.6; // 60% — objetivo < 100 KB
const BUCKET = 'inventario';

// ─── Compression helper (Canvas API, sin dependencias externas) ───────────────

async function compressToWebP(file: File): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            // Calcular dimensiones respetando aspect ratio
            const scaleFactor = img.width > MAX_WIDTH_PX ? MAX_WIDTH_PX / img.width : 1;
            const targetW = Math.round(img.width * scaleFactor);
            const targetH = Math.round(img.height * scaleFactor);

            const canvas = document.createElement('canvas');
            canvas.width = targetW;
            canvas.height = targetH;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('No se pudo obtener el contexto 2D del canvas.'));
                return;
            }

            ctx.drawImage(img, 0, 0, targetW, targetH);

            canvas.toBlob(
                (blob) => {
                    if (!blob) {
                        reject(new Error('No se pudo comprimir la imagen.'));
                        return;
                    }
                    resolve(blob);
                },
                'image/webp',
                WEBP_QUALITY,
            );
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('No se pudo cargar la imagen seleccionada.'));
        };

        img.src = objectUrl;
    });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SubirFotoInventario({ itemId, onSuccess }: SubirFotoInventarioProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<UploadStatus>('idle');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        // Resetear input para permitir re-seleccionar el mismo archivo
        e.target.value = '';

        setErrorMsg(null);

        try {
            // 1. Comprimir en el cliente
            setStatus('compressing');
            const compressed = await compressToWebP(file);

            console.log(
                `[SubirFoto] Original: ${(file.size / 1024).toFixed(1)} KB → Comprimido: ${(compressed.size / 1024).toFixed(1)} KB`,
            );

            // 2. Subir a Supabase Storage
            setStatus('uploading');
            const fileName = `${itemId}_${Date.now()}.webp`;

            const { error: uploadError } = await supabase.storage
                .from(BUCKET)
                .upload(fileName, compressed, {
                    contentType: 'image/webp',
                    upsert: true,
                });

            if (uploadError) throw new Error(`Storage: ${uploadError.message}`);

            // 3. Obtener URL pública
            const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(fileName);
            const publicUrl = urlData?.publicUrl;

            if (!publicUrl) throw new Error('No se pudo obtener la URL pública.');

            // 4. Actualizar la base de datos
            const { error: dbError } = await supabase
                .from('inventario_items')
                .update({ imagen_url: publicUrl })
                .eq('id', itemId);

            if (dbError) throw new Error(`DB: ${dbError.message}`);

            setStatus('success');
            onSuccess?.(publicUrl);

            // Volver al estado idle después de 2.5 s
            setTimeout(() => setStatus('idle'), 2500);
        } catch (err: unknown) {
            console.error('[SubirFoto] Error:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido';
            setErrorMsg(message);
            setStatus('error');
            setTimeout(() => setStatus('idle'), 4000);
        }
    }

    const isLoading = status === 'compressing' || status === 'uploading';

    return (
        <>
            {/* Input oculto — capture="environment" abre la cámara trasera en móviles */}
            <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
                aria-label="Seleccionar foto del producto"
            />

            {/* Botón principal */}
            <button
                type="button"
                disabled={isLoading}
                title={
                    status === 'success'
                        ? 'Foto subida correctamente'
                        : status === 'error'
                            ? errorMsg ?? 'Error al subir la foto'
                            : 'Subir foto del producto'
                }
                onClick={() => !isLoading && inputRef.current?.click()}
                className={[
                    'p-2 rounded-lg transition-all duration-200 flex items-center justify-center',
                    'focus:outline-none focus:ring-2 focus:ring-offset-1',
                    status === 'success'
                        ? 'bg-emerald-50 text-emerald-600 focus:ring-emerald-400 cursor-default'
                        : status === 'error'
                            ? 'bg-red-50 text-red-600 focus:ring-red-400'
                            : isLoading
                                ? 'bg-blue-50 text-blue-400 cursor-not-allowed'
                                : 'bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-400 focus:ring-indigo-400',
                ].join(' ')}
            >
                {isLoading ? (
                    <Loader2 size={18} className="animate-spin" />
                ) : status === 'success' ? (
                    <CheckCircle size={18} />
                ) : status === 'error' ? (
                    <XCircle size={18} />
                ) : (
                    <Camera size={18} />
                )}
            </button>
        </>
    );
}
