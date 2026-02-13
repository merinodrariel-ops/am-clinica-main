'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell, Clock, CheckCircle2, PauseCircle, XCircle, Plus,
    ChevronDown, ChevronUp, History, AlertTriangle, Timer,
    RefreshCw, MessageCircle
} from 'lucide-react';
import {
    getPatientRecalls,
    createRecallRule,
    markRecallCompleted,
} from '@/app/actions/recalls';
import {
    RECALL_TYPE_LABELS,
    RECALL_TYPE_COLORS,
    RECALL_STATE_LABELS,
    RECALL_TYPE_INTERVALS,
    type RecallRule,
    type RecallType,
    type RecallState,
    type RecallActivityLogEntry,
} from '@/lib/recall-constants';

// ─── Add Recall Inline Form ──────────────────────────────────

function AddRecallForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
    const [recallType, setRecallType] = useState<RecallType>('limpieza');
    const [lastCompleted, setLastCompleted] = useState('');
    const [isPending, startTransition] = useTransition();

    const handleSubmit = () => {
        startTransition(async () => {
            await createRecallRule({
                patient_id: patientId,
                recall_type: recallType,
                interval_months: RECALL_TYPE_INTERVALS[recallType],
                last_completed_at: lastCompleted || undefined,
            });
            onDone();
        });
    };

    return (
        <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/40"
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Tipo</label>
                    <select
                        value={recallType}
                        onChange={e => setRecallType(e.target.value as RecallType)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {Object.entries(RECALL_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">
                        Última vez realizado
                    </label>
                    <input
                        type="date"
                        value={lastCompleted}
                        onChange={e => setLastCompleted(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
                <div className="flex items-end">
                    <button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="w-full px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white
              hover:bg-blue-700 transition disabled:opacity-50"
                    >
                        {isPending ? 'Creando...' : 'Agregar'}
                    </button>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Activity Log ────────────────────────────────────────────

function ActivityLog({ logs }: { logs: RecallActivityLogEntry[] }) {
    const [expanded, setExpanded] = useState(false);

    if (logs.length === 0) return null;

    const visible = expanded ? logs : logs.slice(0, 5);

    const actionIcons: Record<string, typeof CheckCircle2> = {
        created: Plus,
        contacted: MessageCircle,
        scheduled: Clock,
        completed: CheckCircle2,
        snoozed: PauseCircle,
        deactivated: XCircle,
    };

    const actionColors: Record<string, string> = {
        created: 'text-blue-500',
        contacted: 'text-cyan-500',
        scheduled: 'text-emerald-500',
        completed: 'text-green-500',
        snoozed: 'text-purple-500',
        deactivated: 'text-red-500',
    };

    return (
        <div className="mt-4">
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400
          uppercase tracking-wider mb-2 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
                <History className="w-3.5 h-3.5" />
                Historial ({logs.length})
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <div className="space-y-1.5">
                {visible.map((log, i) => {
                    const Icon = actionIcons[log.action] || Bell;
                    const color = actionColors[log.action] || 'text-gray-400';
                    return (
                        <motion.div
                            key={log.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.03 }}
                            className="flex items-start gap-2 text-xs"
                        >
                            <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${color}`} />
                            <div className="flex-1 min-w-0">
                                <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                                    {log.action === 'created' ? 'Creado' :
                                        log.action === 'contacted' ? 'Contactado' :
                                            log.action === 'scheduled' ? 'Agendado' :
                                                log.action === 'completed' ? 'Realizado' :
                                                    log.action === 'snoozed' ? 'Pospuesto' :
                                                        log.action === 'deactivated' ? 'Desactivado' : log.action}
                                </span>
                                {log.performed_by && (
                                    <span className="text-gray-400 dark:text-gray-500 ml-1">
                                        por {log.performed_by.split('@')[0]}
                                    </span>
                                )}
                            </div>
                            <span className="text-gray-400 dark:text-gray-500 flex-shrink-0">
                                {new Date(log.performed_at).toLocaleDateString('es-AR', {
                                    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                            </span>
                        </motion.div>
                    );
                })}
            </div>
            {logs.length > 5 && !expanded && (
                <button
                    onClick={() => setExpanded(true)}
                    className="text-xs text-blue-500 hover:text-blue-600 mt-1.5 font-medium"
                >
                    Ver más...
                </button>
            )}
        </div>
    );
}

// ─── Main Patient Cadence Component ──────────────────────────

export default function PatientCadence({ patientId }: { patientId: string }) {
    const [rules, setRules] = useState<RecallRule[]>([]);
    const [logs, setLogs] = useState<RecallActivityLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [isPending, startTransition] = useTransition();

    const loadData = useCallback((background = false) => {
        startTransition(async () => {
            if (!background) setLoading(true);
            const data = await getPatientRecalls(patientId);
            setRules(data.rules);
            setLogs(data.logs);
            setLoading(false);
        });
    }, [patientId]);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-8">
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                <span className="ml-2 text-xs text-gray-500">Cargando recalls...</span>
            </div>
        );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Bell className="w-4 h-4 text-blue-500" />
                    Cadencia de Recalls
                </h3>
                <button
                    onClick={() => setShowAdd(!showAdd)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg
            bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400
            transition-colors"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Agregar
                </button>
            </div>

            {/* Add Form */}
            <AnimatePresence>
                {showAdd && (
                    <AddRecallForm
                        patientId={patientId}
                        onDone={() => { setShowAdd(false); loadData(true); }}
                    />
                )}
            </AnimatePresence>

            {/* Rules */}
            {rules.length === 0 && !showAdd ? (
                <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
                    <Bell className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                        No hay recalls activos para este paciente
                    </p>
                    <button
                        onClick={() => setShowAdd(true)}
                        className="mt-2 text-xs text-blue-500 hover:text-blue-600 font-medium"
                    >
                        Crear primer recall →
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {rules.map((rule, i) => {
                        const typeColor = RECALL_TYPE_COLORS[rule.recall_type];
                        const typeLabel = rule.recall_type === 'otro' && rule.custom_label
                            ? rule.custom_label
                            : RECALL_TYPE_LABELS[rule.recall_type];

                        const dueDate = rule.next_due_date ? new Date(rule.next_due_date + 'T00:00:00') : null;
                        const diffDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;
                        const isPastDue = diffDays !== null && diffDays < 0;

                        // Progress for visual bar: 0 = just completed, 1 = due
                        let progress = 0;
                        if (rule.last_completed_at && rule.next_due_date) {
                            const start = new Date(rule.last_completed_at).getTime();
                            const end = new Date(rule.next_due_date + 'T00:00:00').getTime();
                            const now = today.getTime();
                            const total = end - start;
                            if (total > 0) {
                                progress = Math.min(Math.max((now - start) / total, 0), 1.3);
                            }
                        }

                        const progressColor = isPastDue ? '#ef4444' : progress > 0.8 ? '#f59e0b' : typeColor;

                        return (
                            <motion.div
                                key={rule.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`bg-white dark:bg-gray-800 rounded-xl border p-4
                  ${isPastDue ? 'border-red-200 dark:border-red-800/50' : 'border-gray-100 dark:border-gray-700'}
                  ${!rule.is_active ? 'opacity-50' : ''}`}
                            >
                                {/* Type Label + State */}
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase text-white tracking-wider"
                                            style={{ backgroundColor: typeColor }}
                                        >
                                            {typeLabel}
                                        </span>
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium
                      ${rule.state === 'pending_contact' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                                rule.state === 'contacted' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                                                    rule.state === 'scheduled' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                                                        rule.state === 'snoozed' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                            rule.state === 'completed' ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                                                                'bg-gray-50 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}
                                        >
                                            {RECALL_STATE_LABELS[rule.state]}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-gray-400">
                                        cada {rule.interval_months} meses
                                    </span>
                                </div>

                                {/* Progress Bar */}
                                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${Math.min(progress * 100, 100)}%` }}
                                        transition={{ duration: 0.8, ease: 'easeOut' }}
                                        className="h-full rounded-full"
                                        style={{ backgroundColor: progressColor }}
                                    />
                                </div>

                                {/* Dates */}
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400 dark:text-gray-500">
                                        {rule.last_completed_at
                                            ? `Último: ${new Date(rule.last_completed_at).toLocaleDateString('es-AR')}`
                                            : 'Sin registro previo'}
                                    </span>
                                    {rule.next_due_date && (
                                        <span className={`font-medium flex items-center gap-1
                      ${isPastDue ? 'text-red-600 dark:text-red-400' :
                                                (diffDays !== null && diffDays <= 7) ? 'text-amber-600 dark:text-amber-400' :
                                                    'text-gray-600 dark:text-gray-400'}`}>
                                            {isPastDue && <AlertTriangle className="w-3 h-3" />}
                                            <Timer className="w-3 h-3" />
                                            {diffDays === 0 ? 'Hoy' :
                                                isPastDue ? `Hace ${Math.abs(diffDays!)} días` :
                                                    `En ${diffDays} días`}
                                        </span>
                                    )}
                                </div>

                                {rule.notes && (
                                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 italic">
                                        {rule.notes}
                                    </p>
                                )}

                                {rule.state !== 'completed' && rule.is_active && (
                                    <div className="flex justify-end mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                        <button
                                            onClick={() => {
                                                startTransition(async () => {
                                                    await markRecallCompleted(rule.id);
                                                    loadData(true);
                                                });
                                            }}
                                            disabled={isPending}
                                            className="text-xs font-medium text-green-600 hover:text-green-700 disabled:opacity-50 flex items-center gap-1"
                                        >
                                            <CheckCircle2 className="w-3.5 h-3.5" />
                                            Completar
                                        </button>
                                    </div>
                                )
                                }
                            </motion.div>
                        );
                    })}
                </div>
            )
            }

            {/* Activity Log */}
            <ActivityLog logs={logs} />
        </div >
    );
}
