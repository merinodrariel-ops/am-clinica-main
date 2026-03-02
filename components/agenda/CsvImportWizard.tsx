'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, ArrowRight, Search, X, ChevronDown, ChevronRight, UserCheck, UserX, Users } from 'lucide-react';
import { searchPatients } from '@/app/actions/agenda';
import Papa from 'papaparse';

type Step = 'upload' | 'mapping' | 'processing' | 'resolution' | 'success';
type ImportSource = 'calendly' | 'google_calendar' | 'other';

interface CsvMapping {
    title?: string;
    startTime: string;
    endTime?: string;
    patientName?: string;
    patientEmail?: string;
    patientPhone?: string;
    notes?: string;
}

interface ImportStats {
    importedCount: number;
    skippedCount: number;
    matchedCount: number;
    unmatchedCount: number;
    dateRange: { min: string; max: string } | null;
}

interface ImportRow {
    id: string;
    raw_data: Record<string, any>;
    status: string;
    suggested_patient_id: string | null;
    resolved_patient_id: string | null;
    match_confidence: number;
    match_reasons: string[];
}

interface PatientInfo {
    id: string;
    nombre: string;
    apellido: string;
    email: string | null;
    telefono: string | null;
}

interface SearchResult {
    id: string;
    full_name: string;
    phone: string;
}

// ─── Patient Search Inline Component ─────────────────────────────────────────

function PatientSearchInline({
    onSelect,
    onCancel,
}: {
    onSelect: (patient: SearchResult) => void;
    onCancel: () => void;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout>();

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const doSearch = useCallback(async (q: string) => {
        if (q.length < 2) { setResults([]); return; }
        setLoading(true);
        try {
            const data = await searchPatients(q);
            setResults(data);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleInput = (val: string) => {
        setQuery(val);
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => doSearch(val), 300);
    };

    return (
        <div className="relative">
            <div className="flex items-center gap-1.5">
                <div className="relative flex-1">
                    <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => handleInput(e.target.value)}
                        placeholder="Buscar paciente..."
                        className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                    {loading && <Loader2 size={12} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                </div>
                <button onClick={onCancel} className="p-1 text-gray-400 hover:text-gray-600">
                    <X size={14} />
                </button>
            </div>
            {results.length > 0 && (
                <div className="absolute z-20 left-0 right-6 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {results.map(p => (
                        <button
                            key={p.id}
                            onClick={() => onSelect(p)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between"
                        >
                            <span className="font-medium text-gray-900 dark:text-white">{p.full_name}</span>
                            {p.phone && <span className="text-gray-400 text-[10px]">{p.phone}</span>}
                        </button>
                    ))}
                </div>
            )}
            {query.length >= 2 && !loading && results.length === 0 && (
                <div className="absolute z-20 left-0 right-6 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs text-gray-500 text-center">
                    Sin resultados
                </div>
            )}
        </div>
    );
}

// ─── Confidence Badge ────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
    if (confidence >= 80) return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">{confidence}%</span>;
    if (confidence >= 20) return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">{confidence}%</span>;
    return <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">0%</span>;
}

// ─── Main Wizard Component ───────────────────────────────────────────────────

