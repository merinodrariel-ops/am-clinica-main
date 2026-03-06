'use client';

import { useState, useEffect, Fragment } from 'react';
import { Upload, Search, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileSpreadsheet, UserCheck, UserX, Save, Link, Clock, Download, ChevronDown, ChevronUp, Trophy, Star, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
    previewProsoftFileSafe, importProsoftPreviewSafe,
    getAllPersonalBasic, saveProsoftMapping,
    getProsoftMappings, deleteProsoftMapping,
    ProsoftPreview,
} from '@/app/actions/prosoft-import';

function mesLabel(ym: string) {
    const [y, m] = ym.split('-');
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return `${meses[parseInt(m) - 1]} ${y}`;
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

type ProsoftFila = ProsoftPreview['filas'][number];
type ProsoftRegistro = ProsoftFila['registros'][number];

export default function ProsoftImporter() {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
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
    const [editingMapping, setEditingMapping] = useState<string | null>(null); // raw_name being edited
    const [editValue, setEditValue] = useState<string>(''); // personalId for edit

    const isObservedRecord = (r: { incompleto?: boolean; requiereRevision?: boolean }) => Boolean(r.incompleto || r.requiereRevision);

    const getFriendlyActionError = (error: unknown, fallback: string) => {
        const rawMessage = error instanceof Error ? error.message : '';
        if (!rawMessage) return fallback;

        if (rawMessage.includes('Server Components render')) {
            return 'No se pudo procesar la planilla. Verificá que el link sea público, que apunte a la pestaña correcta (gid) y reintentá.';
        }

        return rawMessage;
    };

    useEffect(() => {
        getAllPersonalBasic().then(setAllPersonal).catch(() => { });
        getProsoftMappings().then(setSavedMappings).catch(() => { });
    }, []);

    async function handlePreview(selectedFile: File) {
        setLoading(true);
        setPreview(null);
        setResult(null);
        setPendingMaps({});
        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            const previewResult = await previewProsoftFileSafe(formData);
            if (!previewResult.success) {
                toast.error(previewResult.error);
                return;
            }

            const data = previewResult.data;
            setPreview(data);
            toast.success(`${data.totalRegistros} registros encontrados · ${mesLabel(data.mes)}`);
        } catch (e: unknown) {
            toast.error(getFriendlyActionError(e, 'Error al leer la planilla'));
        } finally {
            setLoading(false);
        }
    }

    async function handleImport() {
        if (!preview) return;
        setImporting(true);
        try {
            const importResult = await importProsoftPreviewSafe(preview, true);
            if (!importResult.success) {
                toast.error(importResult.error);
                return;
            }

            const res = importResult.data;
            setResult(res);
            const observed = preview.filas
                .filter((f) => f.personalId)
                .reduce((sum, f) => sum + f.registros.filter((r) => isObservedRecord(r)).length, 0);

            if (res.inserted > 0) {
                toast.success(`✓ ${res.inserted} registros importados`);
            } else {
                toast.info('No se importaron nuevos registros');
            }

            if (observed > 0) {
                toast.warning(`${observed} registros quedaron en estado Observado para resolución manual.`);
            }
        } catch (e: unknown) {
            toast.error(getFriendlyActionError(e, 'Error al importar'));
        } finally {
            setImporting(false);
        }
    }

    async function handleSaveMapping(rawName: string) {
        const personalId = pendingMaps[rawName];
        if (!personalId) { toast.error('Seleccioná un prestador'); return; }
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

    async function handleEditMapping(rawName: string) {
        if (!editValue) { toast.error('Seleccioná un prestador'); return; }
        setSavingMap(rawName);
        try {
            const res = await saveProsoftMapping(rawName, editValue);
            if (!res.success) { toast.error(res.error || 'Error al guardar'); return; }
            toast.success('Equivalencia actualizada');
            const fresh = await getProsoftMappings();
            setSavedMappings(fresh);
            setEditingMapping(null);
        } catch {
            toast.error('Error al actualizar');
        } finally {
            setSavingMap(null);
        }
    }

    function exportToCsv() {
        if (!preview) return;

        const headers = ["Prestador", "Días", "Total Horas", "Prom/Día", "Horario Típico"];
        const rows = matchedRows.map(f => {
            const complete = f.registros.filter(r => !isObservedRecord(r));
            const totalH = complete.reduce((s, r) => s + r.horas, 0);
            const dias = f.registros.length;
            const ingresos = complete.filter(r => r.entrada !== '00:00').map(r => r.entrada).sort();
            const egresos = complete.filter(r => r.salida !== '00:00').map(r => r.salida).sort();
            const horaRango = ingresos.length > 0 ? `${ingresos[0]} - ${egresos.at(-1)}` : '—';

            return [
                f.personalNombre,
                dias,
                Math.round(totalH * 10) / 10,
                dias > 0 ? Math.round(totalH / dias * 10) / 10 : 0,
                horaRango
            ];
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map(c => `"${c}"`).join(','))
        ].join('\n');

        downloadCsv(csvContent, `resumen_horas_${preview.mes}.csv`);
    }

    function exportDetailedCsv() {
        if (!preview) return;

        const headers = ["Prestador", "Fecha", "Día", "Entrada", "Salida", "Horas", "Estado", "Notas"];
        const rows: Array<Array<string | number>> = [];

        matchedRows.forEach(f => {
            f.registros.forEach(r => {
                rows.push([
                    f.personalNombre,
                    `${preview.mes}-${String(r.dia).padStart(2, '0')}`,
                    r.dia,
                    r.entrada,
                    r.salida,
                    r.horas,
                    isObservedRecord(r) ? 'Observado' : 'Ok',
                    r.observaciones || ''
                ]);
            });
        });

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.map((c) => `"${c}"`).join(','))
        ].join('\n');

        downloadCsv(csvContent, `detalle_diario_horas_${preview.mes}.csv`);
    }

    function downloadCsv(content: string, filename: string) {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function getBadges(f: ProsoftFila) {
        const badges: Array<{ icon: React.JSX.Element; label: string; bg: string }> = [];
        const complete = f.registros.filter((r) => !isObservedRecord(r));
        const totalH = complete.reduce((s, r) => s + r.horas, 0);
        const hasIncomplete = f.registros.some((r) => isObservedRecord(r));
        const daysWorked = f.registros.length;

        // Merit-based criteria:
        // 1. Asistencia Perfecta: Full month (22+ days) AND zero incomplete records
        if (!hasIncomplete && daysWorked >= 22) {
            badges.push({
                icon: <Trophy size={10} className="text-yellow-400" />,
                label: 'Asistencia Perfecta',
                bg: 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'
            });
        }
        // 2. Alto Rendimiento: Very high total hours (>170h)
        if (totalH >= 170) {
            badges.push({
                icon: <Sparkles size={10} className="text-purple-400" />,
                label: 'Alto Rendimiento',
                bg: 'bg-purple-500/10 border-purple-500/20 text-purple-500'
            });
        }
        // 3. Constancia: Worked at least 20 days with no errors, but didn't reach 170h
        if (!hasIncomplete && daysWorked >= 20 && totalH < 170 && badges.length === 0) {
            badges.push({
                icon: <Star size={10} className="text-blue-400" />,
                label: 'Constancia',
                bg: 'bg-blue-500/10 border-blue-500/20 text-blue-500'
            });
        }
        return badges;
    }

    const matchedRows = preview?.filas.filter(f => f.personalId) ?? [];
    const unmatchedRows = preview?.filas.filter(f => !f.personalId) ?? [];
    const observedCount = matchedRows.reduce(
        (sum, f) => sum + f.registros.filter((r) => isObservedRecord(r)).length,
        0
    );

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
                                <div key={m.raw_name} className="px-4 py-2.5 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3 text-xs min-w-0">
                                            <span className="text-amber-300 font-mono truncate">{m.raw_name}</span>
                                            <span className="text-slate-500 flex-shrink-0">→</span>
                                            <span className="text-emerald-400 flex-shrink-0">{m.nombre} {m.apellido || ''}</span>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                                            <button
                                                onClick={() => {
                                                    setEditingMapping(editingMapping === m.raw_name ? null : m.raw_name);
                                                    setEditValue(m.personal_id);
                                                }}
                                                className="text-xs text-slate-400 hover:text-teal-400 transition-colors"
                                            >
                                                {editingMapping === m.raw_name ? 'Cancelar' : 'Editar'}
                                            </button>
                                            <button
                                                onClick={() => handleDeleteMapping(m.raw_name)}
                                                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    </div>
                                    {editingMapping === m.raw_name && (
                                        <div className="flex items-center gap-2">
                                            <select
                                                value={editValue}
                                                onChange={e => setEditValue(e.target.value)}
                                                className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-teal-500"
                                            >
                                                <option value="">— Seleccionar —</option>
                                                {allPersonal.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                onClick={() => handleEditMapping(m.raw_name)}
                                                disabled={savingMap === m.raw_name}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white text-xs rounded-lg transition-colors"
                                            >
                                                {savingMap === m.raw_name ? <RefreshCw size={10} className="animate-spin" /> : <Save size={10} />}
                                                Guardar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Inputs Dropzone */}
            <div
                className={`relative flex flex-col items-center justify-center p-12 border-2 border-dashed rounded-xl transition-colors ${
                    isDragging
                        ? 'border-teal-500 bg-teal-500/10'
                        : 'border-slate-700 bg-slate-800/50 hover:bg-slate-800'
                }`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    const droppedFile = e.dataTransfer.files?.[0];
                    if (droppedFile) {
                        setFile(droppedFile);
                        handlePreview(droppedFile);
                    }
                }}
            >
                <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    accept=".csv, .xls, .xlsx"
                    onChange={(e) => {
                        const selectedFile = e.target.files?.[0];
                        if (selectedFile) {
                            setFile(selectedFile);
                            handlePreview(selectedFile);
                        }
                    }}
                />
                <div className="text-center pointer-events-none">
                    {loading ? (
                        <Loader2 className="w-10 h-10 animate-spin text-teal-500 mx-auto mb-4" />
                    ) : (
                        <Upload className="w-10 h-10 text-slate-400 mx-auto mb-4" />
                    )}
                    <p className="text-sm font-medium text-white">
                        {loading ? 'Procesando archivo...' : 'Haz clic para subir o arrastra tu archivo aquí'}
                    </p>
                    <p className="text-xs text-slate-400 mt-2">
                        Acepta archivos .xls, .xlsx, .csv generados por Prosoft
                    </p>
                </div>
            </div>

            {preview && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-300 font-medium">
                        Período detectado: {mesLabel(preview.mes)}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-300">
                        {preview.periodoDesde} → {preview.periodoHasta}
                    </span>
                    {!preview.periodoDetectado && (
                        <span className="px-2.5 py-1 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300">
                            Período inferido por estructura (sin cabecera Prosoft)
                        </span>
                    )}
                </div>
            )}

            {/* Preview */}
            {preview && !result && (
                <div className="space-y-4">
                    {/* Summary bar */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                            <p className="text-lg font-bold text-emerald-400">{matchedRows.length}</p>
                            <p className="text-xs text-slate-400">Prestadores encontrados</p>
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

                    {observedCount > 0 && (
                        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
                            <p className="text-xs text-amber-200 font-medium flex items-center gap-2">
                                <AlertTriangle size={13} className="text-amber-400" />
                                Se detectaron {observedCount} fichajes con conflicto o faltantes. Se importarán como <strong className="text-amber-300">Observado</strong> para corrección manual.
                            </p>
                            <p className="text-[11px] text-amber-300/90 mt-1">
                                Luego resolvelos en Caja Administración → Personal → Observados (dejando evidencia y motivo en cada ajuste).
                            </p>
                            <a
                                href="/caja-admin?tab=personal&subtab=observados"
                                className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-amber-200 hover:text-amber-100 underline underline-offset-2"
                            >
                                Abrir Observados ahora
                            </a>
                        </div>
                    )}

                    {/* Manual mapping for unmatched */}
                    {unmatchedRows.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-amber-500/20">
                                <p className="text-xs font-medium text-amber-300 flex items-center gap-2">
                                    <AlertTriangle size={13} />
                                    {unmatchedRows.length} nombre{unmatchedRows.length > 1 ? 's' : ''} sin coincidencia — asignales un prestador y guardá
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
                                                <option value="">— Seleccionar prestador —</option>
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
                        {matchedRows.map((fila) => {
                            const incomplete = fila.registros.filter(r => isObservedRecord(r)).length;
                            return (
                                <div key={fila.rawName} className="border-b border-slate-800/50 last:border-0">
                                    <button
                                        onClick={() => setExpandedRow(expandedRow === fila.rawName ? null : fila.rawName)}
                                        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-800/40 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2">
                                                {expandedRow === fila.rawName ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                                                <UserCheck size={14} className="text-emerald-400 flex-shrink-0" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-sm text-white font-medium">{fila.rawName}</p>
                                                    <div className="flex items-center gap-1">
                                                        {getBadges(fila).map((b, i) => (
                                                            <span key={i} title={b.label} className={`flex items-center p-0.5 rounded-full border ${b.bg}`}>
                                                                {b.icon}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                                <p className="text-xs text-slate-400">→ {fila.personalNombre}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {incomplete > 0 && (
                                                <span className="flex items-center gap-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded px-1.5 py-0.5">
                                                    <Clock size={9} /> {incomplete} incompleto{incomplete > 1 ? 's' : ''}
                                                </span>
                                            )}
                                            <span className="text-xs text-slate-500">{fila.registros.length} días</span>
                                        </div>
                                    </button>

                                    {expandedRow === fila.rawName && (
                                        <div className="px-4 pb-4">
                                            <div className="bg-slate-950/50 border border-slate-800/80 rounded-lg overflow-hidden">
                                                <div className="p-2 border-b border-slate-800/80 bg-slate-900/30">
                                                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Cronología de Asistencia</p>
                                                </div>
                                                <div className="overflow-x-auto max-h-60 overflow-y-auto">
                                                    <table className="w-full text-xs">
                                                        <thead className="sticky top-0 bg-slate-900 shadow-sm z-10">
                                                            <tr className="border-b border-slate-800 text-slate-400">
                                                                <th className="px-3 py-2 text-left font-medium">Día</th>
                                                                <th className="px-3 py-2 text-center font-medium">Horario</th>
                                                                <th className="px-3 py-2 text-right font-medium">Horas</th>
                                                                <th className="px-3 py-2 text-left font-medium">Notas</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-slate-800/50">
                                                            {fila.registros.map((r, idx) => (
                                                                <tr key={`${fila.rawName}-${idx}`} className="hover:bg-slate-800/30 transition-colors">
                                                                    <td className="px-3 py-2">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className="w-5 text-slate-500 font-mono text-center">{r.dia}</span>
                                                                            <p className="text-slate-300 font-medium">
                                                                                {isObservedRecord(r) && <Clock size={10} className="text-amber-400 inline mr-1" />}
                                                                                Día {r.dia}
                                                                            </p>
                                                                        </div>
                                                                    </td>
                                                                    <td className="px-3 py-2 text-center text-slate-400">
                                                                        {r.entrada !== '00:00' ? r.entrada : '??:??'} – {r.salida !== '00:00' ? r.salida : '??:??'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-right font-medium text-slate-300">
                                                                        {isObservedRecord(r) ? (
                                                                            <span className="text-amber-500/80">pendiente</span>
                                                                        ) : (
                                                                            <span className="text-teal-400">{r.horas.toFixed(1)}h</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-500 text-[10px] italic">
                                                                        {r.observaciones && (
                                                                            <div className="flex items-center gap-1">
                                                                                <Sparkles size={9} className="text-purple-500/50" />
                                                                                <span className="truncate max-w-[120px]">{r.observaciones}</span>
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Import button */}
                    <div className="flex items-center justify-between">
                        <p className="text-xs text-slate-400">
                            Se importarán los registros de <strong className="text-white">{matchedRows.length}</strong> prestadores para <strong className="text-white">{mesLabel(preview.mes)}</strong>
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
            )
            }

            {/* Result Dashboard */}
            {
                result && preview && (
                    <div className="space-y-4">
                        {/* Status bar */}
                        {(() => {
                            const totalIncomplete = matchedRows.reduce((s, f) => s + f.registros.filter(r => isObservedRecord(r)).length, 0);
                            return (
                                <div className={`flex items-center gap-3 p-4 rounded-xl border ${result.inserted > 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-slate-800 border-slate-700'}`}>
                                    {result.inserted > 0
                                        ? <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
                                        : <XCircle size={18} className="text-slate-400 flex-shrink-0" />
                                    }
                                    <div className="flex-1">
                                        <p className="text-sm font-semibold text-white">Importación completada — {mesLabel(preview.mes)}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            <span className="text-emerald-400 font-medium">{result.inserted} registros insertados</span>
                                            {result.skipped > 0 && <> · <span className="text-slate-300">{result.skipped} omitidos (ya existían)</span></>}
                                            {totalIncomplete > 0 && <> · <span className="text-amber-400">{totalIncomplete} fichajes observados (requieren resolución manual)</span></>}
                                            {result.errors.length > 0 && <> · <span className="text-red-400">{result.errors.length} errores</span></>}
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* KPIs */}
                        {(() => {
                            const filas = matchedRows;
                            const totalHoras = filas.reduce((s, f) => s + f.registros.reduce((a, r) => a + r.horas, 0), 0);
                            const totalDias = filas.reduce((s, f) => s + f.registros.length, 0);
                            const promPorPersona = filas.length > 0 ? totalHoras / filas.length : 0;
                            return (
                                <div className="grid grid-cols-4 gap-3">
                                    {[
                                        { label: 'Prestadores', value: filas.length, color: 'text-teal-400' },
                                        { label: 'Horas totales', value: `${Math.round(totalHoras * 10) / 10}h`, color: 'text-violet-400' },
                                        { label: 'Días-persona', value: totalDias, color: 'text-blue-400' },
                                        { label: 'Prom. por prestador', value: `${Math.round(promPorPersona * 10) / 10}h`, color: 'text-amber-400' },
                                    ].map(k => (
                                        <div key={k.label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 text-center">
                                            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
                                            <p className="text-xs text-slate-400 mt-0.5">{k.label}</p>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}

                        {/* Detail table */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden print:border-slate-300 print:text-black">
                            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between print:border-slate-300">
                                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide print:text-black">Detalle por prestador</p>
                                <div className="flex items-center gap-3 print:hidden">
                                    <button
                                        onClick={exportToCsv}
                                        className="flex items-center gap-1.5 text-[10px] text-teal-400 font-medium hover:text-teal-300 transition-colors px-2 py-1 bg-teal-500/10 border border-teal-500/20 rounded-lg"
                                    >
                                        <Download size={11} />
                                        Resumen
                                    </button>
                                    <button
                                        onClick={exportDetailedCsv}
                                        className="flex items-center gap-1.5 text-[10px] text-violet-400 font-medium hover:text-violet-300 transition-colors px-2 py-1 bg-violet-500/10 border border-violet-500/20 rounded-lg"
                                    >
                                        <FileSpreadsheet size={11} />
                                        Detalle Diario
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium hover:text-white transition-colors px-2 py-1 border border-slate-700 rounded-lg"
                                    >
                                        Imprimir
                                    </button>
                                    <p className="text-xs text-slate-500">{mesLabel(preview.mes)}</p>
                                </div>
                                <p className="hidden print:block text-xs text-slate-600">{mesLabel(preview.mes)}</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-slate-800 text-slate-400">
                                            <th className="px-4 py-2 text-left font-medium">Prestador</th>
                                            <th className="px-3 py-2 text-center font-medium">Días</th>
                                            <th className="px-3 py-2 text-right font-medium">Total horas</th>
                                            <th className="px-3 py-2 text-right font-medium">Prom/día</th>
                                            <th className="px-3 py-2 text-center font-medium">Horario típico</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {matchedRows
                                            .map(f => {
                                                const complete = f.registros.filter(r => !isObservedRecord(r));
                                                const incomplete = f.registros.filter(r => isObservedRecord(r));
                                                const totalH = complete.reduce((s, r) => s + r.horas, 0);
                                                const dias = f.registros.length;
                                                const ingresos = complete.filter(r => r.entrada !== '00:00').map(r => r.entrada).sort();
                                                const egresos = complete.filter(r => r.salida !== '00:00').map(r => r.salida).sort();
                                                const horaRango = ingresos.length > 0
                                                    ? `${ingresos[0]} – ${egresos.at(-1) ?? '?'}`
                                                    : '—';
                                                return { f, totalH, dias, horaRango, incompleteCount: incomplete.length };
                                            })
                                            .sort((a, b) => b.totalH - a.totalH)
                                            .map(({ f, totalH, dias, horaRango, incompleteCount }) => (
                                                <Fragment key={f.rawName}>
                                                    <tr
                                                        onClick={() => setExpandedRow(expandedRow === f.rawName ? null : f.rawName)}
                                                        className="hover:bg-slate-800/30 transition-colors cursor-pointer"
                                                    >
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex items-center gap-2">
                                                                    {expandedRow === f.rawName ? <ChevronUp size={12} className="text-slate-500" /> : <ChevronDown size={12} className="text-slate-500" />}
                                                                    <div className="flex items-center">
                                                                        {getBadges(f).map((b, i) => (
                                                                            <span key={i} title={b.label} className={`flex items-center p-0.5 -ml-1.5 first:ml-0 rounded-full border bg-slate-900 ${b.bg}`}>
                                                                                {b.icon}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div>
                                                                    <p className="text-white font-medium">{f.personalNombre}</p>
                                                                    <p className="text-slate-500 text-[10px]">{f.rawName}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center text-slate-300">
                                                            {dias}
                                                            {incompleteCount > 0 && (
                                                                <span className="ml-1 text-amber-400" title={`${incompleteCount} fichajes observados`}>
                                                                    ({incompleteCount} pend.)
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-semibold text-teal-400">{Math.round(totalH * 10) / 10}h</td>
                                                        <td className="px-3 py-2.5 text-right text-slate-300">{dias > 0 ? `${Math.round(totalH / dias * 10) / 10}h` : '—'}</td>
                                                        <td className="px-3 py-2.5 text-center text-slate-400 font-mono">{horaRango}</td>
                                                    </tr>
                                                    {expandedRow === f.rawName && (
                                                        <tr className="bg-slate-950/30">
                                                            <td colSpan={5} className="px-4 py-3">
                                                                <div className="bg-slate-900/50 rounded-lg border border-slate-800 p-2 overflow-hidden shadow-inner">
                                                                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2 px-1">Registros diarios importados</p>
                                                                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                                                                        {f.registros.map((r: ProsoftRegistro, idx: number) => (
                                                                            <div key={idx} className={`p-1.5 rounded-md border text-[10px] ${isObservedRecord(r) ? 'bg-amber-500/5 border-amber-500/20' : 'bg-slate-800/40 border-slate-800'}`}>
                                                                                <div className="flex justify-between items-center mb-1">
                                                                                    <span className="text-slate-500 font-bold">Día {r.dia}</span>
                                                                                    {isObservedRecord(r) ? <Clock size={8} className="text-amber-500" /> : <span className="text-teal-500 font-bold">{r.horas}h</span>}
                                                                                </div>
                                                                                <div className="text-slate-400 flex flex-col gap-0.5">
                                                                                    <span>E: {r.entrada}</span>
                                                                                    <span>S: {r.salida}</span>
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </Fragment>
                                            ))
                                        }
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-700 bg-slate-800/40">
                                            <td className="px-4 py-2.5 text-white font-semibold">TOTAL</td>
                                            <td className="px-3 py-2.5 text-center text-slate-300">
                                                {matchedRows.reduce((s, f) => s + f.registros.length, 0)}
                                            </td>
                                            <td className="px-3 py-2.5 text-right font-bold text-teal-300">
                                                {Math.round(matchedRows.reduce((s, f) => s + f.registros.reduce((a, r) => a + r.horas, 0), 0) * 10) / 10}h
                                            </td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>

                        {result.errors.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs text-red-300 space-y-1">
                                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                            </div>
                        )}

                        <button
                            onClick={() => { setResult(null); setPreview(null); setFile(null); }}
                            className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                            ← Nueva importación
                        </button>
                    </div>
                )
            }
        </div >
    );
}
