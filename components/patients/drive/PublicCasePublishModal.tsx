'use client';

import { useMemo, useState } from 'react';
import { Check, Clipboard, CloudUpload, FileText, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { renameDriveFileAction } from '@/app/actions/patient-files-drive';
import Modal from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import {
    buildDrivePhotoFileName,
    buildPublicCaseDraft,
    splitLongPhotoDescription,
    type PublicCaseDraft,
} from '@/lib/public-case-draft';

interface PublicCasePublishModalProps {
    files: DriveFile[];
    patientName: string;
    onClose: () => void;
}

function defaultCaseTitle(patientName: string) {
    const normalized = patientName.trim();
    return normalized ? `${normalized} - caso clínico` : 'Caso clínico';
}

export default function PublicCasePublishModal({ files, patientName, onClose }: PublicCasePublishModalProps) {
    const [currentFiles, setCurrentFiles] = useState(files);
    const [title, setTitle] = useState(defaultCaseTitle(patientName));
    const [caseDescription, setCaseDescription] = useState('');
    const [longDescription, setLongDescription] = useState('');
    const [photoDescriptions, setPhotoDescriptions] = useState(() => currentFiles.map(() => ''));
    const [draft, setDraft] = useState<PublicCaseDraft | null>(null);
    const [renamingDriveFiles, setRenamingDriveFiles] = useState(false);

    const completedDescriptions = useMemo(
        () => photoDescriptions.filter(value => value.trim()).length,
        [photoDescriptions]
    );

    function updatePhotoDescription(index: number, value: string) {
        setPhotoDescriptions(prev => prev.map((current, i) => i === index ? value : current));
        setDraft(null);
    }

    function applyLongDescription() {
        const parsed = splitLongPhotoDescription(longDescription, currentFiles.length);
        const parsedCount = parsed.filter(Boolean).length;
        if (parsedCount === 0) {
            toast.error('No encontré referencias tipo "foto 1", "foto 2" en el texto.');
            return;
        }

        setPhotoDescriptions(prev => prev.map((current, index) => parsed[index] || current));
        setDraft(null);
        toast.success(`${parsedCount} descripción${parsedCount !== 1 ? 'es' : ''} aplicada${parsedCount !== 1 ? 's' : ''}`);
    }

    function prepareDraft() {
        if (currentFiles.length === 0) return;
        const nextDraft = buildPublicCaseDraft({
            patientName,
            title,
            caseDescription,
            photos: currentFiles.map((file, index) => ({
                id: file.id,
                name: file.name,
                description: photoDescriptions[index] || '',
            })),
        });

        setDraft(nextDraft);
        toast.success('Borrador del caso preparado');
    }

    async function renameDriveFilesFromDescriptions() {
        if (renamingDriveFiles) return;
        const missingCount = currentFiles.filter((_, index) => !photoDescriptions[index]?.trim()).length;
        if (missingCount > 0) {
            toast.error(`Faltan ${missingCount} descripción${missingCount !== 1 ? 'es' : ''} antes de renombrar.`);
            return;
        }

        setRenamingDriveFiles(true);
        const renamed: DriveFile[] = [];
        for (let index = 0; index < currentFiles.length; index += 1) {
            const file = currentFiles[index];
            const newName = buildDrivePhotoFileName(index + 1, photoDescriptions[index], file.name);
            const result = await renameDriveFileAction(file.id, newName);
            if (result.error || !result.success) {
                toast.error(`No se pudo renombrar "${file.name}": ${result.error || 'error desconocido'}`);
                setRenamingDriveFiles(false);
                return;
            }
            renamed.push({ ...file, name: newName });
        }

        setCurrentFiles(renamed);
        setDraft(null);
        setRenamingDriveFiles(false);
        toast.success(`${renamed.length} foto${renamed.length !== 1 ? 's renombradas' : ' renombrada'} en Drive`);
    }

    async function copyDraft() {
        if (!draft) return;
        await navigator.clipboard.writeText(draft.caseTsSnippet);
        toast.success('Borrador copiado');
    }

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Subir caso a la web"
            className="max-w-6xl"
        >
            <div className="space-y-5 p-5">
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
                    Esta instancia prepara el caso y las descripciones foto por foto. La publicación automática real todavía requiere conectar credenciales Cloudinary y escritura sobre la repo pública de casos.
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <section className="space-y-3">
                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">
                                Título del caso
                            </label>
                            <input
                                value={title}
                                onChange={event => { setTitle(event.target.value); setDraft(null); }}
                                className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none focus:border-[#C9A96E]/60"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">
                                Descripción general del caso
                            </label>
                            <Textarea
                                value={caseDescription}
                                onChange={event => { setCaseDescription(event.target.value); setDraft(null); }}
                                rows={5}
                                placeholder="Ej: Gingivectomía láser + limpieza + microdiseño de sonrisa en resina. Cambios principales, técnica, tiempos y lectura clínica del antes/después."
                            />
                        </div>

                        <div>
                            <div className="mb-1 flex items-center justify-between gap-2">
                                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400">
                                    Relato largo para repartir
                                </label>
                                <button
                                    type="button"
                                    onClick={applyLongDescription}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                                >
                                    <Wand2 size={13} />
                                    Repartir
                                </button>
                            </div>
                            <Textarea
                                value={longDescription}
                                onChange={event => setLongDescription(event.target.value)}
                                rows={7}
                                placeholder='Pegá texto libre: "La foto 1 es..., la foto 2 es..., la foto doce es..."'
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                            <button
                                type="button"
                                onClick={prepareDraft}
                                className="inline-flex items-center gap-2 rounded-lg bg-[#C9A96E] px-4 py-2 text-sm font-bold text-black hover:bg-[#d9bb7d]"
                            >
                                <FileText size={16} />
                                Preparar caso
                            </button>
                            <button
                                type="button"
                                disabled
                                className="inline-flex cursor-not-allowed items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white/40"
                                title="Falta conectar credenciales Cloudinary y publicación de la web pública"
                            >
                                <CloudUpload size={16} />
                                Publicar ahora
                            </button>
                            <button
                                type="button"
                                onClick={renameDriveFilesFromDescriptions}
                                disabled={renamingDriveFiles}
                                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/15 disabled:cursor-wait disabled:opacity-60"
                            >
                                {renamingDriveFiles ? 'Renombrando...' : 'Renombrar en Drive'}
                            </button>
                        </div>
                    </section>

                    <section className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-white">
                                    {currentFiles.length} foto{currentFiles.length !== 1 ? 's' : ''} seleccionada{currentFiles.length !== 1 ? 's' : ''}
                                </p>
                                <p className="text-xs text-slate-400">
                                    {completedDescriptions}/{currentFiles.length} con descripción
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300 hover:bg-white/15 hover:text-white"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                            {currentFiles.map((file, index) => (
                                <div
                                    key={file.id}
                                    className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3"
                                >
                                    <div className="relative aspect-square overflow-hidden rounded-lg bg-slate-900">
                                        {file.thumbnailLink ? (
                                            <img
                                                src={`/api/drive/thumbnail/${encodeURIComponent(file.id)}?s=240${file.modifiedTime ? `&v=${encodeURIComponent(file.modifiedTime)}` : ''}`}
                                                alt={file.name}
                                                className="h-full w-full object-cover"
                                                referrerPolicy="no-referrer"
                                                loading="lazy"
                                            />
                                        ) : (
                                            <div className="flex h-full w-full items-center justify-center text-xs text-slate-500">
                                                Foto {index + 1}
                                            </div>
                                        )}
                                        <div className="absolute left-1 top-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white">
                                            {index + 1}
                                        </div>
                                    </div>
                                    <div className="min-w-0 space-y-2">
                                        <p className="truncate text-xs font-semibold text-slate-300" title={file.name}>
                                            {file.name}
                                        </p>
                                        <Textarea
                                            value={photoDescriptions[index] || ''}
                                            onChange={event => updatePhotoDescription(index, event.target.value)}
                                            rows={3}
                                            placeholder={`Descripción clínica de la foto ${index + 1}`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </div>

                {draft && (
                    <section className="space-y-3 rounded-xl border border-white/10 bg-slate-950/80 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm font-semibold text-white">
                                <Check size={16} className="text-emerald-400" />
                                Borrador listo: <span className="text-[#C9A96E]">{draft.slug}</span>
                            </div>
                            <button
                                type="button"
                                onClick={copyDraft}
                                className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
                            >
                                <Clipboard size={14} />
                                Copiar objeto para casos.ts
                            </button>
                        </div>
                        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 text-xs text-slate-300">
                            {draft.caseTsSnippet}
                        </pre>
                    </section>
                )}
            </div>
        </Modal>
    );
}
