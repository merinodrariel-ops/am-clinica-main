'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Clipboard, CloudUpload, ExternalLink, FileText, Loader2, Send, Sparkles, Wand2, X } from 'lucide-react';
import { toast } from 'sonner';
import { renameDriveFileAction } from '@/app/actions/patient-files-drive';
import Modal from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import type { DriveFile } from '@/app/actions/patient-files-drive';
import {
    buildDrivePhotoFileName,
    buildPublicCaseDraft,
    slugifyCaseTitle,
    splitLongPhotoDescription,
    type PublicCaseDraft,
} from '@/lib/public-case-draft';

interface PublicCasePublishModalProps {
    files: DriveFile[];
    patientId: string;
    patientName: string;
    onClose: () => void;
}

type AssistantMessage = { role: 'user' | 'assistant'; content: string };

function defaultCaseTitle(patientName: string) {
    void patientName;
    return 'Caso clínico AM Estética Dental';
}

export default function PublicCasePublishModal({ files, patientId, patientName, onClose }: PublicCasePublishModalProps) {
    const [currentFiles, setCurrentFiles] = useState(files);
    const [title, setTitle] = useState(defaultCaseTitle(patientName));
    const [caseDescription, setCaseDescription] = useState('');
    const [longDescription, setLongDescription] = useState('');
    const [photoDescriptions, setPhotoDescriptions] = useState(() => currentFiles.map(() => ''));
    const [draft, setDraft] = useState<PublicCaseDraft | null>(null);
    const [renamingDriveFiles, setRenamingDriveFiles] = useState(false);
    const [mode, setMode] = useState<'create' | 'append'>('create');
    const [slug, setSlug] = useState(() => slugifyCaseTitle(defaultCaseTitle(patientName)));
    const [slugEdited, setSlugEdited] = useState(false);
    const [existingCases, setExistingCases] = useState<Array<{ id: string; slug: string; title: string; status: string }>>([]);
    const [caseId, setCaseId] = useState('');
    const [publishing, setPublishing] = useState(false);
    const [publishedUrl, setPublishedUrl] = useState('');
    const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>([]);
    const [assistantInput, setAssistantInput] = useState('');
    const [assistantLoading, setAssistantLoading] = useState(false);

    useEffect(() => {
        fetch('/api/clinical-cases')
            .then(response => response.ok ? response.json() : Promise.reject())
            .then(result => setExistingCases(result.cases || []))
            .catch(() => setExistingCases([]));
    }, []);

    useEffect(() => {
        if (!slugEdited) setSlug(slugifyCaseTitle(title));
    }, [title, slugEdited]);

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

    async function askCaseAssistant() {
        const message = assistantInput.trim();
        if (!message || assistantLoading) return;
        const nextMessages: AssistantMessage[] = [...assistantMessages, { role: 'user', content: message }];
        setAssistantMessages(nextMessages);
        setAssistantInput('');
        setAssistantLoading(true);
        try {
            const response = await fetch('/api/clinical-cases/assistant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: nextMessages,
                    photoNames: currentFiles.map(file => file.name),
                    draft: {
                        title,
                        description: caseDescription,
                        photoDescriptions,
                    },
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'No se pudo redactar el caso');

            setAssistantMessages(prev => [...prev, {
                role: 'assistant',
                content: result.reply || 'Preparé una propuesta para revisar.',
            }]);
            if (result.proposal?.title) {
                setTitle(result.proposal.title);
                setSlugEdited(false);
            }
            if (result.proposal?.description) setCaseDescription(result.proposal.description);
            if (Array.isArray(result.proposal?.photoDescriptions)) {
                setPhotoDescriptions(currentFiles.map((_, index) => result.proposal.photoDescriptions[index] || ''));
            }
            setDraft(null);
            toast.success('Propuesta aplicada; revisala antes de publicar');
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'No se pudo usar el asistente';
            setAssistantMessages(prev => [...prev, { role: 'assistant', content: errorMessage }]);
            toast.error(errorMessage);
        } finally {
            setAssistantLoading(false);
        }
    }

    async function publishNow() {
        const existingSlug = existingCases.find(item => item.id === caseId)?.slug;
        if (!caseDescription.trim()) {
            toast.error('Completá la descripción general del caso');
            return;
        }
        if (mode === 'append' && !caseId) {
            toast.error('Elegí el caso existente');
            return;
        }
        setPublishing(true);
        try {
            const response = await fetch('/api/clinical-cases', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode, caseId: mode === 'append' ? caseId : undefined, patientId,
                    title, slug: mode === 'append' ? existingSlug : slug,
                    description: caseDescription,
                    photos: currentFiles.map((file, index) => ({
                        id: file.id, name: file.name, createdTime: file.createdTime,
                        alt: photoDescriptions[index]?.trim() || `${title} - foto ${index + 1}`,
                        caption: photoDescriptions[index]?.trim() || undefined,
                    })),
                }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'No se pudo publicar');
            setPublishedUrl(result.publicUrl);
            toast.success(`${result.uploaded} foto${result.uploaded !== 1 ? 's' : ''} publicada${result.uploaded !== 1 ? 's' : ''}`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo publicar');
        } finally {
            setPublishing(false);
        }
    }

    if (publishedUrl) {
        return (
            <Modal isOpen onClose={onClose} title="Caso publicado" className="max-w-lg">
                <div className="p-6 text-center">
                    <Check size={34} className="mx-auto text-emerald-400" />
                    <p className="mt-3 text-sm text-slate-300">Las fotos quedaron cargadas directamente en la web.</p>
                    <a href={publishedUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#C9A96E] px-4 py-2 text-sm font-bold text-black">
                        Ver caso publicado <ExternalLink size={15} />
                    </a>
                </div>
            </Modal>
        );
    }

    return (
        <Modal
            isOpen
            onClose={onClose}
            title="Subir caso a la web"
            className="max-w-6xl"
        >
            <div className="space-y-5 p-5">
                <div className="rounded-xl border border-emerald-400/25 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100">
                    Publicación directa: las fotos se alojan en Cloudinary y el caso aparece en amesteticadental.com sin descargar archivos.
                </div>

                <section className="rounded-xl border border-violet-400/25 bg-violet-400/[0.08] p-4">
                    <div className="flex items-start gap-3">
                        <Sparkles size={19} className="mt-0.5 shrink-0 text-violet-300" />
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-white">Contale la historia al asistente</p>
                            <p className="mt-1 text-xs text-slate-400">
                                Explicá qué se hizo, qué problema se buscó resolver y qué muestran las fotos. No incluyas el nombre del paciente.
                            </p>
                        </div>
                    </div>
                    {assistantMessages.length > 0 && (
                        <div className="mt-3 max-h-40 space-y-2 overflow-y-auto rounded-lg bg-black/20 p-3">
                            {assistantMessages.map((message, index) => (
                                <div
                                    key={`${message.role}-${index}`}
                                    className={`text-sm ${message.role === 'user' ? 'text-slate-200' : 'text-violet-200'}`}
                                >
                                    <span className="mr-1 font-semibold">
                                        {message.role === 'user' ? 'Vos:' : 'Asistente:'}
                                    </span>
                                    {message.content}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="mt-3 flex gap-2">
                        <Textarea
                            value={assistantInput}
                            onChange={event => setAssistantInput(event.target.value)}
                            rows={3}
                            placeholder="Ej: La paciente consultó por... Realizamos... La primera foto muestra..."
                            onKeyDown={event => {
                                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                    event.preventDefault();
                                    void askCaseAssistant();
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={() => void askCaseAssistant()}
                            disabled={!assistantInput.trim() || assistantLoading}
                            className="inline-flex w-32 shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-500 px-3 text-sm font-bold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {assistantLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            {assistantLoading ? 'Redactando' : 'Redactar'}
                        </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500">
                        El asistente completa el borrador; nada se publica hasta que pulses Publicar ahora.
                    </p>
                </section>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <section className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setMode('create')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'create' ? 'bg-[#C9A96E] text-black' : 'bg-white/10 text-white'}`}>Crear caso nuevo</button>
                            <button onClick={() => setMode('append')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${mode === 'append' ? 'bg-[#C9A96E] text-black' : 'bg-white/10 text-white'}`}>Agregar a existente</button>
                        </div>
                        {mode === 'append' && (
                            <select value={caseId} onChange={event => setCaseId(event.target.value)} className="w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white">
                                <option value="">Elegir caso…</option>
                                {existingCases.map(item => <option key={item.id} value={item.id}>{item.title} ({item.status})</option>)}
                            </select>
                        )}
                        {mode === 'create' && (
                        <>
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
                            <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-400">URL editable</label>
                            <div className="flex rounded-lg border border-white/10 bg-slate-950/70 text-sm">
                                <span className="px-3 py-2 text-slate-500">amesteticadental.com/casos/</span>
                                <input
                                    value={slug}
                                    onChange={event => { setSlugEdited(true); setSlug(slugifyCaseTitle(event.target.value)); }}
                                    className="min-w-0 flex-1 bg-transparent py-2 pr-2 text-white outline-none"
                                />
                            </div>
                        </div>
                        </>
                        )}

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
                                onClick={publishNow}
                                disabled={publishing}
                                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
                            >
                                {publishing ? <Loader2 size={16} className="animate-spin" /> : <CloudUpload size={16} />}
                                {publishing ? 'Subiendo…' : mode === 'append' ? 'Agregar fotos al caso' : 'Publicar ahora'}
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
