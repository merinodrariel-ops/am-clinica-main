'use client';

/**
 * DoctorResourceView — Custom Multi-Doctor Column View
 *
 * Renders a day timeline where each doctor occupies a column.
 * Time slots on Y-axis (12:00 – 21:00, 60-min increments).
 * Events positioned absolutely within each column.
 * No FullCalendar Premium required.
 */

import { useEffect, useState, useRef } from 'react';
import { getAppointments } from '@/app/actions/agenda';
import { Loader2, UserCircle2 } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Doctor {
    id: string;
    full_name: string;
    role: string;
}

interface Appointment {
    id: string;
    title: string | null;
    start_time: string;
    end_time: string;
    status: string;
    type: string;
    notes: string | null;
    patient_id: string | null;
    doctor_id: string | null;
    patient?: { full_name?: string } | null;
    doctor?: { full_name?: string } | null;
}

interface DoctorResourceViewProps {
    date: Date;
    doctors: Doctor[];
    activeDoctorIds: Set<string>;
    doctorColors: string[];
    onEventClick: (apt: Appointment) => void;
    onSlotClick: (start: Date, end: Date, doctorId: string) => void;
    canEdit: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const START_HOUR = 12; // 12:00
const END_HOUR = 21; // 21:00
const SLOT_MINS = 60;
const SLOT_HEIGHT = 22; // px per 60-min slot
const TOTAL_SLOTS = ((END_HOUR - START_HOUR) * 60) / SLOT_MINS;
const TOTAL_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT;
const AFTERNOON_FOCUS_MINS = 12 * 60;

function minutesSinceMidnight(isoStr: string): number {
    const d = new Date(isoStr);
    return d.getHours() * 60 + d.getMinutes();
}

function pxFromMinutes(mins: number): number {
    return ((mins - START_HOUR * 60) * SLOT_HEIGHT) / SLOT_MINS;
}

function getVisibleWindow(startIso: string, endIso: string) {
    const startMins = minutesSinceMidnight(startIso);
    const endMins = minutesSinceMidnight(endIso);
    const visibleStart = Math.max(startMins, START_HOUR * 60);
    const visibleEnd = Math.min(endMins, END_HOUR * 60);

    return {
        visibleStart,
        visibleEnd,
        isVisible: visibleEnd > visibleStart,
    };
}

function slotToTime(slotIndex: number): Date {
    const totalMins = START_HOUR * 60 + slotIndex * SLOT_MINS;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

function formatTime(isoStr: string): string {
    return new Date(isoStr).toLocaleTimeString('es-AR', {
        hour: '2-digit', minute: '2-digit', hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires',
    });
}

function getStatusBadgeStyle(status: string): string {
    const map: Record<string, string> = {
        confirmed:   'bg-blue-500',
        pending:     'bg-amber-500',
        arrived:     'bg-green-500',
        in_progress: 'bg-purple-500',
        completed:   'bg-gray-400',
        cancelled:   'bg-red-500',
        no_show:     'bg-gray-800',
    };
    return map[status] ?? 'bg-blue-500';
}

function getAppointmentCardStyle(status: string, doctorColor: string) {
    if (status === 'cancelled') {
        return {
            background: '#e5e7eb',
            border: '#9ca3af',
            text: '#374151',
            mutedText: '#6b7280',
            chip: 'bg-gray-600/15 text-gray-700',
        };
    }

    return {
        background: doctorColor,
        border: doctorColor,
        text: '#ffffff',
        mutedText: 'rgba(255,255,255,0.78)',
        chip: 'bg-white/20 text-white',
    };
}

function getAppointmentDisplayColor(type: string | null | undefined, doctorColor: string) {
    if (type === 'cirugia_implantes' || type === 'cirugia') {
        return '#dc2626';
    }

    return doctorColor;
}

// ─── Time label column ────────────────────────────────────────────────────────

function TimeColumn() {
    const slots = Array.from({ length: TOTAL_SLOTS + 1 }, (_, i) => i);
    return (
        <div
            className="flex-shrink-0 w-14 border-r border-gray-100 dark:border-gray-800 relative"
            style={{ height: TOTAL_HEIGHT }}
        >
            {slots.map(i => {
                const totalMins = START_HOUR * 60 + i * SLOT_MINS;
                const h = Math.floor(totalMins / 60);
                const m = totalMins % 60;
                if (m !== 0) return null;
                return (
                    <div
                        key={i}
                        className="absolute right-2 text-[10px] font-medium text-gray-400 dark:text-gray-600 leading-none"
                        style={{ top: i * SLOT_HEIGHT - 6 }}
                    >
                        {String(h).padStart(2, '0')}:{String(m).padStart(2, '0')}
                    </div>
                );
            })}
        </div>
    );
}

// ─── Doctor Column ────────────────────────────────────────────────────────────

interface DoctorColumnProps {
    doctor: Doctor;
    color: string;
    appointments: Appointment[];
    date: Date;
    onEventClick: (apt: Appointment) => void;
    onSlotClick: (start: Date, end: Date, doctorId: string) => void;
    canEdit: boolean;
}

function DoctorColumn({
    doctor, color, appointments, date,
    onEventClick, onSlotClick, canEdit
}: DoctorColumnProps) {
    const nowRef = useRef<HTMLDivElement>(null);
    const isToday = new Date().toDateString() === date.toDateString();
    const nowMins = minutesSinceMidnight(new Date().toISOString());
    const nowTop = Math.max(0, ((nowMins - START_HOUR * 60) * SLOT_HEIGHT) / SLOT_MINS);

    // Handle click on empty slot
    const handleColumnClick = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!canEdit) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const slotIndex = Math.floor(y / SLOT_HEIGHT);
        const startDate = slotToTime(slotIndex);
        startDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        const endDate = new Date(startDate.getTime() + 60 * 60000);
        onSlotClick(startDate, endDate, doctor.id);
    };

