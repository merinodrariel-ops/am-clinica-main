'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { motion } from 'framer-motion';
import {
    ChevronLeft, ChevronRight, RefreshCw
} from 'lucide-react';
import {
    getRecallCalendarData,
} from '@/app/actions/recalls';
import {
    RECALL_TYPE_LABELS,
    RECALL_TYPE_COLORS,
    type RecallType,
} from '@/lib/recall-constants';

interface CalendarEvent {
    id: string;
    recall_type: RecallType;
    next_due_date: string;
    state: string;
    priority: number;
    patient: {
        id_paciente: string;
        nombre: string;
        apellido: string;
    } | null;
}

const DAYS_ES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MONTHS_ES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export default function RecallCalendar() {
    const [year, setYear] = useState(new Date().getFullYear());
    const [month, setMonth] = useState(new Date().getMonth() + 1);
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [isPending, startTransition] = useTransition();
    const [selectedDay, setSelectedDay] = useState<number | null>(null);

    const loadData = useCallback(() => {
        startTransition(async () => {
            const data = await getRecallCalendarData(year, month);
            // Normalize patient from array (Supabase FK join) to object
            const normalized = (data || []).map((item: Record<string, unknown>) => ({
                ...item,
                patient: Array.isArray(item.patient) ? item.patient[0] || null : item.patient,
            }));
            setEvents(normalized as CalendarEvent[]);
        });
    }, [year, month]);

    useEffect(() => { loadData(); }, [loadData]);

    const prevMonth = () => {
        if (month === 1) { setYear(y => y - 1); setMonth(12); }
        else setMonth(m => m - 1);
        setSelectedDay(null);
    };

    const nextMonth = () => {
        if (month === 12) { setYear(y => y + 1); setMonth(1); }
        else setMonth(m => m + 1);
        setSelectedDay(null);
    };

    const goToday = () => {
        setYear(new Date().getFullYear());
        setMonth(new Date().getMonth() + 1);
        setSelectedDay(new Date().getDate());
    };

    // Calculate calendar grid
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    let startDow = firstDay.getDay();
    if (startDow === 0) startDow = 7; // Monday = 1

    const blanks = startDow - 1;
    const totalCells = blanks + daysInMonth;
    const rows = Math.ceil(totalCells / 7);

    // Group events by day
    const eventsByDay: Record<number, CalendarEvent[]> = {};
    events.forEach(e => {
        const d = new Date(e.next_due_date + 'T00:00:00').getDate();
        if (!eventsByDay[d]) eventsByDay[d] = [];
        eventsByDay[d].push(e);
    });

    const today = new Date();
    const isToday = (day: number) =>
        year === today.getFullYear() && month === today.getMonth() + 1 && day === today.getDate();

    const selectedEvents = selectedDay ? (eventsByDay[selectedDay] || []) : [];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Vista Calendario
                </h2>
                <div className="flex items-center gap-2">
                    <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    <button
                        onClick={goToday}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-50 text-blue-600
              dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                    >
                        Hoy
                    </button>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white min-w-[180px] text-center">
                        {MONTHS_ES[month - 1]} {year}
                    </h3>
                    <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                        <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                    </button>
                    {isPending && <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />}
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6">
                {/* Calendar Grid */}
                <div className="flex-1">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-gray-100 dark:border-gray-700">
                            {DAYS_ES.map(d => (
                                <div key={d} className="px-2 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    {d}
                                </div>
                            ))}
                        </div>

                        {/* Days */}
                        <div className="grid grid-cols-7">
                            {Array.from({ length: rows * 7 }, (_, i) => {
                                const dayNum = i - blanks + 1;
                                const isValid = dayNum >= 1 && dayNum <= daysInMonth;
                                const dayEvents = isValid ? (eventsByDay[dayNum] || []) : [];
                                const isTodayCell = isValid && isToday(dayNum);
                                const isSelected = isValid && dayNum === selectedDay;

                                return (
                                    <motion.div
                                        key={i}
                                        whileHover={isValid ? { scale: 1.02 } : undefined}
                                        onClick={() => isValid && setSelectedDay(dayNum)}
                                        className={`relative min-h-[80px] p-1.5 border-b border-r border-gray-50 dark:border-gray-700/50 cursor-pointer
                      transition-all duration-150
                      ${!isValid ? 'bg-gray-50/50 dark:bg-gray-900/30' : ''}
                      ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500/40 ring-inset' : ''}
                      ${isTodayCell && !isSelected ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}
                      hover:bg-gray-50 dark:hover:bg-gray-700/30`}
                                    >
                                        {isValid && (
                                            <>
                                                <span className={`text-xs font-medium
                          ${isTodayCell ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center' :
                                                        'text-gray-600 dark:text-gray-400'}`}>
                                                    {dayNum}
                                                </span>
                                                {/* Event dots */}
                                                <div className="flex flex-wrap gap-0.5 mt-1">
                                                    {dayEvents.slice(0, 4).map(e => (
                                                        <span
                                                            key={e.id}
                                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                                            style={{ backgroundColor: RECALL_TYPE_COLORS[e.recall_type] }}
                                                            title={`${e.patient?.nombre} ${e.patient?.apellido} - ${RECALL_TYPE_LABELS[e.recall_type]}`}
                                                        />
                                                    ))}
                                                    {dayEvents.length > 4 && (
                                                        <span className="text-[9px] text-gray-400 font-medium leading-none self-center">
                                                            +{dayEvents.length - 4}
                                                        </span>
                                                    )}
                                                </div>
                                                {dayEvents.length > 0 && (
                                                    <span className="absolute bottom-1 right-1 text-[9px] font-bold text-gray-400 dark:text-gray-500">
                                                        {dayEvents.length}
                                                    </span>
                                                )}
                                            </>
                                        )}
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap gap-3 mt-3">
                        {Object.entries(RECALL_TYPE_LABELS).map(([key, label]) => (
                            <div key={key} className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: RECALL_TYPE_COLORS[key as RecallType] }} />
                                <span className="text-[10px] text-gray-500 dark:text-gray-400">{label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Selected Day Detail */}
                <div className="lg:w-80">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-4 shadow-sm sticky top-4">
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
                            {selectedDay
                                ? `${selectedDay} de ${MONTHS_ES[month - 1]}`
                                : 'Seleccione un día'}
                        </h4>
                        {selectedDay && selectedEvents.length === 0 && (
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                                No hay recalls para este día
                            </p>
                        )}
                        <div className="space-y-2 max-h-[400px] overflow-y-auto">
                            {selectedEvents.map(e => (
                                <motion.div
                                    key={e.id}
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-600"
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <span
                                            className="w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ backgroundColor: RECALL_TYPE_COLORS[e.recall_type] }}
                                        />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                            {RECALL_TYPE_LABELS[e.recall_type]}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                                        {e.patient?.nombre} {e.patient?.apellido}
                                    </p>
                                    <span className={`text-[10px] mt-1 inline-block px-2 py-0.5 rounded-full
                    ${e.state === 'pending_contact' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                                            e.state === 'contacted' ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300' :
                                                e.state === 'scheduled' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' :
                                                    'bg-gray-100 text-gray-600 dark:bg-gray-600 dark:text-gray-300'}`}
                                    >
                                        {e.state === 'pending_contact' ? 'Pendiente' :
                                            e.state === 'contacted' ? 'Contactado' :
                                                e.state === 'scheduled' ? 'Agendado' : e.state}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
