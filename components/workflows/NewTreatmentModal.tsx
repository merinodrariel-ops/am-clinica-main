'use client';

import React, { useState, useEffect } from 'react';
import { createTreatment, getPatients } from '@/app/actions/clinical-workflows';
import { Plus, X, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import type { PatientSearchResult, WorkflowType, WorkflowStage } from './types';

interface NewTreatmentModalProps {
    workflowId: string;
    workflowName: string;
    workflowType: WorkflowType;
    workflowFrequencyMonths?: number | null;
    initialStageId: string | null;
    workflowStages: WorkflowStage[];
    onSuccess?: () => void;
}

function parseReminderDays(value: string, fallback: number[]) {
    const parsed = value
        .split(',')
        .map(item => Number(item.trim()))
        .filter(item => Number.isFinite(item) && item > 0)
        .slice(0, 3)
        .sort((a, b) => b - a);

    return parsed.length ? parsed : fallback;
}

function toIsoDateAtNoon(dateInput: string) {
    if (!dateInput) return new Date().toISOString();
    const base = new Date(`${dateInput}T12:00:00`);
    return Number.isNaN(base.getTime()) ? new Date().toISOString() : base.toISOString();
}

export function NewTreatmentModal({
    workflowId,
    workflowName,
    workflowType,
    workflowFrequencyMonths,
    initialStageId,
    workflowStages,
    onSuccess,
}: NewTreatmentModalProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [patients, setPatients] = useState<PatientSearchResult[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedPatient, setSelectedPatient] = useState<PatientSearchResult | null>(null);
    const [searching, setSearching] = useState(false);
    const [recurrenceMonths, setRecurrenceMonths] = useState<number>(workflowFrequencyMonths || 6);
    const [treatmentDate, setTreatmentDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [selectedStageId, setSelectedStageId] = useState<string | null>(initialStageId);
    const [appointmentDate, setAppointmentDate] = useState('');
    const [waitingRemindersText, setWaitingRemindersText] = useState('30,14,3');
    const [appointmentRemindersText, setAppointmentRemindersText] = useState('7,2,1');
    const router = useRouter();

    const isRecurrentWorkflow = workflowType === 'recurrent';
    const isBotoxWorkflow = workflowName.toLowerCase().includes('botox');
    const isBookingStage = (workflowStages.find(stage => stage.id === selectedStageId)?.name || '')
        .toLowerCase()
        .includes('agend');

    useEffect(() => {
        if (isBotoxWorkflow) {
            setRecurrenceMonths(4);
            return;
        }

        if (workflowFrequencyMonths && workflowFrequencyMonths > 0) {
            setRecurrenceMonths(workflowFrequencyMonths);
        } else {
            setRecurrenceMonths(6);
        }
    }, [isBotoxWorkflow, workflowFrequencyMonths]);

    useEffect(() => {
        setSelectedStageId(initialStageId);
    }, [initialStageId]);

    const previewNextMilestone = React.useMemo(() => {
        const next = new Date(`${treatmentDate}T12:00:00`);
        if (Number.isNaN(next.getTime())) {
            return new Date();
        }
        next.setMonth(next.getMonth() + recurrenceMonths);
        return next;
    }, [recurrenceMonths, treatmentDate]);

    // Debounce search
    useEffect(() => {
        const delayDebounceFn = setTimeout(async () => {
            if (selectedPatient) {
                setPatients([]);
                return;
            }

            if (searchTerm.length > 1) {
                setSearching(true);
                const results = await getPatients(searchTerm);
                setPatients(results || []);
                setSearching(false);
            } else {
                setPatients([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, selectedPatient]);

    const handleSubmit = async () => {
        if (!selectedPatient || !selectedStageId) return;

        setIsLoading(true);
        try {
            const waitingReminderDays = parseReminderDays(
                waitingRemindersText,
                isBotoxWorkflow ? [30, 14, 3] : [30, 14, 3]
            );
            const appointmentReminderDays = parseReminderDays(appointmentRemindersText, [7, 2, 1]);

            const metadata = isRecurrentWorkflow
                ? {
                    recurrence_interval_months: recurrenceMonths,
                    type: isBotoxWorkflow ? `Botox ${recurrenceMonths}m` : 'Control recurrente',
                    recurrence_origin: 'manual_creation',
                    treatment_completed_at: toIsoDateAtNoon(treatmentDate),
                    waiting_reminder_days: waitingReminderDays,
                    appointment_reminder_days: appointmentReminderDays,
                    appointment_date: appointmentDate ? toIsoDateAtNoon(appointmentDate) : null,
                }
                : undefined;

            await createTreatment({
                patient_id: selectedPatient.id_paciente,
                workflow_id: workflowId,
                initial_stage_id: selectedStageId,
                start_date: isRecurrentWorkflow ? toIsoDateAtNoon(treatmentDate) : undefined,
                next_milestone_date: isRecurrentWorkflow ? previewNextMilestone.toISOString() : undefined,
                metadata,
            });

            toast.success('Tratamiento creado exitosamente');
            setIsOpen(false);
            setSelectedPatient(null);
            setSearchTerm('');
            setAppointmentDate('');
            router.refresh();
            if (onSuccess) onSuccess();
        } catch (error: unknown) {
            console.error('Submission error:', error);
            const message = error instanceof Error ? error.message : 'Error al crear tratamiento';
            toast.error(message);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isOpen) {
        return (
            <button
                onClick={() => {
                    if (initialStageId) setIsOpen(true);
                }}
                disabled={!initialStageId}
                title={!initialStageId ? 'Este workflow no tiene etapa inicial configurada' : undefined}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
                <Plus size={16} />
                {initialStageId ? 'Nuevo Tratamiento' : 'Workflow sin etapas'}
            </button>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full overflow-hidden border border-gray-100 dark:border-gray-700">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50/50 dark:bg-gray-800/50">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Nuevo Tratamiento: {workflowName}</h3>
                    <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {isRecurrentWorkflow && (
                        <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                                        Fecha del tratamiento
                                    </label>
                                    <input
                                        type="date"
                                        value={treatmentDate}
                                        onChange={e => setTreatmentDate(e.target.value)}
                                        className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                                        Frecuencia de control
                                    </label>
                                    <select
                                        value={recurrenceMonths}
                                        onChange={(e) => setRecurrenceMonths(Number(e.target.value))}
                                        className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    >
                                        {(isBotoxWorkflow ? [3, 4] : [3, 4, 6, 12]).map(months => (
                                            <option key={months} value={months}>{months} meses</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                                        Columna inicial
                                    </label>
                                    <select
                                        value={selectedStageId || ''}
                                        onChange={e => setSelectedStageId(e.target.value || null)}
                                        className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    >
                                        {workflowStages.map(stage => (
                                            <option key={stage.id} value={stage.id}>{stage.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                                        Fecha de turno (si ya esta agendado)
                                    </label>
                                    <input
                                        type="date"
                                        value={appointmentDate}
                                        onChange={e => setAppointmentDate(e.target.value)}
                                        className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                        placeholder="Opcional"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                                        Recordatorios (Pendiente) hasta 3
                                    </label>
                                    <input
                                        value={waitingRemindersText}
                                        onChange={e => setWaitingRemindersText(e.target.value)}
                                        className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                        placeholder="30,14,3"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                                        Recordatorios (Turno Agendado) hasta 3
                                    </label>
                                    <input
                                        value={appointmentRemindersText}
                                        onChange={e => setAppointmentRemindersText(e.target.value)}
                                        className="w-full rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                        placeholder="7,2,1"
                                    />
                                </div>
                            </div>

                            <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">
                                Proximo control estimado: {previewNextMilestone.toLocaleDateString('es-AR')}.
                                {isBookingStage && !appointmentDate ? ' Esta en Turno Agendado: te conviene definir la fecha del turno.' : ''}
                            </p>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Buscar Paciente
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                            <input
                                type="text"
                                placeholder="Nombre, apellido o documento..."
                                className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                value={searchTerm}
                                onChange={(e) => {
                                    setSearchTerm(e.target.value);
                                    if (selectedPatient) setSelectedPatient(null);
                                }}
                            />
                            {searching && <Loader2 className="absolute right-3 top-2.5 animate-spin text-blue-500" size={16} />}
                        </div>

                        {/* Results Dropdown */}
                        {searchTerm.length > 1 && !selectedPatient && patients.length > 0 && (
                            <div className="mt-2 text-sm bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto z-10">
                                {patients.map(p => (
                                    <button
                                        key={p.id_paciente}
                                        onClick={() => {
                                            setSelectedPatient(p);
                                            setSearchTerm(`${p.apellido}, ${p.nombre}`);
                                            setPatients([]);
                                        }}
                                        className="w-full text-left px-4 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex flex-col"
                                    >
                                        <span className="font-medium text-gray-900 dark:text-white">{p.apellido}, {p.nombre}</span>
                                        <span className="text-xs text-gray-500">{p.documento || 'Sin documento'}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {searchTerm.length > 1 && !searching && patients.length === 0 && !selectedPatient && (
                            <div className="mt-2 text-sm text-gray-500 p-2 text-center">
                                No se encontraron pacientes.
                            </div>
                        )}
                    </div>

                    {selectedPatient && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg border border-blue-100 dark:border-blue-800 flex justify-between items-center">
                            <div>
                                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Paciente Seleccionado</p>
                                <p className="text-sm text-blue-700 dark:text-blue-300">{selectedPatient.apellido}, {selectedPatient.nombre}</p>
                            </div>
                            <button
                                onClick={() => {
                                    setSelectedPatient(null);
                                    setSearchTerm('');
                                }}
                                className="text-blue-500 hover:text-blue-700"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-2">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedPatient || isLoading || !selectedStageId}
                        className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    >
                        {isLoading && <Loader2 className="animate-spin" size={16} />}
                        Crear Tratamiento
                    </button>
                </div>
            </div>
        </div>
    );
}