    return (
        <div
            className="flex-1 min-w-[140px] relative border-r border-gray-100 dark:border-gray-800 cursor-pointer select-none"
            style={{ height: TOTAL_HEIGHT }}
            onClick={handleColumnClick}
        >
            {/* Grid lines every 60 min */}
            {Array.from({ length: TOTAL_SLOTS }, (_, i) => (
                <div
                    key={i}
                    className="absolute left-0 right-0 border-t border-gray-200 dark:border-gray-700"
                    style={{ top: i * SLOT_HEIGHT }}
                />
            ))}

            {/* Now indicator */}
            {isToday && nowMins >= START_HOUR * 60 && nowMins <= END_HOUR * 60 && (
                <div
                    ref={nowRef}
                    className="absolute left-0 right-0 z-20 flex items-center pointer-events-none"
                    style={{ top: nowTop }}
                >
                    <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
                    <div className="flex-1 h-px bg-red-400" />
                </div>
            )}

            {/* Appointments */}
            {appointments.map(apt => {
                const window = getVisibleWindow(apt.start_time, apt.end_time);
                if (!window.isVisible) return null;

                const visibleDurationMins = window.visibleEnd - window.visibleStart;
                const topPx = pxFromMinutes(window.visibleStart);
                const heightPx = Math.max(SLOT_HEIGHT, (visibleDurationMins / SLOT_MINS) * SLOT_HEIGHT);
                const isShort = heightPx <= SLOT_HEIGHT;
                const isCancelled = apt.status === 'cancelled';
                const appointmentColor = getAppointmentDisplayColor(apt.type, color);
                const style = getAppointmentCardStyle(apt.status, appointmentColor);

                return (
                    <div
                        key={apt.id}
                        className={`absolute left-1 right-1 rounded-lg z-10 overflow-hidden shadow-md cursor-pointer transition-all group ${isCancelled ? 'border-2 border-dashed hover:shadow-md' : 'hover:shadow-lg hover:scale-[1.01]'}`}
                        style={{
                            top:        topPx,
                            height:     heightPx,
                            background: style.background,
                            borderColor: style.border,
                            minHeight:  SLOT_HEIGHT,
                            opacity: isCancelled ? 0.94 : 1,
                        }}
                        onClick={(e) => {
                            e.stopPropagation();
                            onEventClick(apt);
                        }}
                    >
                        {/* Status indicator strip */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-lg ${getStatusBadgeStyle(apt.status)}`} />

                        <div className="pl-2.5 pr-1.5 py-1 h-full flex flex-col justify-start overflow-hidden">
                            {isCancelled && !isShort && (
                                <span className={`mb-1 inline-flex w-fit items-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em] ${style.chip}`}>
                                    Cancelado
                                </span>
                            )}
                            <p className="text-[11px] font-bold leading-tight truncate" style={{ color: style.text }}>
                                {apt.title || apt.patient?.full_name || 'Cita'}
                            </p>
                            {!isShort && apt.patient?.full_name && apt.patient.full_name !== apt.title && (
                                <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: style.mutedText }}>
                                    {apt.patient.full_name}
                                </p>
                            )}
                            {!isShort && (
                                <p className="text-[10px] leading-tight mt-auto" style={{ color: style.mutedText }}>
                                    {formatTime(apt.start_time)} – {formatTime(apt.end_time)}
                                </p>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function DoctorResourceView({
    date, doctors, activeDoctorIds, doctorColors,
    onEventClick, onSlotClick, canEdit
}: DoctorResourceViewProps) {
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [loading, setLoading] = useState(true);
    const containerRef = useRef<HTMLDivElement>(null);

    const visibleDoctors = doctors.filter(d =>
        activeDoctorIds.has('all') || activeDoctorIds.has(d.id)
    );

    useEffect(() => {
        async function load() {
            setLoading(true);
            const start = new Date(date);
            start.setHours(0, 0, 0, 0);
            const end = new Date(date);
            end.setHours(23, 59, 59, 999);
            try {
                const data = await getAppointments(start.toISOString(), end.toISOString());
                setAppointments(data as Appointment[]);
            } catch (err) {
                console.error('[ResourceView] Load error:', err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [date]);

    // Focus afternoon by default while keeping morning reachable via scroll-up.
    useEffect(() => {
        if (!containerRef.current || loading) return;
        const scrollTop = Math.max(0, ((AFTERNOON_FOCUS_MINS - START_HOUR * 60) * SLOT_HEIGHT) / SLOT_MINS - 40);
        containerRef.current.scrollTop = scrollTop;
    }, [date, loading]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full text-gray-400">
                <Loader2 className="animate-spin mr-2" size={18} />
                <span className="text-sm">Cargando agenda...</span>
            </div>
        );
    }

    if (visibleDoctors.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                <UserCircle2 size={48} strokeWidth={1} />
                <p className="text-sm">No hay doctores seleccionados</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Doctor Headers */}
            <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 flex-shrink-0">
                <div className="w-14 flex-shrink-0" />
                {visibleDoctors.map((doc) => {
                    const color = doctorColors[doctors.indexOf(doc) % doctorColors.length];
                    const dayApts = appointments.filter((a) => a.doctor_id === doc.id && getVisibleWindow(a.start_time, a.end_time).isVisible);
                    return (
                        <div
                            key={doc.id}
                            className="flex-1 min-w-[140px] px-3 py-2.5 border-r border-gray-200 dark:border-gray-700"
                        >
                            <div className="flex items-center gap-2">
                                <div
                                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
                                    style={{ backgroundColor: color }}
                                >
                                    {doc.full_name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-gray-900 dark:text-white truncate leading-tight">
                                        {doc.full_name}
                                    </p>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-tight">
                                        {dayApts.length} turno{dayApts.length !== 1 ? 's' : ''}
                                    </p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Scrollable Time Grid */}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto overflow-x-auto"
            >
                <div className="flex" style={{ minHeight: TOTAL_HEIGHT }}>
                    <TimeColumn />
                    {visibleDoctors.map((doc) => {
                        const color   = doctorColors[doctors.indexOf(doc) % doctorColors.length];
                        const docApts = appointments.filter((a) => a.doctor_id === doc.id);
                        return (
                            <DoctorColumn
                                key={doc.id}
                                doctor={doc}
                                color={color}
                                appointments={docApts}
                                date={date}
                                onEventClick={onEventClick}
                                onSlotClick={onSlotClick}
                                canEdit={canEdit}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
