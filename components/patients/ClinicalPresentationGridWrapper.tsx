'use client';

import { useState, useEffect } from 'react';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import { getPatientDriveFolders, loadFolderFiles } from '@/app/actions/patient-files-drive';
import { getPhotoTagsForPatientAction, type PhotoTag } from '@/app/actions/photo-tags';
import ClinicalPresentationGrid from './ClinicalPresentationGrid';
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import DrivePreviewModal from './drive/DrivePreviewModal';

interface Props {
    patientId: string;
    patientName: string;
    motherFolderUrl: string | null | undefined;
}

export default function ClinicalPresentationGridWrapper({ patientId, patientName, motherFolderUrl }: Props) {
    const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
    const [files, setFiles] = useState<DriveFile[]>([]);
    const [tags, setTags] = useState<Record<string, PhotoTag>>({});
    const [errorMsg, setErrorMsg] = useState('');
    const [previewFile, setPreviewFile] = useState<DriveFile | null>(null);

    async function fetchData() {
        if (!motherFolderUrl) {
            setStatus('idle');
            return;
        }

        setStatus('loading');
        try {
            // 1. Fetch tags
            const tagsList = await getPhotoTagsForPatientAction(patientId);
            const tagMap: Record<string, PhotoTag> = {};
            tagsList.forEach(t => tagMap[t.file_id] = t);
            setTags(tagMap);

            // 2. Fetch all files from FOTO/VIDEO folder (or root if not found)
            const foldersResult = await getPatientDriveFolders(motherFolderUrl);
            if (foldersResult.error) throw new Error(foldersResult.error);

            // Collect all files from all folders to ensure we find the tagged ones
            const allFiles: DriveFile[] = [...foldersResult.rootFiles];
            
            // For the presentation, we need to load at least the folders that might contain tagged items
            // To be simple, let's load ALL first-level folders that have "foto" or "video" in them
            const relevantFolders = foldersResult.folders.filter(f => /foto|video/i.test(f.displayName));
            
            const results = await Promise.all(
                relevantFolders.map(f => loadFolderFiles(f.id))
            );

            results.forEach(res => {
                if (res.files) allFiles.push(...res.files);
            });

            setFiles(allFiles);
            setStatus('loaded');
        } catch (err) {
            console.error('[PresentationGridWrapper] Error fetching data:', err);
            setErrorMsg(err instanceof Error ? err.message : 'Error al cargar los archivos');
            setStatus('error');
        }
    }

    useEffect(() => {
        fetchData();
    }, [patientId, motherFolderUrl]);

    if (!motherFolderUrl) return null;

    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center py-10">
                <Loader2 size={20} className="text-blue-500 animate-spin" />
                <span className="ml-3 text-sm text-gray-500 dark:text-white/40 font-medium">Cargando presentación...</span>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <AlertCircle size={24} className="text-red-400 mb-2" />
                <p className="text-sm text-gray-500 dark:text-white/40 mb-4">{errorMsg}</p>
                <button
                    onClick={fetchData}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-white/10 text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                    <RefreshCw size={14} />
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <ClinicalPresentationGrid 
                files={files} 
                photoTags={tags} 
                onPreview={setPreviewFile}
            />

            {previewFile && (
                <DrivePreviewModal
                    file={previewFile}
                    folderId=""
                    patientId={patientId}
                    patientName={patientName}
                    canSave={false}
                    allFolderFiles={files.filter(f => f.mimeType.startsWith('image/'))}
                    onClose={() => setPreviewFile(null)}
                    onSaved={() => fetchData()}
                />
            )}
        </div>
    );
}
