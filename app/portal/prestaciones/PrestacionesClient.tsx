'use client';

import { useState, useTransition, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import {
    Plus, Stethoscope, FileVideo, Link2, Trash2, ChevronDown,
    Search, X, CheckCircle2, Clock, AlertTriangle, Loader2, CalendarDays,
    Eye,
} from 'lucide-react';
import {
    registrarPrestacion,
    registrarMultiplesPrestaciones,
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

interface Profesional {
    id: string;
    nombre: string;
    apellido?: string | null;
    area?: string | null;
}

interface Props {
    worker: Worker;
    viewMode: 'readonly' | 'registro';
    tarifario: TarifarioItem[];
    resumenInicial: PrestacionesResumen;
    profesionales?: Profesional[];
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
            <button
                onClick={() => setEditing(false)}
                className="p-1.5 rounded-lg text-slate-600 hover:text-slate-400 transition-colors"
            >
                <X size={13} />
            </button>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PrestacionesClient({
    worker,
    viewMode,
    tarifario,
    resumenInicial,
    profesionales,
}: Props) {
    const isReadonly = viewMode === 'readonly';

    const [resumen, setResumen] = useState<PrestacionesResumen>(resumenInicial);
    const [mes, setMes] = useState(mesActual());
    const [showForm, setShowForm] = useState(false);
    const [isBulkMode, setIsBulkMode] = useState(false);
    const [isPending, startTransition] = useTransition();

    // In registro mode: which doctor we're currently loading for
    const [selectedDocId, setSelectedDocId] = useState<string | null>(
        !isReadonly && profesionales && profesionales.length > 0 ? profesionales[0].id : null
    );
    const activeDocId = isReadonly ? worker.id : selectedDocId;

    // Form state
    const [form, setForm] = useState<Partial<RegistrarPrestacionInput>>({
        fecha_realizacion: today(),
        moneda_cobro: 'ARS',
    });
    const [selectedItem, setSelectedItem] = useState<TarifarioItem | null>(null);
    const [pacienteQuery, setPacienteQuery] = useState('');
    const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
    const [selectedPaciente, setSelectedPaciente] = useState<PacienteOption | null>(null);
    const [submitting, startSubmit] = useTransition();
    const [bulkEntries, setBulkEntries] = useState<{
        id: string;
        tarifario_id?: string;
        prestacion_nombre: string;
        monto_honorarios: number;
        moneda_cobro: 'ARS' | 'USD';
        paciente_nombre: string;
        paciente_id?: string;
    }[]>([]);

    const [tarifarioSearch, setTarifarioSearch] = useState('');

    const tarifarioSearchTrimmed = tarifarioSearch.trim().toLowerCase();
    const filteredTarifario = tarifarioSearchTrimmed.length > 0
        ? tarifario.filter(item =>
            item.nombre.toLowerCase().includes(tarifarioSearchTrimmed) ||
            item.area_nombre.toLowerCase().includes(tarifarioSearchTrimmed)
        )
        : [];

    const areaGroups = groupByArea(tarifario);

    // ── Handlers ────────────────────────────────────────────────────────────────

    const loadMes = useCallback((targetMes: string, docId?: string) => {
        const id = docId ?? activeDocId;
        if (!id) return;
        startTransition(async () => {
            const data = await getMisPrestaciones(id, targetMes);
            setResumen(data);
        });
    }, [activeDocId]);

    // Load prestaciones for the first doctor on mount (registro mode)
    useEffect(() => {
        if (!isReadonly && selectedDocId) {
            loadMes(mes, selectedDocId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleDocChange = (docId: string) => {
        setSelectedDocId(docId);
        setShowForm(false);
        setIsBulkMode(false);
        setBulkEntries([]);
        setSelectedItem(null);
        setSelectedPaciente(null);
        setPacienteQuery('');
        loadMes(mes, docId);
    };

    const handleMesChange = (delta: number) => {
        const [y, m] = mes.split('-').map(Number);
        const d = new Date(y, m - 1 + delta, 1);
        const newMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        setMes(newMes);
        loadMes(newMes);
    };

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

    const handleAddToBulk = (item: TarifarioItem) => {
        setBulkEntries(prev => [...prev, {
            id: Math.random().toString(36).slice(2, 9),
            tarifario_id: item.id,
            prestacion_nombre: item.nombre,
            monto_honorarios: item.precio_base,
            moneda_cobro: item.moneda,
            paciente_nombre: selectedPaciente ? `${selectedPaciente.nombre} ${selectedPaciente.apellido}` : '',
            paciente_id: selectedPaciente?.id_paciente,
        }]);
        toast.info(`Agregado: ${item.nombre}`);
    };

    const handleRemoveBulkEntry = (id: string) => {
        setBulkEntries(prev => prev.filter(e => e.id !== id));
    };

    const handleBulkSubmit = () => {
        if (!activeDocId) { toast.error('Seleccioná un profesional'); return; }
        if (bulkEntries.length === 0) { toast.error('La planilla está vacía'); return; }
        startSubmit(async () => {
            const data: RegistrarPrestacionInput[] = bulkEntries.map(e => ({
                profesional_id: activeDocId,
                tarifario_id: e.tarifario_id,
                prestacion_nombre: e.prestacion_nombre,
                monto_honorarios: e.monto_honorarios,
                moneda_cobro: e.moneda_cobro,
                fecha_realizacion: form.fecha_realizacion || today(),
                paciente_nombre: e.paciente_nombre,
                paciente_id: e.paciente_id,
            }));
            const res = await registrarMultiplesPrestaciones(data);
            if (res.success) {
                toast.success(`${bulkEntries.length} prestaciones registradas`);
                setBulkEntries([]);
                setIsBulkMode(false);
                loadMes(mes);
            } else {
                toast.error(res.error || 'Error al registrar');
            }
        });
    };

    const handleSubmit = () => {
        if (!activeDocId) { toast.error('Seleccioná un profesional'); return; }
        if (!form.prestacion_nombre || !form.monto_honorarios || !form.fecha_realizacion) {
            toast.error('Completá los campos requeridos');
            return;
        }
        startSubmit(async () => {
            const res = await registrarPrestacion({
                profesional_id: activeDocId,
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
                setForm({ fecha_realizacion: today(), moneda_cobro: 'ARS' });
                setSelectedItem(null);
                setSelectedPaciente(null);
                setPacienteQuery('');
                loadMes(mes);
            } else {
                toast.error(res.error || 'Error al registrar');
            }
        });
    };

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

    // Group by day
    const byDay: Record<string, PrestacionRealizada[]> = {};
    for (const p of resumen.prestaciones) {
        if (!byDay[p.fecha_realizacion]) byDay[p.fecha_realizacion] = [];
        byDay[p.fecha_realizacion].push(p);
    }
    const sortedDays = Object.keys(byDay).sort((a, b) => b.localeCompare(a));

    // ── Selected profesional display name ────────────────────────────────────
    const selectedDoc = profesionales?.find(p => p.id === selectedDocId);

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-700 pb-16">

            {/* ── Header ── */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800/50 pb-6">
                <div>
                    {isReadonly ? (
                        <>
                            <h1 className="text-3xl font-extrabold text-white tracking-tight">Mis Prestaciones</h1>
                            <p className="text-slate-400 mt-1 font-medium flex items-center gap-2">
                                <Eye size={13} className="text-slate-500" />
                                Solo lectura — las prestaciones son cargadas por la clínica
                            </p>
                        </>
                    ) : (
                        <>
                            <h1 className="text-3xl font-extrabold text-white tracking-tight">Registro de Prestaciones</h1>
                            <p className="text-slate-400 mt-1 font-medium">
                                {selectedDoc ? `${selectedDoc.nombre}${selectedDoc.apellido ? ` ${selectedDoc.apellido}` : ''}` : ''}
                            </p>
                        </>
                    )}
                </div>

                {/* Action buttons — only in registro mode */}
                {!isReadonly && (
                    <div className="flex items-center gap-2 flex-wrap">
                        {profesionales && profesionales.length > 1 && (
                            <select
                                value={selectedDocId || ''}
                                onChange={e => handleDocChange(e.target.value)}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                            >
                                {profesionales.map(p => (
                                    <option key={p.id} value={p.id}>
                                        {p.nombre}{p.apellido ? ` ${p.apellido}` : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                        <button
                            onClick={() => { setIsBulkMode(v => !v); setShowForm(false); }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${isBulkMode
                                ? 'bg-slate-800 text-amber-400 hover:bg-slate-700'
                                : 'bg-slate-800/40 text-slate-400 hover:bg-slate-800 border border-slate-700/50'
                                }`}
                        >
                            {isBulkMode ? <CheckCircle2 size={15} /> : <Clock size={15} />}
                            {isBulkMode ? 'Cerrar Planilla' : 'Modo Planilla'}
                        </button>
                        <button
                            onClick={() => { setShowForm(v => !v); setIsBulkMode(false); }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${showForm
                                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg shadow-indigo-500/20'
                                }`}
                        >
                            {showForm ? <X size={15} /> : <Plus size={15} />}
                            {showForm ? 'Cancelar' : 'Nueva Prestación'}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Content: visible once we have an active doctor ── */}
            {activeDocId && (
                <>
                    {/* KPI Cards + Month Selector */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                                {resumen.total_usd > 0 ? `USD ${resumen.total_usd.toFixed(2)}` : '—'}
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

                    {/* Alert: prestaciones sin slides */}
                    {resumen.pendientes > 0 && (
                        <div className="flex items-center gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                            <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
                            <p className="text-sm text-amber-300/80">
                                <strong>{resumen.pendientes}</strong> {resumen.pendientes === 1 ? 'prestación sin' : 'prestaciones sin'} link de Slides.
                                {isReadonly
                                    ? ' Podés adjuntar tu link usando el botón en cada prestación.'
                                    : ' Las prestaciones sin Slides no se incluyen en la liquidación.'}
                            </p>
                        </div>
                    )}

                    {/* ── Bulk Mode (registro only) ── */}
                    {!isReadonly && isBulkMode && (
                        <div className="bg-slate-900/60 border border-amber-500/20 rounded-3xl p-6 space-y-6">
                            <div className="flex items-center justify-between">
                                <h2 className="text-base font-bold text-white flex items-center gap-2">
                                    <Clock size={16} className="text-amber-400" />
                                    Modo Planilla: Carga Rápida
                                </h2>
                                <span className="text-xs text-slate-500 font-medium">{bulkEntries.length} items</span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                        Fecha para toda la planilla *
                                    </label>
                                    <input
                                        type="date"
                                        value={form.fecha_realizacion || today()}
                                        max={today()}
                                        onChange={e => setForm(f => ({ ...f, fecha_realizacion: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                                    />
                                </div>

                                <div className="relative">
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                                        Paciente (opcional)
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
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                                                />
                                            </div>
                                            {pacientes.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden z-20 shadow-xl">
                                                    {pacientes.map(p => (
                                                        <button
                                                            key={p.id_paciente}
                                                            onClick={() => { setSelectedPaciente(p); setPacientes([]); setPacienteQuery(`${p.nombre} ${p.apellido}`); }}
                                                            className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-amber-500/10 hover:text-white transition-colors border-b border-slate-800 last:border-0"
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

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* Catalog */}
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            type="text"
                                            value={tarifarioSearch}
                                            onChange={e => setTarifarioSearch(e.target.value)}
                                            placeholder="Escribí para buscar rápido..."
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-8 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                                            autoComplete="off"
                                        />
                                        {tarifarioSearch && (
                                            <button onClick={() => setTarifarioSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-300">
                                                <X size={13} />
                                            </button>
                                        )}
                                    </div>
                                    <div className="space-y-1 max-h-[400px] overflow-y-auto pr-1">
                                        {tarifarioSearchTrimmed.length > 0 ? (
                                            /* Búsqueda activa: resultados planos */
                                            filteredTarifario.length === 0 ? (
                                                <p className="text-xs text-slate-600 text-center py-6">Sin coincidencias para "{tarifarioSearch}"</p>
                                            ) : (
                                                filteredTarifario.map(item => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => { handleAddToBulk(item); setTarifarioSearch(''); }}
                                                        className="w-full group text-left px-3 py-2.5 rounded-xl border border-slate-800/50 bg-slate-950/30 hover:bg-amber-500/8 hover:border-amber-500/40 transition-all flex items-center justify-between gap-3"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-slate-200 group-hover:text-amber-200 truncate">{item.nombre}</p>
                                                            <p className="text-[10px] text-slate-600">{item.area_nombre}</p>
                                                        </div>
                                                        <div className="w-6 h-6 rounded-lg bg-slate-800 group-hover:bg-amber-500 flex items-center justify-center text-slate-500 group-hover:text-amber-950 transition-colors flex-shrink-0">
                                                            <Plus size={13} strokeWidth={3} />
                                                        </div>
                                                    </button>
                                                ))
                                            )
                                        ) : (
                                            /* Sin búsqueda: lista agrupada por área */
                                            Object.entries(areaGroups).map(([area, items]) => (
                                                <div key={area} className="space-y-1">
                                                    <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1 pt-3 pb-1">{area}</p>
                                                    {items.map(item => (
                                                        <button
                                                            key={item.id}
                                                            onClick={() => handleAddToBulk(item)}
                                                            className="w-full group text-left px-3 py-2 rounded-xl border border-slate-800/50 bg-slate-950/30 hover:bg-amber-500/5 hover:border-amber-500/30 transition-all flex items-center justify-between gap-3"
                                                        >
                                                            <p className="text-xs font-bold text-slate-300 group-hover:text-amber-200 truncate flex-1">{item.nombre}</p>
                                                            <div className="w-6 h-6 rounded-lg bg-slate-800 group-hover:bg-amber-500 flex items-center justify-center text-slate-500 group-hover:text-amber-950 transition-colors flex-shrink-0">
                                                                <Plus size={13} strokeWidth={3} />
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Planilla list */}
                                <div className="bg-slate-950/50 rounded-2xl border border-slate-800 overflow-hidden flex flex-col min-h-[400px]">
                                    <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-300">Planilla — {bulkEntries.length} items</span>
                                        {bulkEntries.length > 0 && (
                                            <button onClick={() => setBulkEntries([])} className="text-[10px] text-slate-500 hover:text-red-400 uppercase font-black tracking-widest">
                                                Limpiar
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[400px]">
                                        {bulkEntries.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-center opacity-30 px-6 py-12">
                                                <Clock size={32} className="mb-2" />
                                                <p className="text-xs">No hay items.<br />Seleccioná de la izquierda.</p>
                                            </div>
                                        ) : (
                                            bulkEntries.map((entry, idx) => (
                                                <div key={entry.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 animate-in slide-in-from-right-2 duration-300">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-[11px] font-black text-amber-500/80 uppercase tracking-tighter mb-0.5">#{idx + 1}</p>
                                                            <p className="text-xs font-bold text-slate-200 truncate">{entry.prestacion_nombre}</p>
                                                        </div>
                                                        <button onClick={() => handleRemoveBulkEntry(entry.id)} className="text-slate-600 hover:text-red-400 p-1">
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                    <div className="mt-2">
                                                        <input
                                                            type="text"
                                                            value={entry.paciente_nombre}
                                                            onChange={e => {
                                                                const v = e.target.value;
                                                                setBulkEntries(prev => prev.map(item => item.id === entry.id ? { ...item, paciente_nombre: v } : item));
                                                            }}
                                                            placeholder="Nombre del paciente..."
                                                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-700"
                                                        />
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                    {bulkEntries.length > 0 && (
                                        <div className="p-4 bg-slate-900/50 border-t border-slate-800">
                                            <button
                                                disabled={submitting}
                                                onClick={handleBulkSubmit}
                                                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-amber-950 font-black rounded-xl shadow-lg shadow-amber-500/10 transition-all flex items-center justify-center gap-2"
                                            >
                                                {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                                                GUARDAR {bulkEntries.length} PRESTACIONES
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Single Form (registro only) ── */}
                    {!isReadonly && showForm && (
                        <div className="bg-slate-900/60 border border-indigo-500/20 rounded-3xl p-6 space-y-5">
                            <h2 className="text-base font-bold text-white flex items-center gap-2">
                                <Stethoscope size={16} className="text-indigo-400" />
                                Registrar Prestación
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Fecha *</label>
                                    <input
                                        type="date"
                                        value={form.fecha_realizacion || today()}
                                        max={today()}
                                        onChange={e => setForm(f => ({ ...f, fecha_realizacion: e.target.value }))}
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                                    />
                                </div>

                                <div className="relative">
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Paciente</label>
                                    {selectedPaciente ? (
                                        <div className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5">
                                            <span className="text-sm text-slate-200 flex-1">{selectedPaciente.nombre} {selectedPaciente.apellido}</span>
                                            <button onClick={() => { setSelectedPaciente(null); setPacienteQuery(''); }} className="text-slate-500 hover:text-slate-300">
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

                            {/* Tarifario selector */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                                    Prestación del Tarifario
                                </label>
                                <div className="relative mb-2">
                                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                    <input
                                        type="text"
                                        value={tarifarioSearch}
                                        onChange={e => setTarifarioSearch(e.target.value)}
                                        placeholder="Buscar prestación..."
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                                    />
                                    {tarifarioSearch && (
                                        <button onClick={() => setTarifarioSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                                            <X size={12} />
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                    {tarifarioSearchTrimmed.length > 0 ? (
                                        filteredTarifario.length === 0 ? (
                                            <p className="text-xs text-slate-600 text-center py-6">Sin coincidencias para "{tarifarioSearch}"</p>
                                        ) : (
                                            filteredTarifario.map(item => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => { handleSelectItem(item); setTarifarioSearch(''); }}
                                                    className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm transition-all border ${selectedItem?.id === item.id
                                                        ? 'bg-indigo-500/10 border-indigo-500/30 text-white'
                                                        : 'border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 hover:border-slate-700'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="truncate">{item.nombre}</p>
                                                            <p className="text-[10px] text-slate-600">{item.area_nombre}</p>
                                                        </div>
                                                        <span className={`font-mono font-bold text-xs flex-shrink-0 ${item.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                            {item.moneda === 'USD' ? 'USD ' : '$'}{item.precio_base.toLocaleString('es-AR')}
                                                        </span>
                                                    </div>
                                                </button>
                                            ))
                                        )
                                    ) : (
                                        Object.entries(areaGroups).map(([area, items]) => (
                                            <div key={area}>
                                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest px-1 mb-1 pt-2">{area}</p>
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
                                                                    {item.moneda === 'USD' ? 'USD ' : '$'}{item.precio_base.toLocaleString('es-AR')}
                                                                </span>
                                                            </div>
                                                            {item.terminos && (
                                                                <p className="text-[10px] text-slate-600 mt-0.5">{item.terminos}</p>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Descripción *</label>
                                <input
                                    type="text"
                                    value={form.prestacion_nombre || ''}
                                    onChange={e => setForm(f => ({ ...f, prestacion_nombre: e.target.value, tarifario_id: undefined }))}
                                    placeholder="Nombre de la prestación"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Monto *</label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={form.monto_honorarios || ''}
                                        onChange={e => setForm(f => ({ ...f, monto_honorarios: Number(e.target.value) }))}
                                        placeholder="0"
                                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Moneda *</label>
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

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Link Google Slides (opcional)</label>
                                <input
                                    type="url"
                                    value={form.slides_url || ''}
                                    onChange={e => setForm(f => ({ ...f, slides_url: e.target.value }))}
                                    placeholder="https://docs.google.com/presentation/..."
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                                />
                                <p className="text-[10px] text-slate-600 mt-1">Necesario para incluirse en la liquidación. Podés agregarlo después.</p>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Notas (opcional)</label>
                                <textarea
                                    rows={2}
                                    value={form.notas || ''}
                                    onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                                    placeholder="Observaciones clínicas..."
                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-200 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600 resize-none"
                                />
                            </div>

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
                                {!isReadonly && (
                                    <button
                                        onClick={() => setShowForm(true)}
                                        className="mt-4 text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
                                    >
                                        Registrar primera prestación →
                                    </button>
                                )}
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

                                        <div className="divide-y divide-slate-800/40">
                                            {dayItems.map(p => (
                                                <div key={p.id} className="px-5 py-3.5 flex flex-col md:flex-row md:items-center gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-slate-200 truncate">{p.prestacion_nombre}</p>
                                                        {p.paciente_nombre && (
                                                            <p className="text-xs text-slate-500 mt-0.5">Paciente: {p.paciente_nombre}</p>
                                                        )}
                                                        {p.notas && (
                                                            <p className="text-xs text-slate-600 mt-0.5 italic">{p.notas}</p>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-4 flex-shrink-0">
                                                        <span className={`font-mono font-bold text-sm ${p.moneda_cobro === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                            {p.moneda_cobro === 'USD' ? 'USD ' : '$'}
                                                            {Number(p.monto_honorarios || 0).toLocaleString('es-AR')}
                                                        </span>

                                                        <SlidesChip
                                                            url={p.slides_url}
                                                            prestacionId={p.id}
                                                            onUpdate={handleSlidesUpdate}
                                                        />

                                                        {/* Delete: solo en registro mode y prestaciones pendientes */}
                                                        {!isReadonly && p.estado_pago === 'pendiente' && (
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
                </>
            )}
        </div>
    );
}
