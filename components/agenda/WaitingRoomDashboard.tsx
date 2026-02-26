'use client';

/**
 * WaitingRoomDashboard — PRO Feature
 * "Sala de Espera Virtual"
 *
 * Shows all patients present in the clinic today with:
 * - Real-time waiting time (since check-in)
 * - Current status with one-click progression
 * - Doctor assignment column
 * - Auto-refresh every 30 seconds
 */

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
    Clock, User, Stethoscope, CheckCircle2, Play,
    XCircle, UserX, RefreshCw, ArrowRight, AlertTriangle
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface WaitingPatient {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
    type: string;
    checked_in_at: string | null;
    waiting_minutes: number | null;
    patient_name: string;
    patient_phone: string | null;
    doctor_name: string | null;
    doctor_id: string | null;
    patient_id: string | null;
}

// ─── Status Config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, {
    label: string; color: string; bg: string; icon: React.ReactNode; next?: string; nextLabel?: string
}> = {
    confirmed: {
        label: 'Confirmado',
        color: 'text-blue-700',
        bg:    'bg-blue-50 border-blue-200',
        icon:  <CheckCircle2 size={14} />,
        next:  'arrived',
        nextLabel: 'Registrar llegada'
    },
    pending: {
        label: 'Pendiente',
        color: 'text-amber-700',
        bg:    'bg-amber-50 border-amber-200',
        icon:  <Clock size={14} />,
        next:  'arrived',
        nextLabel: 'Registrar llegada'
    },
    arrived: {
        label: 'En sala',
        color: 'text-emerald-700',
        bg:    'bg-emerald-50 border-emerald-200',
        icon:  <User size={14} />,
        next:  'in_progress',
        nextLabel: 'Iniciar atención'
    },
    in_progress: {
        label: 'En atención',
        color: 'text-purple-700',
        bg:    'bg-purple-50 border-purple-200',
        icon:  <Stethoscope size={14} />,
        next:  'completed',
        nextLabel: 'Finalizar'
    },
};

// ─── Waiting Time Badge ───────────────────────────────────────────────────────

