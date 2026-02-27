'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { compressImage } from '@/lib/image-compression';

interface DriveUploadButtonProps {
    folderId: string;
    patientId: string;
    onUploaded: () => void;
}

export default function DriveUploadButton({ folderId, patientId, onUploaded }: DriveUploadButtonProps) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);

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
            toast.success(`${successCount} archivo${successCount > 1 ? 's' : ''} subido${successCount > 1 ? 's' : ''}`);
            onUploaded();
        }

        setUploading(false);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => e.target.files && handleFiles(e.target.files)}
            />
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
