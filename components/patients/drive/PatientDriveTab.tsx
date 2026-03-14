'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FolderOpen,
    ChevronDown,
    RefreshCw,
    Loader2,
    AlertCircle,
    FolderPlus,
    ExternalLink,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
    getPatientDriveFolders,
    createPatientDriveFolderAction,
    loadFolderFiles,
} from '@/app/actions/patient-files-drive';
import type { DriveFile, FolderWithFiles } from '@/app/actions/patient-files-drive';
import DriveFileCard from './DriveFileCard';

function extractFolderIdFromUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    const folderMatch = url.match(/folders\/([a-zA-Z0-9_-]{25,})/);
    if (folderMatch && folderMatch[1]) return folderMatch[1];
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]{25,})/);
    if (idMatch && idMatch[1]) return idMatch[1];
    if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url;
    return null;
}
import DrivePreviewModal from './DrivePreviewModal';
import DriveUploadButton from './DriveUploadButton';

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
    const [currentFolderUrl, setCurrentFolderUrl] = useState(motherFolderUrl);
    const [creating, setCreating] = useState(false);
    const [uploadTargetFolderId, setUploadTargetFolderId] = useState(() => extractFolderIdFromUrl(motherFolderUrl) || '');
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);
    const [globalDropFolderId, setGlobalDropFolderId] = useState('');
    const globalDragDepthRef = useRef(0);

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

        setFolders(result.folders);
        setRootFiles(result.rootFiles);
        // Don't auto-open — files are lazy loaded now
        setOpenFolders(new Set());
        setLoadingFolders(new Set());
        setStatus('loaded');
    }, []);

    useEffect(() => {
        if (currentFolderUrl && status === 'idle') {
            queueMicrotask(() => {
                void fetchFolders(currentFolderUrl);
            });
        }
    }, [currentFolderUrl, status, fetchFolders]);

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

            setFolders(prev => prev.map(f =>
                f.id === folderId
                    ? { ...f, files: result.files, loaded: true }
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
    const isRootTargetHighlighted = isGlobalDragging && effectiveGlobalDropFolderId === motherFolderId;

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
        <div
            className="space-y-4 relative"
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

            {/* Root files (directly in mother folder) */}
            {canUpload && motherFolderId && (
                <motion.div
                    animate={{
                        scale: isRootTargetHighlighted ? 1.01 : 1,
                        y: isRootTargetHighlighted ? -2 : 0,
                    }}
                    transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                    className={`rounded-xl border bg-white/50 dark:bg-white/[0.02] p-4 space-y-3 transition-all ${isRootTargetHighlighted
                        ? 'border-blue-500 ring-2 ring-blue-500/40'
                        : 'border-gray-200 dark:border-white/10'
                        }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <p className="text-xs font-semibold text-gray-600 dark:text-white/60 uppercase tracking-wider">
                            Carga rápida
                        </p>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-white/40">Destino</span>
                            <select
                                value={effectiveUploadTargetFolderId}
                                onChange={(event) => setUploadTargetFolderId(event.target.value)}
                                className="text-xs rounded-md px-2 py-1 bg-white dark:bg-white/5 border border-gray-300 dark:border-white/15 text-gray-700 dark:text-white"
                            >
                                <option value={motherFolderId}>Carpeta raíz del paciente</option>
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
                        folderId={effectiveUploadTargetFolderId}
                        patientId={patientId}
                        onUploaded={() => handleUploadedToFolder(effectiveUploadTargetFolderId)}
                        successMessage={(count) => buildUploadSuccessMessage(effectiveUploadTargetFolderId, count)}
                        dropzoneTitle="Arrastrá archivos o hacé clic para subir"
                        dropzoneHint="Podés subir varios archivos a la vez"
                    />
                </motion.div>
            )}

            {rootFiles.length > 0 && (
                <div className="space-y-2">
                    <p className="text-xs font-medium text-gray-500 dark:text-white/30 uppercase tracking-wider">
                        Archivos raíz
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {rootFiles.map(file => (
                            <DriveFileCard key={file.id} file={file} onPreview={setPreviewFile} />
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
                                            {canUpload && (
                                                <div className="mb-3">
                                                    <DriveUploadButton
                                                        variant="dropzone"
                                                        folderId={folder.id}
                                                        patientId={patientId}
                                                        onUploaded={() => handleUploadedToFolder(folder.id)}
                                                        successMessage={(count) => buildUploadSuccessMessage(folder.id, count)}
                                                        dropzoneTitle={`Soltá archivos en ${folder.displayName}`}
                                                        dropzoneHint="Carga directa en esta carpeta"
                                                        dropzoneClassName="p-6"
                                                    />
                                                </div>
                                            )}

                                            {folder.files.length === 0 ? (
                                                <p className="text-sm text-gray-400 dark:text-white/20 py-4 text-center">
                                                    Carpeta vacía
                                                </p>
                                            ) : (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                    {folder.files.map(file => (
                                                        <DriveFileCard
                                                            key={file.id}
                                                            file={file}
                                                            onPreview={setPreviewFile}
                                                        />
                                                    ))}
                                                </div>
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
                        />
                    </div>
                </div>
            )}

            {/* Preview modal */}
            <DrivePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
        </div>
    );
}
