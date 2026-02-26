'use client';

import { useState, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import esLocale from '@fullcalendar/core/locales/es';
import type {
    DateSelectArg,
    EventClickArg,
    EventDropArg,
    EventInput,
    EventSourceFuncArg,
} from '@fullcalendar/core';
import { getAppointments, updateAppointment, getDoctors } from '@/app/actions/agenda';
import NewAppointmentModal from './NewAppointmentModal';
import DoctorResourceView from './DoctorResourceView';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Calendar, ChevronDown } from 'lucide-react';
import { useEffect } from 'react';

interface AppointmentModalData {
    id?: string;
    title: string;
    start: Date;
    end: Date;
    patientId: string;
    doctorId: string;
    status: string;
    type: string;
    notes: string;
    patient?: { full_name: string };
    doctor?: { full_name: string };
}

interface AgendaAppointmentRecord {
    id: string;
    title: string | null;
    start_time: string;
    end_time: string;
    status: string;
    type: string;
    notes: string | null;
    patient_id: string | null;
    doctor_id: string | null;
    color_tag?: string | null;
    patient?: { full_name?: string } | null;
    doctor?: { full_name?: string } | null;
}

interface AgendaEventExtendedProps {
    status?: string;
    type?: string;
    notes?: string;
    patient_id?: string;
    doctor_id?: string;
    patient?: { full_name: string };
    doctor?: { full_name: string };
}

interface Doctor {
    id: string;
    full_name: string;
    role: string;
}

type ViewMode = 'calendar' | 'resource';

// Doctor palette — assigned deterministically by index
const DOCTOR_COLORS = [
    '#007AFF', '#34C759', '#AF52DE', '#FF9500',
    '#FF3B30', '#00C7BE', '#FF6B35', '#BF5AF2',
];

function getDoctorColor(doctorId: string, doctors: Doctor[]): string {
    const idx = doctors.findIndex(d => d.id === doctorId);
    return DOCTOR_COLORS[idx >= 0 ? idx % DOCTOR_COLORS.length : 0];
}

