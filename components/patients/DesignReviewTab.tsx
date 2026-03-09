'use client';

import { useState, useRef, useCallback } from 'react';
import { Box, Eye, FolderOpen, RefreshCw, CheckCircle2, Clock, AlertCircle, ExternalLink, Smartphone, Upload, UploadCloud } from 'lucide-react';
import { toast } from 'sonner';
import {
    activateDesignFlow,
    syncDesignHtmlFile,
    generateDesignReviewToken,
    getPatientDesignReview,
    getDesignUploadUrl,
    saveDesignFileUrl,
} from '@/app/actions/design-review';

interface DesignReviewTabProps {
    patientId: string;
    motherFolderUrl: string | null;
    initialReview: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
        storage_html_url: string | null;
        exocad_folder_id: string | null;
        patient_comment: string | null;
        viewed_at: string | null;
        responded_at: string | null;
        created_at: string;
    } | null;
}

const STATUS_CONFIG = {
    pending:  { label: 'Pendiente', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/20', icon: Clock },
    viewed:   { label: 'Vista por la paciente', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20', icon: Eye },
    approved: { label: 'Aprobado', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
    revision: { label: 'Pide cambios', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20', icon: AlertCircle },
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function DropZone({
    reviewId,
    patientId,
    onUploaded,
    compact = false,
}: {
    reviewId: string;
    patientId: string;
    onUploaded: () => void;
    compact?: boolean;
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleFile = useCallback(async (file: File) => {
        if (!file.name.endsWith('.html') && file.type !== 'text/html') {
            toast.error('Solo se aceptan archivos .html (exportación Exocad)');
            return;
        }
        if (file.size > MAX_FILE_SIZE) {
            toast.error('El archivo supera los 50 MB');
            return;
        }

        setUploading(true);
        setProgress('Generando URL de subida...');

        const urlResult = await getDesignUploadUrl(reviewId, patientId);
        if (!urlResult.success || !urlResult.signedUrl || !urlResult.storagePath) {
            toast.error(urlResult.error || 'No se pudo preparar la subida');
            setUploading(false);
            setProgress(null);
            return;
        }

        setProgress('Subiendo diseño...');

        try {
            const res = await fetch(urlResult.signedUrl, {
                method: 'PUT',
                body: file,
                headers: { 'Content-Type': 'text/html' },
            });

            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.error('[DropZone] Upload PUT failed', res.status, body);
                throw new Error(`HTTP ${res.status}${body ? ': ' + body.slice(0, 120) : ''}`);
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error('[DropZone] Upload error:', msg);
            toast.error(`Error al subir: ${msg}`);
            setUploading(false);
            setProgress(null);
            return;
        }

        setProgress('Guardando...');
        const saveResult = await saveDesignFileUrl(reviewId, urlResult.storagePath);
        if (!saveResult.success) {
            toast.error(saveResult.error || 'No se pudo guardar el diseño');
            setUploading(false);
            setProgress(null);
            return;
        }

        toast.success('Diseño subido correctamente');
        setUploading(false);
        setProgress(null);
        onUploaded();
    }, [reviewId, patientId, onUploaded]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFile(file);
    }, [handleFile]);

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const handleDragLeave = () => setIsDragOver(false);
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        e.target.value = '';
    };

    if (compact) {
        return (
            <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => !uploading && inputRef.current?.click()}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors cursor-pointer text-sm
                    ${isDragOver
                        ? 'border-[#C9A96E] bg-[#C9A96E]/10 text-[#C9A96E]'
                        : 'border-dashed border-white/20 text-white/40 hover:border-white/40 hover:text-white/60'
                    } ${uploading ? 'pointer-events-none opacity-60' : ''}`}
            >
                <Upload size={14} className={uploading ? 'animate-bounce' : ''} />
                <span>{uploading ? (progress || 'Subiendo...') : 'Reemplazar diseño (.html)'}</span>
                <input ref={inputRef} type="file" accept=".html,text/html" className="hidden" onChange={handleInputChange} />
            </div>
        );
    }

    return (
        <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => !uploading && inputRef.current?.click()}
            className={`relative rounded-2xl border-2 border-dashed p-8 text-center transition-all cursor-pointer
                ${isDragOver
                    ? 'border-[#C9A96E] bg-[#C9A96E]/10'
                    : 'border-white/15 hover:border-white/30 hover:bg-white/3'
                } ${uploading ? 'pointer-events-none' : ''}`}
        >
            <input ref={inputRef} type="file" accept=".html,text/html" className="hidden" onChange={handleInputChange} />

            <div className="flex justify-center mb-3">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center transition-colors
                    ${isDragOver ? 'bg-[#C9A96E]/20' : 'bg-white/5'}`}>
                    {uploading
                        ? <RefreshCw size={24} className="text-[#C9A96E] animate-spin" />
                        : <UploadCloud size={24} className={isDragOver ? 'text-[#C9A96E]' : 'text-white/30'} />
                    }
                </div>
            </div>

            {uploading ? (
                <p className="text-white/60 text-sm">{progress || 'Subiendo...'}</p>
            ) : (
                <>
                    <p className={`font-semibold text-sm mb-1 transition-colors ${isDragOver ? 'text-[#C9A96E]' : 'text-white/60'}`}>
                        {isDragOver ? 'Soltá el archivo aquí' : 'Arrastrá el archivo HTML aquí'}
                    </p>
                    <p className="text-white/30 text-xs">o hacé clic para seleccionar</p>
                    <p className="text-white/20 text-xs mt-2">Exportación Exocad (.html) · Máx. 50 MB</p>
                </>
            )}
        </div>
    );
}

export default function DesignReviewTab({ patientId, motherFolderUrl, initialReview }: DesignReviewTabProps) {
    const [review, setReview] = useState(initialReview);
    const [loading, setLoading] = useState<string | null>(null);

    async function refreshReview() {
        const { review: r } = await getPatientDesignReview(patientId);
        setReview(r);
    }

    async function handleActivate() {
        setLoading('activate');
        const result = await activateDesignFlow(patientId, motherFolderUrl);
        if (result.error) {
            toast.error(result.error);
        } else {
            if (result.driveWarning) {
                toast.warning(result.driveWarning);
            } else {
                toast.success('Flujo de diseño activado');
            }
            await refreshReview();
        }
        setLoading(null);
    }

    async function handleSync() {
        if (!review) return;
        setLoading('sync');
        const result = await syncDesignHtmlFile(review.id);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('Diseño sincronizado desde Drive');
            await refreshReview();
        }
        setLoading(null);
    }

    async function handleSendLink() {
        if (!review) return;
        setLoading('send');
        const result = await generateDesignReviewToken(patientId, review.id);
        if (result.error) {
            toast.error(result.error);
        } else {
            window.open(result.whatsappUrl, '_blank');
            toast.success('Link generado y abierto en WhatsApp');
        }
        setLoading(null);
    }

    const status = review?.status as keyof typeof STATUS_CONFIG | undefined;
    const StatusIcon = status ? STATUS_CONFIG[status].icon : Clock;
    const hasFile = !!(review?.drive_html_file_id || review?.storage_html_url);

    if (!review) {
        return (
            <div className="space-y-6">
                <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center">
                    <div className="flex justify-center mb-4">
                        <div className="h-16 w-16 rounded-2xl bg-[#C9A96E]/10 border border-[#C9A96E]/20 flex items-center justify-center">
                            <Box size={28} className="text-[#C9A96E]" />
                        </div>
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">Flujo de Diseño Digital</h3>
                    <p className="text-white/40 text-sm mb-6 max-w-sm mx-auto">
                        Al activarlo podés subir el diseño directamente o sincronizarlo desde Drive.
                    </p>
                    <button
                        onClick={handleActivate}
                        disabled={!!loading}
                        className="px-6 py-3 rounded-xl bg-[#C9A96E] text-black font-bold text-sm hover:bg-[#C9A96E]/90 transition-colors disabled:opacity-50"
                    >
                        {loading === 'activate' ? 'Activando...' : 'Activar flujo de diseño digital'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Status card */}
            <div className={`rounded-2xl border p-5 ${status ? STATUS_CONFIG[status].bg : 'bg-white/5 border-white/10'}`}>
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <StatusIcon size={18} className={status ? STATUS_CONFIG[status].color : 'text-slate-400'} />
                        <div>
                            <p className={`font-semibold text-sm ${status ? STATUS_CONFIG[status].color : 'text-slate-400'}`}>
                                {status ? STATUS_CONFIG[status].label : '\u2014'}
                            </p>
                            <p className="text-white/40 text-xs mt-0.5">{review.label}</p>
                        </div>
                    </div>
                    {hasFile && (
                        <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-full whitespace-nowrap">
                            HTML listo
                        </span>
                    )}
                </div>

                {review.patient_comment && (
                    <div className="mt-4 p-3 rounded-xl bg-black/20 border border-white/5">
                        <p className="text-white/50 text-xs mb-1">Comentario de la paciente:</p>
                        <p className="text-white text-sm italic">&quot;{review.patient_comment}&quot;</p>
                    </div>
                )}

                {review.viewed_at && (
                    <p className="text-white/30 text-xs mt-3">
                        Vista: {new Date(review.viewed_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                )}
            </div>

            {/* Inline 3D preview */}
            {hasFile && (
                <div className="rounded-2xl overflow-hidden border border-white/10 bg-black" style={{ height: '480px' }}>
                    <iframe
                        src={`/api/design-review/${patientId}/preview`}
                        className="w-full h-full border-0"
                        title="Vista previa del diseño"
                    />
                </div>
            )}

            {/* Upload zone — primary if no file, compact replace if file exists */}
            {!hasFile ? (
                <DropZone reviewId={review.id} patientId={patientId} onUploaded={refreshReview} />
            ) : (
                <DropZone reviewId={review.id} patientId={patientId} onUploaded={refreshReview} compact />
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {review.exocad_folder_id && (
                    <button
                        onClick={handleSync}
                        disabled={!!loading}
                        className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/50 text-xs hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={loading === 'sync' ? 'animate-spin' : ''} />
                        {loading === 'sync' ? 'Sincronizando...' : 'Sincronizar desde Drive'}
                    </button>
                )}

                <button
                    onClick={handleSendLink}
                    disabled={!!loading || !hasFile}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors disabled:opacity-40
                        ${!review.exocad_folder_id ? 'sm:col-span-2' : ''}`}
                >
                    <Smartphone size={15} />
                    {loading === 'send' ? 'Generando...' : 'Enviar por WhatsApp'}
                </button>
            </div>

            {!hasFile && (
                <p className="text-amber-400/70 text-xs text-center px-4">
                    Subí el archivo HTML para poder enviárselo a la paciente.
                </p>
            )}

            {review.exocad_folder_id && (
                <a
                    href={`https://drive.google.com/drive/folders/${review.exocad_folder_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-white/30 text-xs hover:text-white/50 transition-colors w-fit"
                >
                    <FolderOpen size={13} />
                    Abrir carpeta EXOCAD/HTML en Drive
                    <ExternalLink size={11} />
                </a>
            )}
        </div>
    );
}
