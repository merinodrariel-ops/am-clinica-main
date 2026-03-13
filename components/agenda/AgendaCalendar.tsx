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
import { getAppointments, updateAppointment, deleteAppointment, getDoctors } from '@/app/actions/agenda';
import NewAppointmentModal from './NewAppointmentModal';
import DoctorResourceView from './DoctorResourceView';
import { useAuth } from '@/contexts/AuthContext';
import { Users, Calendar, ChevronDown, X, Edit2, Phone, Mic, MicOff, Trash2 } from 'lucide-react';
import { useEffect, useRef as useRefCallback } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

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
    patient?: { full_name?: string };
    doctor?: { full_name?: string };
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
    patient?: { full_name?: string };
    doctor?: { full_name?: string };
    conflict?: boolean;
}

interface Doctor {
    id: string;
    full_name: string;
    role: string;
}

interface QuickPopup {
    appointmentId: string;
    title: string;
    patientName: string;
    doctorName: string;
    startTime: string;
    currentStatus: string;
    x: number;
    y: number;
    fullData: AppointmentModalData;
}

interface DropConfirmData {
    eventId: string;
    oldStart: Date;
    newStart: Date;
    newEnd: Date;
    patientName: string;
    arg: EventDropArg;
}

type ViewMode = 'calendar' | 'resource';

