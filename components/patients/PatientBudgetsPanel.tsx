'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Download, FileText, Loader2, Plus, Save, Sparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import {
    createPatientPresupuesto,
    listPatientPresupuestos,
    updatePatientPresupuesto,
} from '@/app/actions/presupuestos';
import type { PresupuestoPayload, PresupuestoRecord } from '@/lib/presupuesto-types';
import { AM_REFERENCE_CASES, DEFAULT_CASE_SLUGS } from '@/lib/presupuesto-brand';
import { buildFinancingRows, generatePresupuestoPdf } from '@/lib/presupuesto-pdf';

const emptyAlternative = () => ({ title: '', description: '', total: 0, currency: 'USD' as const });

function initialPayload(patientName: string): PresupuestoPayload {
    return {
        patientName,
        intro: 'Diseñamos una propuesta personalizada para acompañarte en el camino hacia la sonrisa que estás buscando.',
        alternatives: [emptyAlternative()],
        financing: '',
        guarantee: 'Te acompañamos con garantía y seguimiento según las condiciones clínicas informadas por el equipo.',
        conditions: 'Los tratamientos y resultados quedan sujetos a evaluación y planificación clínica.',
        cta: 'Esta propuesta tiene una validez de 7 días corridos. Para mantener estas condiciones y reservar tus turnos, podés confirmar el tratamiento abonando una seña.',
        photoUrls: [],
        caseSlugs: DEFAULT_CASE_SLUGS,
        financingUpfrontPct: 50,
        financingBaseIndex: 0,
    };
}

const inputClass =
    'w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none transition focus:border-amber-400 focus:bg-white dark:border-gray-700 dark:bg-gray-800 dark:focus:bg-gray-800';
const labelClass = 'block text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500';

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3 border-t border-gray-100 pt-5 first:border-0 first:pt-0 dark:border-gray-800">
            <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-500">{title}</h3>
                {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
            </div>
            {children}
        </section>
    );
}