export default function AgendaCalendar() {
    const calendarRef = useRef<FullCalendar>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<AppointmentModalData | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('calendar');
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [activeDoctorIds, setActiveDoctorIds] = useState<Set<string>>(new Set(['all']));
    const [resourceDate, setResourceDate] = useState<Date>(new Date());
    const { role } = useAuth();

    // Load doctors for filter bar
    useEffect(() => {
        getDoctors().then(setDoctors);
    }, []);

    const handleDateSelect = (selectInfo: DateSelectArg) => {
        setSelectedEvent({
            title: '',
            start: selectInfo.start,
            end: selectInfo.end,
            patientId: '',
            doctorId: '',
            status: 'confirmed',
            type: 'consulta',
            notes: ''
        });
        setModalOpen(true);
        selectInfo.view.calendar.unselect();
    };

    const handleEventClick = (arg: EventClickArg) => {
        const event = arg.event;
        const props = (event.extendedProps || {}) as AgendaEventExtendedProps;
        const safeStart = event.start || new Date();
        const safeEnd = event.end || new Date(safeStart.getTime() + 30 * 60 * 1000);

        setSelectedEvent({
            id: event.id,
            title: event.title,
            start: safeStart,
            end: safeEnd,
            status: props.status || 'confirmed',
            type: props.type || 'consulta',
            notes: props.notes || '',
            patientId: props.patient_id || '',
            doctorId: props.doctor_id || '',
            patient: props.patient,
            doctor: props.doctor
        });
        setModalOpen(true);
    };

    const handleEventDrop = async (arg: EventDropArg) => {
        const { event } = arg;
        if (!event.start || !event.end) { arg.revert(); return; }
        try {
            await updateAppointment(event.id, {
                start_time: event.start.toISOString(),
                end_time:   event.end.toISOString()
            });
        } catch {
            arg.revert();
        }
    };

    const fetchEvents = useCallback(async (
        fetchInfo: EventSourceFuncArg,
        successCallback: (events: EventInput[]) => void,
        failureCallback: (error: Error) => void
    ) => {
        try {
            const appointments = (await getAppointments(fetchInfo.startStr, fetchInfo.endStr)) as AgendaAppointmentRecord[];

            const filtered = activeDoctorIds.has('all')
                ? appointments
                : appointments.filter(apt => apt.doctor_id && activeDoctorIds.has(apt.doctor_id));

            const events = filtered.map(apt => {
                const doctorColor = apt.doctor_id
                    ? getDoctorColor(apt.doctor_id, doctors)
                    : getStatusColor(apt.status);

                const color = apt.color_tag ?? (
                    doctors.length > 0 && apt.doctor_id ? doctorColor : getStatusColor(apt.status)
                );

                return {
                    id: apt.id,
                    title: apt.title || (apt.patient?.full_name ?? 'Cita'),
                    start: apt.start_time,
                    end: apt.end_time,
                    backgroundColor: color,
                    borderColor: color,
                    textColor: '#ffffff',
                    className: 'premium-event',
                    extendedProps: {
                        status: apt.status,
                        type: apt.type,
                        notes: apt.notes || '',
                        patient_id: apt.patient_id || '',
                        doctor_id: apt.doctor_id || '',
                        patient: apt.patient || undefined,
                        doctor: apt.doctor || undefined
                    }
                };
            });
            successCallback(events);
        } catch (error) {
            failureCallback(error instanceof Error ? error : new Error('Error cargando citas'));
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDoctorIds, doctors]);

    const refreshCalendar = () => {
        calendarRef.current?.getApi()?.refetchEvents();
    };

    const toggleDoctor = (id: string) => {
        setActiveDoctorIds(prev => {
            const next = new Set(prev);
            if (id === 'all') return new Set(['all']);
            next.delete('all');
            if (next.has(id)) {
                next.delete(id);
                if (next.size === 0) next.add('all');
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const canEdit = ['owner', 'admin', 'reception', 'developer'].includes(role || '');

    return (
        <div className="h-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
            <style jsx global>{`
                .fc { --fc-border-color: #f3f4f6; --fc-today-bg-color: rgba(59,130,246,.05); --fc-page-bg-color: #fff; font-family: ui-sans-serif,system-ui,sans-serif; }
                .dark .fc { --fc-border-color: #1f2937; --fc-page-bg-color: #111827; }
                .fc-col-header-cell-cushion { padding:12px 0!important; font-size:.85rem; font-weight:600; color:#4b5563; text-transform:uppercase; letter-spacing:.05em; }
                .dark .fc-col-header-cell-cushion { color:#9ca3af; }
                .fc-timegrid-slot { height:3rem!important; }
                .fc-timegrid-slot-label-cushion { font-size:.72rem; color:#9ca3af; font-weight:500; }
                .fc-event { border-radius:8px; border:none; box-shadow:0 2px 8px rgba(0,0,0,.08); padding:2px 6px; font-size:.82rem; font-weight:600; }
                .premium-event { transition:all .2s ease; }
                .premium-event:hover { transform:scale(1.02); box-shadow:0 8px 20px rgba(0,0,0,.12); z-index:50; }
                .fc-scrollgrid { border:none!important; }
                .fc-toolbar { padding:1rem 1.25rem .5rem; margin-bottom:0!important; }
                .fc-button { border-radius:8px!important; font-weight:500!important; text-transform:capitalize!important; padding:.35rem .9rem!important; box-shadow:none!important; border:1px solid transparent!important; transition:all .2s!important; }
                .fc-button-primary { background-color:white!important; color:#374151!important; border-color:#e5e7eb!important; }
                .fc-button-primary:hover { background-color:#f9fafb!important; border-color:#d1d5db!important; }
                .fc-button-active { background-color:#eff6ff!important; color:#2563eb!important; border-color:#bfdbfe!important; }
                .dark .fc-button-primary { background-color:#1f2937!important; color:#e5e7eb!important; border-color:#374151!important; }
                .dark .fc-button-active { background-color:#1e3a8a!important; color:#93c5fd!important; border-color:#1e40af!important; }
            `}</style>

            {/* ── Top Control Bar ─────────────────────────────────────── */}
            <div className="flex items-center gap-3 px-4 pt-3 pb-2 border-b border-gray-100 dark:border-gray-800 flex-wrap">

                {/* View Mode Toggle */}
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                    <button
                        onClick={() => setViewMode('calendar')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            viewMode === 'calendar'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        <Calendar size={13} />
                        Calendario
                    </button>
                    <button
                        onClick={() => setViewMode('resource')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                            viewMode === 'resource'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                        }`}
                    >
                        <Users size={13} />
                        Por doctor
                    </button>
                </div>

                {/* Doctor Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={() => toggleDoctor('all')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                            activeDoctorIds.has('all')
                                ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent'
                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:border-gray-400'
                        }`}
                    >
                        Todos
                    </button>
                    {doctors.map((doc, idx) => {
                        const color = DOCTOR_COLORS[idx % DOCTOR_COLORS.length];
                        const isActive = activeDoctorIds.has(doc.id);
                        return (
                            <button
                                key={doc.id}
                                onClick={() => toggleDoctor(doc.id)}
                                style={isActive ? { backgroundColor: color, borderColor: color, color: '#fff' } : { borderColor: color + '55' }}
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                                    isActive
                                        ? ''
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:opacity-80'
                                }`}
                            >
                                {doc.full_name.split(' ')[0]}
                            </button>
                        );
                    })}
                </div>

                {/* Resource View Date Navigator */}
                {viewMode === 'resource' && (
                    <div className="ml-auto flex items-center gap-2">
                        <button
                            onClick={() => setResourceDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                        >
                            <ChevronDown className="rotate-90" size={15} />
                        </button>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px] text-center">
                            {resourceDate.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: 'short' })}
                        </span>
                        <button
                            onClick={() => setResourceDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; })}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 transition-colors"
                        >
                            <ChevronDown className="-rotate-90" size={15} />
                        </button>
                        <button
                            onClick={() => setResourceDate(new Date())}
                            className="px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                            Hoy
                        </button>
                    </div>
                )}
            </div>

            {/* ── Main Content ─────────────────────────────────────────── */}
            <div className="flex-1 min-h-0">
                {viewMode === 'calendar' ? (
                    <FullCalendar
                        ref={calendarRef}
                        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                        initialView="timeGridWeek"
                        headerToolbar={{
                            left:   'prev,next today',
                            center: 'title',
                            right:  'dayGridMonth,timeGridWeek,timeGridDay'
                        }}
                        locale={esLocale}
                        height="100%"
                        editable={canEdit}
                        selectable={canEdit}
                        selectMirror
                        dayMaxEvents
                        firstDay={1}
                        events={fetchEvents}
                        select={handleDateSelect}
                        eventClick={handleEventClick}
                        eventDrop={handleEventDrop}
                        slotMinTime="07:30:00"
                        slotMaxTime="21:00:00"
                        allDaySlot={false}
                        slotDuration="00:15:00"
                        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        expandRows
                        stickyHeaderDates
                        nowIndicator
                        buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día' }}
                        eventContent={(arg) => {
                            const { event } = arg;
                            const props = event.extendedProps as AgendaEventExtendedProps;
                            const patientName = props.patient?.full_name ?? '';
                            return (
                                <div className="px-1 overflow-hidden">
                                    <div className="font-semibold truncate text-[11px] leading-tight">{event.title}</div>
                                    {patientName && patientName !== event.title && (
                                        <div className="opacity-80 truncate text-[10px] leading-tight">{patientName}</div>
                                    )}
                                    {props.doctor?.full_name && (
                                        <div className="opacity-70 truncate text-[10px] leading-tight">
                                            {props.doctor.full_name.split(' ')[0]}
                                        </div>
                                    )}
                                </div>
                            );
                        }}
                    />
                ) : (
                    <DoctorResourceView
                        date={resourceDate}
                        doctors={doctors}
                        activeDoctorIds={activeDoctorIds}
                        doctorColors={DOCTOR_COLORS}
                        onEventClick={(apt) => {
                            setSelectedEvent({
                                id:        apt.id,
                                title:     apt.title || '',
                                start:     new Date(apt.start_time),
                                end:       new Date(apt.end_time),
                                patientId: apt.patient_id || '',
                                doctorId:  apt.doctor_id || '',
                                status:    apt.status,
                                type:      apt.type,
                                notes:     apt.notes || '',
                                patient:   apt.patient?.full_name ? { full_name: apt.patient.full_name } : undefined,
                                doctor:    apt.doctor?.full_name  ? { full_name: apt.doctor.full_name  } : undefined,
                            });
                            setModalOpen(true);
                        }}
                        onSlotClick={(start, end, doctorId) => {
                            setSelectedEvent({
                                title: '', start, end,
                                patientId: '', doctorId,
                                status: 'confirmed', type: 'consulta', notes: ''
                            });
                            setModalOpen(true);
                        }}
                        canEdit={canEdit}
                    />
                )}
            </div>

            {modalOpen && (
                <NewAppointmentModal
                    isOpen={modalOpen}
                    onClose={() => setModalOpen(false)}
                    onSave={refreshCalendar}
                    initialData={selectedEvent}
                />
            )}
        </div>
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case 'confirmed':  return '#007AFF';
        case 'pending':    return '#FF9500';
        case 'arrived':    return '#34C759';
        case 'in_progress': return '#AF52DE';
        case 'completed':  return '#8E8E93';
        case 'cancelled':  return '#FF3B30';
        case 'no_show':    return '#1C1C1E';
        default:           return '#007AFF';
    }
}
