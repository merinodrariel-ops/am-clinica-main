'use client';

import React from 'react';
import { X, Calendar, User, Clock, AlertCircle, Trash2, Save, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { deleteTreatment, getTreatmentHistory, updateTreatmentFollowUpConfig } from '@/app/actions/clinical-workflows';
import { toast } from 'sonner';
import type { PatientTreatment, TreatmentHistoryEntry } from './types';

interface TreatmentDetailsModalProps {
    treatment: PatientTreatment;
    onClose: () => void;
}

export function TreatmentDetailsModal({ treatment, onClose }: TreatmentDetailsModalProps) {
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isSavingFollowUp, setIsSavingFollowUp] = React.useState(false);
    const [history, setHistory] = React.useState<TreatmentHistoryEntry[]>([]);
    const [historyLoading, setHistoryLoading] = React.useState(true);

    React.useEffect(() => {
        let isMounted = true;

        const loadHistory = async () => {
            setHistoryLoading(true);
            try {
                const rows = await getTreatmentHistory(treatment.id);
                if (isMounted) {
                    setHistory(rows);
                }
            } catch {
                if (isMounted) {
                    toast.error('No se pudo cargar el historial');
                }
            } finally {
                if (isMounted) {
                    setHistoryLoading(false);
                }
            }
        };

        loadHistory();
        return () => {
            isMounted = false;
        };
    }, [treatment.id]);

    const handleDelete = async () => {
        if (!confirm('¿Estás seguro de que quieres eliminar este tratamiento? Esta acción no se puede deshacer.')) return;

        setIsDeleting(true);
        try {
            await deleteTreatment(treatment.id);
            toast.success('Tratamiento eliminado');
            onClose();
        } catch {
            toast.error('Error al eliminar');
            setIsDeleting(false);
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'active': return 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400';
            case 'finished': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400';
            case 'archived': return 'text-gray-600 bg-gray-50 dark:bg-gray-800 dark:text-gray-400';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const createdAt = treatment.start_date || treatment.created_at;
    const recurrenceInterval = typeof treatment.metadata?.recurrence_interval_months === 'number'
        ? treatment.metadata.recurrence_interval_months
        : null;

    const initialTreatmentDate = (() => {
        const metadataValue = typeof treatment.metadata?.treatment_completed_at === 'string'
            ? treatment.metadata.treatment_completed_at
            : createdAt;
        if (!metadataValue) return new Date().toISOString().slice(0, 10);
        return new Date(metadataValue).toISOString().slice(0, 10);
    })();

    const initialAppointmentDate = (() => {
        const value = typeof treatment.metadata?.appointment_date === 'string'
            ? treatment.metadata.appointment_date
            : null;
        return value ? new Date(value).toISOString().slice(0, 10) : '';
    })();

    const initialWaitingReminders = Array.isArray(treatment.metadata?.waiting_reminder_days)
        ? treatment.metadata.waiting_reminder_days.join(',')
        : '30,14,3';

    const initialAppointmentReminders = Array.isArray(treatment.metadata?.appointment_reminder_days)
        ? treatment.metadata.appointment_reminder_days.join(',')
        : '7,2,1';

    const [followUpDate, setFollowUpDate] = React.useState(initialTreatmentDate);
    const [followUpMonths, setFollowUpMonths] = React.useState(String(recurrenceInterval || 6));
    const [appointmentDate, setAppointmentDate] = React.useState(initialAppointmentDate);
    const [waitingReminders, setWaitingReminders] = React.useState(initialWaitingReminders);
    const [appointmentReminders, setAppointmentReminders] = React.useState(initialAppointmentReminders);

    const isRecurrent = Boolean(recurrenceInterval || treatment.next_milestone_date);

    async function handleSaveFollowUp() {
        setIsSavingFollowUp(true);
        try {
            const parseList = (value: string, fallback: number[]) => {
                const parsed = value
                    .split(',')
                    .map(item => Number(item.trim()))
                    .filter(item => Number.isFinite(item) && item > 0)
                    .slice(0, 3);
                return parsed.length ? parsed : fallback;
            };

            const result = await updateTreatmentFollowUpConfig({
                treatmentId: treatment.id,
                treatmentDate: followUpDate,
                recurrenceMonths: Number(followUpMonths || 0),
                appointmentDate: appointmentDate || null,
                waitingReminderDays: parseList(waitingReminders, [30, 14, 3]),
                appointmentReminderDays: parseList(appointmentReminders, [7, 2, 1]),
            });

            if (!result.success) {
                throw new Error('No se pudo guardar configuracion recurrente');
            }

            toast.success('Configuracion recurrente actualizada');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo guardar configuracion');
        } finally {
            setIsSavingFollowUp(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 dark:border-gray-800">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start bg-gray-50/50 dark:bg-gray-800/50">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded">
                                {treatment.workflow?.name || 'Tratamiento'}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getStatusColor(treatment.status)}`}>
                                {treatment.status === 'active' ? 'Activo' : treatment.status}
                            </span>
                        </div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            {treatment.patient.nombre} {treatment.patient.apellido}
                        </h2>
                        <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                            <User size={14} />
                            {treatment.patient.documento || 'Sin documento'}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                            title="Eliminar tratamiento"
                        >
                            <Trash2 size={20} />
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto space-y-6">
                    {/* Stage Info */}
                    <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-200 mb-2">
                            Etapa Actual
                        </h3>
                        <p className="text-lg font-medium text-blue-900 dark:text-blue-100">
                            {treatment.stage?.name || 'Desconocida'}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-blue-700 dark:text-blue-300">
                            <span className="flex items-center gap-1">
                                <Clock size={16} />
                                En etapa desde: {format(new Date(treatment.last_stage_change), "d MMM yyyy", { locale: es })}
                            </span>
                        </div>
                    </div>

                    {/* Metadata / Details */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Detalles del Tratamiento</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                                <span className="text-xs text-gray-500 block mb-1">Inicio de Tratamiento</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <Calendar size={14} />
                                    {createdAt
                                        ? format(new Date(createdAt), "d MMMM yyyy", { locale: es })
                                        : 'No definido'}
                                </span>
                            </div>
                            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                                <span className="text-xs text-gray-500 block mb-1">Próximo Hito</span>
                                <span className="text-sm font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                    <AlertCircle size={14} />
                                    {treatment.next_milestone_date
                                        ? format(new Date(treatment.next_milestone_date), "d MMM yyyy", { locale: es })
                                        : 'No definido'}
                                </span>
                            </div>
                            {recurrenceInterval ? (
                                <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-800">
                                    <span className="text-xs text-gray-500 block mb-1">Frecuencia recurrente</span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        Cada {recurrenceInterval} meses
                                    </span>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {isRecurrent ? (
                        <div className="rounded-xl border border-violet-100 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-900/10 p-4 space-y-3">
                            <h3 className="text-sm font-semibold text-violet-900 dark:text-violet-200">Control recurrente y recordatorios</h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-violet-700 dark:text-violet-300 block mb-1">Fecha del ultimo tratamiento</label>
                                    <input
                                        type="date"
                                        value={followUpDate}
                                        onChange={event => setFollowUpDate(event.target.value)}
                                        className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-violet-700 dark:text-violet-300 block mb-1">Frecuencia (meses)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={24}
                                        value={followUpMonths}
                                        onChange={event => setFollowUpMonths(event.target.value)}
                                        className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-violet-700 dark:text-violet-300 block mb-1">Fecha de turno (si aplica)</label>
                                    <input
                                        type="date"
                                        value={appointmentDate}
                                        onChange={event => setAppointmentDate(event.target.value)}
                                        className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-violet-700 dark:text-violet-300 block mb-1">Avisos en Pendiente (max 3)</label>
                                    <input
                                        value={waitingReminders}
                                        onChange={event => setWaitingReminders(event.target.value)}
                                        placeholder="30,14,3"
                                        className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="text-xs text-violet-700 dark:text-violet-300 block mb-1">Avisos en Turno Agendado (max 3)</label>
                                    <input
                                        value={appointmentReminders}
                                        onChange={event => setAppointmentReminders(event.target.value)}
                                        placeholder="7,2,1"
                                        className="w-full rounded-lg border border-violet-200 dark:border-violet-800 bg-white dark:bg-gray-900 px-3 py-2 text-sm"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end">
                                <button
                                    onClick={() => void handleSaveFollowUp()}
                                    disabled={isSavingFollowUp}
                                    className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium inline-flex items-center gap-1.5 disabled:opacity-60"
                                >
                                    {isSavingFollowUp ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                    Guardar seguimiento
                                </button>
                            </div>
                        </div>
                    ) : null}

                    {/* History Placeholder (To be implemented fully) */}
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Historial Reciente</h3>
                        {historyLoading ? (
                            <p className="text-sm text-gray-500">Cargando historial...</p>
                        ) : (
                            <div className="relative pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
                                {history.map(entry => (
                                    <div key={entry.id} className="relative">
                                        <span className="absolute -left-[21px] top-1 w-3 h-3 bg-blue-500 rounded-full border-2 border-white dark:border-gray-900"></span>
                                        <p className="text-sm text-gray-900 dark:text-white">
                                            {entry.new_stage?.name
                                                ? `Cambio a ${entry.new_stage.name}`
                                                : 'Cambio de etapa'}
                                        </p>
                                        {entry.previous_stage?.name && (
                                            <p className="text-xs text-gray-500">Desde: {entry.previous_stage.name}</p>
                                        )}
                                        {entry.comments && (
                                            <p className="text-xs text-gray-600 dark:text-gray-300">{entry.comments}</p>
                                        )}
                                        <p className="text-xs text-gray-500">
                                            {format(new Date(entry.created_at), "d MMM yyyy HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                ))}

                                {createdAt && (
                                    <div className="relative opacity-70">
                                        <span className="absolute -left-[21px] top-1 w-3 h-3 bg-gray-300 dark:bg-gray-600 rounded-full border-2 border-white dark:border-gray-900"></span>
                                        <p className="text-sm text-gray-900 dark:text-white">Tratamiento creado</p>
                                        <p className="text-xs text-gray-500">
                                            {format(new Date(createdAt), "d MMM yyyy HH:mm", { locale: es })}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