export default function PatientBudgetsPanel({
    patientId,
    patientName,
    initialPhotoUrls = [],
}: {
    patientId: string;
    patientName: string;
    initialPhotoUrls?: string[];
}) {
    const [records, setRecords] = useState<PresupuestoRecord[]>([]);
    const [active, setActive] = useState<PresupuestoRecord | null>(null);
    const [payload, setPayload] = useState<PresupuestoPayload>(() => ({
        ...initialPayload(patientName),
        photoUrls: initialPhotoUrls,
    }));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void listPatientPresupuestos(patientId).then((result) => {
            if (cancelled) return;
            if (!result.success) toast.error(result.error);
            setRecords(result.data || []);
            setLoading(false);
        });
        return () => {
            cancelled = true;
        };
    }, [patientId]);

    const selectedCases = payload.caseSlugs?.length ? payload.caseSlugs : DEFAULT_CASE_SLUGS;
    const financing = useMemo(() => buildFinancingRows(payload), [payload]);

    function startNew() {
        setActive(null);
        setPayload({ ...initialPayload(patientName), photoUrls: initialPhotoUrls });
    }

    function edit(record: PresupuestoRecord) {
        setActive(record);
        setPayload({ ...initialPayload(record.payload.patientName || patientName), ...record.payload });
    }

    function updateField<K extends keyof PresupuestoPayload>(key: K, value: PresupuestoPayload[K]) {
        setPayload((current) => ({ ...current, [key]: value }));
    }

    function toggleCase(slug: string) {
        const current = selectedCases;
        if (current.includes(slug)) {
            if (current.length === 1) return;
            updateField('caseSlugs', current.filter((item) => item !== slug));
            return;
        }
        // Máximo dos portadas: la propuesta tiene que seguir siendo corta.
        const next = current.length >= 2 ? [current[1], slug] : [...current, slug];
        updateField('caseSlugs', next);
    }

    async function save() {
        setSaving(true);
        const result = active
            ? await updatePatientPresupuesto(active.id, patientId, payload)
            : await createPatientPresupuesto(patientId, payload);
        setSaving(false);
        if (!result.success || !result.data) {
            toast.error(result.error);
            return;
        }
        toast.success(active ? 'Presupuesto actualizado' : 'Presupuesto creado');
        setActive(result.data);
        const refreshed = await listPatientPresupuestos(patientId);
        if (refreshed.success) setRecords(refreshed.data || []);
    }

    function updateAlternative(index: number, key: 'title' | 'description' | 'total' | 'currency', value: string) {
        const alternatives = payload.alternatives.map((item, itemIndex) =>
            itemIndex === index ? { ...item, [key]: key === 'total' ? Number(value) || 0 : value } : item,
        );
        updateField('alternatives', alternatives);
    }

    function addAlternative() {
        if (payload.alternatives.length >= 3) return;
        updateField('alternatives', [...payload.alternatives, emptyAlternative()]);
    }

    function removeAlternative(index: number) {
        if (payload.alternatives.length === 1) return;
        const alternatives = payload.alternatives.filter((_, itemIndex) => itemIndex !== index);
        setPayload((current) => ({
            ...current,
            alternatives,
            financingBaseIndex: Math.min(current.financingBaseIndex ?? 0, alternatives.length - 1),
        }));
    }

    async function exportPdf() {
        setExporting(true);
        try {
            await generatePresupuestoPdf(payload);
        } catch {
            toast.error('No se pudo generar el PDF de la propuesta.');
        } finally {
            setExporting(false);
        }
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold">
                        <FileText size={19} /> Presupuestos
                    </h2>
                    <p className="text-xs text-gray-500">
                        Privado para Administración y Recepción. Los odontólogos no acceden a este módulo.
                    </p>
                </div>
                <button
                    onClick={startNew}
                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                >
                    <Plus size={16} /> Nuevo presupuesto
                </button>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="animate-spin" size={16} /> Cargando...
                </div>
            ) : (
                records.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {records.map((record) => (
                            <button
                                key={record.id}
                                onClick={() => edit(record)}
                                className={`rounded-lg border px-3 py-2 text-left text-xs ${
                                    active?.id === record.id
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30'
                                        : 'border-gray-200 dark:border-gray-700'
                                }`}
                            >
                                <span className="font-semibold">Versión {record.version}</span>
                                <br />
                                <span className="text-gray-500">
                                    Vence {new Date(record.expires_at).toLocaleDateString('es-AR')}
                                </span>
                            </button>
                        ))}
                    </div>
                )
            )}

            <div className="grid gap-5 lg:grid-cols-[1fr_330px]">
                <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
                    <Section title="Apertura" hint="Lo primero que lee el paciente en la portada.">
                        <label className={labelClass}>
                            Paciente
                            <input
                                className={`mt-1 ${inputClass}`}
                                value={payload.patientName}
                                onChange={(e) => updateField('patientName', e.target.value)}
                            />
                        </label>
                        <label className={labelClass}>
                            Introducción
                            <textarea
                                className={`mt-1 ${inputClass}`}
                                rows={3}
                                value={payload.intro}
                                onChange={(e) => updateField('intro', e.target.value)}
                            />
                        </label>
                    </Section>

                    <Section title="Alternativas" hint="Sólo nombre, descripción breve y total. Máximo tres.">
                        <div className="space-y-3">
                            {payload.alternatives.map((item, index) => (
                                <div key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                    <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">
                                        Opción {String(index + 1).padStart(2, '0')}
                                        {payload.alternatives.length > 1 && (
                                            <button onClick={() => removeAlternative(index)} aria-label="Quitar alternativa">
                                                <X size={14} />
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        placeholder="Nombre del tratamiento"
                                        className={`mb-2 ${inputClass}`}
                                        value={item.title}
                                        onChange={(e) => updateAlternative(index, 'title', e.target.value)}
                                    />
                                    <textarea
                                        placeholder="Descripción breve"
                                        rows={2}
                                        className={`mb-2 ${inputClass}`}
                                        value={item.description}
                                        onChange={(e) => updateAlternative(index, 'description', e.target.value)}
                                    />
                                    <div className="flex gap-2">
                                        <select
                                            className="rounded-lg border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800"
                                            value={item.currency}
                                            onChange={(e) => updateAlternative(index, 'currency', e.target.value)}
                                        >
                                            <option value="USD">USD</option>
                                            <option value="ARS">ARS</option>
                                        </select>
                                        <input
                                            type="number"
                                            min="0"
                                            placeholder="Total"
                                            className={inputClass}
                                            value={item.total || ''}
                                            onChange={(e) => updateAlternative(index, 'total', e.target.value)}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={addAlternative}
                            disabled={payload.alternatives.length >= 3}
                            className="text-xs font-semibold text-indigo-600 disabled:opacity-40"
                        >
                            + Agregar alternativa
                        </button>
                    </Section>

                    <Section title="Financiación" hint="Replica el simulador del sitio con TNA 18% anual.">
                        <div className="flex flex-wrap gap-4">
                            <div>
                                <span className={labelClass}>Anticipo</span>
                                <div className="mt-1 flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                                    {[30, 50].map((pct) => (
                                        <button
                                            key={pct}
                                            onClick={() => updateField('financingUpfrontPct', pct as 30 | 50)}
                                            className={`px-4 py-2 text-sm font-semibold transition ${
                                                (payload.financingUpfrontPct ?? 50) === pct
                                                    ? 'bg-amber-500 text-black'
                                                    : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
                                            }`}
                                        >
                                            {pct}%
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <label className={labelClass}>
                                Calculado sobre
                                <select
                                    className={`mt-1 ${inputClass}`}
                                    value={payload.financingBaseIndex ?? 0}
                                    onChange={(e) => updateField('financingBaseIndex', Number(e.target.value))}
                                >
                                    {payload.alternatives.map((item, index) => (
                                        <option key={index} value={index}>
                                            {item.title || `Opción ${index + 1}`}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <label className={labelClass}>
                            Nota adicional (opcional)
                            <textarea
                                className={`mt-1 ${inputClass}`}
                                rows={2}
                                placeholder="Ej: condiciones especiales acordadas con el paciente."
                                value={payload.financing}
                                onChange={(e) => updateField('financing', e.target.value)}
                            />
                        </label>
                    </Section>

                    <Section title="Casos de referencia" hint="Se adjuntan dos portadas reales publicadas en el sitio.">
                        <div className="grid gap-2 sm:grid-cols-2">
                            {AM_REFERENCE_CASES.map((item) => {
                                const checked = selectedCases.includes(item.slug);
                                return (
                                    <button
                                        key={item.slug}
                                        onClick={() => toggleCase(item.slug)}
                                        className={`flex gap-3 rounded-lg border p-2 text-left transition ${
                                            checked
                                                ? 'border-amber-400 bg-amber-50 dark:border-amber-500/60 dark:bg-amber-500/10'
                                                : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                                        }`}
                                    >
                                        <img
                                            src={item.image}
                                            alt={item.headline}
                                            className="h-14 w-14 shrink-0 rounded object-cover"
                                            onError={(event) => {
                                                event.currentTarget.style.visibility = 'hidden';
                                            }}
                                        />
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-500">
                                                {checked && <Check size={11} />}
                                                {item.kicker}
                                            </span>
                                            <span className="mt-0.5 block text-xs font-medium leading-snug text-gray-800 dark:text-gray-100">
                                                {item.headline}
                                            </span>
                                            <span className="text-[10px] uppercase tracking-wide text-gray-500">{item.stat}</span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </Section>

                    <Section title="Fotos del paciente" hint="Antes y diseño seleccionados desde Foto Studio.">
                        {payload.photoUrls.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                                {payload.photoUrls.map((url, index) => (
                                    <div
                                        key={`${url}-${index}`}
                                        className="relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
                                    >
                                        <img
                                            src={url}
                                            alt={`Foto ${index + 1} del presupuesto`}
                                            className="h-full w-full object-cover"
                                            onError={(event) => {
                                                event.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                        <textarea
                            className={inputClass}
                            rows={3}
                            placeholder="Las fotos seleccionadas desde Foto Studio aparecen acá. También podés pegar una URL por línea."
                            value={payload.photoUrls.join('\n')}
                            onChange={(e) =>
                                updateField(
                                    'photoUrls',
                                    e.target.value.split('\n').map((url) => url.trim()).filter(Boolean),
                                )
                            }
                        />
                    </Section>

                    <Section title="Cierre y legales">
                        <label className={labelClass}>
                            CTA final
                            <textarea
                                className={`mt-1 ${inputClass}`}
                                rows={3}
                                value={payload.cta}
                                onChange={(e) => updateField('cta', e.target.value)}
                            />
                        </label>
                        <label className={labelClass}>
                            Garantía
                            <textarea
                                className={`mt-1 ${inputClass}`}
                                rows={2}
                                value={payload.guarantee}
                                onChange={(e) => updateField('guarantee', e.target.value)}
                            />
                        </label>
                        <label className={labelClass}>
                            Condiciones
                            <textarea
                                className={`mt-1 ${inputClass}`}
                                rows={2}
                                value={payload.conditions}
                                onChange={(e) => updateField('conditions', e.target.value)}
                            />
                        </label>
                    </Section>

                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
                        <button
                            onClick={() => void save()}
                            disabled={saving}
                            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                        >
                            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Guardar presupuesto
                        </button>
                    </div>
                </div>

                <aside className="h-fit space-y-4 rounded-xl border border-[#c9a96e]/30 bg-[#0d0d0d] p-5 text-[#f2f0e9] lg:sticky lg:top-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#c9a96e]">Vista previa</p>
                        <p className="mt-1 text-base font-semibold leading-tight">
                            {payload.patientName || 'Paciente'}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.14em] text-[#8a8578]">Propuesta personalizada</p>
                    </div>

                    <div className="border-t border-[#8a7042]/40 pt-3">
                        {financing ? (
                            <>
                                <div className="flex items-baseline justify-between">
                                    <span className="text-[10px] uppercase tracking-[0.14em] text-[#8a8578]">Total</span>
                                    <span className="text-lg font-semibold text-[#c9a96e]">
                                        {financing.currency} {Math.round(financing.plans[0].breakdown.totalUsd).toLocaleString('es-AR')}
                                    </span>
                                </div>
                                <div className="mt-1 flex items-baseline justify-between text-[11px] text-[#8a8578]">
                                    <span>Anticipo {financing.upfrontPct}%</span>
                                    <span>
                                        {financing.currency} {Math.round(financing.upfrontAmount).toLocaleString('es-AR')}
                                    </span>
                                </div>
                                <div className="mt-3 space-y-1.5">
                                    {financing.plans.map((plan) => (
                                        <div key={plan.installments} className="flex items-baseline justify-between text-xs">
                                            <span className="text-[#8a8578]">{plan.installments} cuotas</span>
                                            <span className="font-semibold">
                                                {financing.currency}{' '}
                                                {Math.round(plan.breakdown.installmentUsd).toLocaleString('es-AR')}
                                                <span className="text-[#8a8578]"> /mes</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p className="text-xs text-[#8a8578]">Cargá el total de una alternativa para ver las cuotas.</p>
                        )}
                    </div>

                    <div className="border-t border-[#8a7042]/40 pt-3">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-[#8a8578]">Casos adjuntos</p>
                        <div className="mt-2 flex gap-2">
                            {selectedCases.map((slug) => {
                                const item = AM_REFERENCE_CASES.find((entry) => entry.slug === slug);
                                if (!item) return null;
                                return (
                                    <img
                                        key={slug}
                                        src={item.image}
                                        alt={item.headline}
                                        className="h-16 w-16 rounded border border-[#8a7042]/50 object-cover"
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <div className="border-t border-[#8a7042]/40 pt-3 text-[11px] leading-5 text-[#8a8578]">
                        <p className="flex items-center gap-1.5 font-semibold text-[#c9a96e]">
                            <Sparkles size={12} /> Urgencia configurada
                        </p>
                        <p className="mt-1">
                            La propuesta vence a los 7 días. Incluye financiación, casos reales, testimonios y CTA directo a
                            WhatsApp.
                        </p>
                    </div>

                    <button
                        onClick={() => void exportPdf()}
                        disabled={exporting}
                        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#c9a96e] px-4 py-3 text-sm font-bold uppercase tracking-[0.1em] text-[#0d0d0d] transition hover:bg-[#d9bc85] disabled:opacity-60"
                    >
                        {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />} Generar propuesta
                    </button>
                </aside>
            </div>
        </div>
    );
}
