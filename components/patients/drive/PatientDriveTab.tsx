'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FolderOpen,
    ChevronDown,
    RefreshCw,
    Loader2,
    AlertCircle,
    FolderPlus,
    ExternalLink,
    GripVertical,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
    getPatientDriveFolders,
    createPatientDriveFolderAction,
    loadFolderFiles,
    getPatientFotosOrder,
    saveFotosOrderAction,
    deleteDriveFileAction,
} from '@/app/actions/patient-files-drive';
import type { DriveFile, FolderWithFiles } from '@/app/actions/patient-files-drive';
import DriveFileCard from './DriveFileCard';
import DrivePreviewModal from './DrivePreviewModal';
import DriveUploadButton from './DriveUploadButton';
import ShareWithPatientModal from './ShareWithPatientModal';
import PhotoTagPanel from './PhotoTagPanel';
import { getPhotoTagsForPatientAction, type PhotoTag } from '@/app/actions/photo-tags';

// ─── Sortable photo card ─────────────────────────────────────────────────────

function SortableFileCard({
    file,
    isPortada,
    onPreview,
    onDelete,
    onShare,
    onShareWithPatient,
    onShareEmail,
    onTag,
    photoTag,
    onSmileDesign,
}: {
    file: DriveFile;
    isPortada: boolean;
    onPreview: (f: DriveFile) => void;
    onDelete?: (f: DriveFile) => void;
    onShare?: (f: DriveFile) => void;
    onShareWithPatient?: (f: DriveFile) => void;
    onShareEmail?: (f: DriveFile) => void;
    onTag?: (f: DriveFile) => void;
    photoTag?: PhotoTag | null;
    onSmileDesign?: (f: DriveFile) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.id });
    const style: CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        zIndex: isDragging ? 20 : undefined,
        position: 'relative',
    };
    return (
        <div ref={setNodeRef} style={style} className="group">
            {isPortada && (
                <div className="absolute top-1 left-1 z-10 px-1.5 py-0.5 rounded bg-[#C9A96E] text-black text-[10px] font-bold leading-tight pointer-events-none select-none">
                    Portada
                </div>
            )}
            <div
                {...attributes}
                {...listeners}
                className="absolute top-1.5 right-1.5 z-10 px-2 py-1.5 rounded-md cursor-grab active:cursor-grabbing bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
                title="Arrastrá para reordenar"
            >
                <GripVertical size={15} className="text-white" />
            </div>
            <DriveFileCard file={file} onPreview={onPreview} onDelete={onDelete} onShare={onShare} onShareWithPatient={onShareWithPatient} onShareEmail={onShareEmail} onTag={onTag} photoTag={photoTag} onSmileDesign={onSmileDesign} />
        </div>
    );
}

function toSlug(str: string): string {
    return str
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function buildPatientPrefix(patientName: string, folderDisplayName: string): string {
    const patientSlug = toSlug(patientName) || 'paciente';
    const folderSlug = toSlug(folderDisplayName) || 'archivo';
    return `${patientSlug}_am-clinica_${folderSlug}`;
}

function extractFolderIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (idMatch && idMatch[1]) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;
    return null;
}

const UPLOAD_ROLES = new Set(['owner', 'admin', 'asistente', 'laboratorio']);

interface PatientDriveTabProps {
    patientId: string;
    patientName: string;
    motherFolderUrl: string | null | undefined;
}