function WaitingTimeBadge({ minutes, status }: { minutes: number | null; status: string }) {
    if (status !== 'arrived' || minutes === null) return null;

    const mins   = Math.max(0, Math.round(minutes));
    const urgent = mins > 20;
    const warn   = mins > 10;

    return (
        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
            urgent ? 'bg-red-50 border-red-200 text-red-700' :
            warn   ? 'bg-amber-50 border-amber-200 text-amber-700' :
                     'bg-green-50 border-green-200 text-green-700'
        }`}>
            {urgent && <AlertTriangle size={11} />}
            <Clock size={11} />
            {mins} min esperando
        </div>
    );
}

// ─── Patient Row ──────────────────────────────────────────────────────────────

interface PatientRowProps {
    patient: WaitingPatient;
    onStatusChange: (id: string, newStatus: string) => void;
    updating: boolean;
}

function PatientRow({ patient, onStatusChange, updating }: PatientRowProps) {
    const cfg = STATUS_CONFIG[patient.status];
    if (!cfg) return null;

    const startTime = new Date(patient.start_time).toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', hour12: false,
    });

    const initials = patient.patient_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase();

    return (
        <div className={`rounded-xl border p-4 transition-all ${cfg.bg}`}>
            <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${cfg.color} bg-white border-2 ${cfg.bg.split(' ')[1]}`}>
                    {initials}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 text-sm truncate">
                            {patient.patient_name}
                        </h3>
                        <WaitingTimeBadge minutes={patient.waiting_minutes} status={patient.status} />
                    </div>

                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                            {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-xs text-gray-500">
                            <Clock size={10} className="inline mr-0.5" />
                            {startTime}
                        </span>
                        {patient.doctor_name && (
                            <span className="text-xs text-gray-500">
                                <Stethoscope size={10} className="inline mr-0.5" />
                                {patient.doctor_name}
                            </span>
                        )}
                        <span className="text-xs text-gray-400 capitalize">{patient.type}</span>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {cfg.next && (
                        <button
                            disabled={updating}
                            onClick={() => onStatusChange(patient.id, cfg.next!)}
                            className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all disabled:opacity-50 ${cfg.color} bg-white hover:bg-opacity-80 border-current`}
                        >
                            <ArrowRight size={12} />
                            {cfg.nextLabel}
                        </button>
                    )}
                    <button
                        disabled={updating}
                        onClick={() => onStatusChange(patient.id, 'no_show')}
                        title="Marcar como no presentado"
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <UserX size={14} />
                    </button>
                    <button
                        disabled={updating}
                        onClick={() => onStatusChange(patient.id, 'cancelled')}
                        title="Cancelar turno"
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <XCircle size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Summary Metrics ──────────────────────────────────────────────────────────

function SummaryMetrics({ patients }: { patients: WaitingPatient[] }) {
    const inRoom    = patients.filter(p => p.status === 'arrived').length;
    const inSession = patients.filter(p => p.status === 'in_progress').length;
    const confirmed = patients.filter(p => ['confirmed', 'pending'].includes(p.status)).length;
    const avgWait   = (() => {
        const waitingPts = patients.filter(p => p.status === 'arrived' && p.waiting_minutes !== null);
        if (!waitingPts.length) return null;
        const avg = waitingPts.reduce((a, p) => a + (p.waiting_minutes ?? 0), 0) / waitingPts.length;
        return Math.round(avg);
    })();

    return (
        <div className="grid grid-cols-4 gap-3 mb-5">
            {[
                { label: 'En sala', value: inRoom,    color: 'text-emerald-700', bg: 'bg-emerald-50' },
                { label: 'En atención', value: inSession, color: 'text-purple-700', bg: 'bg-purple-50' },
                { label: 'Por llegar', value: confirmed, color: 'text-blue-700',    bg: 'bg-blue-50' },
                { label: 'Espera prom.', value: avgWait !== null ? `${avgWait} min` : '—',
                  color: avgWait && avgWait > 15 ? 'text-red-700' : 'text-gray-700',
                  bg:    avgWait && avgWait > 15 ? 'bg-red-50' : 'bg-gray-50' },
            ].map(m => (
                <div key={m.label} className={`rounded-xl p-3 ${m.bg} text-center`}>
                    <p className={`text-xl font-bold leading-none ${m.color}`}>{m.value}</p>
                    <p className="text-xs text-gray-500 mt-1">{m.label}</p>
                </div>
            ))}
        </div>
    );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function WaitingRoomDashboard() {
    const [patients, setPatients] = useState<WaitingPatient[]>([]);
    const [loading, setLoading]   = useState(true);
    const [updating, setUpdating] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const supabase = createClient();

    const load = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('waiting_room_today')
                .select('*');

            if (error) throw error;
            setPatients(data ?? []);
            setLastRefresh(new Date());
        } catch (err) {
            console.error('[WaitingRoom] Load error:', err);
        } finally {
            setLoading(false);
        }
    }, [supabase]);

    useEffect(() => {
        load();
        const interval = setInterval(load, 30_000); // Auto-refresh every 30s
        return () => clearInterval(interval);
    }, [load]);

    const handleStatusChange = async (appointmentId: string, newStatus: string) => {
        setUpdating(true);
        try {
            await fetch('/api/agenda/checkin', {
                method:  'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ appointmentId, status: newStatus }),
            });
            await load();
        } finally {
            setUpdating(false);
        }
    };

    // Group patients by priority (in_progress > arrived > confirmed/pending)
    const sorted = [...patients].sort((a, b) => {
        const order = { in_progress: 0, arrived: 1, confirmed: 2, pending: 3 };
        const orderA = order[a.status as keyof typeof order] ?? 9;
        const orderB = order[b.status as keyof typeof order] ?? 9;
        if (orderA !== orderB) return orderA - orderB;
        // Within arrived, sort by longest wait first
        if (a.status === 'arrived' && b.status === 'arrived') {
            return (b.waiting_minutes ?? 0) - (a.waiting_minutes ?? 0);
        }
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
    });

    if (loading) {
        return (
            <div className="space-y-3">
                {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />
                ))}
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                        Sala de espera virtual
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">
                        Actualizado: {lastRefresh.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                </div>
                <button
                    onClick={load}
                    disabled={updating}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                    <RefreshCw size={12} className={updating ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {patients.length > 0 && <SummaryMetrics patients={patients} />}

            {/* Patient List */}
            {sorted.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                    <User size={40} strokeWidth={1} className="mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">Sin pacientes activos hoy</p>
                    <p className="text-xs mt-1">Los turnos confirmados o con check-in aparecerán aquí</p>
                </div>
            ) : (
                <div className="space-y-2.5">
                    {sorted.map(patient => (
                        <PatientRow
                            key={patient.id}
                            patient={patient}
                            onStatusChange={handleStatusChange}
                            updating={updating}
                        />
                    ))}
                </div>
            )}

            {/* Realtime badge */}
            <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-400">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Actualización automática cada 30 segundos
            </div>
        </div>
    );
}