const STATUS_FLOW: { key: string; label: string; color: string }[] = [
    { key: 'confirmed', label: 'Confirmado', color: 'bg-blue-500' },
    { key: 'arrived', label: 'Llegó', color: 'bg-green-500' },
    { key: 'in_progress', label: 'En atención', color: 'bg-purple-500' },
    { key: 'completed', label: 'Finalizado', color: 'bg-gray-400' },
    { key: 'cancelled', label: 'Cancelado', color: 'bg-red-500' },
    { key: 'no_show', label: 'No vino', color: 'bg-gray-800' },
];

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
    const [calendarView, setCalendarView] = useState<'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'>('timeGridWeek');
    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [activeDoctorIds, setActiveDoctorIds] = useState<Set<string>>(new Set(['all']));
    const [resourceDate, setResourceDate] = useState<Date>(new Date());
    const [quickPopup, setQuickPopup] = useState<QuickPopup | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recognitionRef = useRef<any>(null);
    const [voiceText, setVoiceText] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [voiceOpen, setVoiceOpen] = useState(false);
    const [dropConfirm, setDropConfirm] = useState<DropConfirmData | null>(null);
    const [isNotifying, setIsNotifying] = useState(false);
    const { categoria: role } = useAuth();
    const router = useRouter();

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

        const fullData: AppointmentModalData = {
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
        };

        // Calcular posición del popup cerca del evento
        const rect = (arg.el as HTMLElement).getBoundingClientRect();
        const x = Math.min(rect.left, window.innerWidth - 320);
        const y = Math.min(rect.bottom + 8, window.innerHeight - 280);

        setQuickPopup({
            appointmentId: event.id,
            title: event.title,
            patientName: props.patient?.full_name || '',
            doctorName: props.doctor?.full_name || '',
            startTime: safeStart.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }),
            currentStatus: props.status || 'confirmed',
            x, y,
            fullData,
        });
    };

    const handleQuickStatusChange = async (appointmentId: string, newStatus: string) => {
        setUpdatingStatus(true);
        try {
            const result = await updateAppointment(appointmentId, { status: newStatus });
            if (!result.success) {
                throw new Error(result.error || 'No se pudo actualizar el estado');
            }
            setQuickPopup(null);
            refreshCalendar();
            toast.success('Estado actualizado');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al actualizar');
        } finally {
            setUpdatingStatus(false);
        }
    };

    const openFullModal = (data: AppointmentModalData) => {
        setQuickPopup(null);
        setSelectedEvent(data);
        setModalOpen(true);
    };

    // ── Voice Notes ──────────────────────────────────────────────────────────
    const stopVoice = useCallback(() => {
        recognitionRef.current?.stop();
        recognitionRef.current = null;
        setIsListening(false);
    }, []);

    const startVoice = useCallback(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
        if (!SR) { toast.error('Tu navegador no soporta dictado. Usá Chrome.'); return; }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rec = new SR() as any;
        rec.lang = 'es-AR';
        rec.continuous = true;
        rec.interimResults = true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rec.onresult = (e: any) => {
            let t = '';
            for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
            setVoiceText(t);
        };
        rec.onend = () => setIsListening(false);
        rec.start();
        recognitionRef.current = rec;
        setIsListening(true);
    }, []);

    const saveVoiceNote = useCallback(async () => {
        if (!quickPopup || !voiceText.trim()) return;
        setUpdatingStatus(true);
        try {
            await updateAppointment(quickPopup.appointmentId, { notes: voiceText.trim() });
            toast.success('Nota clínica guardada');
            stopVoice();
            setVoiceOpen(false);
            setVoiceText('');
            setQuickPopup(null);
            refreshCalendar();
        } catch {
            toast.error('Error al guardar nota');
        } finally {
            setUpdatingStatus(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quickPopup, voiceText, stopVoice]);

    // Cleanup voice when popup closes
    useEffect(() => {
        if (!quickPopup) { stopVoice(); setVoiceOpen(false); setVoiceText(''); }
    }, [quickPopup, stopVoice]);

    const handleEventDrop = (arg: EventDropArg) => {
        const { event, oldEvent } = arg;
        if (!event.start || !event.end || !oldEvent.start) { arg.revert(); return; }

        const props = event.extendedProps as AgendaEventExtendedProps;
        const patientName = props.patient?.full_name || 'Paciente';

        setDropConfirm({
            eventId: event.id,
            oldStart: oldEvent.start,
            newStart: event.start,
            newEnd: event.end,
            patientName,
            arg
        });
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

            const sorted = [...filtered].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

            const doctorIntervals: Record<string, { start: number, end: number, id: string }[]> = {};
            const conflictMap = new Set<string>();

            sorted.forEach(apt => {
                if (!apt.doctor_id || apt.status === 'cancelled' || apt.status === 'no_show') return;
                const start = new Date(apt.start_time).getTime();
                const end = new Date(apt.end_time).getTime();

                if (!doctorIntervals[apt.doctor_id]) doctorIntervals[apt.doctor_id] = [];

                for (const interval of doctorIntervals[apt.doctor_id]) {
                    // Check for overlap
                    if (Math.max(start, interval.start) < Math.min(end, interval.end)) {
                        conflictMap.add(apt.id);
                        conflictMap.add(interval.id);
                    }
                }

                doctorIntervals[apt.doctor_id].push({ start, end, id: apt.id });
            });

            const events: EventInput[] = filtered.map(apt => {
                const isConflict = conflictMap.has(apt.id);
                const doctorColor = apt.doctor_id
                    ? getDoctorColor(apt.doctor_id, doctors)
                    : getStatusColor(apt.status);

                const fallbackColor = doctors.length > 0 && apt.doctor_id ? doctorColor : getStatusColor(apt.status);
                // Ignore external color_tag when it's invalid or too light to keep weekly/daily events readable.
                const color = normalizeEventColor(apt.color_tag, fallbackColor);
                const textColor = getReadableTextColor(color);

                return {
                    id: apt.id,
                    title: apt.title || (apt.patient?.full_name ?? 'Cita'),
                    start: apt.start_time,
                    end: apt.end_time,
                    backgroundColor: isConflict ? '#ef4444' : color, // highlight red on conflict
                    borderColor: isConflict ? '#dc2626' : color,
                    textColor: isConflict ? '#ffffff' : textColor,
                    className: `premium-event ${isConflict ? 'animate-pulse ring-2 ring-red-500' : ''}`,
                    extendedProps: {
                        status: apt.status,
                        type: apt.type,
                        notes: apt.notes || '',
                        patient_id: apt.patient_id || '',
                        doctor_id: apt.doctor_id || '',
                        patient: apt.patient || undefined,
                        doctor: apt.doctor || undefined,
                        conflict: isConflict
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

    const canEdit = ['owner', 'admin', 'reception', 'developer', 'asistente', 'odontologo', 'recaptacion'].includes(role || '');

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
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'calendar'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                    >
                        <Calendar size={13} />
                        Calendario
                    </button>
                    <button
                        onClick={() => setViewMode('resource')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${viewMode === 'resource'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                    >
                        <Users size={13} />
                        Por doctor
                    </button>
                </div>

                {/* Calendar granularity */}
                {viewMode === 'calendar' && (
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
                        <button
                            onClick={() => {
                                setCalendarView('dayGridMonth');
                                calendarRef.current?.getApi()?.changeView('dayGridMonth');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${calendarView === 'dayGridMonth'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                        >
                            Mes
                        </button>
                        <button
                            onClick={() => {
                                setCalendarView('timeGridWeek');
                                calendarRef.current?.getApi()?.changeView('timeGridWeek');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${calendarView === 'timeGridWeek'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                        >
                            Semana
                        </button>
                        <button
                            onClick={() => {
                                setCalendarView('timeGridDay');
                                calendarRef.current?.getApi()?.changeView('timeGridDay');
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${calendarView === 'timeGridDay'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
                                }`}
                        >
                            Día
                        </button>
                    </div>
                )}

                {/* Doctor Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                        onClick={() => toggleDoctor('all')}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${activeDoctorIds.has('all')
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
                                className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${isActive
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
                        initialView={calendarView}
                        headerToolbar={{
                            left: 'prev,next today',
                            center: 'title',
                            right: ''
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
                        scrollTime="12:00:00"
                        allDaySlot={false}
                        slotDuration="00:15:00"
                        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                        eventMinHeight={44}
                        eventShortHeight={34}
                        expandRows
                        stickyHeaderDates
                        nowIndicator
                        datesSet={(arg) => {
                            const type = arg.view.type;
                            if (type === 'dayGridMonth' || type === 'timeGridWeek' || type === 'timeGridDay') {
                                setCalendarView(type);
                            }
                        }}
                        buttonText={{ today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día' }}
                        eventContent={(arg) => {
                            const { event } = arg;
                            const props = event.extendedProps as AgendaEventExtendedProps;
                            const patientName = props.patient?.full_name ?? '';
                            const isTimeGridView = arg.view.type === 'timeGridWeek' || arg.view.type === 'timeGridDay';
                            const primaryLine = patientName || event.title || 'Cita';
                            const treatmentLine = event.title && event.title !== primaryLine ? event.title : '';
                            const doctorLine = props.doctor?.full_name ? `Dr. ${props.doctor.full_name.split(' ')[0]}` : '';
                            const secondaryLine = treatmentLine || doctorLine;
                            return (
                                <div className={`px-1 overflow-hidden ${isTimeGridView ? 'py-0.5' : ''}`}>
                                    <div className="font-semibold truncate text-[11px] leading-tight flex items-center justify-between">
                                        <span>{primaryLine}</span>
                                        {props.conflict && <span title="Conflicto de horario" className="text-white ml-1">⚠️</span>}
                                    </div>
                                    {!isTimeGridView && treatmentLine && (
                                        <div className="opacity-80 truncate text-[10px] leading-tight">{treatmentLine}</div>
                                    )}
                                    {!isTimeGridView && patientName && patientName !== event.title && !treatmentLine && (
                                        <div className="opacity-80 truncate text-[10px] leading-tight">{patientName}</div>
                                    )}
                                    {secondaryLine && (
                                        <div className="opacity-70 truncate text-[10px] leading-tight">
                                            {secondaryLine}
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
                                id: apt.id,
                                title: apt.title || '',
                                start: new Date(apt.start_time),
                                end: new Date(apt.end_time),
                                patientId: apt.patient_id || '',
                                doctorId: apt.doctor_id || '',
                                status: apt.status,
                                type: apt.type,
                                notes: apt.notes || '',
                                patient: apt.patient?.full_name ? { full_name: apt.patient.full_name } : undefined,
                                doctor: apt.doctor?.full_name ? { full_name: apt.doctor.full_name } : undefined,
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

            {/* Drag & Drop Confirmation Modal */}
            {dropConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-6 animate-in fade-in zoom-in duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Confirmar reprogramación</h3>
                            <button onClick={() => { dropConfirm.arg.revert(); setDropConfirm(null); }} className="text-gray-400 hover:text-gray-600">
                                <X size={20} />
                            </button>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            Estás moviendo el turno de <strong className="text-gray-900 dark:text-white font-semibold">{dropConfirm.patientName}</strong>.<br /><br />
                            <span className="opacity-75">Horario anterior:</span> {dropConfirm.oldStart.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} hs<br />
                            <span className="opacity-75">Nuevo horario:</span> <strong className="text-blue-600 dark:text-blue-400">{dropConfirm.newStart.toLocaleString('es-AR', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} hs</strong>
                        </p>

                        <div className="flex flex-col gap-3">
                            <button
                                disabled={isNotifying}
                                onClick={async () => {
                                    setIsNotifying(true);
                                    try {
                                        const result = await updateAppointment(dropConfirm.eventId, {
                                            start_time: dropConfirm.newStart.toISOString(),
                                            end_time: dropConfirm.newEnd.toISOString(),
                                        });
                                        if (!result.success) {
                                            throw new Error(result.error || 'No se pudo reprogramar el turno');
                                        }
                                        toast.success('Turno reprogramado exitosamente');
                                        setDropConfirm(null);
                                    } catch (err) {
                                        toast.error(err instanceof Error ? err.message : 'Error al reprogramar');
                                        dropConfirm.arg.revert();
                                        setDropConfirm(null);
                                    } finally {
                                        setIsNotifying(false);
                                    }
                                }}
                                className="w-full py-2.5 rounded-xl text-sm font-semibold bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                            >
                                Guardar (Sin notificar)
                            </button>
                            <button
                                disabled={isNotifying}
                                onClick={async () => {
                                    setIsNotifying(true);
                                    try {
                                        const result = await updateAppointment(dropConfirm.eventId, {
                                            start_time: dropConfirm.newStart.toISOString(),
                                            end_time: dropConfirm.newEnd.toISOString(),
                                        });
                                        if (!result.success) {
                                            throw new Error(result.error || 'No se pudo reprogramar el turno');
                                        }
                                        toast.success('Turno reprogramado. Se enviará WhatsApp al paciente.');
                                        setDropConfirm(null);
                                    } catch (err) {
                                        toast.error(err instanceof Error ? err.message : 'Error al reprogramar');
                                        dropConfirm.arg.revert();
                                        setDropConfirm(null);
                                    } finally {
                                        setIsNotifying(false);
                                    }
                                }}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-[#25D366] text-white hover:bg-[#1ebd5a] transition"
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" /></svg>
                                Guardar y Notificar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Status Popup */}
            {quickPopup && (
                <>
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setQuickPopup(null)}
                    />
                    {/* Popup */}
                    <div
                        className="fixed z-50 w-72 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden"
                        style={{ left: quickPopup.x, top: quickPopup.y }}
                    >
                        {/* Header */}
                        <div className="px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate leading-tight">
                                        {quickPopup.patientName || quickPopup.title}
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        {quickPopup.startTime}
                                        {quickPopup.doctorName && ` · ${quickPopup.doctorName.split(' ')[0]}`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setQuickPopup(null)}
                                    className="text-gray-400 hover:text-gray-600 flex-shrink-0 p-0.5"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                        </div>

                        {/* Notes / Purpose */}
                        {quickPopup.fullData.notes && (
                            <div className="px-4 py-2 bg-amber-50/50 dark:bg-amber-900/10 border-b border-gray-100 dark:border-gray-800">
                                <p className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider mb-1">
                                    Motivo / Notas
                                </p>
                                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
                                    {quickPopup.fullData.notes}
                                </p>
                            </div>
                        )}

                        {/* Status pills */}
                        <div className="p-3 space-y-1.5">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-2">
                                Cambiar estado
                            </p>
                            {STATUS_FLOW.map(s => (
                                <button
                                    key={s.key}
                                    disabled={updatingStatus}
                                    onClick={() => handleQuickStatusChange(quickPopup.appointmentId, s.key)}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all disabled:opacity-50 ${quickPopup.currentStatus === s.key
                                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} />
                                    {s.label}
                                    {quickPopup.currentStatus === s.key && (
                                        <span className="ml-auto text-[10px] text-gray-400">actual</span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Rich Quick Actions */}
                        <div className="px-3 pb-3 grid grid-cols-5 gap-2">
                            <button
                                disabled={!canEdit}
                                onClick={() => openFullModal(quickPopup.fullData)}
                                title="Editar"
                                className="w-full flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 rounded-xl transition-colors disabled:opacity-50"
                            >
                                <Edit2 size={16} />
                                Editar
                            </button>

                            <button
                                disabled={!canEdit || updatingStatus}
                                onClick={async () => {
                                    if (!confirm('¿Eliminar este turno? Esta acción no se puede deshacer.')) return;
                                    setUpdatingStatus(true);
                                    try {
                                        const result = await deleteAppointment(quickPopup.appointmentId);
                                        if (!result.success) {
                                            throw new Error(result.error || 'No se pudo eliminar el turno');
                                        }
                                        toast.success('Turno eliminado');
                                        setQuickPopup(null);
                                        refreshCalendar();
                                    } catch (error) {
                                        toast.error(error instanceof Error ? error.message : 'Error al eliminar turno');
                                    } finally {
                                        setUpdatingStatus(false);
                                    }
                                }}
                                title="Eliminar turno"
                                className="w-full flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 rounded-xl transition-colors disabled:opacity-50"
                            >
                                <Trash2 size={16} />
                                Borrar
                            </button>

                            <button
                                disabled={!quickPopup.fullData.patientId}
                                onClick={() => router.push(`/patients/${quickPopup.fullData.patientId}`)}
                                title="Historia Clínica"
                                className="w-full flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold text-purple-600 bg-purple-50 hover:bg-purple-100 dark:bg-purple-900/20 dark:text-purple-400 rounded-xl transition-colors disabled:opacity-50"
                            >
                                <Users size={16} />
                                Menú
                            </button>

                            <button
                                disabled={!quickPopup.fullData.patientId}
                                onClick={() => router.push(`/caja-recepcion?tab=caja&action=nuevo-ingreso&patientId=${quickPopup.fullData.patientId}`)}
                                title="Ingresar Pago / Cobrar"
                                className="w-full flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-xl transition-colors disabled:opacity-50"
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                                Cobrar
                            </button>

                            <button
                                disabled={!quickPopup.fullData.patientId}
                                onClick={() => {
                                    window.open(`https://wa.me/?text=Hola ${quickPopup.patientName}, nos contactamos de Lity Clínica Dental.`, '_blank');
                                }}
                                title="Enviar WhatsApp"
                                className="w-full flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold text-[#25D366] bg-[#25D366]/10 hover:bg-[#25D366]/20 rounded-xl transition-colors disabled:opacity-50"
                            >
                                <Phone size={16} />
                                Mensaje
                            </button>
                        </div>

                        {/* Voice Note */}
                        <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-gray-800">
                            {!voiceOpen ? (
                                <button
                                    onClick={() => setVoiceOpen(true)}
                                    className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 border border-emerald-200 hover:border-emerald-300 rounded-xl transition-colors hover:bg-emerald-50 dark:border-emerald-800 dark:hover:bg-emerald-900/20 dark:text-emerald-400"
                                >
                                    <Mic size={12} />
                                    Dictar nota clínica
                                </button>
                            ) : (
                                <div className="space-y-2">
                                    <div className="relative">
                                        <textarea
                                            value={voiceText}
                                            onChange={e => setVoiceText(e.target.value)}
                                            placeholder={isListening ? 'Hablá ahora...' : 'Nota clínica...'}
                                            rows={3}
                                            className="w-full text-xs p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 dark:focus:ring-emerald-700"
                                        />
                                        {isListening && (
                                            <div className="absolute top-2 right-2 flex items-end gap-0.5 h-4">
                                                {[0, 1, 2].map(i => (
                                                    <div key={i} className="w-0.5 bg-emerald-500 rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 150}ms` }} />
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button
                                            onClick={isListening ? stopVoice : startVoice}
                                            className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-xs font-semibold rounded-xl transition-colors border ${isListening
                                                ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800'
                                                : 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800'
                                                }`}
                                        >
                                            {isListening ? <><MicOff size={11} /> Parar</> : <><Mic size={11} /> Grabar</>}
                                        </button>
                                        <button
                                            disabled={!voiceText.trim() || updatingStatus}
                                            onClick={saveVoiceNote}
                                            className="flex-1 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-xl disabled:opacity-40 hover:bg-blue-700 transition-colors"
                                        >
                                            Guardar
                                        </button>
                                        <button
                                            onClick={() => { stopVoice(); setVoiceOpen(false); setVoiceText(''); }}
                                            className="px-2 py-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            <X size={11} className="text-gray-400" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )
            }
        </div >
    );
}

function getStatusColor(status: string) {
    switch (status) {
        case 'confirmed': return '#007AFF';
        case 'pending': return '#FF9500';
        case 'arrived': return '#34C759';
        case 'in_progress': return '#AF52DE';
        case 'completed': return '#8E8E93';
        case 'cancelled': return '#FF3B30';
        case 'no_show': return '#1C1C1E';
        default: return '#007AFF';
    }
}

function normalizeEventColor(input: string | null | undefined, fallback: string): string {
    const color = (input || '').trim();
    if (!color) return fallback;

    const normalized = color.toLowerCase();
    if (
        normalized === '#fff' ||
        normalized === '#ffffff' ||
        normalized === 'white' ||
        normalized === 'rgb(255,255,255)' ||
        normalized === 'rgb(255, 255, 255)' ||
        normalized === 'rgba(255,255,255,1)' ||
        normalized === 'rgba(255, 255, 255, 1)'
    ) {
        return fallback;
    }

    const rgb = parseColorToRgb(color);
    if (!rgb) return fallback;

    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    if (luminance > 0.9) return fallback;

    return color;
}

function getReadableTextColor(color: string): string {
    const rgb = parseColorToRgb(color);
    if (!rgb) return '#ffffff';

    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.68 ? '#111827' : '#ffffff';
}

function parseColorToRgb(color: string): { r: number; g: number; b: number } | null {
    const c = color.trim().toLowerCase();

    const hex3 = c.match(/^#([0-9a-f]{3})$/i);
    if (hex3) {
        const h = hex3[1];
        return {
            r: parseInt(h[0] + h[0], 16),
            g: parseInt(h[1] + h[1], 16),
            b: parseInt(h[2] + h[2], 16),
        };
    }

    const hex6 = c.match(/^#([0-9a-f]{6})$/i);
    if (hex6) {
        const h = hex6[1];
        return {
            r: parseInt(h.slice(0, 2), 16),
            g: parseInt(h.slice(2, 4), 16),
            b: parseInt(h.slice(4, 6), 16),
        };
    }

    const rgb = c.match(/^rgba?\((\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/);
    if (rgb) {
        return {
            r: Math.min(255, Number(rgb[1])),
            g: Math.min(255, Number(rgb[2])),
            b: Math.min(255, Number(rgb[3])),
        };
    }

    const hsl = c.match(/^hsla?\(([-\d.]+)(?:deg|)?(?:\s*,|\s+)\s*([\d.]+)%(?:\s*,|\s+)\s*([\d.]+)%/);
    if (hsl) {
        const h = (((Number(hsl[1]) % 360) + 360) % 360) / 360;
        const s = Math.max(0, Math.min(1, Number(hsl[2]) / 100));
        const l = Math.max(0, Math.min(1, Number(hsl[3]) / 100));

        const hue2rgb = (p: number, q: number, t: number) => {
            let tt = t;
            if (tt < 0) tt += 1;
            if (tt > 1) tt -= 1;
            if (tt < 1 / 6) return p + (q - p) * 6 * tt;
            if (tt < 1 / 2) return q;
            if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
            return p;
        };

        let r: number;
        let g: number;
        let b: number;

        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }

        return {
            r: Math.round(r * 255),
            g: Math.round(g * 255),
            b: Math.round(b * 255),
        };
    }

    return null;
}
