'use client';

import { useState, useCallback } from 'react';
import {
    compressImage,
    CompressionOptions,
    formatFileSize,
    isImageFile
} from '@/lib/image-compression';
import { uploadToStorage } from '@/lib/supabase-storage';

interface UseImageUploadOptions {
    area: 'caja-admin' | 'caja-recepcion' | 'pacientes';
    compression?: CompressionOptions;
    onProgress?: (progress: number) => void;
}

interface UploadedImage {
    name: string;
    path: string;
    url: string;
    originalSize: number;
    compressedSize: number;
    compressionRatio: number;
}

interface UseImageUploadReturn {
    upload: (files: File[]) => Promise<UploadedImage[]>;
    uploadSingle: (file: File) => Promise<UploadedImage | null>;
    isUploading: boolean;
    error: string | null;
    progress: number;
    lastResults: UploadedImage[];
}

export function useImageUpload(options: UseImageUploadOptions): UseImageUploadReturn {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [lastResults, setLastResults] = useState<UploadedImage[]>([]);

    const uploadSingle = useCallback(async (file: File): Promise<UploadedImage | null> => {
        setIsUploading(true);
        setError(null);
        setProgress(0);

        try {
            let fileData: { blob: Blob; base64: string; originalSize: number; compressedSize: number; compressionRatio: number };

            // Compress if it's an image
            if (isImageFile(file)) {
                setProgress(20);
                const compressed = await compressImage(file, options.compression);
                fileData = compressed;
                console.log(`Image compressed: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)} (${compressed.compressionRatio}% reduction)`);
            } else {
                // For non-images, just convert to base64
                const buffer = await file.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');
                fileData = {
                    blob: file,
                    base64,
                    originalSize: file.size,
                    compressedSize: file.size,
                    compressionRatio: 0,
                };
            }

            setProgress(50);

            // Upload to Supabase
            const result = await uploadToStorage(
                options.area,
                file.name.replace(/\.[^/.]+$/, '.jpg'), // Change extension to jpg for images
                fileData.base64,
                isImageFile(file) ? 'image/jpeg' : file.type
            );

            setProgress(100);

            if (!result.success) {
                throw new Error(result.error || 'Upload failed');
            }

            const uploaded: UploadedImage = {
                name: file.name,
                path: result.path!,
                url: result.publicUrl!,
                originalSize: fileData.originalSize,
                compressedSize: fileData.compressedSize,
                compressionRatio: fileData.compressionRatio,
            };

            setLastResults([uploaded]);
            return uploaded;

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al subir imagen';
            setError(message);
            console.error('Upload error:', err);
            return null;
        } finally {
            setIsUploading(false);
        }
    }, [options.area, options.compression]);

    const upload = useCallback(async (files: File[]): Promise<UploadedImage[]> => {
        setIsUploading(true);
        setError(null);
        setProgress(0);
        const results: UploadedImage[] = [];

        try {
            const total = files.length;

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                setProgress(Math.round(((i + 0.5) / total) * 100));

                const result = await uploadSingle(file);
                if (result) {
                    results.push(result);
                }

                setProgress(Math.round(((i + 1) / total) * 100));
            }

            setLastResults(results);
            return results;

        } catch (err) {
            const message = err instanceof Error ? err.message : 'Error al subir imágenes';
            setError(message);
            return results;
        } finally {
            setIsUploading(false);
        }
    }, [uploadSingle]);

    return {
        upload,
        uploadSingle,
        isUploading,
        error,
        progress,
        lastResults,
    };
}

// Re-export utilities
export { formatFileSize, isImageFile };
