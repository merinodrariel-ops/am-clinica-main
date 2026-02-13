'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell, Clock, CalendarDays, Phone, MessageCircle,
    CheckCircle2, PauseCircle, XCircle, Search, Filter,
    TrendingUp, AlertTriangle, ChevronDown, Plus, User,
    ArrowRight, RefreshCw, Calendar, Timer, Zap
} from 'lucide-react';
import {
    getRecallWorklist,
    getRecallStats,
    markRecallContacted,
    markRecallScheduled,
    markRecallCompleted,
    snoozeRecall,
    deactivateRecall,
} from '@/app/actions/recalls';
import {
    RECALL_TYPE_LABELS,
    RECALL_STATE_LABELS,
    RECALL_TYPE_COLORS,
    type RecallRule,
    type RecallType,
    type RecallState,
    type WorklistFilter,
} from '@/lib/recall-constants';

// ─── Stats Bar ────────────────────────────────────────────────

function StatsBar({ stats }: {
    stats: {
        totalActive: number; pendingContact: number; contacted: number;
        scheduled: number; snoozed: number; pastDue: number; dueThisWeek: number;
        byType: Record<string, number>;
    } | null
}) {
    if (!stats) return null;

    const cards = [
        { label: 'Vencidos', value: stats.pastDue, icon: AlertTriangle, color: 'from-red-500 to-rose-600', textColor: 'text-red-100' },
        { label: 'Esta semana', value: stats.dueThisWeek, icon: Clock, color: 'from-amber-500 to-orange-600', textColor: 'text-amber-100' },
        { label: 'Pendientes', value: stats.pendingContact, icon: Bell, color: 'from-blue-500 to-indigo-600', textColor: 'text-blue-100' },
        { label: 'Contactados', value: stats.contacted, icon: Phone, color: 'from-cyan-500 to-teal-600', textColor: 'text-cyan-100' },
        { label: 'Agendados', value: stats.scheduled, icon: CalendarDays, color: 'from-emerald-500 to-green-600', textColor: 'text-emerald-100' },
        { label: 'Pospuestos', value: stats.snoozed, icon: PauseCircle, color: 'from-purple-500 to-violet-600', textColor: 'text-purple-100' },
    ];

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((card, i) => (
                <motion.div
                    key={card.label}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${card.color} p-4 shadow-lg`}
                >
                    <div className="flex items-center justify-between">
                        <div>
                            <p className={`text-xs font-medium ${card.textColor} opacity-80`}>{card.label}</p>
                            <p className="text-2xl font-bold text-white mt-1">{card.value}</p>
                        </div>
                        <card.icon className="w-8 h-8 text-white/30" />
                    </div>
                    <div className="absolute -bottom-2 -right-2 w-16 h-16 rounded-full bg-white/10" />
                </motion.div>
            ))}
        </div>
    );
}

// ─── Snooze Dropdown ────────────────────────────────────────

function SnoozeDropdown({ onSnooze }: { onSnooze: (days: number) => void }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
          bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300
          transition-colors"
                title="Posponer"
            >
                <PauseCircle className="w-3.5 h-3.5" />
                <ChevronDown className="w-3 h-3" />
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl
              border border-gray-200 dark:border-gray-700 py-1 min-w-[140px]"
                    >
                        {[7, 14, 30, 60].map(d => (
                            <button
                                key={d}
                                onClick={() => { onSnooze(d); setOpen(false); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700
                  transition-colors text-gray-700 dark:text-gray-300"
                            >
                                {d} días
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Complete Modal ──────────────────────────────────────────

function CompleteModal({ open, onClose, onConfirm }: {
    open: boolean; onClose: () => void; onConfirm: (date: string) => void;
}) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4"
            >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Marcar como Realizado
                </h3>
                <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                    Fecha de realización
                </label>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
            bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm mb-4"
                />
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => { onConfirm(date); onClose(); }}
                        className="flex-1 px-4 py-2 text-sm rounded-lg bg-emerald-600 text-white
              hover:bg-emerald-700 transition-colors font-medium"
                    >
                        Confirmar
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

// ─── Recall Card ─────────────────────────────────────────────

function RecallCard({ rule, onAction }: {
    rule: RecallRule;
    onAction: () => void;
}) {
    const [isPending, startTransition] = useTransition();
    const [showComplete, setShowComplete] = useState(false);

    const patient = rule.patient;
    const typeColor = RECALL_TYPE_COLORS[rule.recall_type];
    const typeLabel = rule.recall_type === 'otro' && rule.custom_label
        ? rule.custom_label
        : RECALL_TYPE_LABELS[rule.recall_type];

    // Calculate countdown
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = rule.next_due_date ? new Date(rule.next_due_date + 'T00:00:00') : null;
    const diffDays = dueDate ? Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : null;

    const isPastDue = diffDays !== null && diffDays < 0;
    const isUrgent = diffDays !== null && diffDays <= 3;

    const countdownText = diffDays === null
        ? 'Sin fecha'
        : diffDays === 0 ? 'Hoy'
            : diffDays > 0 ? `En ${diffDays} días`
                : `Vencido hace ${Math.abs(diffDays)} días`;

    const countdownColor = isPastDue
        ? 'text-red-600 dark:text-red-400'
        : isUrgent
            ? 'text-amber-600 dark:text-amber-400'
            : 'text-gray-600 dark:text-gray-400';

    // WhatsApp deeplink
    const waLink = patient?.whatsapp_numero
        ? `https://wa.me/${(patient.whatsapp_pais_code || '+54').replace('+', '')}${patient.whatsapp_numero}`
        : patient?.telefono
            ? `https://wa.me/54${patient.telefono.replace(/\D/g, '')}`
            : null;

    const handleAction = (fn: () => Promise<{ success: boolean; error?: string }>) => {
        startTransition(async () => {
            await fn();
            onAction();
        });
    };

    return (
        <>
            <motion.div
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`group relative bg-white dark:bg-gray-800 rounded-2xl border
          ${isPastDue ? 'border-red-200 dark:border-red-800/50 shadow-red-100 dark:shadow-none' : 'border-gray-100 dark:border-gray-700'}
          shadow-sm hover:shadow-lg transition-all duration-200 p-4`}
            >
                {/* Priority indicator */}
                {rule.priority > 0 && (
                    <div className="absolute -top-1.5 -right-1.5">
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white
              ${rule.priority >= 2 ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`}>
                            !
                        </span>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {/* Patient info */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                            {/* Type chip */}
                            <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider text-white"
                                style={{ backgroundColor: typeColor }}
                            >
                                {typeLabel}
                            </span>
                            {/* State badge */}
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium
                ${rule.state === 'pending_contact' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                    rule.state === 'contacted' ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                                        rule.state === 'scheduled' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                                            rule.state === 'snoozed' ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' :
                                                'bg-gray-50 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}
                            >
                                {RECALL_STATE_LABELS[rule.state]}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                {patient ? `${patient.nombre} ${patient.apellido}` : 'Paciente desconocido'}
                            </h4>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <span className={`flex items-center gap-1 text-xs font-medium ${countdownColor}`}>
                                <Timer className="w-3 h-3" />
                                {countdownText}
                            </span>
                            {rule.last_completed_at && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    Último: {new Date(rule.last_completed_at).toLocaleDateString('es-AR')}
                                </span>
                            )}
                            {rule.next_due_date && (
                                <span className="text-xs text-gray-400 dark:text-gray-500">
                                    Vence: {new Date(rule.next_due_date + 'T00:00:00').toLocaleDateString('es-AR')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isPending && (
                            <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                        )}

                        {/* WhatsApp */}
                        {waLink && (
                            <a
                                href={waLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
                  bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-300
                  transition-colors"
                                title="WhatsApp"
                            >
                                <MessageCircle className="w-3.5 h-3.5" />
                            </a>
                        )}

                        {/* Call */}
                        {patient?.telefono && (
                            <a
                                href={`tel:${patient.telefono}`}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
                  bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300
                  transition-colors"
                                title="Llamar"
                            >
                                <Phone className="w-3.5 h-3.5" />
                            </a>
                        )}

                        {/* Mark Contacted */}
                        {rule.state === 'pending_contact' && (
                            <button
                                onClick={() => handleAction(() => markRecallContacted(rule.id))}
                                disabled={isPending}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
                  bg-cyan-50 text-cyan-700 hover:bg-cyan-100 dark:bg-cyan-900/30 dark:text-cyan-300
                  transition-colors disabled:opacity-50"
                                title="Marcar contactado"
                            >
                                <ArrowRight className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Contactado</span>
                            </button>
                        )}

                        {/* Schedule */}
                        {(rule.state === 'pending_contact' || rule.state === 'contacted') && (
                            <button
                                onClick={() => handleAction(() => markRecallScheduled(rule.id))}
                                disabled={isPending}
                                className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
                  bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300
                  transition-colors disabled:opacity-50"
                                title="Agendar"
                            >
                                <CalendarDays className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">Agendar</span>
                            </button>
                        )}

                        {/* Complete */}
                        <button
                            onClick={() => setShowComplete(true)}
                            disabled={isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
                bg-emerald-600 text-white hover:bg-emerald-700
                transition-colors disabled:opacity-50"
                            title="Marcar realizado"
                        >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                        </button>

                        {/* Snooze */}
                        <SnoozeDropdown
                            onSnooze={(days) => handleAction(() => snoozeRecall(rule.id, days))}
                        />

                        {/* Deactivate */}
                        <button
                            onClick={() => handleAction(() => deactivateRecall(rule.id))}
                            disabled={isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg
                bg-gray-50 text-gray-500 hover:bg-red-50 hover:text-red-600
                dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/30 dark:hover:text-red-400
                transition-colors disabled:opacity-50"
                            title="No aplica"
                        >
                            <XCircle className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </motion.div>

            <CompleteModal
                open={showComplete}
                onClose={() => setShowComplete(false)}
                onConfirm={(date) => handleAction(() => markRecallCompleted(rule.id, date))}
            />
        </>
    );
}

// ─── Create Recall Modal ──────────────────────────────────────

function CreateRecallModal({ open, onClose, onCreate }: {
    open: boolean;
    onClose: () => void;
    onCreate: (data: {
        patient_id: string;
        recall_type: RecallType;
        custom_label?: string;
        interval_months?: number;
        last_completed_at?: string;
        notes?: string;
    }) => void;
}) {
    const [patientSearch, setPatientSearch] = useState('');
    const [patients, setPatients] = useState<Array<{ id_paciente: string; nombre: string; apellido: string }>>([]);
    const [selectedPatient, setSelectedPatient] = useState<{ id_paciente: string; nombre: string; apellido: string } | null>(null);
    const [recallType, setRecallType] = useState<RecallType>('limpieza');
    const [customLabel, setCustomLabel] = useState('');
    const [intervalMonths, setIntervalMonths] = useState(6);
    const [lastCompleted, setLastCompleted] = useState('');
    const [notes, setNotes] = useState('');
    const [searching, setSearching] = useState(false);

    // Import search action
    const searchPatients = useCallback(async (query: string) => {
        if (query.length < 2) { setPatients([]); return; }
        setSearching(true);
        try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );
            const { data } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, apellido')
                .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
                .eq('is_deleted', false)
                .limit(8);
            setPatients(data || []);
        } catch { setPatients([]); }
        setSearching(false);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => searchPatients(patientSearch), 300);
        return () => clearTimeout(t);
    }, [patientSearch, searchPatients]);

    // Update interval when type changes
    useEffect(() => {
        const intervals: Record<RecallType, number> = {
            limpieza: 6, botox: 4, control_carillas: 12,
            blanqueamiento: 6, control_ortodoncia: 6, mantenimiento_implantes: 12, otro: 6,
        };
        setIntervalMonths(intervals[recallType]);
    }, [recallType]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto"
            >
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5 text-blue-500" />
                    Nuevo Recall
                </h3>

                {/* Patient Search */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Paciente
                    </label>
                    {selectedPatient ? (
                        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                {selectedPatient.nombre} {selectedPatient.apellido}
                            </span>
                            <button onClick={() => setSelectedPatient(null)} className="text-blue-500 text-xs hover:underline">
                                Cambiar
                            </button>
                        </div>
                    ) : (
                        <div className="relative">
                            <input
                                type="text"
                                value={patientSearch}
                                onChange={e => setPatientSearch(e.target.value)}
                                placeholder="Buscar paciente..."
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                  bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                            />
                            {searching && <RefreshCw className="absolute right-3 top-2.5 w-4 h-4 animate-spin text-gray-400" />}
                            {patients.length > 0 && (
                                <div className="absolute z-10 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700
                  rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
                                    {patients.map(p => (
                                        <button
                                            key={p.id_paciente}
                                            onClick={() => { setSelectedPatient(p); setPatientSearch(''); setPatients([]); }}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700
                        text-gray-700 dark:text-gray-300 transition-colors"
                                        >
                                            {p.nombre} {p.apellido}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Type */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Tipo de Recall
                    </label>
                    <select
                        value={recallType}
                        onChange={e => setRecallType(e.target.value as RecallType)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                    >
                        {Object.entries(RECALL_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>

                {recallType === 'otro' && (
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Etiqueta personalizada
                        </label>
                        <input
                            type="text"
                            value={customLabel}
                            onChange={e => setCustomLabel(e.target.value)}
                            placeholder="Ej: Control post-cirugía"
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                        />
                    </div>
                )}

                {/* Interval */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Intervalo (meses)
                    </label>
                    <input
                        type="number"
                        value={intervalMonths}
                        onChange={e => setIntervalMonths(Number(e.target.value))}
                        min={1}
                        max={24}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                    />
                </div>

                {/* Last Completed */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Última vez realizado (opcional)
                    </label>
                    <input
                        type="date"
                        value={lastCompleted}
                        onChange={e => setLastCompleted(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white"
                    />
                </div>

                {/* Notes */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Notas
                    </label>
                    <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-white resize-none"
                    />
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-300 dark:border-gray-600
              text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => {
                            if (!selectedPatient) return;
                            onCreate({
                                patient_id: selectedPatient.id_paciente,
                                recall_type: recallType,
                                custom_label: recallType === 'otro' ? customLabel : undefined,
                                interval_months: intervalMonths,
                                last_completed_at: lastCompleted || undefined,
                                notes: notes || undefined,
                            });
                            onClose();
                        }}
                        disabled={!selectedPatient}
                        className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-blue-600 text-white
              hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Crear Recall
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

// ─── Main Worklist Component ─────────────────────────────────

export default function RecallWorklist() {
    const [rules, setRules] = useState<RecallRule[]>([]);
    const [stats, setStats] = useState<{
        totalActive: number; pendingContact: number; contacted: number;
        scheduled: number; snoozed: number; pastDue: number; dueThisWeek: number;
        byType: Record<string, number>;
    } | null>(null);
    const [activeTab, setActiveTab] = useState<WorklistFilter>('all');
    const [typeFilter, setTypeFilter] = useState<RecallType | ''>('');
    const [stateFilter, setStateFilter] = useState<RecallState | ''>('');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [isPending, startTransition] = useTransition();

    const loadData = useCallback(() => {
        startTransition(async () => {
            setLoading(true);
            const [worklistData, statsData] = await Promise.all([
                getRecallWorklist(activeTab, {
                    recall_type: typeFilter as RecallType || undefined,
                    state: stateFilter as RecallState || undefined,
                    search: search || undefined,
                }),
                getRecallStats(),
            ]);
            setRules(worklistData);
            setStats(statsData);
            setLoading(false);
        });
    }, [activeTab, typeFilter, stateFilter, search]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleCreate = async (data: {
        patient_id: string;
        recall_type: RecallType;
        custom_label?: string;
        interval_months?: number;
        last_completed_at?: string;
        notes?: string;
    }) => {
        const { createRecallRule } = await import('@/app/actions/recalls');
        await createRecallRule(data);
        loadData();
    };

    const tabs: { key: WorklistFilter; label: string; icon: typeof Zap }[] = [
        { key: 'past_due', label: 'Vencidos', icon: AlertTriangle },
        { key: 'today', label: 'Hoy', icon: Zap },
        { key: 'next7', label: '7 días', icon: Clock },
        { key: 'next30', label: '30 días', icon: Calendar },
        { key: 'all', label: 'Todos', icon: TrendingUp },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Bell className="w-7 h-7 text-blue-500" />
                        Recall Engine
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Gestión de recordatorios recurrentes para pacientes
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl
            hover:bg-blue-700 transition-colors text-sm font-medium shadow-lg shadow-blue-500/25"
                >
                    <Plus className="w-4 h-4" />
                    Nuevo Recall
                </button>
            </div>

            {/* Stats */}
            <StatsBar stats={stats} />

            {/* Tabs */}
            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5 overflow-x-auto">
                {tabs.map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-xl transition-all whitespace-nowrap
              ${activeTab === tab.key
                                ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                        {tab.key === 'past_due' && stats?.pastDue ? (
                            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                                {stats.pastDue}
                            </span>
                        ) : null}
                    </button>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar paciente..."
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500/30
              focus:border-blue-500 transition-all"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <select
                        value={typeFilter}
                        onChange={e => setTypeFilter(e.target.value as RecallType | '')}
                        className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                        <option value="">Todos los tipos</option>
                        {Object.entries(RECALL_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                    <select
                        value={stateFilter}
                        onChange={e => setStateFilter(e.target.value as RecallState | '')}
                        className="px-3 py-2 text-xs rounded-xl border border-gray-200 dark:border-gray-700
              bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
                    >
                        <option value="">Todos los estados</option>
                        {Object.entries(RECALL_STATE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="space-y-2">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                        <span className="ml-2 text-sm text-gray-500">Cargando...</span>
                    </div>
                ) : rules.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-20"
                    >
                        <Bell className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm">
                            No hay recalls en esta vista.
                        </p>
                        <button
                            onClick={() => setShowCreate(true)}
                            className="mt-3 text-sm text-blue-500 hover:text-blue-600 font-medium"
                        >
                            Crear primer recall →
                        </button>
                    </motion.div>
                ) : (
                    <AnimatePresence>
                        {rules.map(rule => (
                            <RecallCard key={rule.id} rule={rule} onAction={loadData} />
                        ))}
                    </AnimatePresence>
                )}
            </div>

            {/* Total count */}
            {!loading && rules.length > 0 && (
                <p className="text-center text-xs text-gray-400 dark:text-gray-500 pb-4">
                    {rules.length} recall{rules.length !== 1 ? 's' : ''} encontrados
                </p>
            )}

            {/* Create Modal */}
            <CreateRecallModal
                open={showCreate}
                onClose={() => setShowCreate(false)}
                onCreate={handleCreate}
            />
        </div>
    );
}
