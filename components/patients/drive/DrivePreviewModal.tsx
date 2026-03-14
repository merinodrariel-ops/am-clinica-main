'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, ExternalLink, Pencil } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { DriveFile } from '@/app/actions/patient-files-drive';

const STLViewer = dynamic(() => import('@/components/portal-paciente/STLViewer'), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center h-full">
            <div className="h-8 w-8 border-2 border-[#C9A96E] border-t-transparent rounded-full animate-spin" />
        </div>
    ),
});

const DrivePhotoEditor = dynamic(() => import('./DrivePhotoEditor'), { ssr: false });

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
    const [editMode, setEditMode] = useState(false);

    useEffect(() => {
        if (!file) setEditMode(false);
    }, [file]);

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
                        className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-white/10"
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
                            {previewType === 'image' && (
                                <button
                                    onClick={() => setEditMode(true)}
                                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                                >
                                    <Pencil size={14} />
                                    <span className="hidden sm:inline">Editar foto</span>
                                </button>
                            )}
                            <a
                                href={file.webViewLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                            >
                                <ExternalLink size={14} />
                                <span className="hidden sm:inline">Abrir en Drive</span>
                            </a>
                            {previewType !== '3d' && (
                                <a
                                    href={proxyUrl}
                                    download={file.name}
                                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white text-sm border border-white/10 hover:bg-white/15 transition-colors flex items-center gap-1.5"
                                    onClick={e => e.stopPropagation()}
                                >
                                    <Download size={14} />
                                    <span className="hidden sm:inline">Descargar</span>
                                </a>
                            )}
                            <button
                                onClick={onClose}
                                className="p-2 rounded-lg bg-white/10 text-white border border-white/10 hover:bg-white/15 transition-colors"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-hidden" onClick={e => e.stopPropagation()}>
                        {previewType === 'image' && (
                            <div className="h-full flex items-center justify-center p-4">
                                <img
                                    src={proxyUrl}
                                    alt={file.name}
                                    className="max-h-full max-w-full object-contain rounded-lg"
                                />
                            </div>
                        )}

                        {previewType === 'video' && (
                            <div className="h-full flex items-center justify-center p-4">
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

                        {previewType === '3d' && (
                            <STLViewer url={proxyUrl} format={get3DFormat(file)} />
                        )}
                    </div>
                </motion.div>
            )}
            {editMode && file && (
                <DrivePhotoEditor
                    file={file}
                    onClose={() => setEditMode(false)}
                />
            )}
        </AnimatePresence>
    );
}
