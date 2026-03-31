'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Check, X, LinkIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
    upsertPrestacion,
    deletePrestacion,
    recalcularTotalesLiquidacion,
    type PrestacionRealizada,
} from '@/app/actions/liquidaciones';

interface EditForm {
    nombre: string;
    fecha: string;
    monto: string;
    slides_url: string;
}

interface Props {
    liquidacionId: string;
    personalId: string;
    mes: string;               // 'YYYY-MM'
    prestaciones: PrestacionRealizada[];
    liquidacionEstado: string;
    tc: number;
    onRefresh: () => void;
}

function formatUSD(n: number) {
    return `USD ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function formatARS(n: number) {
    return `ARS ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function saveAndRecalculate(
    action: () => Promise<{ success: boolean; error?: string }>,
    liquidacionId: string,
    personalId: string,
    mes: string,
    onRefresh: () => void,
    setSaving: (v: boolean) => void,
) {
    setSaving(true);
    try {
        const res = await action();
        if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
        const recalc = await recalcularTotalesLiquidacion(liquidacionId, personalId, mes);
        if (!recalc.success) toast.warning('Guardado pero no se pudo recalcular totales');
        onRefresh();
    } finally {
        setSaving(false);
    }
}

export default function PrestacionesDetallePanel({
    liquidacionId, personalId, mes, prestaciones, tc, onRefresh,
}: Props) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const defaultDate = `${mes}-01`;
    const emptyForm: EditForm = { nombre: '', fecha: defaultDate, monto: '', slides_url: '' };
    const [form, setForm] = useState<EditForm>(emptyForm);

    const withSlides = prestaciones.filter(p => p.slides_url);
    const withoutSlides = prestaciones.filter(p => !p.slides_url);
    const totalUsd = withSlides.reduce((s, p) => s + Number(p.monto_honorarios), 0);
    const totalArs = totalUsd * tc;

    function startEdit(p: PrestacionRealizada) {
        setAddingNew(false);
        setEditingId(p.id);
        setForm({
            nombre: p.prestacion_nombre,
            fecha: p.fecha_realizacion,
            monto: String(p.monto_honorarios),
            slides_url: p.slides_url || '',
        });
    }

    function startAdd() {
        setEditingId(null);
        setAddingNew(true);
        setForm(emptyForm);
    }

    function cancelEdit() { setEditingId(null); setAddingNew(false); }

    async function handleSaveEdit() {
        if (!editingId) return;
        const monto = parseFloat(form.monto);
        if (!form.nombre.trim() || isNaN(monto) || monto <= 0) {
            toast.error('Completá nombre y monto válido');
            return;
        }
        await saveAndRecalculate(
            () => upsertPrestacion({
                id: editingId,
                profesional_id: personalId,
                prestacion_nombre: form.nombre.trim(),
                fecha_realizacion: form.fecha,
                monto_honorarios: monto,
                slides_url: form.slides_url.trim() || null,
            }),
            liquidacionId, personalId, mes, onRefresh, setSaving,
        );
        setEditingId(null);
    }

    async function handleSaveNew() {
        const monto = parseFloat(form.monto);
        if (!form.nombre.trim() || isNaN(monto) || monto <= 0) {
            toast.error('Completá nombre y monto válido');
            return;
        }
        await saveAndRecalculate(
            () => upsertPrestacion({
                profesional_id: personalId,
                prestacion_nombre: form.nombre.trim(),
                fecha_realizacion: form.fecha,
                monto_honorarios: monto,
                slides_url: form.slides_url.trim() || null,
            }),
            liquidacionId, personalId, mes, onRefresh, setSaving,
        );
        setAddingNew(false);
    }

    async function handleDelete(id: string, nombre: string) {
        if (!confirm(`¿Eliminar "${nombre}"?`)) return;
        await saveAndRecalculate(
            () => deletePrestacion(id),
            liquidacionId, personalId, mes, onRefresh, setSaving,
        );
    }

    const inputCls = 'bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-violet-500 w-full';

    function InlineForm({ onSave }: { onSave: () => void }) {
        function onKey(e: React.KeyboardEvent) {
            if (e.key === 'Enter') { e.preventDefault(); onSave(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
        }
        return (
            <tr className="bg-slate-800/60">
                <td className="px-3 py-2">
                    <input className={inputCls} placeholder="Nombre prestación" value={form.nombre}
                        onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                        onKeyDown={onKey} autoFocus />
                </td>
                <td className="px-3 py-2">
                    <input type="date" className={inputCls} value={form.fecha}
                        onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                        onKeyDown={onKey} />
                </td>
                <td className="px-3 py-2">
                    <input type="number" className={inputCls} placeholder="0.00" min="0" step="0.01"
                        value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                        onKeyDown={onKey} />
                </td>
                <td className="px-3 py-2">
                    <input className={inputCls} placeholder="URL slides (opcional)" value={form.slides_url}
                        onChange={e => setForm(f => ({ ...f, slides_url: e.target.value }))}
                        onKeyDown={onKey} />
                </td>
                <td className="px-3 py-2">
                    <div className="flex gap-1">
                        <button onClick={onSave} disabled={saving}
                            className="p-1.5 bg-emerald-700 hover:bg-emerald-600 rounded text-white disabled:opacity-50"
                            title="Guardar (Enter)">
                            <Check size={12} />
                        </button>
                        <button onClick={cancelEdit}
                            className="p-1.5 bg-slate-700 hover:bg-slate-600 rounded text-slate-300"
                            title="Cancelar (Escape)">
                            <X size={12} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between mb-1">
                <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Prestaciones del mes</p>
                <button
                    onClick={startAdd}
                    disabled={saving}
                    className="flex items-center gap-1 px-2 py-1 bg-violet-700/70 hover:bg-violet-700 text-white rounded text-xs transition-colors disabled:opacity-50"
                >
                    <Plus size={12} /> Agregar
                </button>
            </div>

            <div className="rounded-lg border border-slate-800 overflow-hidden">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="bg-slate-900/80 text-slate-500 text-[10px] uppercase tracking-wider">
                            <th className="px-3 py-2 text-left">Prestación</th>
                            <th className="px-3 py-2 text-left">Fecha</th>
                            <th className="px-3 py-2 text-right">Monto USD</th>
                            <th className="px-3 py-2 text-center">Slides</th>
                            <th className="px-3 py-2 text-center w-16">Acc.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {prestaciones.map(p => (
                            editingId === p.id ? (
                                <InlineForm key={p.id} onSave={handleSaveEdit} />
                            ) : (
                                <tr key={p.id} className={`hover:bg-slate-800/30 transition-colors ${!p.slides_url ? 'opacity-60' : ''}`}>
                                    <td className="px-3 py-2 text-slate-200">{p.prestacion_nombre}</td>
                                    <td className="px-3 py-2 text-slate-400">
                                        {new Date(p.fecha_realizacion + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium text-white">
                                        {formatUSD(Number(p.monto_honorarios))}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                        {p.slides_url ? (
                                            <a href={p.slides_url} target="_blank" rel="noopener noreferrer"
                                                className="inline-flex items-center gap-0.5 text-emerald-400 hover:text-emerald-300">
                                                <LinkIcon size={10} /> ok
                                            </a>
                                        ) : (
                                            <span className="text-amber-400 text-[10px]">sin slides</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2">
                                        <div className="flex items-center justify-center gap-1">
                                            <button onClick={() => startEdit(p)} disabled={saving}
                                                className="p-1 text-slate-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
                                                title="Editar">
                                                <Pencil size={11} />
                                            </button>
                                            <button onClick={() => handleDelete(p.id, p.prestacion_nombre)} disabled={saving}
                                                className="p-1 text-slate-400 hover:text-red-400 disabled:opacity-40 transition-colors"
                                                title="Eliminar">
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )
                        ))}
                        {addingNew && <InlineForm onSave={handleSaveNew} />}
                        {prestaciones.length === 0 && !addingNew && (
                            <tr>
                                <td colSpan={5} className="px-3 py-4 text-center text-slate-600 text-xs">
                                    No hay prestaciones registradas para este mes. Hacé click en &quot;Agregar&quot;.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Totales */}
            <div className="flex flex-wrap gap-3 pt-1 text-xs">
                <div className="flex items-center gap-1.5 rounded bg-emerald-900/30 border border-emerald-800/40 px-3 py-1.5">
                    <span className="text-slate-500">Validado:</span>
                    <span className="font-semibold text-white">{formatUSD(totalUsd)}</span>
                    <span className="text-slate-500">→</span>
                    <span className="font-semibold text-emerald-300">{formatARS(totalArs)}</span>
                </div>
                {withoutSlides.length > 0 && (
                    <div className="flex items-center gap-1.5 rounded bg-amber-900/20 border border-amber-800/30 px-3 py-1.5">
                        <span className="text-amber-400">⚠ Pendiente (sin slides):</span>
                        <span className="font-semibold text-amber-300">
                            {formatUSD(withoutSlides.reduce((s, p) => s + Number(p.monto_honorarios), 0))}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