export default function PatientDriveTab({ patientId, patientName, motherFolderUrl }: PatientDriveTabProps) {
    const { categoria: role } = useAuth();
    const canUpload = UPLOAD_ROLES.has(role || '');

    const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
    const [folders, setFolders] = useState<FolderWithFiles[]>([]);
    const [rootFiles, setRootFiles] = useState<DriveFile[]>([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [previewFolderId, setPreviewFolderId] = useState<string>('');
    const [previewAutoSmile, setPreviewAutoSmile] = useState(false);
    const [currentFolderUrl, setCurrentFolderUrl] = useState(motherFolderUrl);
    const [creating, setCreating] = useState(false);
    const [uploadTargetFolderId, setUploadTargetFolderId] = useState(() => extractFolderIdFromUrl(motherFolderUrl) || '');
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);
    const [globalDropFolderId, setGlobalDropFolderId] = useState('');
    const globalDragDepthRef = useRef(0);
    const [fotosOrder, setFotosOrder] = useState<Record<string, string[]>>({});

    // dnd-kit sensors — require 8px move before drag activates (avoids accidental drags on click)
    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    function applySavedOrder(files: DriveFile[], savedOrder: string[]): DriveFile[] {
        if (!savedOrder.length) return files;
        const pos = new Map(savedOrder.map((id, i) => [id, i]));
        return [...files].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity));
    }

    function handleDragEnd(event: DragEndEvent, folderId: string) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return;
        const oldIdx = folder.files.findIndex(f => f.id === String(active.id));
        const newIdx = folder.files.findIndex(f => f.id === String(over.id));
        if (oldIdx === -1 || newIdx === -1) return;
        const reordered = arrayMove(folder.files, oldIdx, newIdx);
        const ids = reordered.map(f => f.id);
        setFolders(prev => prev.map(f => f.id === folderId ? { ...f, files: reordered } : f));
        setFotosOrder(prev => ({ ...prev, [folderId]: ids }));
        void saveFotosOrderAction(patientId, folderId, ids);
    }

    async function handleDeleteFile(file: DriveFile) {
        if (!confirm(`¿Eliminar "${file.name}"? Esta acción no se puede deshacer.`)) return;
        const result = await deleteDriveFileAction(file.id);
        if (result.error) {
            toast.error(`Error al eliminar: ${result.error}`);
            return;
        }
        toast.success(`"${file.name}" eliminado`);
        setFolders(prev => prev.map(f => ({ ...f, files: f.files.filter(fi => fi.id !== file.id) })));
        setRootFiles(prev => prev.filter(fi => fi.id !== file.id));
    }

    function handleShareEmail(file: DriveFile) {
        const subject = encodeURIComponent(`Archivo — ${file.name}`);
        const body    = encodeURIComponent(`Te comparto este archivo de AM Clínica:\n\n${file.webViewLink}`);
        window.open(`mailto:?subject=${subject}&body=${body}`, '_blank');
    }

    async function handleShareFile(file: DriveFile) {
        try {
            const res = await fetch(`/api/drive/file/${file.id}`);
            const blob = await res.blob();
            const shareFile = new File([blob], file.name, { type: blob.type });
            if (navigator.canShare?.({ files: [shareFile] })) {
                await navigator.share({ files: [shareFile], title: file.name });
            } else {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = file.name;
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                toast.info('Tu browser no soporta AirDrop — se descargó el archivo');
            }
        } catch (err) {
            if (err instanceof Error && err.name !== 'AbortError')
                toast.error('No se pudo compartir');
        }
    }

    const [sharePatientFile, setSharePatientFile] = useState<DriveFile | null>(null);
    const [tagFile, setTagFile] = useState<DriveFile | null>(null);
    const [photoTags, setPhotoTags] = useState<Record<string, PhotoTag>>({});

    const fetchFolders = useCallback(async (url: string) => {
        const folderId = extractFolderIdFromUrl(url);
        if (!folderId) {
            setErrorMsg('No se pudo extraer el ID de la carpeta de Drive');
            setStatus('error');
            return;
        }

        setStatus('loading');
        const result = await getPatientDriveFolders(folderId);

        if (result.error) {
            setErrorMsg(result.error);
            setStatus('error');
            return;
        }

        // Load saved photo order for all folders
        const orderData = await getPatientFotosOrder(patientId);
        setFotosOrder(orderData);

        // Auto-expand the FOTO & VIDEO folder (or first folder with "foto"/"video" in name)
        const fotoFolder = result.folders.find(f => /foto|video/i.test(f.displayName));
        let foldersToSet = result.folders;
        const autoOpenIds = new Set<string>();
        if (fotoFolder) {
            const filesResult = await loadFolderFiles(fotoFolder.id);
            const sortedFiles = applySavedOrder(filesResult.files, orderData[fotoFolder.id] ?? []);
            foldersToSet = result.folders.map(f =>
                f.id === fotoFolder.id ? { ...f, files: sortedFiles, loaded: true } : f
            );
            autoOpenIds.add(fotoFolder.id);
        }

        setFolders(foldersToSet);
        setRootFiles(result.rootFiles);
        setOpenFolders(autoOpenIds);
        setLoadingFolders(new Set());
        setStatus('loaded');

        // Load photo tags for this patient
        const tags = await getPhotoTagsForPatientAction(patientId);
        const tagMap: Record<string, PhotoTag> = {};
        for (const t of tags) tagMap[t.file_id] = t;
        setPhotoTags(tagMap);
    }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (currentFolderUrl && status === 'idle') {
            queueMicrotask(() => {
                void fetchFolders(currentFolderUrl);
            });
        }
    }, [currentFolderUrl, status, fetchFolders]);

    function openPreview(file: DriveFile, folderId: string) {
        setPreviewAutoSmile(false);
        setPreviewFile(file);
        setPreviewFolderId(folderId);
    }

    function openSmileDesign(file: DriveFile, folderId: string) {
        setPreviewAutoSmile(true);
        setPreviewFile(file);
        setPreviewFolderId(folderId);
    }

    const handleRefresh = () => {
        if (currentFolderUrl) {
            setStatus('idle');
            fetchFolders(currentFolderUrl);
        }
    };

    const handleCreateFolder = async () => {
        setCreating(true);
        const [apellido, nombre] = patientName.includes(',')
            ? patientName.split(',').map(s => s.trim())
            : [patientName.split(' ').pop() || '', patientName.split(' ').slice(0, -1).join(' ')];

        const result = await createPatientDriveFolderAction(patientId, apellido, nombre);

        if (result.error) {
            toast.error(`Error creando carpeta: ${result.error}`);
            setCreating(false);
            return;
        }

        if (result.motherFolderUrl) {
            const nextMotherFolderId = extractFolderIdFromUrl(result.motherFolderUrl);
            setCurrentFolderUrl(result.motherFolderUrl);
            if (nextMotherFolderId) setUploadTargetFolderId(nextMotherFolderId);
            setStatus('idle');
            toast.success('Carpeta de Drive creada correctamente');
        }
        setCreating(false);
    };

    const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());

    const toggleFolder = async (folderId: string) => {
        if (openFolders.has(folderId)) {
            // Collapse
            setOpenFolders(prev => {
                const next = new Set(prev);
                next.delete(folderId);
                return next;
            });
            return;
        }

        // Expand — lazy load files if not loaded yet
        const folder = folders.find(f => f.id === folderId);
        if (folder && !folder.loaded) {
            setLoadingFolders(prev => new Set(prev).add(folderId));

            const result = await loadFolderFiles(folderId);
            const sortedFiles = applySavedOrder(result.files, fotosOrder[folderId] ?? []);

            setFolders(prev => prev.map(f =>
                f.id === folderId
                    ? { ...f, files: sortedFiles, loaded: true }
                    : f
            ));
            setLoadingFolders(prev => {
                const next = new Set(prev);
                next.delete(folderId);
                return next;
            });
        }

        // Open the folder
        setOpenFolders(prev => new Set(prev).add(folderId));
    };

    const motherFolderId = extractFolderIdFromUrl(currentFolderUrl);
    const validUploadTargetIds = new Set([motherFolderId, ...folders.map((folder) => folder.id)].filter(Boolean) as string[]);
    const effectiveUploadTargetFolderId =
        uploadTargetFolderId && validUploadTargetIds.has(uploadTargetFolderId)
            ? uploadTargetFolderId
            : (motherFolderId || '');
    const primaryOpenFolderId = folders.find((folder) => openFolders.has(folder.id))?.id || '';
    const defaultGlobalDropTargetId = primaryOpenFolderId || effectiveUploadTargetFolderId;
    const effectiveGlobalDropFolderId =
        globalDropFolderId && validUploadTargetIds.has(globalDropFolderId)
            ? globalDropFolderId
            : defaultGlobalDropTargetId;

    const getFolderDestinationName = (folderId: string) => {
        if (!folderId) return 'destino seleccionado';
        if (folderId === motherFolderId) return 'carpeta raiz';
        const folder = folders.find((item) => item.id === folderId);
        return folder?.displayName || 'carpeta seleccionada';
    };

    const buildUploadSuccessMessage = (folderId: string, count: number) => {
        const destinationName = getFolderDestinationName(folderId);
        return `${count} archivo${count > 1 ? 's' : ''} subido${count > 1 ? 's' : ''} a ${destinationName}`;
    };

    const handleUploadedToFolder = async (folderId: string) => {
        if (!folderId) {
            handleRefresh();
            return;
        }

        setUploadTargetFolderId(folderId);
        setGlobalDropFolderId(folderId);

        if (motherFolderId && folderId !== motherFolderId) {
            setOpenFolders((prev) => {
                const next = new Set(prev);
                next.add(folderId);
                return next;
            });
        }

        // Reload only this folder's files instead of full refresh
        if (folderId !== motherFolderId) {
            const result = await loadFolderFiles(folderId);
            setFolders(prev => prev.map(f =>
                f.id === folderId
                    ? { ...f, files: result.files, loaded: true }
                    : f
            ));
        } else {
            handleRefresh();
        }
    };

    const isFileDrag = (event: DragEvent<HTMLElement>) =>
        Array.isArray(event?.dataTransfer?.types)
            ? event.dataTransfer.types.includes('Files')
            : Array.from(event?.dataTransfer?.types || []).includes('Files');

    const resetGlobalDrag = () => {
        globalDragDepthRef.current = 0;
        setIsGlobalDragging(false);
    };

    const handleGlobalDragEnter = (event: DragEvent<HTMLElement>) => {
        if (!canUpload || !isFileDrag(event)) return;
        event.preventDefault();
        globalDragDepthRef.current += 1;
        setIsGlobalDragging(true);
        if (defaultGlobalDropTargetId) {
            setGlobalDropFolderId(defaultGlobalDropTargetId);
        }
    };

    const handleGlobalDragOver = (event: DragEvent<HTMLElement>) => {
        if (!canUpload || !isFileDrag(event)) return;
        event.preventDefault();
    };

    const handleGlobalDragLeave = (event: DragEvent<HTMLElement>) => {
        if (!canUpload || !isFileDrag(event)) return;
        event.preventDefault();
        globalDragDepthRef.current = Math.max(0, globalDragDepthRef.current - 1);
        if (globalDragDepthRef.current === 0) {
            setIsGlobalDragging(false);
        }
    };

    const handleGlobalDrop = (event: DragEvent<HTMLElement>) => {
        if (!canUpload || !isFileDrag(event)) return;
        resetGlobalDrag();
    };

    // Empty state: no Drive folder configured
    if (!currentFolderUrl) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="h-16 w-16 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center mb-4">
                    <FolderOpen size={28} className="text-gray-400 dark:text-white/30" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                    Sin carpeta en Drive
                </h3>
                <p className="text-sm text-gray-500 dark:text-white/40 max-w-sm mb-6">
                    Este paciente no tiene una carpeta de Google Drive asociada. Creá una para organizar sus archivos.
                </p>
                {canUpload && (
                    <button
                        onClick={handleCreateFolder}
                        disabled={creating}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {creating ? (
                            <Loader2 size={16} className="animate-spin" />
                        ) : (
                            <FolderPlus size={16} />
                        )}
                        Crear carpeta en Drive
                    </button>
                )}
            </div>
        );
    }

    // Loading state
    if (status === 'loading' || status === 'idle') {
        return (
            <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="text-blue-500 animate-spin" />
                <span className="ml-3 text-sm text-gray-500 dark:text-white/40">Cargando archivos de Drive...</span>
            </div>
        );
    }

    // Error state
    if (status === 'error') {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-center">
                <AlertCircle size={28} className="text-red-400 mb-3" />
                <p className="text-sm text-gray-500 dark:text-white/40 max-w-md mb-4">{errorMsg}</p>
                <button
                    onClick={handleRefresh}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 text-sm text-gray-700 dark:text-white/70 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors"
                >
                    <RefreshCw size={14} />
                    Reintentar
                </button>
            </div>
        );
    }

    const loadedFiles = folders.reduce((acc, f) => acc + f.files.length, 0) + rootFiles.length;
    const allFoldersLoaded = folders.every(f => f.loaded);

    return (
        <div className="flex gap-0 items-start">
        <div
            className="flex-1 min-w-0 space-y-4 relative"
            onDragEnterCapture={handleGlobalDragEnter}
            onDragOverCapture={handleGlobalDragOver}
            onDragLeaveCapture={handleGlobalDragLeave}
            onDrop={handleGlobalDrop}
            onDragEnd={resetGlobalDrag}
        >
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FolderOpen size={18} className="text-blue-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {allFoldersLoaded
                            ? `${loadedFiles} archivo${loadedFiles !== 1 ? 's' : ''} en `
                            : ''
                        }{folders.length} carpeta{folders.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <a
                        href={currentFolderUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <ExternalLink size={14} />
                        Abrir en Drive
                    </a>
                    <button
                        onClick={handleRefresh}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                    >
                        <RefreshCw size={14} />
                        Refrescar
                    </button>
                </div>
            </div>

            {rootFiles.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-white/30 uppercase tracking-wider">
                        Archivos raíz
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {rootFiles.map(file => (
                            <DriveFileCard key={file.id} file={file} onPreview={f => openPreview(f, motherFolderId || '')} onDelete={canUpload ? handleDeleteFile : undefined} onShare={handleShareFile} onShareWithPatient={setSharePatientFile} onShareEmail={handleShareEmail} onTag={canUpload ? setTagFile : undefined} photoTag={photoTags[file.id]} onSmileDesign={f => openSmileDesign(f, motherFolderId || '')} />
                        ))}
                    </div>
                </div>
            )}

            {/* Subfolders as accordion */}
            <div className="space-y-2">
                {folders.map(folder => {
                    const isOpen = openFolders.has(folder.id);
                    const isDropTarget = isGlobalDragging && effectiveGlobalDropFolderId === folder.id;
                    const isLoading = loadingFolders.has(folder.id);

                    return (
                        <motion.div
                            key={folder.id}
                            animate={{
                                scale: isDropTarget ? 1.01 : 1,
                                y: isDropTarget ? -2 : 0,
                            }}
                            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                            className={`rounded-xl border overflow-hidden transition-all ${isDropTarget
                                ? 'border-blue-500 ring-2 ring-blue-500/40'
                                : 'border-gray-200 dark:border-white/10'
                                }`}
                        >
                            {/* Folder header — div instead of button to allow nested DriveUploadButton */}
                            <div
                                role="button"
                                tabIndex={isLoading ? -1 : 0}
                                aria-expanded={isOpen}
                                onClick={() => !isLoading && toggleFolder(folder.id)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); !isLoading && toggleFolder(folder.id); } }}
                                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors cursor-pointer select-none${isLoading ? ' opacity-70 pointer-events-none' : ''}`}
                            >
                                {isLoading ? (
                                    <Loader2 size={16} className="text-blue-400 animate-spin" />
                                ) : (
                                    <motion.div
                                        animate={{ rotate: isOpen ? 180 : 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <ChevronDown size={16} className="text-gray-400" />
                                    </motion.div>
                                )}
                                <FolderOpen size={16} className="text-yellow-500" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">
                                    {folder.displayName}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-white/30 mr-2">
                                    {isLoading
                                        ? 'Cargando...'
                                        : folder.loaded
                                            ? `${folder.files.length} archivo${folder.files.length !== 1 ? 's' : ''}`
                                            : 'Clic para ver'
                                    }
                                </span>
                                {canUpload && (
                                    <span onClick={e => e.stopPropagation()}>
                                        <DriveUploadButton
                                            folderId={folder.id}
                                            patientId={patientId}
                                            onUploaded={() => handleUploadedToFolder(folder.id)}
                                            successMessage={(count) => buildUploadSuccessMessage(folder.id, count)}
                                            fileNamePrefix={buildPatientPrefix(patientName, folder.displayName)}
                                        />
                                    </span>
                                )}
                            </div>

                            {/* Folder contents */}
                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="px-4 pb-4 pt-1">
                                            {folder.files.length === 0 ? (
                                                <p className="text-sm text-gray-400 dark:text-white/20 py-4 text-center">
                                                    Carpeta vacía
                                                </p>
                                            ) : (
                                                <DndContext
                                                    sensors={dndSensors}
                                                    collisionDetection={closestCenter}
                                                    onDragEnd={e => handleDragEnd(e, folder.id)}
                                                >
                                                    <SortableContext
                                                        items={folder.files.map(f => f.id)}
                                                        strategy={rectSortingStrategy}
                                                    >
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                            {folder.files.map((file, idx) => (
                                                                <SortableFileCard
                                                                    key={file.id}
                                                                    file={file}
                                                                    isPortada={idx === 0 && file.mimeType.startsWith('image/')}
                                                                    onPreview={f => openPreview(f, folder.id)}
                                                                    onDelete={canUpload ? handleDeleteFile : undefined}
                                                                    onShare={handleShareFile}
                                                                    onShareWithPatient={setSharePatientFile}
                                                                    onShareEmail={handleShareEmail}
                                                                    onTag={canUpload ? setTagFile : undefined}
                                                                    photoTag={photoTags[file.id]}
                                                                    onSmileDesign={f => openSmileDesign(f, folder.id)}
                                                                />
                                                            ))}
                                                        </div>
                                                    </SortableContext>
                                                </DndContext>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    );
                })}
            </div>

            {canUpload && isGlobalDragging && effectiveGlobalDropFolderId && (
                <div className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[1px] p-4 sm:p-8">
                    <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-blue-400/35 bg-slate-950/85 p-4 shadow-2xl">
                        <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                            <p className="text-sm font-semibold text-white">
                                Soltá archivos para subir a Drive
                            </p>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-300">Destino</span>
                                <select
                                    value={effectiveGlobalDropFolderId}
                                    onChange={(event) => setGlobalDropFolderId(event.target.value)}
                                    className="text-xs rounded-md px-2 py-1 bg-slate-900 border border-slate-700 text-slate-100"
                                >
                                    {motherFolderId && (
                                        <option value={motherFolderId}>Carpeta raíz del paciente</option>
                                    )}
                                    {folders.map((folder) => (
                                        <option key={folder.id} value={folder.id}>
                                            {folder.displayName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <DriveUploadButton
                            variant="dropzone"
                            folderId={effectiveGlobalDropFolderId}
                            patientId={patientId}
                            successMessage={(count) => buildUploadSuccessMessage(effectiveGlobalDropFolderId, count)}
                            onUploaded={() => {
                                resetGlobalDrag();
                                handleUploadedToFolder(effectiveGlobalDropFolderId);
                            }}
                            dropzoneTitle="Soltá archivos en cualquier parte"
                            dropzoneHint="También podés hacer clic para elegir archivos"
                            dropzoneClassName="p-10 border-blue-400/70 bg-blue-500/5"
                            fileNamePrefix={
                                effectiveGlobalDropFolderId === motherFolderId
                                    ? buildPatientPrefix(patientName, 'archivos')
                                    : buildPatientPrefix(patientName, folders.find(f => f.id === effectiveGlobalDropFolderId)?.displayName || 'archivos')
                            }
                        />
                    </div>
                </div>
            )}

            {/* Compartir con paciente */}
            {sharePatientFile && (
                <ShareWithPatientModal
                    files={[{
                        id: sharePatientFile.id,
                        name: sharePatientFile.name,
                        driveFileId: sharePatientFile.id,
                    }]}
                    folderId={previewFolderId || motherFolderId || undefined}
                    patientId={patientId}
                    patientName={patientName}
                    onClose={() => setSharePatientFile(null)}
                />
            )}

            {/* Preview modal */}
            <DrivePreviewModal
                file={previewFile}
                folderId={previewFolderId}
                patientId={patientId}
                patientName={patientName}
                canSave={canUpload}
                allFolderFiles={
                    previewFolderId === motherFolderId
                        ? rootFiles.filter(f => f.mimeType.toLowerCase().startsWith('image/'))
                        : (folders.find(f => f.id === previewFolderId)?.files ?? [])
                            .filter(f => f.mimeType.toLowerCase().startsWith('image/'))
                }
                autoStartSmile={previewAutoSmile}
                onClose={() => { setPreviewFile(null); setPreviewFolderId(''); setPreviewAutoSmile(false); }}
                onSaved={() => {
                    // Refresca la carpeta pero mantiene el estudio abierto
                    handleUploadedToFolder(previewFolderId);
                }}
            />
        </div>

        {/* Tag panel — right sidebar */}
        {tagFile && (
            <PhotoTagPanel
                file={tagFile}
                patientId={patientId}
                currentTag={photoTags[tagFile.id] ?? null}
                onClose={() => setTagFile(null)}
                onTagSaved={(tag) => {
                    setPhotoTags(prev => {
                        const next = { ...prev };
                        if (tag) next[tag.file_id] = tag;
                        else delete next[tagFile.id];
                        return next;
                    });
                }}
            />
        )}
        </div>
    );
}
