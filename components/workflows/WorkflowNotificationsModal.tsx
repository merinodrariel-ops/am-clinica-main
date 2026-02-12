'use client';

import React from 'react';
import { BellRing, Loader2, RefreshCcw, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { getWorkflowNotificationLog, runWorkflowSlaReminders } from '@/app/actions/clinical-workflows';
import type { WorkflowNotificationLogEntry } from './types';

interface WorkflowNotificationsModalProps {
    workflowId: string;
    workflowName: string;
}

function formatEventType(eventType: string) {
    if (eventType === 'stage_entry') return 'Ingreso a etapa';
    if (eventType === 'sla_due_soon') return 'SLA por vencer';
    return eventType;
}

export function WorkflowNotificationsModal({ workflowId, workflowName }: WorkflowNotificationsModalProps) {
    const [isOpen, setIsOpen] = React.useState(false);
    const [loading, setLoading] = React.useState(false);
    const [running, setRunning] = React.useState(false);
    const [entries, setEntries] = React.useState<WorkflowNotificationLogEntry[]>([]);

    const loadLog = React.useCallback(async () => {
        setLoading(true);
        try {
            const rows = await getWorkflowNotificationLog(workflowId);
            setEntries(rows);
        } catch {
            toast.error('No se pudo cargar el historial de notificaciones');
        } finally {
            setLoading(false);
        }
    }, [workflowId]);

    React.useEffect(() => {
        if (isOpen) {
            loadLog();
        }
    }, [isOpen, loadLog]);

    const handleRunSla = async () => {
        setRunning(true);
        try {
            const result = await runWorkflowSlaReminders();
            toast.success(`Recordatorios SLA ejecutados: ${result.sent} enviados`);
            await loadLog();
        } catch {
            toast.error('No se pudieron ejecutar recordatorios SLA');
        } finally {
            setRunning(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
                <BellRing size={16} />
                Notificaciones
            </button>

            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col">
                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/50">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">Notificaciones de {workflowName}</h3>
                                <p className="text-xs text-gray-500">Historial y ejecucion manual de recordatorios SLA</p>
                            </div>
                            <button
                                onClick={() => setIsOpen(false)}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-2">
                            <button
                                onClick={handleRunSla}
                                disabled={running}
                                className="px-3 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                            >
                                {running ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
                                Ejecutar SLA ahora
                            </button>

                            <button
                                onClick={loadLog}
                                disabled={loading}
                                className="px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg border border-gray-200 disabled:opacity-50 flex items-center gap-2"
                            >
                                {loading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCcw size={14} />}
                                Refrescar
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto">
                            {loading ? (
                                <p className="text-sm text-gray-500">Cargando historial...</p>
                            ) : entries.length === 0 ? (
                                <p className="text-sm text-gray-500">Sin eventos de notificacion aun.</p>
                            ) : (
                                <div className="space-y-2">
                                    {entries.map(entry => (
                                        <div
                                            key={entry.id}
                                            className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm bg-white dark:bg-gray-800/40"
                                        >
                                            <div className="flex items-center justify-between gap-2">
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {formatEventType(entry.event_type)}
                                                    {entry.stage?.name ? ` · ${entry.stage.name}` : ''}
                                                </div>
                                                <span className="text-xs text-gray-500">
                                                    {new Date(entry.created_at).toLocaleString('es-AR')}
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                                Para: {entry.recipient_email || 'N/A'}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1">Asunto: {entry.subject || '-'}</div>
                                            <div className="text-xs mt-1">
                                                Estado:{' '}
                                                <span className={entry.status === 'sent' ? 'text-green-600' : 'text-red-600'}>
                                                    {entry.status}
                                                </span>
                                            </div>
                                            {entry.error_message ? (
                                                <div className="text-xs text-red-600 mt-1">Error: {entry.error_message}</div>
                                            ) : null}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
