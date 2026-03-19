'use client';

import { useState, useEffect } from 'react';
import { Pencil, RotateCcw, Sparkles, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import {
    loadStoredTemplates,
    saveStoredTemplates,
    getMasterClauses,
    getAnexoBNormas,
    getReciboTemplate,
} from '@/lib/staff-contracts/template-store';
import { getAnexoA } from '@/lib/staff-contracts/template-store';
import {
    DEFAULT_MASTER_CLAUSES,
    DEFAULT_ANEXOB_NORMAS,
    DEFAULT_RECIBO_TEMPLATE,
    type StoredTemplates,
} from '@/lib/staff-contracts/templates-default';
import { ANEXO_A_MAP } from '@/lib/staff-contracts/anexo-a';
import { improveContractClauseAction } from '@/app/actions/contract-ai';
import type { AnexoRol } from '@/lib/staff-contracts/types';

const ANEXO_A_ROLES: { rol: AnexoRol; label: string }[] = [
    { rol: 'odontologo', label: 'Odontólogo/a' },
    { rol: 'asistente', label: 'Asistente Dental' },
    { rol: 'laboratorio', label: 'Laboratorista Digital' },
    { rol: 'admin', label: 'Administrativo/a' },
    { rol: 'fidelizacion', label: 'Fidelización de Pacientes' },
    { rol: 'marketing', label: 'Marketing y Comunicación' },
];

// ─── Clause editor ──────────────────────────────────────────────────────────

interface ClauseEditorProps {
    heading: string;
    defaultBody: string;
    storedBody: string | undefined;
    onSave: (body: string) => void;
    onReset: () => void;
}

function ClauseEditor({ heading, defaultBody, storedBody, onSave, onReset }: ClauseEditorProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState(storedBody ?? defaultBody);
    const [aiInstruction, setAiInstruction] = useState('');
    const [aiLoading, setAiLoading] = useState(false);
    const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
    const isCustom = !!storedBody && storedBody !== defaultBody;

    function handleSave() {
        onSave(draft);
        toast.success('Cláusula guardada');
        setOpen(false);
    }

    function handleReset() {
        setDraft(defaultBody);
        onReset();
        toast.success('Cláusula restaurada al original');
    }

    async function handleAI() {
        setAiLoading(true);
        setAiSuggestion(null);
        const result = await improveContractClauseAction(heading, draft, aiInstruction);
        setAiLoading(false);
        if (result.improved) {
            setAiSuggestion(result.improved);
        } else {
            toast.error(result.error || 'Error en IA');
        }
    }

    return (
        <div className={`rounded-xl border ${isCustom ? 'border-teal-500/30 bg-teal-500/5' : 'border-white/10 bg-white/5'} overflow-hidden`}>
            <button
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2 min-w-0">
                    {isCustom && <span className="w-2 h-2 rounded-full bg-teal-400 flex-shrink-0" />}
                    <span className="text-sm font-medium text-white truncate">{heading}</span>
                </div>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
            </button>

            {open && (
                <div className="border-t border-white/10 px-4 py-4 space-y-3">
                    <textarea
                        value={draft}
                        onChange={e => setDraft(e.target.value)}
                        rows={6}
                        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-teal-500/50 resize-y font-mono leading-relaxed"
                    />

                    {/* AI assist */}
                    <div className="flex gap-2">
                        <input
                            value={aiInstruction}
                            onChange={e => setAiInstruction(e.target.value)}
                            placeholder="Instrucción para la IA (opcional)..."
                            className="flex-1 bg-black/20 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500/50 placeholder-slate-600"
                        />
                        <button
                            onClick={handleAI}
                            disabled={aiLoading}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 transition-colors disabled:opacity-50 flex-shrink-0"
                        >
                            <Sparkles className="w-3.5 h-3.5" />
                            {aiLoading ? 'Pensando...' : 'Mejorar con IA'}
                        </button>
                    </div>

                    {aiSuggestion && (
                        <div className="rounded-lg bg-purple-500/10 border border-purple-500/20 p-3 space-y-2">
                            <p className="text-xs font-medium text-purple-300">Sugerencia de la IA:</p>
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">{aiSuggestion}</p>
                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => { setDraft(aiSuggestion); setAiSuggestion(null); }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors"
                                >
                                    <Check className="w-3 h-3" /> Aceptar
                                </button>
                                <button
                                    onClick={() => setAiSuggestion(null)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-white/5 hover:bg-white/10 text-slate-400 transition-colors"
                                >
                                    <X className="w-3 h-3" /> Descartar
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                        <button
                            onClick={handleReset}
                            disabled={!isCustom && draft === defaultBody}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-40"
                        >
                            <RotateCcw className="w-3.5 h-3.5" />
                            Restaurar original
                        </button>
                        <button
                            onClick={handleSave}
                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 border border-teal-500/30 transition-colors"
                        >
                            <Pencil className="w-3.5 h-3.5" />
                            Guardar cambios
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
    const [open, setOpen] = useState(true);
    return (
        <div className="space-y-2">
            <button
                onClick={() => setOpen(v => !v)}
                className="flex items-center gap-2 w-full text-left"
            >
                {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                <span className="text-sm font-semibold text-slate-300">{title}</span>
                {count !== undefined && (
                    <span className="text-xs text-slate-500 ml-1">({count} ítems)</span>
                )}
            </button>
            {open && <div className="space-y-2 pl-2">{children}</div>}
        </div>
    );
}

// ─── Main config view ────────────────────────────────────────────────────────

export default function ContratosConfigView() {
    const [templates, setTemplates] = useState<StoredTemplates>({});
    const [activeAnexoRol, setActiveAnexoRol] = useState<AnexoRol>('odontologo');

    useEffect(() => {
        setTemplates(loadStoredTemplates());
    }, []);

    function persistAndUpdate(updates: Partial<StoredTemplates>) {
        const next = { ...templates, ...updates };
        setTemplates(next);
        saveStoredTemplates(next);
    }

    // ── Master clauses ──────────────────────────────────────────────
    const masterClauses = getMasterClauses(templates);
    function saveMasterClause(idx: number, body: string) {
        const updated = [...masterClauses];
        updated[idx] = { ...updated[idx], body };
        persistAndUpdate({ master_clauses: updated });
    }
    function resetMasterClause(idx: number) {
        const updated = [...masterClauses];
        updated[idx] = { ...updated[idx], body: DEFAULT_MASTER_CLAUSES[idx].body };
        const allDefault = updated.every((cl, i) => cl.body === DEFAULT_MASTER_CLAUSES[i].body);
        persistAndUpdate({ master_clauses: allDefault ? undefined : updated });
    }

    // ── Anexo A ─────────────────────────────────────────────────────
    const currentAnexoA = getAnexoA(activeAnexoRol, templates);
    function saveAnexoA(rol: AnexoRol, funciones: string) {
        const prev = templates.anexo_a ?? {};
        persistAndUpdate({ anexo_a: { ...prev, [rol]: { titulo: ANEXO_A_MAP[rol].titulo, funciones } } });
    }
    function resetAnexoA(rol: AnexoRol) {
        const prev = { ...(templates.anexo_a ?? {}) };
        delete prev[rol];
        persistAndUpdate({ anexo_a: Object.keys(prev).length ? prev : undefined });
    }

    // ── Anexo B ─────────────────────────────────────────────────────
    const normas = getAnexoBNormas(templates);
    function saveNorma(idx: number, texto: string) {
        const updated = [...normas];
        updated[idx] = { ...updated[idx], texto };
        persistAndUpdate({ anexo_b_normas: updated });
    }
    function resetNorma(idx: number) {
        const updated = [...normas];
        updated[idx] = { ...updated[idx], texto: DEFAULT_ANEXOB_NORMAS[idx].texto };
        const allDefault = updated.every((n, i) => n.texto === DEFAULT_ANEXOB_NORMAS[i].texto);
        persistAndUpdate({ anexo_b_normas: allDefault ? undefined : updated });
    }

    // ── Recibo ──────────────────────────────────────────────────────
    const reciboText = getReciboTemplate(templates);

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-base font-semibold text-white">Configuración de Plantillas</h3>
                <p className="text-xs text-slate-400 mt-1">
                    Editá el texto de cada cláusula o sección. Los cambios se guardan en este navegador y se usan en los próximos contratos generados.
                    Los ítems con el punto verde <span className="inline-block w-2 h-2 rounded-full bg-teal-400 align-middle mx-1" /> tienen texto personalizado.
                </p>
            </div>

            {/* ── CONTRATO MAESTRO ── */}
            <Section title="Contrato Maestro" count={masterClauses.length}>
                {masterClauses.map((cl, idx) => (
                    <ClauseEditor
                        key={idx}
                        heading={cl.heading}
                        defaultBody={DEFAULT_MASTER_CLAUSES[idx].body}
                        storedBody={templates.master_clauses?.[idx]?.body !== DEFAULT_MASTER_CLAUSES[idx].body
                            ? templates.master_clauses?.[idx]?.body
                            : undefined}
                        onSave={(body) => saveMasterClause(idx, body)}
                        onReset={() => resetMasterClause(idx)}
                    />
                ))}
            </Section>

            {/* ── ANEXO A ── */}
            <Section title="Anexo A — Descripción de Funciones por Rol">
                {/* Rol selector */}
                <div className="flex flex-wrap gap-1.5 pb-1">
                    {ANEXO_A_ROLES.map(({ rol, label }) => {
                        const isCustom = !!templates.anexo_a?.[rol];
                        return (
                            <button
                                key={rol}
                                onClick={() => setActiveAnexoRol(rol)}
                                className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors ${activeAnexoRol === rol
                                    ? 'bg-teal-500/30 text-teal-200 border border-teal-500/40'
                                    : 'bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10'
                                    }`}
                            >
                                {isCustom && <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />}
                                {label}
                            </button>
                        );
                    })}
                </div>

                <ClauseEditor
                    key={activeAnexoRol}
                    heading={`Funciones — ${currentAnexoA.titulo}`}
                    defaultBody={ANEXO_A_MAP[activeAnexoRol].funciones}
                    storedBody={templates.anexo_a?.[activeAnexoRol]?.funciones !== ANEXO_A_MAP[activeAnexoRol].funciones
                        ? templates.anexo_a?.[activeAnexoRol]?.funciones
                        : undefined}
                    onSave={(body) => saveAnexoA(activeAnexoRol, body)}
                    onReset={() => resetAnexoA(activeAnexoRol)}
                />
            </Section>

            {/* ── ANEXO B ── */}
            <Section title="Anexo B — Normas de Convivencia" count={normas.length}>
                {normas.map((norma, idx) => (
                    <ClauseEditor
                        key={idx}
                        heading={`${norma.num} ${norma.titulo}`}
                        defaultBody={DEFAULT_ANEXOB_NORMAS[idx].texto}
                        storedBody={templates.anexo_b_normas?.[idx]?.texto !== DEFAULT_ANEXOB_NORMAS[idx].texto
                            ? templates.anexo_b_normas?.[idx]?.texto
                            : undefined}
                        onSave={(texto) => saveNorma(idx, texto)}
                        onReset={() => resetNorma(idx)}
                    />
                ))}
            </Section>

            {/* ── RECIBO ── */}
            <Section title="Recibo de Liquidación">
                <ClauseEditor
                    heading="Plantilla del Recibo"
                    defaultBody={DEFAULT_RECIBO_TEMPLATE}
                    storedBody={templates.recibo !== DEFAULT_RECIBO_TEMPLATE ? templates.recibo : undefined}
                    onSave={(text) => persistAndUpdate({ recibo: text })}
                    onReset={() => persistAndUpdate({ recibo: undefined })}
                />
                <p className="text-[11px] text-slate-500 pl-1">
                    Variables disponibles: {'{{nombre_apellido}}'}, {'{{dni}}'}, {'{{fecha}}'}, {'{{periodo}}'}, {'{{rol}}'}, {'{{monto_total}}'}, {'{{moneda}}'}, {'{{forma_pago}}'}, {'{{detalle_liquidacion}}'}
                </p>
            </Section>
        </div>
    );
}
