'use client';

import { useState, useEffect } from 'react';
import { FileText, Download, CheckCircle, Clock, ChevronDown, ChevronUp, User } from 'lucide-react';
import { toast } from 'sonner';
import { getPersonal, type Personal } from '@/lib/caja-admin';
import { getPersonalContratos, recordStaffContractAction, markContractSignedAction } from '@/app/actions/staff-contracts';
import { generateStaffContractPDF } from '@/lib/staff-contracts/pdf-generator';
import type { ContractRecord } from '@/lib/staff-contracts/types';

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PersonalContratoRow({ worker }: { worker: Personal }) {
    const [expanded, setExpanded] = useState(false);
    const [contratos, setContratos] = useState<ContractRecord[]>([]);
    const [loadingContratos, setLoadingContratos] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [signingId, setSigningId] = useState<string | null>(null);

    async function loadContratos() {
        if (loadingContratos) return;
        setLoadingContratos(true);
        const data = await getPersonalContratos(worker.id);
        setContratos(data);
        setLoadingContratos(false);
    }

    function toggle() {
        const next = !expanded;
        setExpanded(next);
        if (next && contratos.length === 0) {
            void loadContratos();
        }
    }

    async function handleGenerate() {
        setGenerating(true);
        try {
            const nombre = worker.nombre || '';
            const apellido = worker.apellido || '';
            const dni = worker.documento || '—';
            const domicilio = [worker.direccion, worker.barrio_localidad].filter(Boolean).join(', ') || '—';

            // Derive anexoRol from worker data (mirrors server-side deriveAnexoRol)
            const { deriveAnexoRolClient } = await import('@/lib/staff-contracts/derive-rol');
            const anexoRol = deriveAnexoRolClient(worker.area || '', worker.tipo || '');

            const blob = generateStaffContractPDF({
                nombre,
                apellido,
                dni,
                domicilio,
                fecha: new Date(),
                anexoRol,
            });

            // Trigger download
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Contrato_${apellido}_${nombre}_${new Date().toISOString().slice(0, 10)}.pdf`;
            a.click();
            URL.revokeObjectURL(url);

            // Record in DB (pass base64)
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const result = await recordStaffContractAction(worker.id, base64);
                if (result.success && result.contrato) {
                    setContratos(prev => [result.contrato!, ...prev]);
                    toast.success('Contrato generado y registrado');
                    if (!expanded) setExpanded(true);
                } else {
                    toast.warning('PDF descargado, pero no se pudo registrar: ' + (result.error || 'Error desconocido'));
                }
            };
            reader.readAsDataURL(blob);
        } catch (err) {
            console.error(err);
            toast.error('Error al generar el contrato');
        } finally {
            setGenerating(false);
        }
    }

    async function handleSign(contratoId: string) {
        setSigningId(contratoId);
        const result = await markContractSignedAction(contratoId);
        if (result.success) {
            setContratos(prev => prev.map(c =>
                c.id === contratoId ? { ...c, estado: 'firmado', firmado_at: new Date().toISOString() } : c
            ));
            toast.success('Contrato marcado como firmado');
        } else {
            toast.error(result.error || 'Error al marcar como firmado');
        }
        setSigningId(null);
    }

    const pendingCount = contratos.filter(c => c.estado === 'pendiente_firma').length;

    return (
        <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
            {/* Worker row */}
            <div className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4 text-teal-400" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-medium text-white truncate">
                            {worker.nombre} {worker.apellido}
                        </p>
                        <p className="text-xs text-slate-400 truncate capitalize">
                            {worker.area || worker.tipo || '—'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                    {pendingCount > 0 && (
                        <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/25">
                            <Clock className="w-3 h-3" />
                            {pendingCount} pendiente{pendingCount > 1 ? 's' : ''}
                        </span>
                    )}
                    <button
                        onClick={handleGenerate}
                        disabled={generating}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 transition-colors disabled:opacity-50"
                    >
                        <Download className="w-3.5 h-3.5" />
                        {generating ? 'Generando...' : 'Generar'}
                    </button>
                    <button
                        onClick={toggle}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors"
                    >
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Contract history */}
            {expanded && (
                <div className="border-t border-white/10 px-4 py-3">
                    {loadingContratos ? (
                        <p className="text-xs text-slate-500 py-2">Cargando historial...</p>
                    ) : contratos.length === 0 ? (
                        <p className="text-xs text-slate-500 py-2">Sin contratos generados aún.</p>
                    ) : (
                        <div className="space-y-2">
                            {contratos.map(c => (
                                <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-xs text-slate-300 capitalize">{c.anexo_rol}</p>
                                            <p className="text-[11px] text-slate-500">{formatDate(c.generado_at)}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        {c.estado === 'firmado' ? (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-400">
                                                <CheckCircle className="w-3 h-3" />
                                                Firmado
                                            </span>
                                        ) : (
                                            <>
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300">
                                                    <Clock className="w-3 h-3" />
                                                    Pendiente
                                                </span>
                                                <button
                                                    onClick={() => handleSign(c.id)}
                                                    disabled={signingId === c.id}
                                                    className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 transition-colors disabled:opacity-50"
                                                >
                                                    {signingId === c.id ? '...' : 'Marcar firmado'}
                                                </button>
                                            </>
                                        )}
                                        {c.drive_url && (
                                            <a
                                                href={c.drive_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[11px] px-2 py-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition-colors"
                                            >
                                                Ver PDF
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function ContratosTab() {
    const [workers, setWorkers] = useState<Personal[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    useEffect(() => {
        void loadWorkers();
    }, []);

    async function loadWorkers() {
        setLoading(true);
        const data = await getPersonal();
        setWorkers(data);
        setLoading(false);
    }

    const filtered = workers.filter(w => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            w.nombre?.toLowerCase().includes(q) ||
            w.apellido?.toLowerCase().includes(q) ||
            w.area?.toLowerCase().includes(q)
        );
    });

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-white">Contratos de Personal</h2>
                    <p className="text-sm text-slate-400 mt-0.5">
                        Generá y registrá contratos de locación de servicios para cada prestador.
                    </p>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <input
                    type="text"
                    placeholder="Buscar prestador..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full sm:w-72 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                />
            </div>

            {/* Workers list */}
            {loading ? (
                <div className="text-center py-12 text-slate-500 text-sm">Cargando prestadores...</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                    {search ? 'Sin resultados para esa búsqueda.' : 'No hay prestadores activos.'}
                </div>
            ) : (
                <div className="space-y-2">
                    {filtered.map(w => (
                        <PersonalContratoRow key={w.id} worker={w} />
                    ))}
                </div>
            )}
        </div>
    );
}
