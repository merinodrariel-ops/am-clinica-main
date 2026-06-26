'use client';

import { useState, useEffect, useCallback, useRef, type DragEvent, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FolderOpen,
    RefreshCw,
    Loader2,
    AlertCircle,
    ExternalLink,
    GripVertical,
    FileImage,
    Video,
    Layers,
    Presentation,
    FileText,
    FileCode,
    Sparkles,
} from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, rectSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
    getPatientAllFilesAction,
    extractSlidesAsImagesAction,
    createPatientDriveFolderAction,
    getPatientFotosOrder,
    saveFotosOrderAction,
    deleteDriveFileAction,
} from '@/app/actions/patient-files-drive';
import type { DriveFile } from '@/app/actions/patient-files-drive';
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
    onSetPortada,
    patientFolder,
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
    onSetPortada?: (f: DriveFile) => void;
    patientFolder?: string;
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
            <DriveFileCard file={file} onPreview={onPreview} onDelete={onDelete} onShare={onShare} onShareWithPatient={onShareWithPatient} onShareEmail={onShareEmail} onTag={onTag} photoTag={photoTag} onSmileDesign={onSmileDesign} isPortada={isPortada} onSetPortada={onSetPortada} patientFolder={patientFolder} />
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

function getFormattedFolderName(patientName: string): string {
    const parts = patientName.split(',');
    if (parts.length === 2) {
        const apellido = parts[0].trim().toUpperCase();
        const nombre = parts[1].trim();
        const formattedNombre = nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1).toLowerCase() : '';
        return `${apellido}, ${formattedNombre}`;
    }
    return patientName.trim();
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

function classifyFile(file: DriveFile): 'exocad' | 'redes' | 'foto' | 'video' | '3d' | 'presentacion' | 'documentacion' | 'otros' {
    if (file.parentName === 'Redes' || (file.parentName && (file.parentName.startsWith('[Selección]') || file.parentName.includes('Selección') || file.parentName.includes('Seleccion')))) {
        return 'redes';
    }
    const name = (file.name || '').toLowerCase();
    const mime = (file.mimeType || '').toLowerCase();

    // 0. Exocad Project Files
    if (
        name.endsWith('.project') ||
        name.endsWith('.projects') ||
        name.endsWith('.dentalproject')
    ) {
        return 'exocad';
    }

    // 1. Photos
    if (mime.startsWith('image/')) {
        return 'foto';
    }
    // 2. Videos
    if (mime.startsWith('video/')) {
        return 'video';
    }
    // 3. Presentations (Google Slides, PPTX, Keynote)
    if (
        mime.includes('presentation') ||
        mime.includes('powerpoint') ||
        name.endsWith('.pptx') ||
        name.endsWith('.ppt') ||
        name.endsWith('.key') ||
        name.endsWith('.gslides')
    ) {
        return 'presentacion';
    }
    // 4. 3D Files / Escaneos (excluding Exocad project files)
    if (
        name.endsWith('.stl') ||
        name.endsWith('.obj') ||
        name.endsWith('.ply') ||
        name.endsWith('.3dx') ||
        mime.includes('3d') ||
        mime.includes('mesh') ||
        name.includes('3d') ||
        name.includes('escaneo')
    ) {
        return '3d';
    }
    // 5. Budgets / Contracts / Documents / PDFs
    if (
        mime.includes('pdf') ||
        mime.includes('word') ||
        mime.includes('document') ||
        mime.includes('spreadsheet') ||
        mime.includes('excel') ||
        name.endsWith('.pdf') ||
        name.endsWith('.docx') ||
        name.endsWith('.doc') ||
        name.endsWith('.xlsx') ||
        name.endsWith('.xls') ||
        name.includes('presupuesto') ||
        name.includes('contrato')
    ) {
        return 'documentacion';
    }
    return 'otros';
}

function applySavedOrder(files: DriveFile[], savedOrder: string[]): DriveFile[] {
    if (!savedOrder.length) return files;
    const pos = new Map(savedOrder.map((id, i) => [id, i]));
    return [...files].sort((a, b) => (pos.get(a.id) ?? Infinity) - (pos.get(b.id) ?? Infinity));
}

const UPLOAD_ROLES = new Set(['owner', 'admin', 'asistente', 'laboratorio']);

interface PatientDriveTabProps {
    patientId: string;
    patientName: string;
    motherFolderUrl: string | null | undefined;
}

