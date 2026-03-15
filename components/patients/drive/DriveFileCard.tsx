'use client';

import { motion } from 'framer-motion';
import {
    Image as ImageIcon,
    Video,
    Box,
    FileText,
    File,
    ExternalLink,
    Play,
    Download,
} from 'lucide-react';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import Mini3DPreview from './Mini3DPreview';

interface DriveFileCardProps {
    file: DriveFile;
    onPreview: (file: DriveFile) => void;
}

function getFileCategory(file: DriveFile): 'image' | 'video' | '3d' | 'pdf' | 'google-doc' | 'other' {
    const mime = file.mimeType.toLowerCase();
    const name = file.name.toLowerCase();

    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (name.endsWith('.stl') || name.endsWith('.ply') || mime === 'application/sla' || mime === 'model/stl') return '3d';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.startsWith('application/vnd.google-apps.')) return 'google-doc';
    return 'other';
}

function formatFileSize(sizeStr?: string): string {
    if (!sizeStr) return '';
    const bytes = parseInt(sizeStr, 10);
    if (isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatRelativeDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Hoy';
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    if (diffDays < 30) return `Hace ${Math.floor(diffDays / 7)} sem`;
    if (diffDays < 365) return `Hace ${Math.floor(diffDays / 30)} meses`;
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
}

const ICON_MAP = {
    image: ImageIcon,
    video: Video,
    '3d': Box,
    pdf: FileText,
    'google-doc': FileText,
    other: File,
};

const COLOR_MAP = {
    image: 'text-blue-400 bg-blue-400/10',
    video: 'text-purple-400 bg-purple-400/10',
    '3d': 'text-[#C9A96E] bg-[#C9A96E]/10',
    pdf: 'text-red-400 bg-red-400/10',
    'google-doc': 'text-green-400 bg-green-400/10',
    other: 'text-gray-400 bg-gray-400/10',
};

export default function DriveFileCard({ file, onPreview }: DriveFileCardProps) {
    const category = getFileCategory(file);
    const Icon = ICON_MAP[category];
    const colorClass = COLOR_MAP[category];
    const canPreview = category === 'image' || category === 'video' || category === '3d';
    // google-docs are served by Google directly; the proxy can't download them
    const canDownload = category !== 'google-doc';
    const size = formatFileSize(file.size);

    const handleClick = () => {
        if (canPreview) {
            onPreview(file);
        } else {
            window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleClick}
            className="text-left rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 hover:border-blue-300 dark:hover:border-[#C9A96E]/30 hover:shadow-sm transition-all group w-full"
        >
            {/* Thumbnail or icon */}
            <div className="aspect-square rounded-lg overflow-hidden mb-2 flex items-center justify-center bg-gray-50 dark:bg-white/5 relative">
                {(category === 'image' || category === 'pdf' || category === 'google-doc') && file.thumbnailLink ? (
                    <img
                        src={file.thumbnailLink}
                        alt={file.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                        loading="lazy"
                    />
                ) : category === 'video' ? (
                    <div className="relative flex items-center justify-center w-full h-full">
                        {file.thumbnailLink ? (
                            <img
                                src={file.thumbnailLink}
                                alt={file.name}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                        ) : (
                            <Video size={32} className="text-purple-400/50" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-10 w-10 rounded-full bg-black/60 flex items-center justify-center">
                                <Play size={18} className="text-white ml-0.5" />
                            </div>
                        </div>
                    </div>
                ) : category === '3d' ? (
                    <Mini3DPreview
                        fileId={file.id}
                        format={file.name.toLowerCase().endsWith('.ply') ? 'ply' : 'stl'}
                    />
                ) : (
                    <div className={`h-12 w-12 rounded-xl ${colorClass} flex items-center justify-center`}>
                        <Icon size={22} />
                    </div>
                )}

                {!canPreview && (
                    <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ExternalLink size={14} className="text-gray-400" />
                    </div>
                )}

                {canDownload && (
                    <a
                        href={`/api/drive/file/${file.id}`}
                        download={file.name}
                        onClick={e => e.stopPropagation()}
                        className="absolute bottom-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 sm:opacity-60 transition-all hover:bg-black/80 hover:text-white z-10"
                        title="Descargar"
                    >
                        <Download size={13} />
                    </a>
                )}
            </div>

            {/* File info */}
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={file.name}>
                {file.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-gray-500 dark:text-white/40">
                    {formatRelativeDate(file.createdTime)}
                </span>
                {size && (
                    <span className="text-xs text-gray-400 dark:text-white/30">{size}</span>
                )}
            </div>
        </motion.button>
    );
}
