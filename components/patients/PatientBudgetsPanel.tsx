'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Save, Download, Star, X } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';
import {
    createPatientPresupuesto,
    listPatientPresupuestos,
    updatePatientPresupuesto,
    type PresupuestoPayload,
    type PresupuestoRecord,
} from '@/app/actions/presupuestos';

const emptyAlternative = () => ({ title: '', description: '', total: 0, currency: 'USD' as const });

function initialPayload(patientName: string): PresupuestoPayload {
    return {
        patientName,
        intro: 'Diseñamos una propuesta personalizada para acompañarte en el camino hacia la sonrisa que estás buscando.',
        alternatives: [emptyAlternative()],
        financing: 'Consultá las opciones de financiación disponibles para tu tratamiento.',
        guarantee: 'Te acompañamos con garantía y seguimiento según las condiciones clínicas informadas por el equipo.',
        conditions: 'Los tratamientos y resultados quedan sujetos a evaluación y planificación clínica.',
        cta: 'Esta propuesta tiene una validez de 7 días corridos. Para mantener estas condiciones y reservar tus turnos, podés confirmar el tratamiento abonando una seña.',
        photoUrls: [],
    };
}

export default function PatientBudgetsPanel({ patientId, patientName }: { patientId: string; patientName: string }) {
    const [records, setRecords] = useState<PresupuestoRecord[]>([]);
    const [active, setActive] = useState<PresupuestoRecord | null>(null);
    const [payload, setPayload] = useState<PresupuestoPayload>(() => initialPayload(patientName));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void listPatientPresupuestos(patientId).then((result) => {
            if (cancelled) return;
            if (!result.success) toast.error(result.error);
            setRecords(result.data || []);
            setLoading(false);
        });
        return () => { cancelled = true; };
    }, [patientId]);

    function startNew() {
        setActive(null);
        setPayload(initialPayload(patientName));
    }

    function edit(record: PresupuestoRecord) {
        setActive(record);
        setPayload(record.payload);
    }

    function updateField<K extends keyof PresupuestoPayload>(key: K, value: PresupuestoPayload[K]) {
        setPayload((current) => ({ ...current, [key]: value }));
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
        const alternatives = payload.alternatives.map((item, itemIndex) => itemIndex === index
            ? { ...item, [key]: key === 'total' ? Number(value) || 0 : value }
            : item);
        updateField('alternatives', alternatives);
    }

    function addAlternative() {
        if (payload.alternatives.length >= 3) return;
        updateField('alternatives', [...payload.alternatives, emptyAlternative()]);
    }

    function removeAlternative(index: number) {
        if (payload.alternatives.length === 1) return;
        updateField('alternatives', payload.alternatives.filter((_, itemIndex) => itemIndex !== index));
    }

    function exportPdf() {
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const margin = 18;
        let y = 22;
        const line = (text: string, size = 10, bold = false) => {
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setFontSize(size);
            const lines = doc.splitTextToSize(text, 174);
            doc.text(lines, margin, y);
            y += lines.length * (size * 0.48) + 4;
        };
        doc.setTextColor(20, 29, 52);
        line('AM ESTÉTICA DENTAL', 18, true);
        line('Propuesta personalizada', 12, true);
        line(`Paciente: ${payload.patientName}`);
        line(`Válido hasta: ${new Date(Date.now() + 7 * 86400000).toLocaleDateString('es-AR')}`);
        y += 3;
        line(payload.intro);
        payload.photoUrls.slice(0, 1).forEach((url) => {
            try { doc.addImage(url, 'JPEG', margin, y, 55, 42); y += 47; } catch { /* remote image may not be embeddable */ }
        });
        line('Alternativas de tratamiento', 13, true);
        payload.alternatives.forEach((item) => {
            line(item.title || 'Alternativa de tratamiento', 11, true);
            line(item.description);
            line(`Total: ${item.currency} ${item.total.toLocaleString('es-AR')}`, 11, true);
        });
        line('Financiación', 12, true); line(payload.financing);
        line('Garantía y condiciones', 12, true); line(`${payload.guarantee}\n${payload.conditions}`);
        line('¿Cómo avanzar?', 12, true); line(payload.cta);
        doc.save(`presupuesto-${payload.patientName.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.pdf`);
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold"><FileText size={19} /> Presupuestos</h2>
                    <p className="text-xs text-gray-500">Privado para Administración y Recepción. Los odontólogos no acceden a este módulo.</p>
                </div>
                <button onClick={startNew} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={16} /> Nuevo presupuesto</button>
            </div>
            {loading ? <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="animate-spin" size={16} /> Cargando...</div> : records.length > 0 && (
                <div className="flex flex-wrap gap-2">
                    {records.map((record) => <button key={record.id} onClick={() => edit(record)} className={`rounded-lg border px-3 py-2 text-left text-xs ${active?.id === record.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-gray-200 dark:border-gray-700'}`}><span className="font-semibold">Versión {record.version}</span><br /><span className="text-gray-500">Vence {new Date(record.expires_at).toLocaleDateString('es-AR')}</span></button>)}
                </div>
            )}
            <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Paciente<input className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" value={payload.patientName} onChange={(e) => updateField('patientName', e.target.value)} /></label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Introducción<textarea className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" rows={3} value={payload.intro} onChange={(e) => updateField('intro', e.target.value)} /></label>
                    <div><div className="mb-2 flex items-center justify-between"><label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Alternativas (solo total)</label><button onClick={addAlternative} disabled={payload.alternatives.length >= 3} className="text-xs font-semibold text-indigo-600 disabled:opacity-40">+ Agregar alternativa</button></div><div className="space-y-3">{payload.alternatives.map((item, index) => <div key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"><div className="mb-2 flex items-center justify-between text-xs font-bold">Alternativa {index + 1}{payload.alternatives.length > 1 && <button onClick={() => removeAlternative(index)}><X size={14} /></button>}</div><input placeholder="Nombre del tratamiento" className="mb-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" value={item.title} onChange={(e) => updateAlternative(index, 'title', e.target.value)} /><textarea placeholder="Descripción breve" rows={2} className="mb-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" value={item.description} onChange={(e) => updateAlternative(index, 'description', e.target.value)} /><div className="flex gap-2"><select className="rounded-lg border border-gray-200 bg-gray-50 px-2 text-sm dark:border-gray-700 dark:bg-gray-800" value={item.currency} onChange={(e) => updateAlternative(index, 'currency', e.target.value)}><option value="USD">USD</option><option value="ARS">ARS</option></select><input type="number" min="0" placeholder="Total" className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" value={item.total || ''} onChange={(e) => updateAlternative(index, 'total', e.target.value)} /></div></div>)}</div></div>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Financiación<textarea className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" rows={2} value={payload.financing} onChange={(e) => updateField('financing', e.target.value)} /></label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Garantía<textarea className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" rows={2} value={payload.guarantee} onChange={(e) => updateField('guarantee', e.target.value)} /></label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Condiciones<textarea className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" rows={2} value={payload.conditions} onChange={(e) => updateField('conditions', e.target.value)} /></label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">CTA final<textarea className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" rows={3} value={payload.cta} onChange={(e) => updateField('cta', e.target.value)} /></label>
                    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Fotos marcadas / Smile Design (URLs temporales)<input className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800" placeholder="Pegá una URL de imagen por línea" value={payload.photoUrls.join('\n')} onChange={(e) => updateField('photoUrls', e.target.value.split('\n').map((url) => url.trim()).filter(Boolean))} /></label>
                    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-800"><button onClick={() => void save()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">{saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} Guardar presupuesto</button><button onClick={exportPdf} className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"><Download size={16} /> Generar PDF</button></div>
                </div>
                <aside className="h-fit rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm dark:border-indigo-900/50 dark:bg-indigo-950/20"><div className="mb-2 flex items-center gap-2 font-semibold text-indigo-800 dark:text-indigo-200"><Star size={16} /> Urgencia configurada</div><p className="text-xs leading-5 text-indigo-900/75 dark:text-indigo-100/75">La propuesta vence automáticamente a los 7 días. Para congelar condiciones y reservar turnos, se solicita una seña.</p></aside>
            </div>
        </div>
    );
}
