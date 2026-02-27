'use client';

import { useState, useEffect } from 'react';
import { Upload, Search, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileSpreadsheet, UserCheck, UserX, Save, Link } from 'lucide-react';
import { toast } from 'sonner';
import {
    previewProsoftImport, importProsoftData,
    getAllPersonalBasic, saveProsoftMapping,
    getProsoftMappings, deleteProsoftMapping,
    ProsoftPreview,
} from '@/app/actions/prosoft-import';

function mesLabel(ym: string) {
    const [y, m] = ym.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[parseInt(m) - 1]} ${y}`;
}

function currentMes() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface PersonalOption {
    id: string;
    nombre: string;
    apellido: string | null;
}

interface SavedMapping {
    raw_name: string;
    personal_id: string;
    nombre: string;
    apellido: string | null;
}

export default function ProsoftImporter() {
    const [url, setUrl] = useState('');
    const [mes, setMes] = useState(currentMes());
    const [preview, setPreview] = useState<ProsoftPreview | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const [result, setResult] = useState<{ inserted: number; skipped: number; errors: string[] } | null>(null);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    // Manual mapping state
    const [allPersonal, setAllPersonal] = useState<PersonalOption[]>([]);
    const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
    const [pendingMaps, setPendingMaps] = useState<Record<string, string>>({}); // rawName → personalId
    const [savingMap, setSavingMap] = useState<string | null>(null);
    const [showMappings, setShowMappings] = useState(false);

    useEffect(() => {
        getAllPersonalBasic().then(setAllPersonal).catch(() => {});
        getProsoftMappings().then(setSavedMappings).catch(() => {});
    }, []);

    async function handlePreview() {
        if (!url.trim()) { toast.error('Ingresá el link de la planilla Prosoft'); return; }
        setLoading(true);
        setPreview(null);
        setResult(null);
        setPendingMaps({});
        try {
            const data = await previewProsoftImport(url.trim(), mes);
            setPreview(data);
            toast.success(`${data.totalRegistros} registros encontrados`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al leer la planilla');
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        if (!preview) return;
        setImporting(true);
        try {
            const res = await importProsoftData(url.trim(), mes, true);
            setResult(res);
            if (res.inserted > 0) {
                toast.success(`✓ ${res.inserted} registros importados`);
            } else {
                toast.info('No se importaron nuevos registros');
            }
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al importar');
        } finally {
            setImporting(false);
        }
    }

    async function handleSaveMapping(rawName: string) {
        const personalId = pendingMaps[rawName];
        if (!personalId) { toast.error('Seleccioná un empleado'); return; }
        setSavingMap(rawName);
        try {
            const res = await saveProsoftMapping(rawName, personalId);
            if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
            toast.success('Equivalencia guardada');
            // Optimistically update preview
            const person = allPersonal.find(p => p.id === personalId);
            if (person && preview) {
                setPreview({
                    ...preview,
                    filas: preview.filas.map(f =>
                        f.rawName === rawName
                            ? { ...f, personalId, personalNombre: `${person.nombre} ${person.apellido || ''}`.trim() }
                            : f
                    ),
                    sinMatch: preview.sinMatch.filter(n => n !== rawName),
                });
            }
            // Refresh saved mappings list
            const fresh = await getProsoftMappings();
            setSavedMappings(fresh);
        } catch {
            toast.error('Error al guardar equivalencia');
        } finally {
            setSavingMap(null);
        }
    }

    async function handleDeleteMapping(rawName: string) {
        await deleteProsoftMapping(rawName);
        setSavedMappings(prev => prev.filter(m => m.raw_name !== rawName));
        toast.success('Equivalencia eliminada');
    }

    const matchedRows = preview?.filas.filter(f => f.personalId) ?? [];
    const unmatchedRows = preview?.filas.filter(f => !f.personalId) ?? [];

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-teal-500/10 rounded-xl border border-teal-500/20">
                        <FileSpreadsheet size={18} className="text-teal-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">Importar desde Prosoft</h2>
                        <p className="text-xs text-slate-400">Cargá asistencias desde la planilla mensual</p>
                    </div>
                </div>
                <button
                    onClick={() => setShowMappings(!showMappings)}
                    className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg px-3 py-1.5 transition-colors"
                >
                    <Link size={12} />
                    Equivalencias ({savedMappings.length})
                </button>
            </div>

            {/* Saved mappings panel */}
            {showMappings && (
                <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-800">
                        <p className="text-xs font-medium text-slate-300">Equivalencias guardadas (se aplican automáticamente)</p>
                    </div>
                    {savedMappings.length === 0 ? (
                        <p className="text-xs text-slate-500 px-4 py-3">No hay equivalencias guardadas aún.</p>
                    ) : (
                        <div className="divide-y divide-slate-800">
                            {savedMappings.map(m => (
                                <div key={m.raw_name} className="flex items-center justify-between px-4 py-2.5">
                                    <div className="flex items-center gap-3 text-xs">
                                        <span className="text-amber-300 font-mono">{m.raw_name}</span>
                                        <span className="text-slate-500">→</span>
                                        <span className="text-emerald-400">{m.nombre} {m.apellido || ''}</span>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteMapping(m.raw_name)}
                                        className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                                    >
                                        Eliminar
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Inputs */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
                <input
                    type="url"
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
                <input
                    type="month"
                    value={mes}
                    onChange={e => setMes(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                    onClick={handlePreview}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
                >
                    {loading
                        ? <RefreshCw size={14} className="animate-spin" />
                        : <Search size={14} />
                    }
                    Vista previa
                </button>
            </div>

            {/* Preview */}
            {preview && !result && (
                <div className="space-y-4">
                    {/* Summary bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-emerald-400">{matchedRows.length}</p>
                            <p className="text-xs text-slate-400">Empleados encontrados</p>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-white">{preview.totalRegistros}</p>
                            <p className="text-xs text-slate-400">Registros de asistencia</p>
                        </div>
                        <div className={`border rounded-xl p-3 text-center ${unmatchedRows.length > 0 ? 'bg-amber-500/10 border-amber-500/20' : 'bg-slate-800 border-slate-700'}`}>
                            <p className={`text-lg font-bold ${unmatchedRows.length > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                                {unmatchedRows.length}
                            </p>
                            <p className="text-xs text-slate-400">Sin coincidencia</p>
                        </div>
                    </div>

                    {/* Manual mapping for unmatched */}
                    {unmatchedRows.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-amber-500/20">
                                <p className="text-xs font-medium text-amber-300 flex items-center gap-2">
                                    <AlertTriangle size={13} />
                                    {unmatchedRows.length} nombre{unmatchedRows.length > 1 ? 's' : ''} sin coincidencia — asignales un empleado y guardá
                                </p>
                            </div>
                            <div className="divide-y divide-amber-500/10">
                                {unmatchedRows.map(fila => (
                                    <div key={fila.rawName} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <UserX size={14} className="text-amber-400 flex-shrink-0" />
                                            <span className="text-sm text-amber-200 font-mono truncate">{fila.rawName}</span>
                                        </div>
                                        <div className="flex items-center gap-2 sm:w-auto">
                                            <select
                                                value={pendingMaps[fila.rawName] || ''}
                                                onChange={e => setPendingMaps(prev => ({ ...prev, [fila.rawName]: e.target.value }))}
                                                className="bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-teal-500 min-w-[200px]"
                                            >
                                                <option value="">— Seleccionar empleado —</option>
                                                {allPersonal.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleSaveMapping(fila.rawName)}
                                                disabled={!pendingMaps[fila.rawName] || savingMap === fila.rawName}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap"
                                            >
                                                {savingMap === fila.rawName
                                                    ? <RefreshCw size={11} className="animate-spin" />
                                                    : <Save size={11} />
                                                }
                                                Guardar
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Employee list */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                        {matchedRows.map((fila) => (
                            <div key={fila.rawName} className="border-b border-slate-800/50 last:border-0">
                                <button
                                    onClick={() => setExpandedRow(expandedRow === fila.rawName ? null : fila.rawName)}
                                    className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <UserCheck size={14} className="text-emerald-400 flex-shrink-0" />
                                        <div>
                                            <p className="text-sm text-white font-medium">{fila.rawName}</p>
                                            <p className="text-xs text-slate-400">→ {fila.personalNombre}</p>
                                        </div>
                                    </div>
                                    <span className="text-xs text-slate-500">{fila.registros.length} días</span>
                                </button>

                                {expandedRow === fila.rawName && (
                                    <div className="px-4 pb-3 grid grid-cols-3 gap-1.5">
                                        {fila.registros.map(r => (
                                            <div key={r.fecha} className="bg-slate-800 rounded-lg px-2 py-1.5 text-xs">
                                                <p className="text-slate-300 font-medium">Día {r.dia}</p>
                                                <p className="text-slate-400">{r.entrada}–{r.salida}</p>
                                                <p className="text-teal-400">{r.horas}h</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Import button */}
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Se importarán los registros de <strong className="text-white">{matchedRows.length}</strong> empleados para <strong className="text-white">{mesLabel(mes)}</strong>
                        </p>
                        <button
                            onClick={handleImport}
                            disabled={importing || matchedRows.length === 0}
                            className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
                        >
                            {importing
                                ? <RefreshCw size={14} className="animate-spin" />
                                : <Upload size={14} />
                            }
                            Confirmar importación
                        </button>
                    </div>
                </div>
            )}

            {/* Result */}
            {result && (
                <div className="space-y-3">
                    <div className={`flex items-start gap-3 p-4 rounded-xl border ${result.inserted > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800 border-slate-700'}`}>
                        {result.inserted > 0
                            ? <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                            : <XCircle size={18} className="text-slate-400 flex-shrink-0 mt-0.5" />
                        }
                        <div>
                            <p className="text-sm font-medium text-white">Importación completada</p>
                            <p className="text-xs text-slate-400 mt-1">
                                <span className="text-emerald-400 font-medium">{result.inserted} insertados</span>
                                {' · '}
                                <span className="text-slate-300">{result.skipped} omitidos</span>
                                {result.errors.length > 0 && (
                                    <> · <span className="text-red-400">{result.errors.length} errores</span></>
                                )}
                            </p>
                        </div>
                    </div>

                    {result.errors.length > 0 && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 space-y-1">
                            {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                        </div>
                    )}

                    <button
                        onClick={() => { setResult(null); setPreview(null); setUrl(''); }}
                        className="text-xs text-slate-400 hover:text-white transition-colors"
                    >
                        Nueva importación
                    </button>
                </div>
            )}
        </div>
    );
}
