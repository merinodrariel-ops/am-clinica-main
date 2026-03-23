'use client';

import { useEffect, useState, useCallback } from 'react';
import { getAppointments } from '@/app/actions/agenda';
import { Clock, User, Stethoscope, RefreshCw, CalendarCheck } from 'lucide-react';

interface Appointment {
    id: string;
    title: string | null;
    start_time: string;
    end_time: string;
    status: string;
    type: string;
    patient_id: string | null;
    doctor_id: string | null;
    patient?: { full_name?: string } | null;
    doctor?: { full_name?: string } | null;
}

const STATUS_STYLE: Record<string, { dot: string; bg: string; label: string }> = {
    confirmed:   { dot: 'bg-blue-500',   bg: 'border-blue-100 dark:border-blue-900/40',   label: 'Confirmado' },
    pending:     { dot: 'bg-amber-400',  bg: 'border-amber-100 dark:border-amber-900/40', label: 'Pendiente' },
    arrived:     { dot: 'bg-green-500',  bg: 'border-green-100 dark:border-green-900/40', label: 'En sala' },
    in_progress: { dot: 'bg-purple-500', bg: 'border-purple-100 dark:border-purple-900/40',label: 'Atendiendo' },
    completed:   { dot: 'bg-gray-300',   bg: 'border-gray-100 dark:border-gray-800',       label: 'Finalizado' },
    cancelled:   { dot: 'bg-red-400',    bg: 'border-red-100 dark:border-red-900/40',      label: 'Cancelado' },
    no_show:     { dot: 'bg-gray-700',   bg: 'border-gray-200 dark:border-gray-700',       label: 'No vino' },
};

function fmt(iso: string) {
    return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export default function TodaySchedulePanel() {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const end   = new Date(); end.setHours(23, 59, 59, 999);
        try {
            const data = await getAppointments(start.toISOString(), end.toISOString());
            const sorted = (data as Appointment[]).sort(
                (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
            );
            setAppointments(sorted);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
        const interval = setInterval(load, 60_000);
        return () => clearInterval(interval);
    }, [load]);

    const now = new Date();
    const upcoming  = appointments.filter(a => new Date(a.end_time) >= now && !['completed','cancelled','no_show'].includes(a.status));
    const done      = appointments.filter(a => ['completed','cancelled','no_show'].includes(a.status) || new Date(a.end_time) < now);
    const total     = appointments.length;
    const completed = appointments.filter(a => a.status === 'completed').length;

    if (loading) {
        return (
            <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 h-full">
                <div className="space-y-3">
                    {[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 dark:bg-gray-800 rounded-xl animate-pulse" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 h-full overflow-y-auto flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between mb-2 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                    <CalendarCheck size={13} className="text-blue-600" />
                    <span className="text-xs font-semibold text-gray-900 dark:text-white">Hoy</span>
                    <span className="text-[10px] text-gray-400">
                        {new Date().toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                    </span>
                </div>
                <button onClick={load} className="text-gray-400 hover:text-gray-600 p-0.5 rounded transition-colors">
                    <RefreshCw size={11} />
                </button>
            </div>

            {/* Summary bar */}
            <div className="flex gap-1.5 mb-2 flex-shrink-0">
                <div className="flex-1 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-1.5 text-center">
                    <p className="text-sm font-bold text-blue-700 dark:text-blue-400 leading-none">{total}</p>
                    <p className="text-[9px] text-blue-600/70">Total</p>
                </div>
                <div className="flex-1 bg-green-50 dark:bg-green-900/20 rounded-lg p-1.5 text-center">
                    <p className="text-sm font-bold text-green-700 dark:text-green-400 leading-none">{completed}</p>
                    <p className="text-[9px] text-green-600/70">Listos</p>
                </div>
                <div className="flex-1 bg-purple-50 dark:bg-purple-900/20 rounded-lg p-1.5 text-center">
                    <p className="text-sm font-bold text-purple-700 dark:text-purple-400 leading-none">{upcoming.length}</p>
                    <p className="text-[9px] text-purple-600/70">Pendientes</p>
                </div>
            </div>

            {total === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-400 py-10">
                    <CalendarCheck size={36} strokeWidth={1} className="mb-2 opacity-40" />
                    <p className="text-sm">Sin turnos para hoy</p>
                </div>
            ) : (
                <div className="space-y-1.5 flex-1">
                    {/* Upcoming */}
                    {upcoming.length > 0 && (
                        <>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pb-1">
                                Próximos
                            </p>
                            {upcoming.map(apt => <AppointmentRow key={apt.id} apt={apt} now={now} />)}
                        </>
                    )}

                    {/* Done */}
                    {done.length > 0 && (
                        <>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 pt-3 pb-1">
                                Anteriores
                            </p>
                            {done.map(apt => <AppointmentRow key={apt.id} apt={apt} now={now} muted />)}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

function AppointmentRow({ apt, now, muted = false }: { apt: Appointment; now: Date; muted?: boolean }) {
    const cfg = STATUS_STYLE[apt.status] ?? STATUS_STYLE.confirmed;
    const isNow = new Date(apt.start_time) <= now && new Date(apt.end_time) >= now;
    const name = apt.patient?.full_name || apt.title || 'Sin paciente';
    const doctor = apt.doctor?.full_name?.split(' ')[0];

    return (
        <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all ${cfg.bg} ${
            isNow ? 'ring-1 ring-purple-300 dark:ring-purple-700' : ''
        } ${muted ? 'opacity-40' : ''}`}>
            {/* Time */}
            <div className="text-center flex-shrink-0 w-8">
                <p className="text-[10px] font-bold text-gray-900 dark:text-white leading-none">{fmt(apt.start_time)}</p>
            </div>

            {/* Dot */}
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot} ${isNow ? 'animate-pulse' : ''}`} />

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-[11px] font-medium text-gray-900 dark:text-white truncate leading-tight">{name}</p>
                {doctor && <p className="text-[9px] text-gray-400 truncate">{doctor}</p>}
            </div>

            {isNow && (
                <span className="text-[9px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    AHORA
                </span>
            )}
        </div>
    );
}
