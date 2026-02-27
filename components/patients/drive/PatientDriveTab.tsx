'use client';

import { useState, useEffect, useCallback } from 'react';
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
    const { role } = useAuth();
    const canUpload = UPLOAD_ROLES.has(role || '');

    const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
    const [folders, setFolders] = useState<FolderWithFiles[]>([]);
    const [rootFiles, setRootFiles] = useState<DriveFile[]>([]);
    const [errorMsg, setErrorMsg] = useState('');
    const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);
    const [currentFolderUrl, setCurrentFolderUrl] = useState(motherFolderUrl);
    const [creating, setCreating] = useState(false);

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
        // Auto-open folders that have files
        setOpenFolders(new Set(result.folders.filter(f => f.files.length > 0).map(f => f.id)));
        setStatus('loaded');
    }, []);

    useEffect(() => {
        if (currentFolderUrl && status === 'idle') {
            fetchFolders(currentFolderUrl);
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
            setCurrentFolderUrl(result.motherFolderUrl);
            setStatus('idle');
            toast.success('Carpeta de Drive creada correctamente');
        }
        setCreating(false);
    };

    const toggleFolder = (folderId: string) => {
        setOpenFolders(prev => {
            const next = new Set(prev);
            if (next.has(folderId)) next.delete(folderId);
            else next.add(folderId);
            return next;
        });
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

    const totalFiles = folders.reduce((acc, f) => acc + f.files.length, 0) + rootFiles.length;
    const motherFolderId = extractFolderIdFromUrl(currentFolderUrl);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FolderOpen size={18} className="text-blue-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {totalFiles} archivo{totalFiles !== 1 ? 's' : ''} en {folders.length} carpeta{folders.length !== 1 ? 's' : ''}
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

                    return (
                        <div
                            key={folder.id}
                            className="rounded-xl border border-gray-200 dark:border-white/10 overflow-hidden"
                        >
                            {/* Folder header */}
                            <button
                                onClick={() => toggleFolder(folder.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                            >
                                <motion.div
                                    animate={{ rotate: isOpen ? 180 : 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <ChevronDown size={16} className="text-gray-400" />
                                </motion.div>
                                <FolderOpen size={16} className="text-yellow-500" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1 text-left">
                                    {folder.displayName}
                                </span>
                                <span className="text-xs text-gray-400 dark:text-white/30 mr-2">
                                    {folder.files.length} archivo{folder.files.length !== 1 ? 's' : ''}
                                </span>
                                {canUpload && (
                                    <span onClick={e => e.stopPropagation()}>
                                        <DriveUploadButton
                                            folderId={folder.id}
                                            patientId={patientId}
                                            onUploaded={handleRefresh}
                                        />
                                    </span>
                                )}
                            </button>

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
                        </div>
                    );
                })}
            </div>

            {/* Also upload to mother folder root */}
            {canUpload && motherFolderId && (
                <div className="flex justify-center pt-2">
                    <div className="flex items-center gap-2 text-sm text-gray-400 dark:text-white/30">
                        <span>Subir a carpeta raíz</span>
                        <DriveUploadButton
                            folderId={motherFolderId}
                            patientId={patientId}
                            onUploaded={handleRefresh}
                        />
                    </div>
                </div>
            )}

            {/* Preview modal */}
            <DrivePreviewModal file={previewFile} onClose={() => setPreviewFile(null)} />
        </div>
    );
}
