'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    X, Plus, Check, Pencil, Trash2, LinkIcon, GripVertical,
    Search, RefreshCw, CheckCircle2, Banknote, XCircle, Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    upsertPrestacion, deletePrestacion, recalcularTotalesLiquidacion,
    getPrestacionesDelMes, approveLiquidacion, markLiquidacionPaid, rejectLiquidacion,
    type PrestacionRealizada, type LiquidacionAdminRow, type LiquidacionResult,
} from '@/app/actions/liquidaciones';
import type { PrestacionCatalogoItem } from '@/app/actions/prestaciones';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EditForm {
    paciente_nombre: string;
    nombre: string;
    fecha: string;
    monto: string;
    slides_url: string;
}

interface Props {
    row: LiquidacionAdminRow;
    liq: LiquidacionResult;
    mes: string;
    catalogo: PrestacionCatalogoItem[];
    onClose: () => void;
    onRefresh: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUSD(n: number) {
    return `USD ${n.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatARS(n: number) {
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

const ESTADO_CONFIG: Record<string, { label: string; cls: string }> = {
    pending:  { label: 'Pendiente', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    approved: { label: 'Aprobada',  cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    paid:     { label: 'Pagada',    cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    rejected: { label: 'Rechazada', cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function PrestacionRow({
    p, onEdit, onDelete, saving,
}: {
    p: PrestacionRealizada;
    onEdit: () => void;
    onDelete: () => void;
    saving: boolean;
}) {
    return (
        <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors group ${
            p.slides_url
                ? 'border-slate-800 bg-slate-900/40 hover:bg-slate-800/40'
                : 'border-amber-900/30 bg-amber-900/10 opacity-80'
        }`}>
            <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-200 truncate">{p.prestacion_nombre}</p>
                <p className="text-xs text-slate-500">
                    {new Date(p.fecha_realizacion + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                    {' · '}
                    <span className="font-medium text-white">
                        USD {Number(p.monto_honorarios).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                    </span>
                </p>
            </div>
            {p.slides_url ? (
                <a href={p.slides_url} target="_blank" rel="noopener noreferrer"
                    className="text-emerald-400 hover:text-emerald-300 flex-shrink-0" title="Ver slides">
                    <LinkIcon size={13} />
                </a>
            ) : (
                <span className="text-amber-400 text-[10px] flex-shrink-0">sin slides</span>
            )}
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={onEdit} disabled={saving}
                    className="p-1 text-slate-400 hover:text-violet-300 disabled:opacity-40" title="Editar">
                    <Pencil size={12} />
                </button>
                <button onClick={onDelete} disabled={saving}
                    className="p-1 text-slate-400 hover:text-red-400 disabled:opacity-40" title="Eliminar">
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    );
}

function InlineEditRow({
    form, setForm, onSave, onCancel, saving, mes, isNew,
}: {
    form: EditForm;
    setForm: (updater: (prev: EditForm) => EditForm) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    mes: string;
    isNew?: boolean;
}) {
    const inputCls = 'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-violet-500 w-full';

    function onKey(e: React.KeyboardEvent) {
        if (e.key === 'Enter') { e.preventDefault(); onSave(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    }

    const maxDate = (() => {
        const [y, m] = mes.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        return `${mes}-${String(lastDay).padStart(2, '0')}`;
    })();

    return (
        <div className={`rounded-lg border p-3 space-y-2.5 ${
            isNew ? 'border-violet-500/50 bg-violet-900/10' : 'border-slate-600 bg-slate-800/60'
        }`}>
            <div className="grid grid-cols-2 gap-2">
                <input
                    className={inputCls}
                    placeholder="Paciente"
                    value={form.paciente_nombre}
                    onChange={e => setForm(f => ({ ...f, paciente_nombre: e.target.value }))}
                    onKeyDown={onKey}
                    autoFocus
                />
                <input
                    className={inputCls}
                    placeholder="Nombre prestación"
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    onKeyDown={onKey}
                />
            </div>
            <div className="grid grid-cols-3 gap-2">
                <input
                    type="number"
                    className={inputCls}
                    placeholder="Monto USD"
                    min="0"
                    step="0.01"
                    value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))}
                    onKeyDown={onKey}
                />
                <input
                    type="date"
                    className={inputCls}
                    value={form.fecha}
                    onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                    min={`${mes}-01`}
                    max={maxDate}
                    onKeyDown={onKey}
                />
                <input
                    className={inputCls}
                    placeholder="URL Slides (opcional)"
                    value={form.slides_url}
                    onChange={e => setForm(f => ({ ...f, slides_url: e.target.value }))}
                    onKeyDown={onKey}
                />
            </div>
            <div className="flex items-center justify-between">
                <p className="text-[10px] text-slate-500">↵ Enter para guardar · Esc para cancelar</p>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={onSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-50 transition-colors"
                    >
                        {saving ? <RefreshCw size={11} className="animate-spin" /> : <Check size={11} />}
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}

function CatalogItem({ item }: { item: PrestacionCatalogoItem }) {
    return (
        <div
            draggable
            onDragStart={e => {
                e.dataTransfer.setData('application/json', JSON.stringify(item));
                e.dataTransfer.effectAllowed = 'copy';
            }}
            className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-900/60 hover:bg-slate-800/50 cursor-grab active:cursor-grabbing group transition-colors select-none"
        >
            <GripVertical size={12} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">{item.nombre}</p>
                <p className="text-[10px] text-slate-500">{item.area_nombre}</p>
            </div>
            <span className="text-xs font-medium text-white flex-shrink-0">
                USD {Number(item.precio_base || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
            </span>
        </div>
    );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LiquidacionDashboard({ row, liq, mes, catalogo, onClose, onRefresh }: Props) {
    const defaultDate = `${mes}-01`;
    const emptyForm: EditForm = { paciente_nombre: '', nombre: '', fecha: defaultDate, monto: '', slides_url: '' };

    const [prestaciones, setPrestaciones] = useState<PrestacionRealizada[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [addingNew, setAddingNew] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState<EditForm>(emptyForm);
    const [catalogSearch, setCatalogSearch] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [payDateModal, setPayDateModal] = useState(false);
    const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);

    const withSlides = prestaciones.filter(p => p.slides_url);
    const withoutSlides = prestaciones.filter(p => !p.slides_url);
    const totalUsd = withSlides.reduce((s, p) => s + Number(p.monto_honorarios), 0);
    const totalArs = totalUsd * Number(liq.tc_liquidacion || 1050);

    const filteredCatalog = catalogo
        .filter(item => item.moneda === 'USD')
        .filter(item => {
            if (!catalogSearch.trim()) return true;
            const q = catalogSearch.toLowerCase();
            return item.nombre.toLowerCase().includes(q) || item.area_nombre.toLowerCase().includes(q);
        });

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getPrestacionesDelMes(row.personal_id, mes);
            setPrestaciones(data);
        } catch {
            toast.error('No se pudieron cargar las prestaciones');
        } finally {
            setLoading(false);
        }
    }, [row.personal_id, mes]);

    useEffect(() => { refresh(); }, [refresh]);

    // Escape / Enter global key handler
    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            if (e.key === 'Escape') {
                if (editingId || addingNew) {
                    setEditingId(null);
                    setAddingNew(false);
                    return;
                }
                onClose();
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [editingId, addingNew, onClose]);

    async function saveAndRefresh(action: () => Promise<{ success: boolean; error?: string }>) {
        setSaving(true);
        try {
            const res = await action();
            if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
            await recalcularTotalesLiquidacion(liq.id, row.personal_id, mes);
            await refresh();
            onRefresh();
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveEdit() {
        if (!editingId) return;
        const monto = parseFloat(form.monto);
        if (!form.paciente_nombre.trim() || !form.nombre.trim() || isNaN(monto) || monto <= 0) { toast.error('Completá paciente, nombre y monto válido'); return; }
        await saveAndRefresh(() => upsertPrestacion({
            id: editingId,
            profesional_id: row.personal_id,
            paciente_nombre: form.paciente_nombre.trim(),
            prestacion_nombre: form.nombre.trim(),
            fecha_realizacion: form.fecha,
            monto_honorarios: monto,
            slides_url: form.slides_url.trim() || null,
        }));
        setEditingId(null);
    }

    async function handleSaveNew() {
        const monto = parseFloat(form.monto);
        if (!form.paciente_nombre.trim() || !form.nombre.trim() || isNaN(monto) || monto <= 0) { toast.error('Completá paciente, nombre y monto válido'); return; }
        await saveAndRefresh(() => upsertPrestacion({
            profesional_id: row.personal_id,
            paciente_nombre: form.paciente_nombre.trim(),
            prestacion_nombre: form.nombre.trim(),
            fecha_realizacion: form.fecha,
            monto_honorarios: monto,
            slides_url: form.slides_url.trim() || null,
        }));
        setAddingNew(false);
        setForm(emptyForm);
    }

    async function handleDelete(id: string, nombre: string) {
        if (!confirm(`¿Eliminar "${nombre}"?`)) return;
        await saveAndRefresh(() => deletePrestacion(id));
    }

    function startEdit(p: PrestacionRealizada) {
        setAddingNew(false);
        setEditingId(p.id);
        setForm({ paciente_nombre: p.paciente_nombre, nombre: p.prestacion_nombre, fecha: p.fecha_realizacion, monto: String(p.monto_honorarios), slides_url: p.slides_url || '' });
    }

    function startAdd() {
        setEditingId(null);
        setAddingNew(true);
        setForm(emptyForm);
    }

    function handleDrop(e: React.DragEvent) {
        e.preventDefault();
        setDragOver(false);
        const data = e.dataTransfer.getData('application/json');
        if (!data) return;
        try {
            const item = JSON.parse(data) as PrestacionCatalogoItem;
            setEditingId(null);
            setAddingNew(true);
            setForm({
                paciente_nombre: '',
                nombre: item.nombre,
                fecha: defaultDate,
                monto: String(item.precio_base || ''),
                slides_url: '',
            });
        } catch { /* ignore */ }
    }

    async function handleApprove() {
        setSaving(true);
        try {
            await approveLiquidacion(liq.id);
            toast.success('Liquidación aprobada');
            onRefresh();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al aprobar');
        } finally { setSaving(false); }
    }

    async function handlePay() {
        setSaving(true);
        try {
            await markLiquidacionPaid(liq.id, payDate);
            toast.success('Liquidación marcada como pagada');
            setPayDateModal(false);
            onRefresh();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al registrar pago');
        } finally { setSaving(false); }
    }

    async function handleReject() {
        if (!confirm('¿Rechazar esta liquidación?')) return;
        setSaving(true);
        try {
            await rejectLiquidacion(liq.id);
            toast.success('Liquidación rechazada');
            onRefresh();
            onClose();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al rechazar');
        } finally { setSaving(false); }
    }

    const estadoCfg = ESTADO_CONFIG[liq.estado];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3">
            <div
                className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl flex flex-col overflow-hidden"
                style={{ maxHeight: '92vh' }}
            >
                {/* ── Header ───────────────────────────────────────────────── */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        {row.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={row.foto_url} alt="" className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-700" />
                        ) : (
                            <div className="w-11 h-11 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-slate-300 ring-2 ring-slate-600">
                                {row.nombre[0]}{row.apellido?.[0] || ''}
                            </div>
                        )}
                        <div>
                            <h3 className="text-white font-semibold text-base">
                                {row.nombre} {row.apellido}
                            </h3>
                            <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-xs text-slate-400">{row.area || ''} · {mes}</p>
                                {estadoCfg && (
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${estadoCfg.cls}`}>
                                        {estadoCfg.label}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {liq.estado === 'pending' && (
                            <>
                                <button
                                    onClick={handleApprove}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
                                >
                                    <CheckCircle2 size={14} /> Aprobar
                                </button>
                                <button
                                    onClick={handleReject}
                                    disabled={saving}
                                    className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-800 text-red-400 hover:bg-red-900/30 disabled:opacity-50 transition-colors"
                                >
                                    <XCircle size={14} /> Rechazar
                                </button>
                            </>
                        )}
                        {liq.estado === 'approved' && (
                            <button
                                onClick={() => setPayDateModal(true)}
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
                            >
                                <Banknote size={14} /> Marcar pagada
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
                            title="Cerrar (Esc)"
                        >
                            <X size={18} />
                        </button>
                    </div>
                </div>

                {/* ── Body ─────────────────────────────────────────────────── */}
                <div className="flex-1 overflow-hidden flex min-h-0">

                    {/* Left: prestaciones del mes */}
                    <div
                        className={`flex-1 flex flex-col overflow-hidden border-r border-slate-800 transition-colors ${dragOver ? 'bg-violet-900/10' : ''}`}
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                    >
                        <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between flex-shrink-0 bg-slate-950/60">
                            <p className="text-sm font-medium text-slate-300">Prestaciones del mes</p>
                            <button
                                onClick={startAdd}
                                disabled={saving || addingNew}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors"
                            >
                                <Plus size={12} /> Agregar
                            </button>
                        </div>

                        {dragOver && (
                            <div className="mx-5 mt-3 flex-shrink-0 rounded-lg border-2 border-dashed border-violet-500/60 py-3 text-center text-xs text-violet-400 pointer-events-none">
                                Soltá para agregar al mes
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
                            {loading ? (
                                <p className="text-xs text-slate-500 text-center py-10 animate-pulse">Cargando prestaciones...</p>
                            ) : (
                                <>
                                    {prestaciones.map(p => (
                                        editingId === p.id ? (
                                            <InlineEditRow
                                                key={p.id}
                                                form={form}
                                                setForm={setForm}
                                                onSave={handleSaveEdit}
                                                onCancel={() => setEditingId(null)}
                                                saving={saving}
                                                mes={mes}
                                            />
                                        ) : (
                                            <PrestacionRow
                                                key={p.id}
                                                p={p}
                                                onEdit={() => startEdit(p)}
                                                onDelete={() => handleDelete(p.id, p.prestacion_nombre)}
                                                saving={saving}
                                            />
                                        )
                                    ))}

                                    {addingNew && (
                                        <InlineEditRow
                                            form={form}
                                            setForm={setForm}
                                            onSave={handleSaveNew}
                                            onCancel={() => { setAddingNew(false); setForm(emptyForm); }}
                                            saving={saving}
                                            mes={mes}
                                            isNew
                                        />
                                    )}

                                    {prestaciones.length === 0 && !addingNew && (
                                        <div className="text-center py-12 text-slate-600">
                                            <Wallet size={32} className="mx-auto mb-3 text-slate-700" />
                                            <p className="text-xs text-slate-500">Arrastrá prestaciones desde el catálogo</p>
                                            <p className="text-xs text-slate-600 mt-1">o usá el botón "Agregar"</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* Totals */}
                        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/80 flex-shrink-0 space-y-1">
                            <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-400">
                                    Validado <span className="text-slate-500">({withSlides.length} con slides)</span>
                                </span>
                                <div className="text-right">
                                    <span className="text-sm font-semibold text-white">{formatUSD(totalUsd)}</span>
                                    <span className="text-slate-500 mx-1.5">→</span>
                                    <span className="text-sm font-semibold text-emerald-300">{formatARS(totalArs)}</span>
                                </div>
                            </div>
                            {withoutSlides.length > 0 && (
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-amber-400">⚠ Sin slides ({withoutSlides.length}) — no se incluyen en el cálculo</span>
                                    <span className="text-amber-300">
                                        {formatUSD(withoutSlides.reduce((s, p) => s + Number(p.monto_honorarios), 0))}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: catalog */}
                    <div className="w-72 flex flex-col overflow-hidden flex-shrink-0 bg-slate-900/30">
                        <div className="px-4 py-3 border-b border-slate-800 flex-shrink-0">
                            <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-2">
                                Catálogo USD
                            </p>
                            <div className="relative">
                                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                <input
                                    value={catalogSearch}
                                    onChange={e => setCatalogSearch(e.target.value)}
                                    placeholder="Buscar..."
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-7 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500"
                                />
                            </div>
                            <p className="text-[10px] text-slate-600 mt-1.5">Arrastrá al panel de prestaciones</p>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {filteredCatalog.length === 0 ? (
                                <p className="text-xs text-slate-600 text-center py-8">
                                    {catalogo.filter(i => i.moneda === 'USD').length === 0
                                        ? 'No hay prestaciones USD en el catálogo'
                                        : 'Sin resultados'}
                                </p>
                            ) : (
                                filteredCatalog.map(item => (
                                    <CatalogItem key={item.id} item={item} />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Pay date modal */}
            {payDateModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-80 shadow-2xl">
                        <h3 className="text-white font-semibold mb-3">Fecha de pago</h3>
                        <input
                            type="date"
                            value={payDate}
                            onChange={e => setPayDate(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-4"
                        />
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setPayDateModal(false)} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                                Cancelar
                            </button>
                            <button
                                onClick={handlePay}
                                disabled={saving}
                                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 transition-colors"
                            >
                                Confirmar pago
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
