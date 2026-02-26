'use client';

import { useState, useTransition, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import {
    Plus, Stethoscope, FileVideo, Link2, Trash2, ChevronDown,
    Search, X, CheckCircle2, Clock, DollarSign, TrendingUp,
    AlertTriangle, Loader2, CalendarDays,
} from 'lucide-react';
import {
    registrarPrestacion,
    actualizarSlidesUrl,
    eliminarPrestacion,
    getMisPrestaciones,
    buscarPacientes,
} from '@/app/actions/prestaciones';
import type {
    TarifarioItem,
    PrestacionRealizada,
    PrestacionesResumen,
    RegistrarPrestacionInput,
} from '@/app/actions/prestaciones';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Worker {
    id: string;
    nombre: string;
    apellido?: string;
    tipo?: string;
}

interface Props {
    worker: Worker;
    tarifario: TarifarioItem[];
    areasAsignadas: string[];
    resumenInicial: PrestacionesResumen;
}

interface PacienteOption {
    id_paciente: string;
    nombre: string;
    apellido: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function today() {
    return new Date().toISOString().slice(0, 10);
}

function mesActual() {
    return new Date().toISOString().slice(0, 7);
}

function formatMes(mes: string) {
    return new Date(mes + '-02').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function groupByArea(items: TarifarioItem[]) {
    const map: Record<string, TarifarioItem[]> = {};
    for (const item of items) {
        if (!map[item.area_nombre]) map[item.area_nombre] = [];
        map[item.area_nombre].push(item);
    }
    return map;
}

function slidesStatus(p: PrestacionRealizada) {
    if (p.slides_url) return 'validado';
    return 'pendiente';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SlidesChip({ url, prestacionId, onUpdate }: {
    url?: string;
    prestacionId: string;
    onUpdate: (id: string, url: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(url || '');
    const [saving, startSave] = useTransition();

    if (!editing) {
        if (url) {
            return (
                <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                >
                    <FileVideo size={11} />
                    Slides
                </a>
            );
        }
        return (
            <button
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors"
            >
                <Link2 size={11} />
                Adjuntar Slides
            </button>
        );
    }

    return (
        <div className="flex items-center gap-1.5">
            <input
                autoFocus
                type="url"
                value={val}
                onChange={e => setVal(e.target.value)}
                placeholder="https://docs.google.com/presentation/..."
                className="text-xs bg-slate-900 border border-indigo-500/40 rounded-lg px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 w-52"
            />
            <button
                disabled={saving || !val}
                onClick={() => {
                    startSave(async () => {
                        const res = await actualizarSlidesUrl(prestacionId, val);
                        if (res.success) {
                            onUpdate(prestacionId, val);
                            setEditing(false);
                            toast.success('Slides guardados');
                        } else {
                            toast.error(res.error || 'Error al guardar');
                        }
                    });
                }}
                className="px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
                {saving ? <Loader2 size={11} className="animate-spin" /> : 'OK'}
            </button>
            <button onClick={() => setEditing(false)} className="text-slate-600 hover:text-slate-400 transition-colors">
                <X size={13} />
            </button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PrestacionesClient({ worker, tarifario, areasAsignadas, resumenInicial }: Props) {
    const [resumen, setResumen] = useState<PrestacionesResumen>(resumenInicial);
    const [mes, setMes] = useState(mesActual());
    const [showForm, setShowForm] = useState(false);
    const [isPending, startTransition] = useTransition();

    // Form state
    const [form, setForm] = useState<Partial<RegistrarPrestacionInput>>({
        profesional_id: worker.id,
        fecha_realizacion: today(),
        moneda_cobro: 'ARS',
    });
    const [selectedItem, setSelectedItem] = useState<TarifarioItem | null>(null);
    const [pacienteQuery, setPacienteQuery] = useState('');
    const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
    const [selectedPaciente, setSelectedPaciente] = useState<PacienteOption | null>(null);
    const [submitting, startSubmit] = useTransition();

    const areaGroups = groupByArea(tarifario);

    // Load prestaciones for the selected month
    const loadMes = useCallback((targetMes: string) => {
        startTransition(async () => {
            const data = await getMisPrestaciones(worker.id, targetMes);
            setResumen(data);
        });
    }, [worker.id]);

    const handleMesChange = (delta: number) => {
        const [y, m] = mes.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        const newMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        setMes(newMes);
        loadMes(newMes);
    };

    // Patient search debounce
    const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handlePacienteSearch = (q: string) => {
        setPacienteQuery(q);
        setSelectedPaciente(null);
        if (searchTimer.current) clearTimeout(searchTimer.current);
        if (q.length < 2) { setPacientes([]); return; }
        searchTimer.current = setTimeout(async () => {
            const results = await buscarPacientes(q);
            setPacientes(results);
        }, 300);
    };

    // Select from tarifario
    const handleSelectItem = (item: TarifarioItem) => {
        setSelectedItem(item);
        setForm(f => ({
            ...f,
            tarifario_id: item.id,
            prestacion_nombre: item.nombre,
            monto_honorarios: item.precio_base,
            moneda_cobro: item.moneda,
        }));
    };

    // Submit form
    const handleSubmit = () => {
        if (!form.prestacion_nombre || !form.monto_honorarios || !form.fecha_realizacion) {
            toast.error('Completá los campos requeridos');
            return;
        }
        startSubmit(async () => {
            const res = await registrarPrestacion({
                profesional_id: worker.id,
                tarifario_id: form.tarifario_id,
                prestacion_nombre: form.prestacion_nombre!,
                monto_honorarios: Number(form.monto_honorarios),
                moneda_cobro: form.moneda_cobro as 'ARS' | 'USD',
                fecha_realizacion: form.fecha_realizacion!,
                paciente_nombre: selectedPaciente
                    ? `${selectedPaciente.nombre} ${selectedPaciente.apellido}`
                    : form.paciente_nombre,
                paciente_id: selectedPaciente?.id_paciente,
                slides_url: form.slides_url,
                notas: form.notas,
            });

            if (res.success) {
                toast.success('Prestación registrada');
                setShowForm(false);
                setForm({ profesional_id: worker.id, fecha_realizacion: today(), moneda_cobro: 'ARS' });
                setSelectedItem(null);
                setSelectedPaciente(null);
                setPacienteQuery('');
                loadMes(mes);
            } else {
                toast.error(res.error || 'Error al registrar');
            }
        });
    };

    // Update slides locally
    const handleSlidesUpdate = (id: string, url: string) => {
        setResumen(prev => ({
            ...prev,
            prestaciones: prev.prestaciones.map(p =>
                p.id === id ? { ...p, slides_url: url, slides_validado: true } : p
            ),
            validadas: prev.validadas + 1,
            pendientes: Math.max(0, prev.pendientes - 1),
        }));
    };

    // Delete
    const handleDelete = (id: string) => {
        startTransition(async () => {
            const res = await eliminarPrestacion(id);
            if (res.success) {
                toast.success('Prestación eliminada');
                setResumen(prev => ({
                    ...prev,
                    prestaciones: prev.prestaciones.filter(p => p.id !== id),
                }));
            } else {
                toast.error(res.error || 'No se pudo eliminar');
            }
        });
    };

    // Group prestaciones by day
    const byDay: Record<string, PrestacionRealizada[]> = {};
    for (const p of resumen.prestaciones) {
        if (!byDay[p.fecha_realizacion]) byDay[p.fecha_realizacion] = [];
        byDay[p.fecha_realizacion].push(p);
    }
    const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700 pb-16">

            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800/50 pb-6">
                <div>
                    <h1 className="text-3xl font-extrabold text-white tracking-tight">Mis Prestaciones</h1>
                    <p className="text-slate-400 mt-1 font-medium">
                        {areasAsignadas.length > 0
                            ? `Áreas: ${areasAsignadas.join(' · ')}`
                            : 'Registro de historia clínica'}
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(v => !v)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${showForm
                        ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                        : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                        }`}
                >
                    {showForm ? <X size={15} /> : <Plus size={15} />}
                    {showForm ? 'Cancelar' : 'Nueva Prestación'}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* Month selector */}
                <div className="col-span-2 md:col-span-4 flex items-center gap-3 mb-1">
                    <button
                        onClick={() => handleMesChange(-1)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                    >
                        <ChevronDown size={16} className="rotate-90" />
                    </button>
                    <span className="text-sm font-bold text-slate-200 capitalize min-w-36 text-center">
                        {formatMes(mes)}
                    </span>
                    <button
                        onClick={() => handleMesChange(1)}
                        disabled={mes >= mesActual()}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-30"
                    >
                        <ChevronDown size={16} className="-rotate-90" />
                    </button>
                    {isPending && <Loader2 size={14} className="animate-spin text-indigo-400" />}
                </div>

                <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5">Total ARS</p>
                    <p className="text-xl font-black text-white">
                        ${resumen.total_ars.toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </p>
                </div>
                <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900 border border-emerald-500/20 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1.5">Total USD</p>
                    <p className="text-xl font-black text-white">
                        {resumen.total_usd > 0
                            ? `USD ${resumen.total_usd.toFixed(2)}`
                            : '—'}
                    </p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Con Slides</p>
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-emerald-400" />
                        <p className="text-xl font-black text-white">{resumen.validadas}</p>
                    </div>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-4">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Sin Slides</p>
                    <div className="flex items-center gap-2">
                        <Clock size={16} className={resumen.pendientes > 0 ? 'text-amber-400' : 'text-slate-600'} />
                        <p className="text-xl font-black text-white">{resumen.pendientes}</p>
                    </div>
                </div>
            </div>

            {/* Alert if pending slides */}
            {resumen.pendientes > 0 && (
                <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                    <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                    <p className="text-sm text-amber-300/80">
                        Tenés <strong>{resumen.pendientes}</strong> {resumen.pendientes === 1 ? 'prestación sin' : 'prestaciones sin'} link de Google Slides.
                        Las prestaciones sin Slides no se incluyen en la liquidación.
                    </p>
                </div>
            )}

            {/* ── New Prestacion Form ── */}
            {showForm && (
                <div className="bg-slate-900/60 border border-indigo-500/20 rounded-3xl p-6 space-y-5">
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <Stethoscope size={16} className="text-indigo-400" />
                        Registrar Prestación
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Date */}
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Fecha *
                            </label>
                            <input
                                type="date"
                                value={form.fecha_realizacion || today()}
                                max={today()}
                                onChange={e => setForm(f => ({ ...f, fecha_realizacion: e.target.value }))}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            />
                        </div>

                        {/* Patient search */}
                        <div className="relative">
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Paciente
                            </label>
                            {selectedPaciente ? (
                                <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5">
                                    <span className="text-sm text-slate-200 flex-1">
                                        {selectedPaciente.nombre} {selectedPaciente.apellido}
                                    </span>
                                    <button
                                        onClick={() => { setSelectedPaciente(null); setPacienteQuery(''); }}
                                        className="text-slate-500 hover:text-slate-300"
                                    >
                                        <X size={13} />
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="text"
                                            value={pacienteQuery}
                                            onChange={e => handlePacienteSearch(e.target.value)}
                                            placeholder="Buscar paciente..."
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                                        />
                                    </div>
                                    {pacientes.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden z-20 shadow-xl">
                                            {pacientes.map(p => (
                                                <button
                                                    key={p.id_paciente}
                                                    onClick={() => { setSelectedPaciente(p); setPacientes([]); setPacienteQuery(`${p.nombre} ${p.apellido}`); }}
                                                    className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-indigo-500/10 hover:text-white transition-colors border-b border-slate-800 last:border-0"
                                                >
                                                    {p.nombre} {p.apellido}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Service selector from tarifario */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                            Prestación del Tarifario
                        </label>
                        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                            {Object.entries(areaGroups).map(([area, items]) => (
                                <div key={area}>
                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1 mb-1">{area}</p>
                                    <div className="space-y-1">
                                        {items.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => handleSelectItem(item)}
                                                className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm transition-all border ${selectedItem?.id === item.id
                                                    ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                                                    : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 hover:border-slate-700'
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between gap-3">
                                                    <span className="flex-1">{item.nombre}</span>
                                                    <span className={`font-mono font-bold text-xs flex-shrink-0 ${item.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                        {item.moneda === 'USD' ? 'USD ' : '$'}
                                                        {item.precio_base.toLocaleString('es-AR')}
                                                    </span>
                                                </div>
                                                {item.terminos && (
                                                    <p className="text-[10px] text-slate-600 mt-0.5">{item.terminos}</p>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Custom name if not from tarifario */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            Descripción *
                        </label>
                        <input
                            type="text"
                            value={form.prestacion_nombre || ''}
                            onChange={e => setForm(f => ({ ...f, prestacion_nombre: e.target.value, tarifario_id: undefined }))}
                            placeholder="Nombre de la prestación"
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {/* Amount */}
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Monto *
                            </label>
                            <input
                                type="number"
                                min={0}
                                value={form.monto_honorarios || ''}
                                onChange={e => setForm(f => ({ ...f, monto_honorarios: Number(e.target.value) }))}
                                placeholder="0"
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                            />
                        </div>

                        {/* Currency */}
                        <div>
                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                Moneda *
                            </label>
                            <div className="flex gap-2">
                                {(['ARS', 'USD'] as const).map(cur => (
                                    <button
                                        key={cur}
                                        onClick={() => setForm(f => ({ ...f, moneda_cobro: cur }))}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${form.moneda_cobro === cur
                                            ? cur === 'USD'
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                            : 'border-slate-800 text-slate-500 hover:border-slate-700'
                                            }`}
                                    >
                                        {cur}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Slides URL */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            Link Google Slides (opcional)
                        </label>
                        <input
                            type="url"
                            value={form.slides_url || ''}
                            onChange={e => setForm(f => ({ ...f, slides_url: e.target.value }))}
                            placeholder="https://docs.google.com/presentation/..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                        />
                        <p className="text-[10px] text-slate-600 mt-1">
                            Necesario para incluirse en la liquidación. Podés agregarlo después.
                        </p>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                            Notas (opcional)
                        </label>
                        <textarea
                            rows={2}
                            value={form.notas || ''}
                            onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                            placeholder="Observaciones clínicas..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600 resize-none"
                        />
                    </div>

                    {/* Submit */}
                    <div className="flex justify-end gap-3 pt-1">
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            disabled={submitting}
                            onClick={handleSubmit}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-500 disabled:opacity-50 transition-colors shadow-lg shadow-indigo-500/20"
                        >
                            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Registrar
                        </button>
                    </div>
                </div>
            )}

            {/* ── Prestaciones List ── */}
            <div className="space-y-4">
                <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <CalendarDays size={16} className="text-indigo-400" />
                    Historial — <span className="text-indigo-300 capitalize">{formatMes(mes)}</span>
                </h2>

                {resumen.prestaciones.length === 0 ? (
                    <div className="text-center py-16 border border-dashed border-slate-800 rounded-3xl">
                        <Stethoscope size={36} className="mx-auto text-slate-700 mb-3" />
                        <p className="text-slate-500">No hay prestaciones registradas este mes.</p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                        >
                            Registrar primera prestación →
                        </button>
                    </div>
                ) : (
                    sortedDays.map(day => {
                        const dayLabel = new Date(day + 'T12:00:00').toLocaleDateString('es-AR', {
                            weekday: 'long', day: 'numeric', month: 'long',
                        });
                        const dayItems = byDay[day];
                        const dayTotal = {
                            ars: dayItems.filter(p => p.moneda_cobro === 'ARS').reduce((s, p) => s + Number(p.monto_honorarios || 0), 0),
                            usd: dayItems.filter(p => p.moneda_cobro === 'USD').reduce((s, p) => s + Number(p.monto_honorarios || 0), 0),
                        };

                        return (
                            <div key={day} className="bg-slate-900/40 border border-slate-800/60 rounded-2xl overflow-hidden">
                                {/* Day header */}
                                <div className="flex items-center justify-between px-5 py-3 bg-slate-950/40 border-b border-slate-800/50">
                                    <span className="text-sm font-bold text-slate-300 capitalize">{dayLabel}</span>
                                    <div className="flex items-center gap-3 text-xs font-mono">
                                        {dayTotal.ars > 0 && (
                                            <span className="text-blue-400">${dayTotal.ars.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>
                                        )}
                                        {dayTotal.usd > 0 && (
                                            <span className="text-emerald-400">USD {dayTotal.usd.toFixed(2)}</span>
                                        )}
                                    </div>
                                </div>

                                {/* Items */}
                                <div className="divide-y divide-slate-800/40">
                                    {dayItems.map(p => (
                                        <div key={p.id} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center gap-3">
                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-200 truncate">{p.prestacion_nombre}</p>
                                                {p.paciente_nombre && (
                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                        Paciente: {p.paciente_nombre}
                                                    </p>
                                                )}
                                                {p.notas && (
                                                    <p className="text-xs text-slate-600 mt-0.5 italic">{p.notas}</p>
                                                )}
                                            </div>

                                            {/* Amount */}
                                            <div className="flex items-center gap-4 flex-shrink-0">
                                                <span className={`font-mono font-bold text-sm ${p.moneda_cobro === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                    {p.moneda_cobro === 'USD' ? 'USD ' : '$'}
                                                    {Number(p.monto_honorarios || 0).toLocaleString('es-AR')}
                                                </span>

                                                {/* Slides chip */}
                                                <SlidesChip
                                                    url={p.slides_url}
                                                    prestacionId={p.id}
                                                    onUpdate={handleSlidesUpdate}
                                                />

                                                {/* Delete (only pending payment) */}
                                                {p.estado_pago === 'pendiente' && (
                                                    <button
                                                        onClick={() => {
                                                            if (confirm('¿Eliminar esta prestación?')) handleDelete(p.id);
                                                        }}
                                                        className="text-slate-700 hover:text-red-400 transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
