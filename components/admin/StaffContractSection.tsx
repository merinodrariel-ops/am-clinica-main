'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FileText, Download, CheckCircle2, Clock, ExternalLink, RefreshCw, FilePlus } from 'lucide-react';
import type { WorkerProfile } from '@/types/worker-portal';
import type { ContractRecord, AnexoRol } from '@/lib/staff-contracts/types';
import { getPersonalContratos, getAnexoRolForPersonal, markContractSignedAction, recordStaffContractAction } from '@/app/actions/staff-contracts';

const ROL_LABELS: Record<AnexoRol, string> = {
    odontologo: 'Odontólogo/a',
    asistente: 'Asistente Dental',
    laboratorio: 'Laboratorista Digital',
    admin: 'Administrativo/a y Gestión',
    fidelizacion: 'Fidelización y Ventas',
    marketing: 'Marketing y Comunicación',
};

function formatDate(iso: string): string {
    try {
        return new Date(iso).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
        });
    } catch {
        return iso;
    }
}

interface Props {
    worker: WorkerProfile;
}

export default function StaffContractSection({ worker }: Props) {
    const [contratos, setContratos] = useState<ContractRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(false);
    const [markingId, setMarkingId] = useState<string | null>(null);

    const fetchContratos = useCallback(async () => {
        setLoading(true);
        const data = await getPersonalContratos(worker.id);
        setContratos(data);
        setLoading(false);
    }, [worker.id]);

    useEffect(() => {
        fetchContratos();
    }, [fetchContratos]);

    async function handleGenerate() {
        setGenerating(true);
        try {
            // Resolve role from server
            const anexoRol = await getAnexoRolForPersonal(worker.id);

            // Dynamic import to keep jsPDF out of the server bundle
            const { generateStaffContractPDF } = await import('@/lib/staff-contracts/pdf-generator');

            const fecha = new Date();
            const blob = generateStaffContractPDF({
                nombre: worker.nombre,
                apellido: worker.apellido || '',
                dni: worker.documento || '—',
                domicilio: worker.direccion || '—',
                fecha,
                anexoRol,
            });

            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Contrato_${worker.apellido || worker.nombre}_${fecha.toISOString().split('T')[0]}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Convert blob to base64 and record in DB
            const arrayBuffer = await blob.arrayBuffer();
            const uint8 = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < uint8.byteLength; i++) {
                binary += String.fromCharCode(uint8[i]);
            }
            const pdfBase64 = btoa(binary);

            const result = await recordStaffContractAction(worker.id, pdfBase64);

            if (result.success) {
                toast.success('Contrato generado y descargado');
                await fetchContratos();
            } else {
                // PDF was downloaded; DB record failed — warn but don't block
                toast.warning(`Contrato descargado, pero no se pudo registrar: ${result.error}`);
            }
        } catch (err) {
            console.error('[StaffContractSection] generate error:', err);
            toast.error(err instanceof Error ? err.message : 'Error al generar el contrato');
        } finally {
            setGenerating(false);
        }
    }

    async function handleMarkSigned(contratoId: string) {
        setMarkingId(contratoId);
        const result = await markContractSignedAction(contratoId);
        if (result.success) {
            toast.success('Contrato marcado como firmado');
            setContratos(prev =>
                prev.map(c =>
                    c.id === contratoId
                        ? { ...c, estado: 'firmado', firmado_at: new Date().toISOString() }
                        : c
                )
            );
        } else {
            toast.error(result.error || 'Error al marcar como firmado');
        }
        setMarkingId(null);
    }

    return (
        <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-3">
                    <FileText className="text-violet-400" size={20} />
                    <h3 className="font-bold text-white">Contratos</h3>
                    {contratos.length > 0 && (
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full">
                            {contratos.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-violet-500/20"
                >
                    {generating ? (
                        <>
                            <RefreshCw size={14} className="animate-spin" />
                            Generando...
                        </>
                    ) : (
                        <>
                            <FilePlus size={14} />
                            Generar contrato
                        </>
                    )}
                </button>
            </div>

            {/* Contract list */}
            {loading ? (
                <div className="flex items-center justify-center py-10">
                    <RefreshCw size={20} className="animate-spin text-slate-500" />
                </div>
            ) : contratos.length === 0 ? (
                <div className="text-center py-10">
                    <FileText size={32} className="mx-auto text-slate-700 mb-3" />
                    <p className="text-slate-500 text-sm">Sin contratos generados aún</p>
                    <p className="text-slate-600 text-xs mt-1">
                        Usá el botón de arriba para generar el primer contrato
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {contratos.map(contrato => {
                        const rolLabel = ROL_LABELS[contrato.anexo_rol] ?? contrato.anexo_rol;
                        const isPending = contrato.estado === 'pendiente_firma';
                        const isMarkingThis = markingId === contrato.id;

                        return (
                            <div
                                key={contrato.id}
                                className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/40 border border-slate-800/40 gap-3"
                            >
                                {/* Left: info */}
                                <div className="flex items-start gap-3 min-w-0">
                                    <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                                        isPending
                                            ? 'bg-amber-500/10 border border-amber-500/20'
                                            : 'bg-emerald-500/10 border border-emerald-500/20'
                                    }`}>
                                        {isPending
                                            ? <Clock size={14} className="text-amber-400" />
                                            : <CheckCircle2 size={14} className="text-emerald-400" />
                                        }
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-white truncate">{rolLabel}</p>
                                        <p className="text-[11px] text-slate-500 mt-0.5">
                                            Generado: {formatDate(contrato.generado_at)}
                                        </p>
                                        {contrato.firmado_at && (
                                            <p className="text-[11px] text-emerald-500 mt-0.5">
                                                Firmado: {formatDate(contrato.firmado_at)}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                {/* Right: badge + actions */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                                        isPending
                                            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                            : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    }`}>
                                        {isPending ? 'Pendiente firma' : 'Firmado'}
                                    </span>

                                    {contrato.drive_url && (
                                        <a
                                            href={contrato.drive_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-1.5 text-slate-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors"
                                            title="Ver PDF"
                                        >
                                            <ExternalLink size={14} />
                                        </a>
                                    )}

                                    {isPending && (
                                        <button
                                            onClick={() => handleMarkSigned(contrato.id)}
                                            disabled={isMarkingThis}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold rounded-xl transition-all disabled:opacity-50"
                                            title="Marcar como firmado"
                                        >
                                            {isMarkingThis ? (
                                                <RefreshCw size={12} className="animate-spin" />
                                            ) : (
                                                <CheckCircle2 size={12} />
                                            )}
                                            Marcar firmado
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Download hint */}
            {contratos.length > 0 && (
                <p className="mt-4 text-[10px] text-slate-600 flex items-center gap-1.5">
                    <Download size={10} />
                    Al generar un nuevo contrato se descarga el PDF automáticamente.
                </p>
            )}
        </div>
    );
}
