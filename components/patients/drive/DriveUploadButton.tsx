'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compression';

interface DriveUploadButtonProps {
    folderId: string;
    patientId: string;
    onUploaded: () => void;
    variant?: 'icon' | 'dropzone';
    dropzoneTitle?: string;
    dropzoneHint?: string;
    dropzoneClassName?: string;
    successMessage?: string | ((count: number) => string);
}

export default function DriveUploadButton({
    folderId,
    patientId,
    onUploaded,
    variant = 'icon',
    dropzoneTitle = 'Arrastrá archivos aquí o hacé clic',
    dropzoneHint = 'Subida directa a Google Drive',
    dropzoneClassName,
    successMessage,
}: DriveUploadButtonProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleFiles = async (files: FileList) => {
        setUploading(true);
        let successCount = 0;

        for (const file of Array.from(files)) {
            try {
                let fileToUpload: File | Blob = file;

                // Compress images before upload
                if (file.type.startsWith('image/') && file.size > 500 * 1024) {
                    const compressed = await compressImage(file, {
                        maxWidth: 2000,
                        maxHeight: 2000,
                        quality: 0.8,
                        maxSizeKB: 500,
                    });
                    fileToUpload = compressed.blob;
                }

                const formData = new FormData();
                formData.append('file', fileToUpload, file.name);
                formData.append('folderId', folderId);
                formData.append('patientId', patientId);

                const res = await fetch('/api/drive/upload', {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) {
                    const err = await res.json();
                    throw new Error(err.error || 'Error al subir');
                }

                successCount++;
            } catch (error) {
                toast.error(`Error subiendo ${file.name}: ${error instanceof Error ? error.message : 'Error desconocido'}`);
            }
        }

        if (successCount > 0) {
            const defaultMessage = `${successCount} archivo${successCount > 1 ? 's' : ''} subido${successCount > 1 ? 's' : ''}`;
            const resolvedMessage = typeof successMessage === 'function'
                ? successMessage(successCount)
                : successMessage;
            toast.success(resolvedMessage || defaultMessage);
            onUploaded();
        }

        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    const fileInput = (
        <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => e.target.files && handleFiles(e.target.files)}
        />
    );

    if (variant === 'dropzone') {
        return (
            <>
                {fileInput}
                <div
                    onDragOver={(e) => {
                        e.preventDefault();
                        if (!uploading) setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (uploading) return;
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                            void handleFiles(e.dataTransfer.files);
                        }
                    }}
                    onClick={() => {
                        if (!uploading) inputRef.current?.click();
                    }}
                    className={`rounded-xl border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
                        isDragging
                            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/10'
                            : 'border-gray-300 dark:border-white/15 hover:border-blue-400 dark:hover:border-blue-400/60 bg-gray-50/50 dark:bg-white/[0.03]'
                    } ${uploading ? 'opacity-70 cursor-not-allowed' : ''} ${dropzoneClassName || ''}`}
                >
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-white/60">
                        {uploading ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
                    </div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-white">
                        {uploading ? 'Subiendo archivos...' : isDragging ? 'Soltá los archivos' : dropzoneTitle}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-white/45">{dropzoneHint}</p>
                </div>
            </>
        );
    }

    return (
        <>
            {fileInput}
            <button
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className="p-1.5 rounded-lg text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-700 dark:hover:text-white/70 transition-colors disabled:opacity-50"
                title="Subir archivo"
            >
                {uploading ? (
                    <Loader2 size={16} className="animate-spin" />
                ) : (
                    <Upload size={16} />
                )}
            </button>
        </>
    );
}
