'use client';

import React, { useState, useRef } from 'react';
import { uploadToStorage } from '@/lib/supabase-storage';
import { compressImage, formatFileSize, isImageFile } from '@/lib/image-compression';

interface ComprobanteUploadProps {
    area: 'caja-admin' | 'caja-recepcion';
    movimientoId?: string;
    onUploadComplete?: (result: { path: string; url: string }) => void;
    className?: string;
}

export function ComprobanteUpload({
    area,
    movimientoId,
    onUploadComplete,
    className = ''
}: ComprobanteUploadProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [compressionInfo, setCompressionInfo] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        setError(null);
        setProgress(10);

        try {
            let fileData: { base64: string; mimeType: string; fileName: string };

            if (isImageFile(file)) {
                // Compress image
                setProgress(30);
                const compressed = await compressImage(file, {
                    maxWidth: 1600,
                    maxHeight: 1600,
                    quality: 0.7,
                    maxSizeKB: 250,
                });

                setCompressionInfo(
                    `Comprimido: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)} (${compressed.compressionRatio}% menos)`
                );

                // Show preview
                setPreview(URL.createObjectURL(compressed.blob));

                fileData = {
                    base64: compressed.base64,
                    mimeType: 'image/jpeg',
                    fileName: file.name.replace(/\.[^/.]+$/, '.jpg'),
                };
            } else {
                // For PDFs and other files
                const buffer = await file.arrayBuffer();
                const base64 = Buffer.from(buffer).toString('base64');

                fileData = {
                    base64,
                    mimeType: file.type,
                    fileName: file.name,
                };
                setCompressionInfo(null);
            }

            setProgress(60);

            // Generate unique filename
            const timestamp = Date.now();
            const prefix = movimientoId ? `mov-${movimientoId}` : 'comp';
            const finalName = `${prefix}-${timestamp}-${fileData.fileName}`;

            // Upload to Supabase Storage
            const result = await uploadToStorage(
                area,
                finalName,
                fileData.base64,
                fileData.mimeType
            );

            setProgress(100);

            if (!result.success) {
                throw new Error(result.error || 'Error al subir archivo');
            }

            onUploadComplete?.({
                path: result.path!,
                url: result.publicUrl!,
            });

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Error al subir comprobante');
            console.error('Upload error:', err);
        } finally {
            setIsUploading(false);
            // Reset file input
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const triggerFileSelect = () => {
        fileInputRef.current?.click();
    };

    return (
        <div className={`comprobante-upload ${className}`}>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
            />

            <button
                type="button"
                onClick={triggerFileSelect}
                disabled={isUploading}
                className="upload-btn"
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    backgroundColor: isUploading ? '#666' : '#333',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: isUploading ? 'not-allowed' : 'pointer',
                    fontSize: '14px',
                    transition: 'background-color 0.2s',
                }}
            >
                {isUploading ? (
                    <>
                        <span className="spinner" style={{
                            width: '16px',
                            height: '16px',
                            border: '2px solid #fff',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                        }} />
                        Subiendo... {progress}%
                    </>
                ) : (
                    <>
                        📎 Adjuntar Comprobante
                    </>
                )}
            </button>

            {compressionInfo && (
                <p style={{ fontSize: '12px', color: '#10b981', marginTop: '4px' }}>
                    ✓ {compressionInfo}
                </p>
            )}

            {error && (
                <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    ⚠️ {error}
                </p>
            )}

            {preview && (
                <div style={{ marginTop: '8px' }}>
                    <img
                        src={preview}
                        alt="Preview"
                        style={{
                            maxWidth: '200px',
                            maxHeight: '150px',
                            borderRadius: '8px',
                            border: '1px solid #333'
                        }}
                    />
                </div>
            )}

            <style jsx>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
