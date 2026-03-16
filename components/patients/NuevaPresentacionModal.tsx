'use client';

import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Mic, MicOff, Loader2, Save, CalendarDays } from 'lucide-react';
import { toast } from 'sonner';
import { createHistoriaClinicaEntry } from '@/app/actions/patients';

interface NuevaPresentacionModalProps {
    patientId: string;
    profesional: string;
    onSaved: (entry: { id: string; fecha: string; profesional: string; tratamiento_realizado: string }) => void;
    onClose: () => void;
}

export default function NuevaPresentacionModal({ patientId, profesional, onSaved, onClose }: NuevaPresentacionModalProps) {
    const todayIso = new Date().toISOString().split('T')[0];

    const [fecha, setFecha] = useState(todayIso);
    const [tratamiento, setTratamiento] = useState('');
    const [saving, setSaving] = useState(false);
    const [isRecording, setIsRecording] = useState(false);

    // accumulate final transcript separately from interim so interim doesn't erase it
    const finalTranscriptRef = useRef('');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);

    function toggleDictation() {
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

        if (!SR) {
            toast.error('Tu navegador no soporta dictado por voz. Usá Chrome o Edge.');
            return;
        }

        finalTranscriptRef.current = tratamiento;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recognition = new SR() as any;
        recognition.lang = 'es-AR';
        recognition.continuous = true;
        recognition.interimResults = true;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recognition.onresult = (e: any) => {
            let interimText = '';
            let newFinals = '';
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const result of Array.from(e.results) as any[]) {
                if (result.isFinal) {
                    newFinals += result[0].transcript;
                } else {
                    interimText += result[0].transcript;
                }
            }
            if (newFinals) {
                finalTranscriptRef.current = (finalTranscriptRef.current + ' ' + newFinals).trim();
            }
            setTratamiento((finalTranscriptRef.current + (interimText ? ' ' + interimText : '')).trim());
        };

        recognition.onend = () => {
            setTratamiento(finalTranscriptRef.current);
            setIsRecording(false);
        };
        recognition.onerror = () => {
            setTratamiento(finalTranscriptRef.current);
            setIsRecording(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsRecording(true);
    }

    async function handleSave() {
        if (!tratamiento.trim()) {
            toast.error('Escribí o dictá el tratamiento realizado');
            return;
        }
        setSaving(true);
        if (isRecording) {
            recognitionRef.current?.stop();
            setIsRecording(false);
        }
        const result = await createHistoriaClinicaEntry({
            paciente_id: patientId,
            fecha,
            profesional,
            tratamiento_realizado: tratamiento.trim(),
        });
        if (result.error) {
            toast.error(`Error al guardar: ${result.error}`);
            setSaving(false);
            return;
        }
        toast.success('Presentación guardada');
        onSaved(result.data!);
        onClose();
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.97, y: 12 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.97, y: 12 }}
                    transition={{ duration: 0.18 }}
                    onClick={e => e.stopPropagation()}
                    className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Nueva Presentación</h3>
                        <button
                            onClick={onClose}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="px-6 py-5 space-y-4">
                        {/* Fecha */}
                        <div>
                            <label className="block text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide mb-1.5">
                                <CalendarDays size={12} className="inline mr-1" />
                                Fecha
                            </label>
                            <input
                                type="date"
                                value={fecha}
                                onChange={e => setFecha(e.target.value)}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-white/15 bg-white dark:bg-white/5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>

                        {/* Tratamiento realizado + dictado */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wide">
                                    Tratamiento realizado
                                </label>
                                <button
                                    type="button"
                                    onClick={toggleDictation}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                                        isRecording
                                            ? 'bg-red-500 text-white shadow-[0_0_0_3px_rgba(239,68,68,0.25)]'
                                            : 'bg-violet-50 dark:bg-violet-500/20 text-violet-600 dark:text-violet-300 hover:bg-violet-100'
                                    }`}
                                >
                                    {isRecording
                                        ? <><MicOff size={13} /> Detener</>
                                        : <><Mic size={13} /> Dictado</>
                                    }
                                </button>
                            </div>
                            <textarea
                                value={tratamiento}
                                onChange={e => setTratamiento(e.target.value)}
                                rows={6}
                                placeholder={isRecording ? 'Escuchando...' : 'Describí el tratamiento realizado hoy...'}
                                className={`w-full px-3 py-2.5 rounded-lg border text-sm resize-none focus:outline-none focus:ring-2 transition-colors bg-white dark:bg-white/5 text-gray-900 dark:text-white ${
                                    isRecording
                                        ? 'border-red-300 dark:border-red-500/50 focus:ring-red-300'
                                        : 'border-gray-200 dark:border-white/15 focus:ring-blue-400'
                                }`}
                            />
                            {isRecording && (
                                <p className="mt-1 text-xs text-red-500 dark:text-red-400 flex items-center gap-1.5">
                                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                    Escuchando — hablá naturalmente
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="flex gap-3 px-6 pb-5">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-white/15 text-gray-600 dark:text-white/60 text-sm hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving || !tratamiento.trim()}
                            className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                            Guardar presentación
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
