'use client';

import { useState, useRef } from 'react';
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
import { getAppointments, updateAppointment } from '@/app/actions/agenda';
import NewAppointmentModal from './NewAppointmentModal';
import { useAuth } from '@/contexts/AuthContext';

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

export default function AgendaCalendar() {
    const calendarRef = useRef<FullCalendar>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState<AppointmentModalData | null>(null);
    const { role } = useAuth();

    const handleDateSelect = (selectInfo: DateSelectArg) => {
        // Create new event from selection
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

        // Clear selection to avoid visual artifacts
        const calendarApi = selectInfo.view.calendar;
        calendarApi.unselect();
    };

    const handleEventClick = (arg: EventClickArg) => {
        const event = arg.event;
        const props = (event.extendedProps || {}) as AgendaEventExtendedProps;

        const safeStart = event.start || new Date();
        const safeEnd = event.end || new Date(safeStart.getTime() + 30 * 60 * 1000);
        const appointmentData = {
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

        setSelectedEvent(appointmentData);
        setModalOpen(true);
    };

    const handleEventDrop = async (arg: EventDropArg) => {
        const { event } = arg;
        if (!event.start || !event.end) {
            arg.revert();
            return;
        }

        try {
            await updateAppointment(event.id, {
                start_time: event.start.toISOString(),
                end_time: event.end.toISOString()
            });
        } catch (error) {
            console.error('Error moving event:', error);
            arg.revert();
        }
    };

    const fetchEvents = async (
        fetchInfo: EventSourceFuncArg,
        successCallback: (events: EventInput[]) => void,
        failureCallback: (error: Error) => void
    ) => {
        try {
            const appointments = (await getAppointments(fetchInfo.startStr, fetchInfo.endStr)) as AgendaAppointmentRecord[];
            const events = appointments.map(apt => ({
                id: apt.id,
                title: apt.title || (apt.patient ? apt.patient.full_name : 'Cita'),
                start: apt.start_time,
                end: apt.end_time,
                backgroundColor: getStatusColor(apt.status),
                borderColor: getStatusColor(apt.status),
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
            }));
            successCallback(events);
        } catch (error) {
            console.error(error);
            const failureError = error instanceof Error ? error : new Error('No se pudieron cargar citas');
            failureCallback(failureError);
        }
    };

    const refreshCalendar = () => {
        const calendarApi = calendarRef.current?.getApi();
        calendarApi?.refetchEvents();
    };

    const canEdit = ['owner', 'admin', 'reception', 'developer'].includes(role || '');

    return (
        <div className="h-full bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col">
            <style jsx global>{`
                .fc {
                    --fc-border-color: #f3f4f6;
                    --fc-today-bg-color: rgba(59, 130, 246, 0.05);
                    --fc-page-bg-color: #ffffff;
                    --fc-neutral-bg-color: #f9fafb;
                    --fc-list-event-hover-bg-color: #f3f4f6;
                    font-family: ui-sans-serif, system-ui, sans-serif;
                }
                .dark .fc {
                    --fc-border-color: #1f2937;
                    --fc-page-bg-color: #111827;
                    --fc-neutral-bg-color: #1f2937;
                }
                .fc-theme-standard td, .fc-theme-standard th {
                    border-color: var(--fc-border-color);
                }
                .fc-col-header-cell-cushion {
                    padding: 12px 0 !important;
                    font-size: 0.85rem;
                    font-weight: 600;
                    color: #4b5563;
                    text-transform: uppercase;
                    letter-spacing: 0.05em;
                }
                .dark .fc-col-header-cell-cushion {
                    color: #9ca3af;
                }
                .fc-timegrid-slot {
                    height: 3.5rem !important; /* Taller slots for cleaner look */
                }
                .fc-timegrid-slot-label-cushion {
                    font-size: 0.75rem;
                    color: #9ca3af;
                    font-weight: 500;
                }
                .fc-event {
                    border-radius: 6px;
                    border: none;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
                    padding: 2px 4px;
                    font-size: 0.85rem;
                    font-weight: 600;
                }
                .premium-event {
                    transition: all 0.2s ease;
                }
                .premium-event:hover {
                    transform: scale(1.02);
                    box-shadow: 0 8px 16px rgba(0,0,0,0.1);
                    z-index: 50;
                }
                .fc-scrollgrid {
                    border: none !important;
                }
                /* Hide top borders of header to blend with container */
                .fc-scrollgrid-section-header td {
                    border-top: none !important;
                    border-bottom-width: 1px !important;
                }
                .fc-toolbar {
                    padding: 1.5rem 1.5rem 0.5rem 1.5rem;
                    margin-bottom: 0 !important;
                }
                .fc-button {
                    border-radius: 8px !important;
                    font-weight: 500 !important;
                    text-transform: capitalize !important;
                    padding: 0.4rem 1rem !important;
                    box-shadow: none !important;
                    border: 1px solid transparent !important;
                    transition: all 0.2s !important;
                }
                .fc-button-primary {
                    background-color: white !important;
                    color: #374151 !important;
                    border-color: #e5e7eb !important;
                }
                .fc-button-primary:hover {
                    background-color: #f9fafb !important;
                    border-color: #d1d5db !important;
                }
                .fc-button-active {
                    background-color: #eff6ff !important;
                    color: #2563eb !important;
                    border-color: #bfdbfe !important;
                }
                .dark .fc-button-primary {
                    background-color: #1f2937 !important;
                    color: #e5e7eb !important;
                    border-color: #374151 !important;
                }
                .dark .fc-button-primary:hover {
                    background-color: #374151 !important;
                    border-color: #4b5563 !important;
                }
                .dark .fc-button-active {
                    background-color: #1e3a8a !important;
                    color: #93c5fd !important;
                    border-color: #1e40af !important;
                }
            `}</style>

            <FullCalendar
                ref={calendarRef}
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="timeGridWeek"
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                }}
                locale={esLocale}
                height="100%"
                editable={canEdit}
                selectable={canEdit}
                selectMirror={true}
                dayMaxEvents={true}
                firstDay={1} // Start on Monday
                events={fetchEvents}
                select={handleDateSelect}
                eventClick={handleEventClick}
                eventDrop={handleEventDrop}
                slotMinTime="08:00:00"
                slotMaxTime="20:00:00"
                allDaySlot={false}
                slotDuration="00:15:00"
                slotLabelFormat={{
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                    meridiem: false
                }}
                eventTimeFormat={{
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                }}
                expandRows={true}
                stickyHeaderDates={true}
                nowIndicator={true}
                buttonText={{
                    today: 'Hoy',
                    month: 'Mes',
                    week: 'Semana',
                    day: 'Día'
                }}
            />

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
    // Apple/iOS Style Colors
    switch (status) {
        case 'confirmed': return '#007AFF'; // Blue
        case 'pending': return '#FF9500'; // Orange
        case 'arrived': return '#34C759'; // Green
        case 'in_progress': return '#AF52DE'; // Purple
        case 'completed': return '#8E8E93'; // Gray
        case 'cancelled': return '#FF3B30'; // Red
        case 'no_show': return '#1C1C1E'; // Black
        default: return '#007AFF';
    }
}
