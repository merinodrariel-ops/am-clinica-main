'use client';

import { useState } from 'react';
import { Box, FolderOpen, RefreshCw, Eye, CheckCircle2, Clock, AlertCircle, ExternalLink, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import {
    activateDesignFlow,
    syncDesignHtmlFile,
    generateDesignReviewToken,
    getPatientDesignReview,
} from '@/app/actions/design-review';

interface DesignReviewTabProps {
    patientId: string;
    motherFolderUrl: string | null;
    initialReview: {
        id: string;
        status: string;
        label: string;
        drive_html_file_id: string | null;
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

export default function DesignReviewTab({ patientId, motherFolderUrl, initialReview }: DesignReviewTabProps) {
    const [review, setReview] = useState(initialReview);
    const [loading, setLoading] = useState<string | null>(null);

    async function handleActivate() {
        if (!motherFolderUrl) {
            toast.error('El paciente no tiene carpeta de Drive configurada');
            return;
        }
        setLoading('activate');
        const result = await activateDesignFlow(patientId, motherFolderUrl);
        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success('Flujo de diseño activado. Carpeta EXOCAD/HTML creada en Drive.');
            const { review: r } = await getPatientDesignReview(patientId);
            setReview(r);
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
            const { review: r } = await getPatientDesignReview(patientId);
            setReview(r);
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
                        Al activarlo se crea la carpeta <span className="text-[#C9A96E] font-mono text-xs">[EXOCAD]/HTML/</span> en Drive para que el diseñador suba el diseño.
                    </p>
                    <button
                        onClick={handleActivate}
                        disabled={!!loading}
                        className="px-6 py-3 rounded-xl bg-[#C9A96E] text-black font-bold text-sm hover:bg-[#C9A96E]/90 transition-colors disabled:opacity-50"
                    >
                        {loading === 'activate' ? 'Activando...' : 'Activar flujo de diseño digital'}
                    </button>
                    {!motherFolderUrl && (
                        <p className="text-red-400 text-xs mt-3">El paciente no tiene carpeta de Drive configurada</p>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
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
                    {review.drive_html_file_id && (
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                    onClick={handleSync}
                    disabled={!!loading}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white/70 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
                >
                    <RefreshCw size={15} className={loading === 'sync' ? 'animate-spin' : ''} />
                    {loading === 'sync' ? 'Sincronizando...' : 'Sincronizar desde Drive'}
                </button>

                <button
                    onClick={handleSendLink}
                    disabled={!!loading || !review.drive_html_file_id}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[#25D366]/10 border border-[#25D366]/20 text-[#25D366] text-sm font-medium hover:bg-[#25D366]/20 transition-colors disabled:opacity-40"
                >
                    <Smartphone size={15} />
                    {loading === 'send' ? 'Generando...' : 'Enviar por WhatsApp'}
                </button>
            </div>

            {!review.drive_html_file_id && (
                <p className="text-amber-400/70 text-xs text-center px-4">
                    No hay archivo HTML aun. Pedile al disenador que suba el diseno a la carpeta Drive y luego hace clic en &quot;Sincronizar&quot;.
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
