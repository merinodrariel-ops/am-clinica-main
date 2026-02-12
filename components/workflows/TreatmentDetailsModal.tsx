'use client';

import React from 'react';
import { X, Calendar, User, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { deleteTreatment, getTreatmentHistory } from '@/app/actions/clinical-workflows';
import { toast } from 'sonner';
import type { PatientTreatment, TreatmentHistoryEntry } from './types';

interface TreatmentDetailsModalProps {
    treatment: PatientTreatment;
    onClose: () => void;
}

export function TreatmentDetailsModal({ treatment, onClose }: TreatmentDetailsModalProps) {
    const [isDeleting, setIsDeleting] = React.useState(false);
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
