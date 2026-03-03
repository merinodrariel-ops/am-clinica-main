'use client';

import { useState, useTransition, useMemo } from 'react';
import { toast } from 'sonner';
import {
    Plus, Stethoscope, Trash2, Search, X,
    CheckCircle2, Clock, Loader2, CalendarDays,
    User, ChevronRight, Hash
} from 'lucide-react';
import {
    registrarMultiplesPrestaciones,
    buscarPacientes,
} from '@/app/actions/prestaciones';
import type {
    TarifarioItem,
} from '@/app/actions/prestaciones';

interface Profesional {
    id: string;
    nombre: string;
    apellido?: string;
    area?: string;
}

interface Props {
    profesionales: Profesional[];
    prestacionesCatalogo: TarifarioItem[];
}

interface PacienteOption {
    id_paciente: string;
    nombre: string;
    apellido: string;
}

interface BulkEntry {
    id: string;
    profesional_id: string;
    tarifario_id: string;
    prestacion_nombre: string;
    monto_honorarios: number;
    moneda_cobro: 'ARS' | 'USD';
    fecha_realizacion: string;
    paciente_nombre: string;
    paciente_id: string | null;
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

function groupByArea(items: TarifarioItem[]) {
    const map: Record<string, TarifarioItem[]> = {};
    for (const item of items) {
        if (!map[item.area_nombre]) map[item.area_nombre] = [];
        map[item.area_nombre].push(item);
    }
    return map;
}

export default function AdminPrestacionesClient({ profesionales, prestacionesCatalogo }: Props) {
    const [selectedProfId, setSelectedProfId] = useState<string>('');
    const [selectedPaciente, setSelectedPaciente] = useState<PacienteOption | null>(null);
    const [pacienteQuery, setPacienteQuery] = useState('');
    const [pacientes, setPacientes] = useState<PacienteOption[]>([]);
    const [fecha, setFecha] = useState(today());
    const [bulkEntries, setBulkEntries] = useState<BulkEntry[]>([]);
    const [submitting, startSubmit] = useTransition();

    const areaGroups = useMemo(() => groupByArea(prestacionesCatalogo), [prestacionesCatalogo]);

    const handlePacienteSearch = async (val: string) => {
        setPacienteQuery(val);
        if (val.length < 2) {
            setPacientes([]);
            return;
        }
        const res = await buscarPacientes(val);
        setPacientes(res);
    };

    const handleAddToBulk = (item: TarifarioItem) => {
        if (!selectedProfId) {
            toast.error('Selecciona un doctor primero');
            return;
        }

        setBulkEntries(prev => {
            const sameServiceCount = prev.filter((entry) => entry.tarifario_id === item.id).length + 1;
            const newEntry: BulkEntry = {
                id: `${selectedProfId}-${item.id}-${fecha}-${sameServiceCount}`,
            profesional_id: selectedProfId,
            tarifario_id: item.id,
            prestacion_nombre: item.nombre,
            monto_honorarios: item.precio_base,
            moneda_cobro: item.moneda,
            fecha_realizacion: fecha,
            paciente_nombre: selectedPaciente ? `${selectedPaciente.nombre} ${selectedPaciente.apellido}` : '',
            paciente_id: selectedPaciente?.id_paciente || null,
            };

            return [...prev, newEntry];
        });
        toast.success(`Agregado: ${item.nombre}`, { duration: 800 });
    };

    const handleRemoveBulkEntry = (id: string) => {
        setBulkEntries(prev => prev.filter(e => e.id !== id));
    };

    const handleBulkSubmit = async () => {
        if (bulkEntries.length === 0) return;

        startSubmit(async () => {
            try {
                // Ensure all entries have the current global date if they haven't been customized
                const finalizedItems = bulkEntries.map(entry => ({
                    ...entry,
                    fecha_realizacion: fecha, // Always pulse global date for now to keep it simple
                }));

                const res = await registrarMultiplesPrestaciones(finalizedItems);
                if (res.success) {
                    toast.success('Prestaciones registradas correctamente');
                    setBulkEntries([]);
                    setSelectedPaciente(null);
                    setPacienteQuery('');
                } else {
                    toast.error(res.error || 'Error al registrar');
                }
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : 'Error inesperado';
                toast.error(message);
            }
        });
    };

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 pb-32">
            {/* Header section with Professional selection */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
                            <Stethoscope size={22} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-tight">Prestaciones de Doctores</h1>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Panel de Administración</p>
                        </div>
                    </div>
                </div>

                <div className="w-full md:w-80">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                        Doctor Responsable
                    </label>
                    <div className="relative">
                        <User size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select
                            value={selectedProfId}
                            onChange={(e) => {
                                setSelectedProfId(e.target.value);
                                setBulkEntries([]); // Reset if prof changes to avoid confusion
                            }}
                            className="w-full bg-slate-900 border border-slate-700 rounded-2xl pl-9 pr-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 appearance-none cursor-pointer transition-all"
                        >
                            <option value="">Seleccionar doctor...</option>
                            {profesionales.map(p => (
                                <option key={p.id} value={p.id}>
                                    {p.nombre} {p.apellido} {p.area ? `(${p.area})` : ''}
                                </option>
                            ))}
                        </select>
                        <ChevronRight size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-600 rotate-90 pointer-events-none" />
                    </div>
                </div>
            </div>

            {profesionales.length === 0 ? (
                <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-[32px] p-20 flex flex-col items-center justify-center text-center">
                    <div className="p-4 bg-slate-950 rounded-full mb-4 text-slate-700">
                        <User size={48} strokeWidth={1} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-300">No hay doctores disponibles</h3>
                    <p className="text-slate-500 text-sm max-w-sm mt-2">
                        Esta pantalla solo carga prestaciones de profesionales activos. Revisa la configuración en Prestadores.
                    </p>
                </div>
            ) : !selectedProfId ? (
                <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-[32px] p-20 flex flex-col items-center justify-center text-center">
                    <div className="p-4 bg-slate-950 rounded-full mb-4 text-slate-700">
                        <User size={48} strokeWidth={1} />
                    </div>
                    <h3 className="text-xl font-bold text-slate-300">Selecciona un doctor</h3>
                    <p className="text-slate-500 text-sm max-w-sm mt-2">
                        Para comenzar a cargar prestaciones, primero selecciona el profesional odontólogo que realizó el trabajo.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                    {/* Left side: CONFIG + CATALOG */}
                    <div className="lg:col-span-12 xl:col-span-8 space-y-6">
                        {/* Common Config (Date + Patient) */}
                        <div className="bg-slate-900/60 border border-slate-800 rounded-[32px] p-6">
                            <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                <Hash size={14} className="text-amber-500" /> Configuración de Carga
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                        Fecha de las prestaciones
                                    </label>
                                    <div className="relative">
                                        <CalendarDays size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="date"
                                            value={fecha}
                                            max={today()}
                                            onChange={e => setFecha(e.target.value)}
                                            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors"
                                        />
                                    </div>
                                </div>

                                <div className="relative">
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">
                                        Paciente (opcional)
                                    </label>
                                    {selectedPaciente ? (
                                        <div className="flex items-center gap-2 bg-slate-950 border border-emerald-500/30 rounded-xl px-3.5 py-3">
                                            <span className="text-sm text-emerald-100 font-medium flex-1">
                                                {selectedPaciente.nombre} {selectedPaciente.apellido}
                                            </span>
                                            <button
                                                onClick={() => { setSelectedPaciente(null); setPacienteQuery(''); }}
                                                className="text-slate-500 hover:text-red-400 p-1"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="relative">
                                                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                                                <input
                                                    type="text"
                                                    value={pacienteQuery}
                                                    onChange={e => handlePacienteSearch(e.target.value)}
                                                    placeholder="Buscar por nombre o apellido..."
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-4 py-3 text-slate-200 text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-700"
                                                />
                                            </div>
                                            {pacientes.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-2 bg-[#0a0a0a] border border-slate-700 rounded-2xl overflow-hidden z-50 shadow-2xl animate-in fade-in slide-in-from-top-2">
                                                    {pacientes.map(p => (
                                                        <button
                                                            key={p.id_paciente}
                                                            onClick={() => {
                                                                setSelectedPaciente(p);
                                                                setPacientes([]);
                                                                setPacienteQuery(`${p.nombre} ${p.apellido}`);
                                                            }}
                                                            className="w-full text-left px-4 py-3 text-sm text-slate-300 hover:bg-amber-500/10 hover:text-white transition-colors border-b border-slate-800 last:border-0 flex items-center justify-between group"
                                                        >
                                                            <span>{p.nombre} {p.apellido}</span>
                                                            <ChevronRight size={14} className="text-slate-700 group-hover:text-amber-500 transition-colors" />
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Catalog */}
                        <div className="bg-slate-900/40 border border-slate-800 rounded-[32px] overflow-hidden">
                            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
                                <h2 className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                                    <Plus size={14} className="text-amber-500" /> Catálogo de Prestaciones
                                </h2>
                            </div>
                            <div className="p-6">
                                {prestacionesCatalogo.length === 0 ? (
                                    <div className="text-center py-12 border border-dashed border-slate-800 rounded-2xl">
                                        <p className="text-slate-500 text-sm">No hay prestaciones activas para cargar.</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                                        {Object.entries(areaGroups).map(([area, items]) => (
                                        <div key={area} className="md:col-span-2 space-y-3 mb-6 last:mb-0">
                                            <div className="flex items-center gap-3">
                                                <div className="h-px flex-1 bg-slate-800/50"></div>
                                                <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{area}</p>
                                                <div className="h-px flex-1 bg-slate-800/50"></div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                {items.map(item => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => handleAddToBulk(item)}
                                                        className="group text-left px-4 py-3 rounded-2xl border border-slate-800/50 bg-slate-950/30 hover:bg-amber-500/5 hover:border-amber-500/30 transition-all flex items-center justify-between gap-3"
                                                    >
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-xs font-bold text-slate-300 group-hover:text-amber-200 truncate">{item.nombre}</p>
                                                            <p className="text-[10px] font-mono text-slate-500 mt-0.5">
                                                                {item.moneda === 'USD' ? 'USD ' : '$'}
                                                                {item.precio_base.toLocaleString('es-AR')}
                                                            </p>
                                                        </div>
                                                        <div className="w-8 h-8 rounded-xl bg-slate-800/50 group-hover:bg-amber-500 flex items-center justify-center text-slate-500 group-hover:text-amber-950 transition-all">
                                                            <Plus size={16} strokeWidth={3} />
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right side: PLANILLA (Sticky) */}
                    <div className="lg:col-span-12 xl:col-span-4 lg:sticky lg:top-8">
                        <div className="bg-[#0a0a0a] border border-slate-800 rounded-[32px] overflow-hidden flex flex-col shadow-2xl border-t-amber-500/20">
                            <div className="p-6 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between">
                                <div>
                                    <h3 className="text-sm font-bold text-white tracking-tight">Planilla de Carga</h3>
                                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                        {bulkEntries.length} items seleccionados
                                    </p>
                                </div>
                                {bulkEntries.length > 0 && (
                                    <button
                                        onClick={() => setBulkEntries([])}
                                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                                        title="Limpiar planilla"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[400px] max-h-[500px] custom-scrollbar bg-slate-950/20">
                                {bulkEntries.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center py-20">
                                        <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-700 mb-4">
                                            <Clock size={32} />
                                        </div>
                                        <h4 className="text-sm font-bold text-slate-500">Planilla Vacía</h4>
                                        <p className="text-[11px] text-slate-600 mt-1 max-w-[180px]">
                                            Agrega prestaciones desde el catálogo para comenzar.
                                        </p>
                                    </div>
                                ) : (
                                    bulkEntries.map((entry, idx) => (
                                        <div
                                            key={entry.id}
                                            className="bg-slate-900/80 border border-slate-800/50 rounded-2xl p-4 animate-in slide-in-from-right-4 duration-300"
                                        >
                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-[9px] font-black bg-amber-500/10 text-amber-500/80 px-1.5 py-0.5 rounded uppercase tracking-tighter">Item {idx + 1}</span>
                                                        <span className="text-[10px] text-slate-600 font-mono">{entry.fecha_realizacion}</span>
                                                    </div>
                                                    <p className="text-xs font-bold text-slate-200 truncate leading-relaxed">{entry.prestacion_nombre}</p>
                                                </div>
                                                <button
                                                    onClick={() => handleRemoveBulkEntry(entry.id)}
                                                    className="p-1.5 text-slate-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>

                                            <div className="flex items-center justify-between py-2 border-y border-slate-800/50 mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500/40"></div>
                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Honorarios</p>
                                                </div>
                                                <p className="text-xs font-mono font-bold text-white">
                                                    {entry.moneda_cobro === 'USD' ? 'USD ' : '$'}
                                                    {entry.monto_honorarios.toLocaleString('es-AR')}
                                                </p>
                                            </div>

                                            <div className="space-y-1">
                                                <label className="text-[9px] font-black text-slate-600 uppercase tracking-wider ml-1">Paciente</label>
                                                <div className="relative group/input">
                                                    <User size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600 group-focus-within/input:text-amber-500 transition-colors" />
                                                    <input
                                                        type="text"
                                                        value={entry.paciente_nombre}
                                                        onChange={e => {
                                                            const newVal = e.target.value;
                                                            setBulkEntries(prev => prev.map(item =>
                                                                item.id === entry.id ? { ...item, paciente_nombre: newVal } : item
                                                            ));
                                                        }}
                                                        placeholder="Escribir nombre del paciente..."
                                                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-7 pr-3 py-2 text-[11px] text-slate-300 focus:outline-none focus:border-amber-500 transition-all placeholder:text-slate-800"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {bulkEntries.length > 0 && (
                                <div className="p-6 bg-slate-900/80 border-t border-slate-800">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em]">Total Estimado</p>
                                        <div className="text-right">
                                            <p className="text-lg font-black text-white leading-none">
                                                {bulkEntries.filter(e => e.moneda_cobro === 'ARS').reduce((s, e) => s + e.monto_honorarios, 0).toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}
                                            </p>
                                            {bulkEntries.some(e => e.moneda_cobro === 'USD') && (
                                                <p className="text-xs font-bold text-emerald-400 mt-1">
                                                    + USD {bulkEntries.filter(e => e.moneda_cobro === 'USD').reduce((s, e) => s + e.monto_honorarios, 0).toFixed(2)}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        disabled={submitting}
                                        onClick={handleBulkSubmit}
                                        className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-amber-950 font-black rounded-2xl shadow-xl shadow-amber-500/10 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed group"
                                    >
                                        {submitting ? (
                                            <>
                                                <Loader2 size={18} className="animate-spin" />
                                                <span>PROCESANDO...</span>
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 size={18} className="group-hover:scale-110 transition-transform" />
                                                <span>GUARDAR EN FICHA PROFESIONAL</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Float helper */}
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 px-6 py-3 bg-[#0a0a0a] border border-slate-800 rounded-full shadow-2xl flex items-center gap-6 animate-in slide-in-from-bottom-8">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                    <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Estado Admin</span>
                </div>
                <div className="h-4 w-px bg-slate-800"></div>
                <div className="flex items-center gap-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                    <span>{profesionales.length} Prof.</span>
                    <span>{prestacionesCatalogo.length} Prest.</span>
                </div>
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 4px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: #1e293b;
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: #334155;
                }
            `}</style>
        </div>
    );
}
