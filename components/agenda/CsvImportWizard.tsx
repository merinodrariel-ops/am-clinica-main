'use client';

import { useState } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, Loader2, ArrowRight } from 'lucide-react';
import Papa from 'papaparse';

type Step = 'upload' | 'mapping' | 'processing' | 'resolution' | 'success';

interface CsvMapping {
    title?: string;
    startTime: string;
    endTime?: string;
    patientName?: string;
    patientEmail?: string;
    patientPhone?: string;
    notes?: string;
}

export default function CsvImportWizard() {
    const [step, setStep] = useState<Step>('upload');
    const [file, setFile] = useState<File | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [previewData, setPreviewData] = useState<any[]>([]);
    const [mapping, setMapping] = useState<CsvMapping>({ startTime: '' });

    const [jobId, setJobId] = useState<string | null>(null);
    const [progress, setProgress] = useState(0);
    const [importedCount, setImportedCount] = useState(0);

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
                    setHeaders(results.meta.fields);
                    // Try to guess mapping
                    const guess: CsvMapping = { startTime: '' };
                    results.meta.fields.forEach(f => {
                        const low = f.toLowerCase();
                        if (low.includes('start') || low.includes('inicio') || low.includes('fecha')) guess.startTime = f;
                        if (low.includes('end') || low.includes('fin')) guess.endTime = f;
                        if (low.includes('title') || low.includes('titulo') || low.includes('asunto')) guess.title = f;
                        if (low.includes('email') || low.includes('correo')) guess.patientEmail = f;
                        if (low.includes('phone') || low.includes('telefono') || low.includes('celular')) guess.patientPhone = f;
                        if (low.includes('name') || low.includes('nombre') || low.includes('paciente')) guess.patientName = f;
                        if (low.includes('note') || low.includes('descripcion')) guess.notes = f;
                    });
                    setMapping(guess);
                }
                setPreviewData(results.data);
                setStep('mapping');
            }
        });
    };

    const startAnalysis = async () => {
        if (!file || !mapping.startTime) return;
        setStep('processing');
        setProgress(0);

        // Parse the whole file
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const rows = results.data;
                try {
                    // 1. Create Job
                    const resJob = await fetch('/api/agenda/import/job', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            source: document.location.hostname.includes('calendly') ? 'calendly' : 'google_calendar', // Simplification
                            totalRows: rows.length,
                            settings: mapping
                        })
                    });
                    const { jobId, error: jobErr } = await resJob.json();
                    if (jobErr) throw new Error(jobErr);
                    setJobId(jobId);

                    // 2. Process in batches
                    const batchSize = 100;
                    for (let i = 0; i < rows.length; i += batchSize) {
                        const batch = rows.slice(i, i + batchSize);
                        await fetch('/api/agenda/import/batch', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ jobId, rows: batch, mapping })
                        });
                        setProgress(Math.round(((i + batch.length) / rows.length) * 100));
                    }

                    setStep('resolution');
                } catch (err) {
                    console.error(err);
                    alert('Failed to process CSV');
                    setStep('mapping');
                }
            }
        });
    };

    const executeImport = async () => {
        if (!jobId) return;
        setStep('processing');
        setProgress(100);

        try {
            const res = await fetch('/api/agenda/import/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jobId })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            setImportedCount(data.importedCount || 0);
            setStep('success');
        } catch (err: any) {
            console.error(err);
            alert('Error during import: ' + err.message);
            setStep('resolution');
        }
    };

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

            {step === 'mapping' && (
                <div className="space-y-6">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">Revisión de columnas</h4>
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                            Hemos pre-seleccionado las equivalencias. Por favor, verifica que cada campo apunte a la columna correcta de tu archivo.
                        </p>
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

            {step === 'resolution' && (
                <div className="text-center py-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-6">
                        <CheckCircle2 size={32} />
                    </div>
                    <h3 className="text-xl font-bold mb-2">Análisis Completado</h3>
                    <p className="text-gray-500 mb-8 max-w-lg mx-auto">
                        Los datos han sido analizados correctamente. Se crearán turnos históricos en la agenda.
                        (En el futuro aquí podrás revisar individualmente las coincidencias dudosas).
                    </p>

                    <button
                        onClick={executeImport}
                        className="px-8 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-800 hover:-translate-y-0.5 transition-all shadow-lg"
                    >
                        Confirmar e Importar Turnos
                    </button>
                </div>
            )}

            {step === 'success' && (
                <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 text-blue-600 mb-6">
                        <CheckCircle2 size={40} />
                    </div>
                    <h3 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">¡Importación Exitosa!</h3>
                    <p className="text-gray-500 text-lg mb-8">
                        Se han importado exitosamente <strong className="text-black">{importedCount}</strong> turnos a tu agenda histórica.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
                    >
                        Volver a la Agenda
                    </button>
                </div>
            )}

        </div>
    );
}