export default function PatientDriveTab({ patientId, patientName, motherFolderUrl }: PatientDriveTabProps) {
    const { categoria: role, profile } = useAuth();
    const canUpload = UPLOAD_ROLES.has(role || '');

    const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [previewFolderId, setPreviewFolderId] = useState<string>('');
    const [previewAutoSmile, setPreviewAutoSmile] = useState(false);
    const [currentFolderUrl, setCurrentFolderUrl] = useState(motherFolderUrl);
    const [creating, setCreating] = useState(false);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);
    const globalDragDepthRef = useRef(0);
    const [fotosOrder, setFotosOrder] = useState<Record<string, string[]>>({});
    const [extractingSlidesId, setExtractingSlidesId] = useState<string | null>(null);
    const [sharePatientFile, setSharePatientFile] = useState<DriveFile | null>(null);
    const [tagFile, setTagFile] = useState<DriveFile | null>(null);
    const [photoTags, setPhotoTags] = useState<Record<string, PhotoTag>>({});

    // dnd-kit sensors — require 8px move before drag activates (avoids accidental drags on click)
    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

    const fetchFolders = useCallback(async (url: string) => {
        const folderId = extractFolderIdFromUrl(url);
        if (!folderId) {
            setErrorMsg('No se pudo extraer el ID de la carpeta de Drive');
            setStatus('error');
            return;
        }

        setStatus('loading');
        const result = await getPatientAllFilesAction(folderId);

        if (result.error) {
            setErrorMsg(result.error);
            setStatus('error');
            return;
        }

        setFiles(result.files || []);

        // Load saved photo order
        const orderData = await getPatientFotosOrder(patientId);
        setFotosOrder(orderData);

        setStatus('loaded');

        // Load photo tags for this patient
        const tags = await getPhotoTagsForPatientAction(patientId);
        const tagMap: Record<string, PhotoTag> = {};
        for (const t of tags) tagMap[t.file_id] = t;
        setPhotoTags(tagMap);
    }, [patientId]);

    useEffect(() => {
        if (currentFolderUrl && status === 'idle') {
            queueMicrotask(() => {
                void fetchFolders(currentFolderUrl);
            });
        }
    }, [currentFolderUrl, status, fetchFolders]);

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const photos = files.filter(f => classifyFile(f) === 'foto');
        const oldIdx = photos.findIndex(f => f.id === String(active.id));
        const newIdx = photos.findIndex(f => f.id === String(over.id));
        if (oldIdx === -1 || newIdx === -1) return;

        const reordered = arrayMove(photos, oldIdx, newIdx);
        const ids = reordered.map(f => f.id);
        const coverFileId = reordered[0]?.id || undefined;

        // Update files in state
        const otherFiles = files.filter(f => classifyFile(f) !== 'foto');
        setFiles([...reordered, ...otherFiles]);

        const motherFolderId = extractFolderIdFromUrl(currentFolderUrl) || '';
        setFotosOrder(prev => ({ ...prev, [motherFolderId]: ids }));

        void saveFotosOrderAction(patientId, motherFolderId, ids, coverFileId).then(result => {
            if (result.error) {
                toast.error(`No se pudo guardar la portada: ${result.error}`);
            }
        });
    }

    function handleSetPortada(file: DriveFile) {
        const photos = files.filter(f => classifyFile(f) === 'foto');
        const idx = photos.findIndex(f => f.id === file.id);
        if (idx < 0) return;
        const reordered = [photos[idx], ...photos.slice(0, idx), ...photos.slice(idx + 1)];
        const otherFiles = files.filter(f => classifyFile(f) !== 'foto');
        setFiles([...reordered, ...otherFiles]);
        const ids = reordered.map(f => f.id);
        const motherFolderId = extractFolderIdFromUrl(currentFolderUrl) || '';
        setFotosOrder(prev => ({ ...prev, [motherFolderId]: ids }));
        void saveFotosOrderAction(patientId, motherFolderId, ids, file.id).then(result => {
            if (result.error) {
                toast.error(`No se pudo guardar la portada: ${result.error}`);
            } else {
                toast.success('Foto de portada actualizada');
            }
        });
    }

    async function handleDeleteFile(file: DriveFile) {
        if (!confirm(`¿Eliminar "${file.name}"? Esta acción no se puede deshacer.`)) return;
        const result = await deleteDriveFileAction(file.id);
        if (result.error) {
            toast.error(`Error al eliminar: ${result.error}`);
            return;
        }
        toast.success(`"${file.name}" eliminado`);
        setFiles(prev => prev.filter(fi => fi.id !== file.id));
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

    async function handleExtractSlides(fileId: string) {
        if (extractingSlidesId) return;
        setExtractingSlidesId(fileId);

        toast.info('Extrayendo diapositivas como imágenes PNG. Esto puede demorar unos segundos...');
        const motherFolderId = extractFolderIdFromUrl(currentFolderUrl) || '';
        const profesional = profile?.full_name || role || 'Importación automática';
        const res = await extractSlidesAsImagesAction(fileId, motherFolderId, { patientId, profesional });

        if (res.success) {
            const textMsg = res.textSaved ? ' El texto se guardó en la historia clínica.' : '';
            toast.success(`Se extrajeron ${res.extractedCount} diapositivas correctamente.${textMsg}`);
            void fetchFolders(currentFolderUrl!);
        } else {
            toast.error(`Error al extraer diapositivas: ${res.error || 'error desconocido'}`);
        }
        setExtractingSlidesId(null);
    }

    const openPreview = (file: DriveFile, folderId: string) => {
        setPreviewAutoSmile(false);
        setPreviewFile(file);
        setPreviewFolderId(folderId);
    };

    const openSmileDesign = (file: DriveFile, folderId: string) => {
        setPreviewAutoSmile(true);
        setPreviewFile(file);
        setPreviewFolderId(folderId);
    };

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
            setCurrentFolderUrl(result.motherFolderUrl);
            setStatus('idle');
            toast.success('Carpeta de Drive creada correctamente');
        }
        setCreating(false);
    };

    const handleUploadedToFolder = () => {
        handleRefresh();
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
                            <FolderOpen size={16} />
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
                <span className="ml-3 text-sm text-gray-500 dark:text-white/40">Cargando documentación...</span>
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

    const motherFolderId = extractFolderIdFromUrl(currentFolderUrl) || '';

    // Classify files
    const classifiedGroups = {
        exocad: { title: 'Proyectos Exocad', icon: <Sparkles size={16} className="text-orange-400 animate-pulse" />, files: [] as DriveFile[] },
        foto: { title: 'Fotos', icon: <FileImage size={16} className="text-emerald-500" />, files: [] as DriveFile[] },
        video: { title: 'Videos', icon: <Video size={16} className="text-amber-500" />, files: [] as DriveFile[] },
        '3d': { title: 'Escaneos y Diseños 3D', icon: <Layers size={16} className="text-indigo-500" />, files: [] as DriveFile[] },
        presentacion: { title: 'Presentaciones', icon: <Presentation size={16} className="text-blue-500" />, files: [] as DriveFile[] },
        documentacion: { title: 'Presupuestos y Documentación', icon: <FileText size={16} className="text-rose-500" />, files: [] as DriveFile[] },
        otros: { title: 'Otros Archivos', icon: <FileCode size={16} className="text-slate-400" />, files: [] as DriveFile[] },
        redes: { title: 'Selección', icon: <Sparkles size={16} className="text-purple-400" />, files: [] as DriveFile[] }
    };

    for (const file of files) {
        const cat = classifyFile(file);
        classifiedGroups[cat].files.push(file);
    }

    // Apply sorting to Fotos
    const savedOrder = fotosOrder[motherFolderId] || [];
    if (savedOrder.length > 0) {
        classifiedGroups.foto.files = applySavedOrder(classifiedGroups.foto.files, savedOrder);
    }

    // Sort 'exocad' files: ordered by modifiedTime descending (newest first)
    classifiedGroups.exocad.files.sort((a, b) => {
        const timeA = new Date(a.modifiedTime || a.createdTime).getTime();
        const timeB = new Date(b.modifiedTime || b.createdTime).getTime();
        return timeB - timeA;
    });

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
                <div className="flex items-center justify-between bg-white/5 dark:bg-navy-900/40 p-4 rounded-xl border border-white/5">
                    <div className="flex items-center gap-2">
                        <FolderOpen size={18} className="text-blue-500" />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                            {files.length} archivo{files.length !== 1 ? 's' : ''} en total
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        {canUpload && (
                            <DriveUploadButton
                                folderId={motherFolderId}
                                patientId={patientId}
                                onUploaded={handleUploadedToFolder}
                                successMessage={(count) => `${count} archivo(s) subido(s) correctamente`}
                                fileNamePrefix={buildPatientPrefix(patientName, 'archivos')}
                            />
                        )}
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
                            onClick={() => {
                                const formattedFolder = getFormattedFolderName(patientName);
                                const protocolUrl = `am-clinica-exocad://open?patientFolder=${encodeURIComponent(formattedFolder)}&path=`;
                                window.location.href = protocolUrl;
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-orange-400 dark:text-orange-400/80 hover:bg-orange-500/10 border border-orange-500/20 transition-colors"
                            title="Abrir la carpeta local de Google Drive para este paciente"
                        >
                            <FolderOpen size={14} />
                            Carpeta Local
                        </button>
                        <button
                            onClick={handleRefresh}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-white/40 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <RefreshCw size={14} />
                            Refrescar
                        </button>
                    </div>
                </div>

                {files.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-center bg-white/5 dark:bg-navy-950/10 rounded-xl border border-dashed border-white/5">
                        <p className="text-sm text-gray-400 dark:text-white/20 mb-2">La carpeta del paciente está vacía</p>
                        <p className="text-xs text-gray-500 dark:text-white/10">Arrastra archivos aquí para subirlos a la documentación del paciente</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {Object.entries(classifiedGroups).map(([key, group]) => {
                            if (group.files.length === 0) return null;

                            const isCoverFolder = key === 'foto';

                            return (
                                <div key={key} className="space-y-3 p-4 rounded-xl border border-white/5 bg-white/5 dark:bg-navy-950/20 backdrop-blur-sm shadow-md">
                                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2">
                                            {group.icon}
                                            <span>{group.title}</span>
                                            <span className="text-xs bg-white/10 text-slate-400 px-2 py-0.5 rounded-full lowercase">
                                                {group.files.length} archivo{group.files.length !== 1 ? 's' : ''}
                                            </span>
                                        </h3>
                                    </div>

                                    {key === 'foto' ? (
                                        <DndContext
                                            sensors={dndSensors}
                                            collisionDetection={closestCenter}
                                            onDragEnd={handleDragEnd}
                                        >
                                            <SortableContext
                                                items={group.files.map(f => f.id)}
                                                strategy={rectSortingStrategy}
                                            >
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                                    {group.files.map((file, idx) => (
                                                        <SortableFileCard
                                                            key={file.id}
                                                            file={file}
                                                            isPortada={idx === 0}
                                                            onPreview={f => openPreview(f, motherFolderId)}
                                                            onDelete={canUpload ? handleDeleteFile : undefined}
                                                            onShare={handleShareFile}
                                                            onShareWithPatient={setSharePatientFile}
                                                            onShareEmail={handleShareEmail}
                                                            onTag={canUpload ? setTagFile : undefined}
                                                            photoTag={photoTags[file.id]}
                                                            onSmileDesign={f => openSmileDesign(f, motherFolderId)}
                                                            onSetPortada={canUpload ? handleSetPortada : undefined}
                                                            patientFolder={getFormattedFolderName(patientName)}
                                                        />
                                                    ))}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                            {group.files.map(file => (
                                                <div key={file.id} className="flex flex-col gap-1.5">
                                                    <DriveFileCard
                                                        file={file}
                                                        onPreview={f => openPreview(f, motherFolderId)}
                                                        onDelete={canUpload ? handleDeleteFile : undefined}
                                                        onShare={handleShareFile}
                                                        onShareWithPatient={setSharePatientFile}
                                                        onShareEmail={handleShareEmail}
                                                        onTag={canUpload ? setTagFile : undefined}
                                                        photoTag={photoTags[file.id]}
                                                        onSmileDesign={f => openSmileDesign(f, motherFolderId)}
                                                        patientFolder={getFormattedFolderName(patientName)}
                                                    />
                                                    {key === 'presentacion' && canUpload && (
                                                        <button
                                                            onClick={() => handleExtractSlides(file.id)}
                                                            disabled={extractingSlidesId === file.id}
                                                            className="w-full py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/30 text-blue-400 hover:text-blue-300 text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                                            title="Extraer diapositivas como fotos e importar texto a historia clínica"
                                                        >
                                                            {extractingSlidesId === file.id ? 'Extrayendo...' : 'Extraer fotos'}
                                                        </button>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Global dropzone overlay */}
                {canUpload && isGlobalDragging && motherFolderId && (
                    <div className="fixed inset-0 z-[70] bg-black/35 backdrop-blur-[1px] p-4 sm:p-8 flex items-center justify-center">
                        <div className="w-full max-w-3xl rounded-2xl border border-blue-400/35 bg-slate-950/85 p-6 shadow-2xl space-y-4">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <p className="text-sm font-semibold text-white">
                                    Subir archivos a la carpeta del paciente
                                </p>
                            </div>

                            <DriveUploadButton
                                variant="dropzone"
                                folderId={motherFolderId}
                                patientId={patientId}
                                successMessage={(count) => `${count} archivo(s) subido(s) correctamente`}
                                onUploaded={() => {
                                    resetGlobalDrag();
                                    handleUploadedToFolder();
                                }}
                                dropzoneTitle="Soltá tus archivos acá"
                                dropzoneHint="También podés hacer clic para elegir archivos"
                                dropzoneClassName="p-10 border-blue-400/70 bg-blue-500/5"
                                fileNamePrefix={buildPatientPrefix(patientName, 'archivos')}
                            />
                        </div>
                    </div>
                )}

                {/* Share with patient */}
                {sharePatientFile && (
                    <ShareWithPatientModal
                        files={[{
                            id: sharePatientFile.id,
                            name: sharePatientFile.name,
                            driveFileId: sharePatientFile.id,
                        }]}
                        folderId={motherFolderId || undefined}
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
                    allFolderFiles={files.filter(f => ['foto', 'redes'].includes(classifyFile(f)))}
                    autoStartSmile={previewAutoSmile}
                    onClose={() => { setPreviewFile(null); setPreviewFolderId(''); setPreviewAutoSmile(false); }}
                    onSaved={() => {
                        handleUploadedToFolder();
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
