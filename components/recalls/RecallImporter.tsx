
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Search, CheckCircle2, User, RefreshCw, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import { ScannedEvent, scanCalendarForRecalls, importRecalls } from '@/app/actions/recall-import';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function RecallImporter() {
    const router = useRouter();
    const [step, setStep] = useState<'scan' | 'review' | 'importing'>('scan');
    const [events, setEvents] = useState<ScannedEvent[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [scanning, setScanning] = useState(false);

    async function handleScan() {
        setScanning(true);
        try {
            const res = await scanCalendarForRecalls();
            if (res.success && res.data) {
                setEvents(res.data);
                // Auto-select all high confidence matches
                const initialSelected = new Set(res.data.filter(e => e.patient).map(e => e.id));
                setSelectedIds(initialSelected);
                setStep('review');
            } else {
                toast.error('Error al escanear: ' + res.error);
                if (res.error?.includes('API has not been used')) {
                    toast.message('Importante:', {
                        description: 'Debes habilitar la Google Calendar API en la consola de Google Cloud.',
                        duration: 10000
                    });
                }
            }
        } catch (e: any) {
            toast.error('Error inesperado: ' + e.message);
        }
        setScanning(false);
    }

    async function handleImport() {
        if (selectedIds.size === 0) return;
        setStep('importing');

        const toImport = events.filter(e => selectedIds.has(e.id));
        const res = await importRecalls(toImport);

        toast.success(`Importados ${res.imported} recalls correctamente.`);
        if (res.errors > 0) toast.warning(`${res.errors} errores durante la importación.`);

        router.push('/recalls');
    }

    function toggleSelect(id: string) {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    }

    return (
        <div className="max-w-4xl mx-auto p-6 bg-white dark:bg-gray-900 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800">

            {/* Header */}
            <div className="mb-8 text-center">
                <div className="w-16 h-16 bg-blue-50 dark:bg-blue-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <Calendar className="w-8 h-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    Importador de Recalls
                </h1>
                <p className="text-gray-500 max-w-md mx-auto">
                    Escanea tus calendarios de Google para detectar tratamientos pasados y generar recalls automáticos.
                </p>
                {step === 'scan' && (
                    <div className="mt-4 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm border border-amber-200">
                        Asegúrate de haber habilitado la API de Google Calendar en tu proyecto.
                    </div>
                )}
            </div>

            {/* Steps */}
            <AnimatePresence mode="wait">
                {step === 'scan' && (
                    <motion.div
                        key="scan"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center"
                    >
                        <button
                            onClick={handleScan}
                            disabled={scanning}
                            className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-2xl
                                hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 text-lg font-semibold disabled:opacity-70"
                        >
                            {scanning ? <Loader2 className="w-6 h-6 animate-spin" /> : <RefreshCw className="w-6 h-6" />}
                            {scanning ? 'Escaneando Calendarios...' : 'Iniciar Escaneo Inteligente'}
                        </button>
                        <p className="mt-4 text-sm text-gray-400">
                            Esto puede tomar unos momentos dependiendo de la cantidad de eventos.
                        </p>
                    </motion.div>
                )}

                {step === 'review' && (
                    <motion.div
                        key="review"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-6"
                    >
                        <div className="flex items-center justify-between text-sm text-gray-500">
                            <span>Encontrados: {events.length} eventos</span>
                            <span>Seleccionados: {selectedIds.size}</span>
                        </div>

                        <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden max-h-[500px] overflow-y-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 dark:bg-gray-800/50 text-gray-500 font-medium sticky top-0 backdrop-blur-sm z-10">
                                    <tr>
                                        <th className="p-3 w-10">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.size === events.length && events.length > 0}
                                                onChange={() => {
                                                    if (selectedIds.size === events.length) setSelectedIds(new Set());
                                                    else setSelectedIds(new Set(events.map(e => e.id)));
                                                }}
                                                className="rounded border-gray-300"
                                            />
                                        </th>
                                        <th className="p-3">Fecha</th>
                                        <th className="p-3">Evento Original</th>
                                        <th className="p-3">Paciente Detectado</th>
                                        <th className="p-3">Tipo Recall</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                                    {events.map((event) => (
                                        <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                                            <td className="p-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(event.id)}
                                                    onChange={() => toggleSelect(event.id)}
                                                    className="rounded border-gray-300"
                                                />
                                            </td>
                                            <td className="p-3 whitespace-nowrap text-gray-500">
                                                {new Date(event.date).toLocaleDateString()}
                                            </td>
                                            <td className="p-3 font-medium text-gray-900 dark:text-white">
                                                {event.summary}
                                            </td>
                                            <td className="p-3">
                                                {event.patient ? (
                                                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded-lg w-fit">
                                                        <User className="w-3.5 h-3.5" />
                                                        <span className="font-medium">{event.patient.name}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400 italic">No encontrado</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <span className="capitalize px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                                                    {event.recallType.replace('_', ' ')}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {events.length === 0 && (
                                <div className="p-8 text-center text-gray-400">
                                    No se encontraron eventos relevantes con los criterios de búsqueda.
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
                            <button
                                onClick={() => setStep('scan')}
                                className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl transition-colors font-medium"
                            >
                                Volver
                            </button>
                            <button
                                onClick={handleImport}
                                disabled={selectedIds.size === 0}
                                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 
                                    disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium flex items-center gap-2"
                            >
                                Importar {selectedIds.size} Recalls
                                <ArrowRight className="w-4 h-4" />
                            </button>
                        </div>
                    </motion.div>
                )}

                {step === 'importing' && (
                    <motion.div
                        key="importing"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex flex-col items-center justify-center py-12"
                    >
                        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
                        <h3 className="text-xl font-semibold">Procesando Importación...</h3>
                        <p className="text-gray-500">Estamos creando los registros en la base de datos.</p>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
