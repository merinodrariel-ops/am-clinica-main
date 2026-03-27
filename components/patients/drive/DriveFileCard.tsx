'use client';

import { useState } from 'react';
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
    Trash2,
    Share2,
    Mail,
    Tag,
} from 'lucide-react';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { getCategoryDef, getTagLabel } from '@/lib/photo-tag-taxonomy';
import type { PhotoTag } from '@/app/actions/photo-tags';
import Mini3DPreview from './Mini3DPreview';

// ── Inline WhatsApp icon ─────────────────────────────────────────────────────
function WhatsAppIcon({ size = 13 }: { size?: number }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" className="flex-shrink-0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zm-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884zm8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
    );
}

interface DriveFileCardProps {
    file: DriveFile;
    onPreview: (file: DriveFile) => void;
    onDelete?: (file: DriveFile) => void;
    onShare?: (file: DriveFile) => void;
    onShareWithPatient?: (file: DriveFile) => void;
    onShareEmail?: (file: DriveFile) => void;
    onTag?: (file: DriveFile) => void;
    photoTag?: PhotoTag | null;
    onSmileDesign?: (file: DriveFile) => void;
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

export default function DriveFileCard({ file, onPreview, onDelete, onShare, onShareWithPatient, onShareEmail, onTag, photoTag, onSmileDesign }: DriveFileCardProps) {
    const [showShare, setShowShare] = useState(false);
    const category = getFileCategory(file);
    const Icon = ICON_MAP[category];
    const colorClass = COLOR_MAP[category];
    const canPreview = category === 'image' || category === 'video' || category === '3d';
    // google-docs are served by Google directly; the proxy can't download them
    const canDownload = category !== 'google-doc';
    const size = formatFileSize(file.size);
    const hasShare = onShare || onShareWithPatient || onShareEmail;

    const handleClick = () => {
        if (canPreview) {
            onPreview(file);
        } else {
            window.open(file.webViewLink, '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && handleClick()}
            className="text-left rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 p-3 hover:border-blue-300 dark:hover:border-[#C9A96E]/30 hover:shadow-sm transition-all group w-full cursor-pointer"
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
                        className="absolute bottom-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 text-white/80 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-black/80 hover:text-white z-10"
                        title="Descargar"
                    >
                        <Download size={13} />
                    </a>
                )}
                {/* Unified share button + dropdown — next to download (bottom-right) */}
                {hasShare && (
                    <div className="absolute bottom-1.5 right-8 z-20">
                        <button
                            onClick={e => { e.stopPropagation(); setShowShare(s => !s); }}
                            className="p-1.5 rounded-lg bg-black/60 text-white/70 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-black/80 hover:text-white"
                            title="Compartir"
                        >
                            <Share2 size={13} />
                        </button>

                        {showShare && (
                            <>
                                {/* Backdrop */}
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); setShowShare(false); }}
                                />
                                {/* Dropdown opens upward */}
                                <div className="absolute bottom-full right-0 mb-1 w-44 bg-gray-900/95 backdrop-blur-sm border border-white/15 rounded-xl shadow-2xl z-20 overflow-hidden py-1">
                                    {onShare && (
                                        <button
                                            onClick={e => { e.stopPropagation(); setShowShare(false); onShare(file); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-white/70 text-xs hover:bg-white/10 hover:text-white transition-colors"
                                        >
                                            <Share2 size={13} className="text-blue-400 flex-shrink-0" />
                                            AirDrop
                                        </button>
                                    )}
                                    {onShareWithPatient && (
                                        <button
                                            onClick={e => { e.stopPropagation(); setShowShare(false); onShareWithPatient(file); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-white/70 text-xs hover:bg-white/10 hover:text-white transition-colors"
                                        >
                                            <WhatsAppIcon size={13} />
                                            <span className="text-green-400">WhatsApp</span>
                                        </button>
                                    )}
                                    {onShareEmail && (
                                        <button
                                            onClick={e => { e.stopPropagation(); setShowShare(false); onShareEmail(file); }}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-white/70 text-xs hover:bg-white/10 hover:text-white transition-colors"
                                        >
                                            <Mail size={13} className="text-red-400 flex-shrink-0" />
                                            Email
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )}
                {onDelete && (
                    <button
                        onClick={e => { e.stopPropagation(); onDelete(file); }}
                        className="absolute bottom-1.5 left-1.5 p-1.5 rounded-lg bg-black/60 text-white/60 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white z-10"
                        title="Eliminar"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
                {onTag && (
                    <button
                        onClick={e => { e.stopPropagation(); onTag(file); }}
                        className={`absolute top-1.5 left-1.5 p-1.5 rounded-lg bg-black/60 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all z-10 ${photoTag ? 'text-emerald-400 hover:bg-emerald-600' : 'text-white/60 hover:bg-indigo-600 hover:text-white'}`}
                        title="Clasificar foto"
                    >
                        <Tag size={13} />
                    </button>
                )}
                {onSmileDesign && category === 'image' && (
                    <button
                        onClick={e => { e.stopPropagation(); onSmileDesign(file); }}
                        className="absolute top-1.5 right-1.5 p-1.5 rounded-lg bg-black/60 text-purple-300 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-all hover:bg-purple-600 hover:text-white z-10"
                        title="Smile Design con IA"
                    >
                        ✨
                    </button>
                )}
            </div>

            {/* File info */}
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate" title={file.name}>
                {file.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {photoTag ? (() => {
                    const cat = getCategoryDef(photoTag.category);
                    return cat ? (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${cat.bgColor} ${cat.color}`}>
                            {getTagLabel(photoTag.category, photoTag.subcategory)}
                        </span>
                    ) : null;
                })() : null}
                <span className="text-xs text-gray-500 dark:text-white/40">
                    {formatRelativeDate(file.createdTime)}
                </span>
                {size && (
                    <span className="text-xs text-gray-400 dark:text-white/30">{size}</span>
                )}
            </div>
        </motion.div>
    );
}