export default function CsvImportWizard() {
    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [mapping, setMapping] = useState<CsvMapping>({ startTime: '' });
    const [source, setSource] = useState<ImportSource>('calendly');

    const [jobId, setJobId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [importStats, setImportStats] = useState<ImportStats | null>(null);

    // Resolution state
    const [resolutionRows, setResolutionRows] = useState<ImportRow[]>([]);
    const [patients, setPatients] = useState<Record<string, PatientInfo>>({});
    const [localResolutions, setLocalResolutions] = useState<Record<string, string | null>>({});
    const [searchingRowId, setSearchingRowId] = useState<string | null>(null);
    const [loadingResolution, setLoadingResolution] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        matched: false,
        partial: true,
        unmatched: true,
    });

    // ── File Upload ──────────────────────────────────────────────────────────

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;
        setFile(selected);

        Papa.parse(selected, {
            header: true,
            skipEmptyLines: true,
            preview: 5,
            complete: (results) => {
                if (results.meta.fields) {
                    const fields = results.meta.fields;
                    setHeaders(fields);

                    // Auto-detect source from headers
                    const allLower = fields.map(f => f.toLowerCase()).join(' ');
                    if (allLower.includes('invitee') || allLower.includes('calendly') || allLower.includes('event type')) {
                        setSource('calendly');
                    } else if (allLower.includes('subject') || allLower.includes('all day event') || allLower.includes('google')) {
                        setSource('google_calendar');
                    }

                    // Try to guess mapping
                    const guess: CsvMapping = { startTime: '' };
                    fields.forEach(f => {
                        const low = f.toLowerCase();
                        if (low === 'start date & time' || low === 'start date') guess.startTime = f;
                        if (low === 'end date & time' || low === 'end date') guess.endTime = f;
                        if (low === 'invitee name' || low === 'invitee full name') guess.patientName = f;
                        if (low === 'invitee email') guess.patientEmail = f;
                        if (low === 'text reminder number' || low === 'invitee phone' || low === 'phone number') guess.patientPhone = f;
                        if (low === 'event type name' || low === 'event name') guess.title = f;
                        if (low === 'start date' || low === 'start time') guess.startTime = guess.startTime || f;
                        if (low === 'end date' || low === 'end time') guess.endTime = guess.endTime || f;
                        if (low === 'subject') guess.title = guess.title || f;
                        if (low === 'description') guess.notes = guess.notes || f;
                        if (!guess.startTime && (low.includes('start') || low.includes('inicio') || low.includes('fecha'))) guess.startTime = f;
                        if (!guess.endTime && (low.includes('end') || low.includes('fin'))) guess.endTime = f;
                        if (!guess.title && (low.includes('title') || low.includes('titulo') || low.includes('asunto'))) guess.title = f;
                        if (!guess.patientEmail && (low.includes('email') || low.includes('correo'))) guess.patientEmail = f;
                        if (!guess.patientPhone && (low.includes('phone') || low.includes('telefono') || low.includes('celular'))) guess.patientPhone = f;
                        if (!guess.patientName && (low.includes('name') || low.includes('nombre') || low.includes('paciente'))) guess.patientName = f;
                        if (!guess.notes && (low.includes('note') || low.includes('descripcion'))) guess.notes = f;
                    });
                    setMapping(guess);
                }
                setPreviewData(results.data);
                setStep('mapping');
            }
        });
    };

    // ── Start Analysis (batch processing) ────────────────────────────────────

    const startAnalysis = async () => {
        if (!file || !mapping.startTime) return;
        setStep('processing');
        setProgress(0);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data;
                try {
                    const resJob = await fetch('/api/agenda/import/job', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ source, totalRows: rows.length, settings: mapping })
                    });
                    const { jobId: newJobId, error: jobErr } = await resJob.json();
                    if (jobErr) throw new Error(jobErr);
                    setJobId(newJobId);

                    const batchSize = 100;
                    for (let i = 0; i < rows.length; i += batchSize) {
                        const batch = rows.slice(i, i + batchSize);
                        await fetch('/api/agenda/import/batch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jobId: newJobId, rows: batch, mapping })
                        });
                        setProgress(Math.round(((i + batch.length) / rows.length) * 100));
                    }

                    // Fetch resolution data
                    await loadResolutionData(newJobId);
                    setStep('resolution');
                } catch (err) {
                    console.error(err);
                    alert('Error al procesar CSV');
                    setStep('mapping');
                }
            }
        });
    };

    // ── Load Resolution Data ─────────────────────────────────────────────────

    const loadResolutionData = async (jId: string) => {
        setLoadingResolution(true);
        try {
            const res = await fetch(`/api/agenda/import/resolve?jobId=${jId}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            setResolutionRows(data.rows || []);
            setPatients(data.patients || {});
        } catch (err) {
            console.error('Error loading resolution data:', err);
        } finally {
            setLoadingResolution(false);
        }
    };

    // ── Resolution Helpers ───────────────────────────────────────────────────

    const getRowName = (row: ImportRow): string => {
        if (mapping.patientName && row.raw_data[mapping.patientName]) return row.raw_data[mapping.patientName];
        return '(sin nombre)';
    };

    const getRowEmail = (row: ImportRow): string => {
        if (mapping.patientEmail && row.raw_data[mapping.patientEmail]) return row.raw_data[mapping.patientEmail];
        return '';
    };

    const getRowPhone = (row: ImportRow): string => {
        if (mapping.patientPhone && row.raw_data[mapping.patientPhone]) return row.raw_data[mapping.patientPhone];
        return '';
    };

    const getEffectivePatientId = (row: ImportRow): string | null => {
        if (localResolutions[row.id] !== undefined) return localResolutions[row.id];
        return row.resolved_patient_id || row.suggested_patient_id;
    };

    const getPatientDisplay = (patientId: string | null): string => {
        if (!patientId) return '';
        const p = patients[patientId];
        if (!p) return patientId;
        return `${p.nombre} ${p.apellido}`;
    };

    const categorizedRows = {
        matched: resolutionRows.filter(r => r.match_confidence >= 80),
        partial: resolutionRows.filter(r => r.match_confidence >= 1 && r.match_confidence < 80),
        unmatched: resolutionRows.filter(r => r.match_confidence === 0),
    };

    const handleSelectPatient = (rowId: string, patient: SearchResult) => {
        setLocalResolutions(prev => ({ ...prev, [rowId]: patient.id }));
        // Add to patients cache
        setPatients(prev => ({
            ...prev,
            [patient.id]: {
                id: patient.id,
                nombre: patient.full_name.split(' ')[0] || '',
                apellido: patient.full_name.split(' ').slice(1).join(' ') || '',
                email: null,
                telefono: patient.phone || null,
            }
        }));
        setSearchingRowId(null);
    };

    const handleAcceptAllPartials = () => {
        const updates: Record<string, string | null> = {};
        for (const row of categorizedRows.partial) {
            if (row.suggested_patient_id) {
                updates[row.id] = row.suggested_patient_id;
            }
        }
        setLocalResolutions(prev => ({ ...prev, ...updates }));
    };

    const handleClearResolution = (rowId: string) => {
        setLocalResolutions(prev => ({ ...prev, [rowId]: null }));
    };

    // ── Save Resolutions + Execute Import ────────────────────────────────────

    const saveAndExecute = async () => {
        if (!jobId) return;
        setStep('processing');
        setProgress(100);

        try {
            // 1. Save local resolutions to DB
            const resolutionsToSave = Object.entries(localResolutions)
                .filter(([, patientId]) => patientId !== undefined)
                .map(([rowId, patientId]) => ({ rowId, patientId }));

            if (resolutionsToSave.length > 0) {
                const resolveRes = await fetch('/api/agenda/import/resolve', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jobId, resolutions: resolutionsToSave })
                });
                const resolveData = await resolveRes.json();
                if (resolveData.error) throw new Error(resolveData.error);
            }

            // 2. Execute the import
            const res = await fetch('/api/agenda/import/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setImportStats({
                importedCount: data.importedCount || 0,
                skippedCount: data.skippedCount || 0,
                matchedCount: data.matchedCount || 0,
                unmatchedCount: data.unmatchedCount || 0,
                dateRange: data.dateRange || null,
            });
            setStep('success');
        } catch (err: any) {
            console.error(err);
            alert('Error durante la importación: ' + err.message);
            setStep('resolution');
        }
    };

    // ── Toggle Section ───────────────────────────────────────────────────────

    const toggleSection = (key: string) => {
        setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // ── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 shadow-sm">
            <div className="mb-8">
                <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                    Importador Inteligente de Agenda
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                    Sube exportaciones de Google Calendar o Calendly. El sistema vinculará automáticamente los turnos con tus pacientes existentes.
                </p>
            </div>

            {/* ── Step: Upload ──────────────────────────────────────────── */}
            {step === 'upload' && (
                <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-2xl p-12 text-center hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Sube tu archivo CSV</h3>
                    <p className="text-sm text-gray-500 mb-6">Soporta Google Calendar, Calendly y formatos estándar</p>
                    <label className="bg-black dark:bg-white text-white dark:text-gray-900 px-6 py-2.5 rounded-lg font-medium cursor-pointer hover:bg-gray-800 transition-colors">
                        Seleccionar archivo
                        <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
            )}

            {/* ── Step: Mapping ─────────────────────────────────────────── */}
            {step === 'mapping' && (
                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Revisión de columnas</h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Hemos pre-seleccionado las equivalencias. Por favor, verifica que cada campo apunte a la columna correcta de tu archivo.
                        </p>
                    </div>

                    {/* Source selector */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Origen de los datos</label>
                        <div className="flex gap-2">
                            {([['calendly', 'Calendly'], ['google_calendar', 'Google Calendar'], ['other', 'Otro']] as const).map(([val, label]) => (
                                <button
                                    key={val}
                                    onClick={() => setSource(val)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${source === val
                                        ? 'bg-black dark:bg-white text-white dark:text-gray-900 border-transparent'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { key: 'startTime', label: 'Inicio del turno (*)', required: true },
                            { key: 'endTime', label: 'Fin del turno' },
                            { key: 'title', label: 'Título / Asunto' },
                            { key: 'patientName', label: 'Nombre del Paciente' },
                            { key: 'patientEmail', label: 'Email del Paciente' },
                            { key: 'patientPhone', label: 'Teléfono del Paciente' },
                            { key: 'notes', label: 'Notas / Detalles' }
                        ].map((f) => (
                            <div key={f.key}>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{f.label}</label>
                                <select
                                    value={(mapping as any)[f.key] || ''}
                                    onChange={e => setMapping({ ...mapping, [f.key]: e.target.value })}
                                    className="w-full rounded-lg border-gray-200 dark:border-gray-700 dark:bg-gray-900 focus:ring-black"
                                >
                                    <option value="">-- No mapear --</option>
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-6 border-t dark:border-gray-700">
                        <button onClick={() => setStep('upload')} className="px-5 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Atrás</button>
                        <button
                            onClick={startAnalysis}
                            disabled={!mapping.startTime}
                            className="px-5 py-2 bg-black text-white rounded-lg disabled:opacity-50 hover:bg-gray-800 flex items-center gap-2"
                        >
                            Comenzar Análisis Inteligente <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* ── Step: Processing ──────────────────────────────────────── */}
            {step === 'processing' && (
                <div className="py-20 text-center">
                    <Loader2 className="h-10 w-10 text-blue-600 animate-spin mx-auto mb-6" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        Analizando y Vinculando Identidades
                    </h3>
                    <p className="text-gray-500 mb-6">
                        Buscando coincidencias con pacientes existentes por email, teléfono o nombre...
                    </p>
                    <div className="max-w-md mx-auto h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="text-sm font-medium mt-2 text-gray-700">{progress}%</p>
                </div>
            )}

            {/* ── Step: Resolution ──────────────────────────────────────── */}
            {step === 'resolution' && (
                <div className="space-y-6">
                    {loadingResolution ? (
                        <div className="py-12 text-center">
                            <Loader2 className="h-8 w-8 text-blue-600 animate-spin mx-auto mb-4" />
                            <p className="text-gray-500">Cargando resultados del análisis...</p>
                        </div>
                    ) : (
                        <>
                            {/* Stats header */}
                            <div className="flex items-center gap-4 flex-wrap">
                                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-xl border border-green-200 dark:border-green-800">
                                    <UserCheck size={16} className="text-green-600" />
                                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">
                                        {categorizedRows.matched.length} vinculados
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/20 px-3 py-2 rounded-xl border border-yellow-200 dark:border-yellow-800">
                                    <AlertCircle size={16} className="text-yellow-600" />
                                    <span className="text-sm font-semibold text-yellow-700 dark:text-yellow-400">
                                        {categorizedRows.partial.length} coincidencia parcial
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-xl border border-red-200 dark:border-red-800">
                                    <UserX size={16} className="text-red-600" />
                                    <span className="text-sm font-semibold text-red-700 dark:text-red-400">
                                        {categorizedRows.unmatched.length} sin coincidencia
                                    </span>
                                </div>
                            </div>

                            {/* Matched section (collapsed) */}
                            {categorizedRows.matched.length > 0 && (
                                <ResolutionSection
                                    title="Vinculados automáticamente"
                                    count={categorizedRows.matched.length}
                                    color="green"
                                    expanded={expandedSections.matched}
                                    onToggle={() => toggleSection('matched')}
                                >
                                    {categorizedRows.matched.map(row => (
                                        <ResolutionRow
                                            key={row.id}
                                            row={row}
                                            mapping={mapping}
                                            patients={patients}
                                            effectivePatientId={getEffectivePatientId(row)}
                                            isSearching={searchingRowId === row.id}
                                            onStartSearch={() => setSearchingRowId(row.id)}
                                            onCancelSearch={() => setSearchingRowId(null)}
                                            onSelectPatient={(p) => handleSelectPatient(row.id, p)}
                                            onClear={() => handleClearResolution(row.id)}
                                            getRowName={getRowName}
                                            getRowEmail={getRowEmail}
                                            getRowPhone={getRowPhone}
                                            getPatientDisplay={getPatientDisplay}
                                        />
                                    ))}
                                </ResolutionSection>
                            )}

                            {/* Partial matches */}
                            {categorizedRows.partial.length > 0 && (
                                <ResolutionSection
                                    title="Coincidencia parcial — revisá"
                                    count={categorizedRows.partial.length}
                                    color="yellow"
                                    expanded={expandedSections.partial}
                                    onToggle={() => toggleSection('partial')}
                                    action={
                                        <button
                                            onClick={handleAcceptAllPartials}
                                            className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 hover:underline"
                                        >
                                            Aceptar todas las sugerencias
                                        </button>
                                    }
                                >
                                    {categorizedRows.partial.map(row => (
                                        <ResolutionRow
                                            key={row.id}
                                            row={row}
                                            mapping={mapping}
                                            patients={patients}
                                            effectivePatientId={getEffectivePatientId(row)}
                                            isSearching={searchingRowId === row.id}
                                            onStartSearch={() => setSearchingRowId(row.id)}
                                            onCancelSearch={() => setSearchingRowId(null)}
                                            onSelectPatient={(p) => handleSelectPatient(row.id, p)}
                                            onClear={() => handleClearResolution(row.id)}
                                            getRowName={getRowName}
                                            getRowEmail={getRowEmail}
                                            getRowPhone={getRowPhone}
                                            getPatientDisplay={getPatientDisplay}
                                        />
                                    ))}
                                </ResolutionSection>
                            )}

                            {/* Unmatched */}
                            {categorizedRows.unmatched.length > 0 && (
                                <ResolutionSection
                                    title="Sin coincidencia"
                                    count={categorizedRows.unmatched.length}
                                    color="red"
                                    expanded={expandedSections.unmatched}
                                    onToggle={() => toggleSection('unmatched')}
                                >
                                    {categorizedRows.unmatched.map(row => (
                                        <ResolutionRow
                                            key={row.id}
                                            row={row}
                                            mapping={mapping}
                                            patients={patients}
                                            effectivePatientId={getEffectivePatientId(row)}
                                            isSearching={searchingRowId === row.id}
                                            onStartSearch={() => setSearchingRowId(row.id)}
                                            onCancelSearch={() => setSearchingRowId(null)}
                                            onSelectPatient={(p) => handleSelectPatient(row.id, p)}
                                            onClear={() => handleClearResolution(row.id)}
                                            getRowName={getRowName}
                                            getRowEmail={getRowEmail}
                                            getRowPhone={getRowPhone}
                                            getPatientDisplay={getPatientDisplay}
                                        />
                                    ))}
                                </ResolutionSection>
                            )}

                            {/* Actions */}
                            <div className="flex justify-end gap-3 pt-6 border-t dark:border-gray-700">
                                <button
                                    onClick={saveAndExecute}
                                    className="px-8 py-3 bg-black dark:bg-white text-white dark:text-gray-900 rounded-xl font-medium hover:bg-gray-800 dark:hover:bg-gray-100 hover:-translate-y-0.5 transition-all shadow-lg flex items-center gap-2"
                                >
                                    Confirmar e Importar {resolutionRows.length} Turnos <ArrowRight size={16} />
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* ── Step: Success ──────────────────────────────────────────── */}
            {step === 'success' && importStats && (
                <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 text-blue-600 mb-6">
                        <CheckCircle2 size={40} />
                    </div>
                    <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">¡Importación Exitosa!</h3>
                    <p className="text-gray-500 text-lg mb-4">
                        Se importaron <strong className="text-black dark:text-white">{importStats.importedCount}</strong> turnos a tu agenda.
                    </p>

                    <div className="flex justify-center gap-4 mb-4 text-sm flex-wrap">
                        <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-3 py-1.5 rounded-lg">
                            <strong>{importStats.matchedCount}</strong> con paciente vinculado
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 px-3 py-1.5 rounded-lg">
                            <strong>{importStats.unmatchedCount}</strong> sin vincular
                        </div>
                        {importStats.skippedCount > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 px-3 py-1.5 rounded-lg">
                                <strong>{importStats.skippedCount}</strong> omitidos (fecha inválida)
                            </div>
                        )}
                    </div>

                    {importStats.dateRange && (
                        <p className="text-xs text-gray-400 mb-6">
                            Rango: {new Date(importStats.dateRange.min).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                            {' — '}
                            {new Date(importStats.dateRange.max).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </p>
                    )}

                    <div className="flex justify-center gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
                        >
                            Volver a la Agenda
                        </button>
                    </div>

                    {importStats.unmatchedCount > 0 && (
                        <p className="text-xs text-gray-400 mt-6 max-w-md mx-auto">
                            Los turnos sin paciente vinculado se importaron correctamente. Podés vincularlos editando cada turno desde la agenda.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Resolution Section (collapsible) ────────────────────────────────────────

function ResolutionSection({
    title,
    count,
    color,
    expanded,
    onToggle,
    action,
    children,
}: {
    title: string;
    count: number;
    color: 'green' | 'yellow' | 'red';
    expanded: boolean;
    onToggle: () => void;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    const colorMap = {
        green: 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10',
        yellow: 'border-yellow-200 dark:border-yellow-800 bg-yellow-50/50 dark:bg-yellow-900/10',
        red: 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10',
    };
    const dotColor = { green: 'bg-green-500', yellow: 'bg-yellow-500', red: 'bg-red-500' };

    return (
        <div className={`border rounded-xl overflow-hidden ${colorMap[color]}`}>
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
                <div className="flex items-center gap-2.5">
                    {expanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
                    <div className={`w-2 h-2 rounded-full ${dotColor[color]}`} />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
                    <span className="text-xs text-gray-500 bg-white dark:bg-gray-800 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                        {count}
                    </span>
                </div>
                {action && <div onClick={e => e.stopPropagation()}>{action}</div>}
            </button>
            {expanded && (
                <div className="border-t border-inherit divide-y divide-gray-100 dark:divide-gray-800 max-h-[400px] overflow-y-auto">
                    {children}
                </div>
            )}
        </div>
    );
}

// ─── Resolution Row ──────────────────────────────────────────────────────────

function ResolutionRow({
    row,
    mapping,
    patients,
    effectivePatientId,
    isSearching,
    onStartSearch,
    onCancelSearch,
    onSelectPatient,
    onClear,
    getRowName,
    getRowEmail,
    getRowPhone,
    getPatientDisplay,
}: {
    row: ImportRow;
    mapping: CsvMapping;
    patients: Record<string, PatientInfo>;
    effectivePatientId: string | null;
    isSearching: boolean;
    onStartSearch: () => void;
    onCancelSearch: () => void;
    onSelectPatient: (p: SearchResult) => void;
    onClear: () => void;
    getRowName: (row: ImportRow) => string;
    getRowEmail: (row: ImportRow) => string;
    getRowPhone: (row: ImportRow) => string;
    getPatientDisplay: (id: string | null) => string;
}) {
    const name = getRowName(row);
    const email = getRowEmail(row);
    const phone = getRowPhone(row);

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 text-xs">
            {/* CSV data (left) */}
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 dark:text-white truncate">{name}</p>
                <div className="flex items-center gap-2 text-gray-500 mt-0.5">
                    {email && <span className="truncate">{email}</span>}
                    {email && phone && <span>·</span>}
                    {phone && <span>{phone}</span>}
                </div>
            </div>

            {/* Arrow */}
            <ArrowRight size={12} className="text-gray-300 flex-shrink-0" />

            {/* Patient match (right) */}
            <div className="flex-1 min-w-0">
                {isSearching ? (
                    <PatientSearchInline
                        onSelect={onSelectPatient}
                        onCancel={onCancelSearch}
                    />
                ) : effectivePatientId ? (
                    <div className="flex items-center gap-2">
                        <UserCheck size={13} className="text-green-500 flex-shrink-0" />
                        <span className="font-medium text-gray-900 dark:text-white truncate">
                            {getPatientDisplay(effectivePatientId)}
                        </span>
                        <ConfidenceBadge confidence={row.match_confidence} />
                        <button
                            onClick={onStartSearch}
                            className="text-blue-500 hover:text-blue-700 font-semibold flex-shrink-0"
                        >
                            Cambiar
                        </button>
                        <button
                            onClick={onClear}
                            className="text-gray-400 hover:text-red-500 flex-shrink-0"
                            title="Desvincular"
                        >
                            <X size={12} />
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <UserX size={13} className="text-gray-400 flex-shrink-0" />
                        <span className="text-gray-400 italic">Sin vincular</span>
                        <button
                            onClick={onStartSearch}
                            className="text-blue-500 hover:text-blue-700 font-semibold flex-shrink-0 flex items-center gap-1"
                        >
                            <Search size={11} /> Buscar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
