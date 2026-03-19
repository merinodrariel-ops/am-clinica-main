'use client';

import { useState, useEffect } from 'react';
import {
    FileText, Download, CheckCircle, Clock, ChevronDown, ChevronUp,
    User, X, Eye, Settings, List, FileDown, Sparkles, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { getPersonal, type Personal } from '@/lib/caja-admin';
import { getPersonalContratos, recordStaffContractAction, markContractSignedAction } from '@/app/actions/staff-contracts';
import { generateStaffContractPDF } from '@/lib/staff-contracts/pdf-generator';
import { deriveAnexoRolClient } from '@/lib/staff-contracts/derive-rol';
import {
    loadStoredTemplates,
    assembleContractFullText,
    type ContractTextParams,
} from '@/lib/staff-contracts/template-store';
import { generateContractWord } from '@/lib/staff-contracts/word-generator';
import { assistFullContractAction } from '@/app/actions/contract-ai';
import type { ContractRecord, AnexoRol } from '@/lib/staff-contracts/types';
import ContratosConfigView from './ContratosConfigView';

const ANEXO_LABELS: Record<AnexoRol, string> = {
    odontologo: 'Odontólogo/a',
    asistente: 'Asistente dental',
    laboratorio: 'Laboratorio',
    admin: 'Administrativo/a',
    fidelizacion: 'Fidelización de pacientes',
    marketing: 'Marketing',
};

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Preview modal ──────────────────────────────────────────────────────────

interface PreviewForm {
    nombre: string;
    apellido: string;
    dni: string;
    domicilio: string;
    fecha: string;
    anexoRol: AnexoRol;
}

type PreviewView = 'datos' | 'texto';

interface PreviewModalProps {
    worker: Personal;
    onClose: () => void;
    onDownloaded: (contrato: ContractRecord) => void;
}

function PreviewModal({ worker, onClose, onDownloaded }: PreviewModalProps) {
    const [form, setForm] = useState<PreviewForm>({
        nombre: worker.nombre || '',
        apellido: worker.apellido || '',
        dni: worker.documento || '',
        domicilio: [worker.direccion, worker.barrio_localidad].filter(Boolean).join(', '),
        fecha: new Date().toISOString().slice(0, 10),
        anexoRol: deriveAnexoRolClient(worker.area || '', worker.tipo || ''),
    });
    const [view, setView] = useState<PreviewView>('datos');
    const [contractText, setContractText] = useState('');
    const [downloading, setDownloading] = useState(false);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiReply, setAiReply] = useState<string | null>(null);

    function set(field: keyof PreviewForm, value: string) {
        setForm(prev => ({ ...prev, [field]: value }));
    }

    function buildParams(): ContractTextParams {
        return {
            nombre: form.nombre,
            apellido: form.apellido,
            dni: form.dni || '—',
            domicilio: form.domicilio || '—',
            fecha: new Date(form.fecha + 'T12:00:00'),
            anexoRol: form.anexoRol,
            templates: loadStoredTemplates(),
        };
    }

    function openTextView() {
        setContractText(assembleContractFullText(buildParams()));
        setView('texto');
    }

    async function handleAIAssist() {
        if (!aiInstruction.trim()) return;
        setAiLoading(true);
        setAiReply(null);
        const result = await assistFullContractAction(contractText, aiInstruction);
        setAiLoading(false);
        if (result.reply) {
            setAiReply(result.reply);
        } else {
            toast.error(result.error || 'Error en la IA');
        }
    }

    async function handleDownloadPDF() {
        setDownloading(true);
        try {
            const params = buildParams();
            const blob = generateStaffContractPDF({
                nombre: params.nombre,
                apellido: params.apellido,
                dni: params.dni,
                domicilio: params.domicilio,
                fecha: params.fecha,
                anexoRol: params.anexoRol,
            });

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Contrato_${form.apellido}_${form.nombre}_${form.fecha}.pdf`;
            a.click();
            URL.revokeObjectURL(url);

            // Record in DB
            const reader = new FileReader();
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const result = await recordStaffContractAction(worker.id, base64);
                if (result.success && result.contrato) {
                    onDownloaded(result.contrato);
                    toast.success('Contrato PDF descargado y registrado');
                } else {
                    toast.warning('PDF descargado, no se pudo registrar: ' + (result.error || 'Error'));
                }
                onClose();
            };
            reader.readAsDataURL(blob);
        } catch (err) {
            console.error(err);
            toast.error('Error al generar el PDF');
            setDownloading(false);
        }
    }

    function handleDownloadWord() {
        const text = view === 'texto' ? contractText : assembleContractFullText(buildParams());
        generateContractWord(text, `Contrato_${form.apellido}_${form.nombre}_${form.fecha}.doc`);
        toast.success('Contrato Word descargado');
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-[#0f1623] border border-white/10 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <Eye className="w-5 h-5 text-teal-400" />
                        <h2 className="text-base font-semibold text-white">Revisar contrato</h2>
                        {/* View toggle */}
                        <div className="flex rounded-lg border border-white/10 overflow-hidden ml-2">
                            <button
                                onClick={() => setView('datos')}
                                className={`px-3 py-1 text-xs font-medium transition-colors ${view === 'datos' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-white'}`}
                            >
                                Datos
                            </button>
                            <button
                                onClick={openTextView}
                                className={`px-3 py-1 text-xs font-medium transition-colors ${view === 'texto' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-white'}`}
                            >
                                Texto completo
                            </button>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                    {view === 'datos' ? (
                        <>
                            <p className="text-xs text-slate-400">Revisá y corregí los datos. Podés ver el texto completo en la pestaña "Texto completo".</p>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">Nombre</label>
                                    <input value={form.nombre} onChange={e => set('nombre', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">Apellido</label>
                                    <input value={form.apellido} onChange={e => set('apellido', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">DNI</label>
                                    <input value={form.dni} onChange={e => set('dni', e.target.value)} placeholder="Sin puntos"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-400">Fecha del contrato</label>
                                    <input type="date" value={form.fecha} onChange={e => set('fecha', e.target.value)}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50" />
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-400">Domicilio</label>
                                <input value={form.domicilio} onChange={e => set('domicilio', e.target.value)} placeholder="Calle, número, localidad"
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50" />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-medium text-slate-400">Rol / Anexo A</label>
                                <select value={form.anexoRol} onChange={e => set('anexoRol', e.target.value as AnexoRol)}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500/50">
                                    {(Object.entries(ANEXO_LABELS) as [AnexoRol, string][]).map(([val, label]) => (
                                        <option key={val} value={val} className="bg-slate-900">{label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Summary */}
                            <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-1.5 text-xs text-slate-300">
                                <p className="font-semibold text-white text-sm mb-2">Resumen</p>
                                <p><span className="text-slate-500">Partes:</span> Full Esthetic S.A. y <strong>{form.nombre} {form.apellido}</strong>{form.dni ? `, DNI ${form.dni}` : ''}</p>
                                <p><span className="text-slate-500">Domicilio:</span> {form.domicilio || <em className="text-slate-500">No especificado</em>}</p>
                                <p><span className="text-slate-500">Fecha:</span> {form.fecha ? new Date(form.fecha + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'}</p>
                                <p><span className="text-slate-500">Anexo A:</span> {ANEXO_LABELS[form.anexoRol]}</p>
                                <p className="text-slate-500 pt-1">Incluye: Contrato maestro + Anexo A (funciones del rol) + Anexo B (normas de convivencia)</p>
                            </div>
                        </>
                    ) : (
                        <>
                            <p className="text-xs text-slate-400">
                                Texto completo del contrato. Editá lo que necesites antes de descargar. Para cambios permanentes usá <strong>Configuración</strong>.
                            </p>

                            <textarea
                                value={contractText}
                                onChange={e => { setContractText(e.target.value); setAiReply(null); }}
                                rows={20}
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-3 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-y font-mono leading-relaxed"
                            />

                            {/* IA assistant panel */}
                            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-purple-400" />
                                    <span className="text-sm font-medium text-purple-300">Asistente IA</span>
                                    <span className="text-xs text-slate-500">— Preguntá o pedí cambios sobre el contrato</span>
                                </div>

                                <div className="flex gap-2">
                                    <input
                                        value={aiInstruction}
                                        onChange={e => setAiInstruction(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && void handleAIAssist()}
                                        placeholder='Ej: "¿Falta alguna cláusula importante?" o "Reescribí la parte de honorarios de forma más clara"'
                                        className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-slate-600"
                                    />
                                    <button
                                        onClick={handleAIAssist}
                                        disabled={aiLoading || !aiInstruction.trim()}
                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition-colors disabled:opacity-50 flex-shrink-0"
                                    >
                                        <Sparkles className="w-3.5 h-3.5" />
                                        {aiLoading ? 'Pensando...' : 'Consultar'}
                                    </button>
                                </div>

                                {aiReply && (
                                    <div className="rounded-lg bg-black/20 border border-purple-500/20 p-3 space-y-2">
                                        <p className="text-xs font-medium text-purple-300">Respuesta:</p>
                                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{aiReply}</p>
                                        {/* If reply looks like a full contract (long), offer to apply it */}
                                        {aiReply.length > 500 && (
                                            <div className="flex gap-2 pt-1">
                                                <button
                                                    onClick={() => { setContractText(aiReply); setAiReply(null); setAiInstruction(''); }}
                                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors"
                                                >
                                                    <Check className="w-3 h-3" /> Aplicar al contrato
                                                </button>
                                                <button
                                                    onClick={() => setAiReply(null)}
                                                    className="inline-flex items-center gap-1 px-3 py-1 rounded-md text-xs bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
                                                >
                                                    <X className="w-3 h-3" /> Descartar
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-white/10 flex-shrink-0">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
                        Cancelar
                    </button>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleDownloadWord}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 transition-colors"
                        >
                            <FileDown className="w-4 h-4" />
                            Word (.doc)
                        </button>
                        <button
                            onClick={handleDownloadPDF}
                            disabled={downloading || !form.nombre || !form.apellido}
                            className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 transition-colors disabled:opacity-50"
                        >
                            <Download className="w-4 h-4" />
                            {downloading ? 'Generando...' : 'PDF'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Worker row ─────────────────────────────────────────────────────────────

function PersonalContratoRow({ worker }: { worker: Personal }) {
    const [expanded, setExpanded] = useState(false);
    const [contratos, setContratos] = useState<ContractRecord[]>([]);
    const [loadingContratos, setLoadingContratos] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
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
        if (next && contratos.length === 0) void loadContratos();
    }

    function handleDownloaded(contrato: ContractRecord) {
        setContratos(prev => [contrato, ...prev]);
        setShowPreview(false);
        if (!expanded) setExpanded(true);
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
        <>
            <div className="rounded-xl border border-white/10 bg-white/5 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-teal-500/20 flex items-center justify-center flex-shrink-0">
                            <User className="w-4 h-4 text-teal-400" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-white truncate">{worker.nombre} {worker.apellido}</p>
                            <p className="text-xs text-slate-400 truncate capitalize">{worker.area || worker.tipo || '—'}</p>
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
                            onClick={() => setShowPreview(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 transition-colors"
                        >
                            <FileText className="w-3.5 h-3.5" />
                            Generar
                        </button>
                        <button onClick={toggle} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                    </div>
                </div>

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
                                                <p className="text-xs text-slate-300">{ANEXO_LABELS[c.anexo_rol as AnexoRol] ?? c.anexo_rol}</p>
                                                <p className="text-[11px] text-slate-500">{formatDate(c.generado_at)}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {c.estado === 'firmado' ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-400">
                                                    <CheckCircle className="w-3 h-3" /> Firmado
                                                </span>
                                            ) : (
                                                <>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300">
                                                        <Clock className="w-3 h-3" /> Pendiente firma
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
                                                <a href={c.drive_url} target="_blank" rel="noopener noreferrer"
                                                    className="text-[11px] px-2 py-0.5 rounded-md bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 transition-colors">
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

            {showPreview && (
                <PreviewModal worker={worker} onClose={() => setShowPreview(false)} onDownloaded={handleDownloaded} />
            )}
        </>
    );
}

// ─── Main tab ────────────────────────────────────────────────────────────────

type View = 'prestadores' | 'configuracion';

export default function ContratosTab() {
    const [view, setView] = useState<View>('prestadores');
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
            {/* Header + view toggle */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                    <h2 className="text-lg font-semibold text-white">Contratos de Personal</h2>
                    <p className="text-sm text-slate-400 mt-0.5">
                        Generá contratos de locación de servicios para cada prestador.
                    </p>
                </div>
                <div className="flex rounded-xl border border-white/10 overflow-hidden">
                    <button
                        onClick={() => setView('prestadores')}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${view === 'prestadores' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <List className="w-4 h-4" />
                        Prestadores
                    </button>
                    <button
                        onClick={() => setView('configuracion')}
                        className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${view === 'configuracion' ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                    >
                        <Settings className="w-4 h-4" />
                        Configuración
                    </button>
                </div>
            </div>

            {view === 'configuracion' ? (
                <ContratosConfigView />
            ) : (
                <>
                    <input
                        type="text"
                        placeholder="Buscar prestador..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full sm:w-72 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
                    />

                    {loading ? (
                        <div className="text-center py-12 text-slate-500 text-sm">Cargando prestadores...</div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-12 text-slate-500 text-sm">
                            {search ? 'Sin resultados.' : 'No hay prestadores activos.'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map(w => (
                                <PersonalContratoRow key={w.id} worker={w} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
