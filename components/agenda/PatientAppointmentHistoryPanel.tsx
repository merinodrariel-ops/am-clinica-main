'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    CalendarDays,
    ChevronRight,
    Clock3,
    ExternalLink,
    FileImage,
    Loader2,
    Search,
    UserRound,
    X,
} from 'lucide-react';
import {
    getPatientAppointmentHistory,
    searchPatients,
    type AgendaPatientSearchResult,
    type PatientAppointmentHistoryItem,
} from '@/app/actions/agenda';

interface PatientAppointmentHistoryPanelProps {
    open: boolean;
    onClose: () => void;
    onOpenAppointment: (appointment: PatientAppointmentHistoryItem, patient: AgendaPatientSearchResult) => void;
}

const STATUS_PRESENTATION: Record<string, { label: string; className: string }> = {
    confirmed: { label: 'Confirmado', className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
    pending: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
    arrived: { label: 'Llegó', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
    in_progress: { label: 'En atención', className: 'bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300' },
    completed: { label: 'Finalizado', className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
    cancelled: { label: 'Cancelado', className: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300' },
    no_show: { label: 'No asistió', className: 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100' },
};

const TYPE_LABELS: Record<string, string> = {
    consulta: 'Consulta de primera vez',
    tratamiento: 'Tratamiento',
    control: 'Control general / urgencia',
    control_carilla_inmediato: 'Control de carillas',
    control_carilla_anual: 'Control anual de carillas',
    control_ortodoncia: 'Control de ortodoncia',
    resinas_diseno_sonrisa: 'Diseño de sonrisa en resinas',
    cirugia_implantes: 'Cirugía / implantes',
    cirugia: 'Cirugía',
    limpieza: 'Limpieza',
    limpieza_convencional: 'Limpieza convencional',
    limpieza_laser: 'Limpieza con láser',
    urgencia: 'Urgencia',
    cementado: 'Cementado',
    turno_detallado: 'Día detallado',
    tallado: 'Día detallado',
    botox: 'Botox',
    otro: 'Otro',
};

const dateFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
});

function AppointmentRow({
    appointment,
    patient,
    onOpenAppointment,
}: {
    appointment: PatientAppointmentHistoryItem;
    patient: AgendaPatientSearchResult;
    onOpenAppointment: PatientAppointmentHistoryPanelProps['onOpenAppointment'];
}) {
    const status = STATUS_PRESENTATION[appointment.status] || {
        label: appointment.status,
        className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    };
    const start = new Date(appointment.start_time);
    const end = new Date(appointment.end_time);
    const title = appointment.title || TYPE_LABELS[appointment.type] || 'Turno';
    const typeLabel = TYPE_LABELS[appointment.type] || appointment.type;
    const detailParts = [
        appointment.doctor?.full_name ? `Dr. ${appointment.doctor.full_name}` : 'Sin profesional',
        appointment.area?.nombre || null,
        appointment.modality === 'virtual' ? 'Virtual' : null,
    ].filter(Boolean);

    return (
        <article className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-white">{dateFormatter.format(start)}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${status.className}`}>
                            {status.label}
                        </span>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                        <Clock3 size={13} className="shrink-0" />
                        <span>{timeFormatter.format(start)}–{timeFormatter.format(end)}</span>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onOpenAppointment(appointment, patient)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/60"
                >
                    Ver en agenda
                    <ChevronRight size={13} />
                </button>
            </div>

            <div className="mt-3 border-t border-gray-100 pt-2.5 dark:border-gray-800">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-white" title={title}>{title}</p>
                {title !== typeLabel && (
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{typeLabel}</p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{detailParts.join(' · ')}</p>
            </div>
        </article>
    );
}

export default function PatientAppointmentHistoryPanel({ open, onClose, onOpenAppointment }: PatientAppointmentHistoryPanelProps) {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState<AgendaPatientSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedPatient, setSelectedPatient] = useState<AgendaPatientSearchResult | null>(null);
    const [appointments, setAppointments] = useState<PatientAppointmentHistoryItem[]>([]);
    const [total, setTotal] = useState(0);
    const [nextOffset, setNextOffset] = useState<number | null>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');

    const loadHistory = useCallback(async (patient: AgendaPatientSearchResult, offset = 0) => {
        setHistoryLoading(true);
        setHistoryError('');
        try {
            const result = await getPatientAppointmentHistory(patient.id, offset);
            if (!result.success) throw new Error(result.error || 'No se pudo cargar el historial');
            setAppointments(current => offset === 0 ? result.appointments : [...current, ...result.appointments]);
            setTotal(result.total);
            setNextOffset(result.nextOffset);
        } catch (error) {
            setHistoryError(error instanceof Error ? error.message : 'No se pudo cargar el historial');
            if (offset === 0) setAppointments([]);
        } finally {
            setHistoryLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose, open]);

    useEffect(() => {
        if (!open || selectedPatient) return;
        const normalized = searchTerm.trim().replace(/\s+/g, ' ');
        if (normalized.length < 2) {
            setSearchResults([]);
            setSearching(false);
            return;
        }

        let cancelled = false;
        const timeoutId = window.setTimeout(async () => {
            setSearching(true);
            try {
                const results = await searchPatients(normalized);
                if (!cancelled) setSearchResults(results);
            } catch {
                if (!cancelled) setSearchResults([]);
            } finally {
                if (!cancelled) setSearching(false);
            }
        }, 250);

        return () => {
            cancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [open, searchTerm, selectedPatient]);

    const groupedAppointments = useMemo(() => {
        const now = Date.now();
        const upcoming = appointments
            .filter(appointment => new Date(appointment.end_time).getTime() >= now && !['cancelled', 'no_show'].includes(appointment.status))
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
        const upcomingIds = new Set(upcoming.map(appointment => appointment.id));
        const previous = appointments.filter(appointment => !upcomingIds.has(appointment.id));
        return { upcoming, previous };
    }, [appointments]);

    const choosePatient = (patient: AgendaPatientSearchResult) => {
        setSelectedPatient(patient);
        setSearchResults([]);
        setAppointments([]);
        setTotal(0);
        setNextOffset(null);
        void loadHistory(patient);
    };

    const changePatient = () => {
        setSelectedPatient(null);
        setSearchTerm('');
        setSearchResults([]);
        setAppointments([]);
        setTotal(0);
        setNextOffset(null);
        setHistoryError('');
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Historial de turnos por paciente">
            <button type="button" aria-label="Cerrar historial" className="absolute inset-0 bg-black/35 backdrop-blur-[1px]" onClick={onClose} />
            <aside className="absolute inset-y-0 right-0 flex w-full flex-col bg-gray-50 shadow-2xl dark:bg-gray-950 sm:max-w-2xl">
                <header className="border-b border-gray-200 bg-white px-4 py-4 dark:border-gray-800 dark:bg-gray-900 sm:px-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                                <Search size={18} />
                                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Buscar turnos por paciente</h2>
                            </div>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Historial completo, aunque la fecha no esté visible en el calendario.</p>
                        </div>
                        <button type="button" onClick={onClose} className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200" aria-label="Cerrar">
                            <X size={19} />
                        </button>
                    </div>

                    {!selectedPatient ? (
                        <div className="relative mt-4">
                            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={17} />
                            <input
                                autoFocus
                                value={searchTerm}
                                onChange={event => setSearchTerm(event.target.value)}
                                placeholder="Escribí nombre y apellido"
                                className="w-full rounded-xl border border-gray-300 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-gray-700 dark:bg-gray-950 dark:text-white"
                            />
                            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-blue-500" size={17} />}
                        </div>
                    ) : (
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/35">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="rounded-full bg-blue-100 p-2 text-blue-700 dark:bg-blue-900 dark:text-blue-200"><UserRound size={18} /></div>
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{selectedPatient.full_name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{total} {total === 1 ? 'turno vinculado' : 'turnos vinculados'}</p>
                                </div>
                            </div>
                            <button type="button" onClick={changePatient} className="shrink-0 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-300">Cambiar paciente</button>
                        </div>
                    )}
                </header>

                <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">
                    {!selectedPatient && (
                        <div>
                            {searchTerm.trim().length < 2 ? (
                                <div className="py-16 text-center text-gray-400">
                                    <Search className="mx-auto mb-3 opacity-40" size={36} />
                                    <p className="text-sm font-medium">Escribí al menos dos letras</p>
                                    <p className="mt-1 text-xs">Después seleccioná al paciente correcto de la base.</p>
                                </div>
                            ) : !searching && searchResults.length === 0 ? (
                                <div className="py-16 text-center text-gray-500 dark:text-gray-400">
                                    <p className="text-sm font-semibold">No encontramos pacientes con ese nombre</p>
                                    <p className="mt-1 text-xs">Probá con el apellido o revisá cómo está registrado.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {searchResults.map(patient => (
                                        <button
                                            type="button"
                                            key={patient.id}
                                            onClick={() => choosePatient(patient)}
                                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3.5 text-left transition hover:border-blue-300 hover:bg-blue-50/40 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-blue-800 dark:hover:bg-blue-950/20"
                                        >
                                            <div className="flex min-w-0 items-center gap-3">
                                                <div className="rounded-full bg-gray-100 p-2 text-gray-500 dark:bg-gray-800 dark:text-gray-300"><UserRound size={17} /></div>
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{patient.full_name}</p>
                                                    {patient.status && <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{patient.status}</p>}
                                                </div>
                                            </div>
                                            <ChevronRight className="shrink-0 text-gray-400" size={17} />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {selectedPatient && (
                        <div>
                            <div className="mb-4 grid grid-cols-2 gap-2">
                                <Link href={`/patients/${selectedPatient.id}`} target="_blank" className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-800 dark:hover:text-blue-300">
                                    <UserRound size={15} />
                                    Abrir paciente
                                    <ExternalLink size={12} />
                                </Link>
                                <Link href={`/patients/${selectedPatient.id}?section=archivos`} target="_blank" className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-xs font-semibold text-gray-700 transition hover:border-blue-300 hover:text-blue-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-blue-800 dark:hover:text-blue-300">
                                    <FileImage size={15} />
                                    Ver archivos
                                    <ExternalLink size={12} />
                                </Link>
                            </div>

                            {historyError && (
                                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{historyError}</div>
                            )}

                            {historyLoading && appointments.length === 0 ? (
                                <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500"><Loader2 className="animate-spin" size={18} /> Cargando historial…</div>
                            ) : !historyError && appointments.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-5 py-12 text-center dark:border-gray-700 dark:bg-gray-900">
                                    <CalendarDays className="mx-auto mb-3 text-gray-300 dark:text-gray-600" size={34} />
                                    <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">No hay turnos vinculados a este paciente</p>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Un turno importado que sólo tenga el nombre escrito no se atribuye automáticamente.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {groupedAppointments.upcoming.length > 0 && (
                                        <section>
                                            <div className="mb-2 flex items-center justify-between">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">Próximos turnos</h3>
                                                <span className="text-xs text-gray-400">{groupedAppointments.upcoming.length}</span>
                                            </div>
                                            <div className="space-y-2.5">
                                                {groupedAppointments.upcoming.map(appointment => <AppointmentRow key={appointment.id} appointment={appointment} patient={selectedPatient} onOpenAppointment={onOpenAppointment} />)}
                                            </div>
                                        </section>
                                    )}

                                    {groupedAppointments.previous.length > 0 && (
                                        <section>
                                            <div className="mb-2 flex items-center justify-between">
                                                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">Historial anterior</h3>
                                                <span className="text-xs text-gray-400">{groupedAppointments.previous.length}{nextOffset !== null ? ` de ${total}` : ''}</span>
                                            </div>
                                            <div className="space-y-2.5">
                                                {groupedAppointments.previous.map(appointment => <AppointmentRow key={appointment.id} appointment={appointment} patient={selectedPatient} onOpenAppointment={onOpenAppointment} />)}
                                            </div>
                                        </section>
                                    )}

                                    {nextOffset !== null && (
                                        <button
                                            type="button"
                                            disabled={historyLoading}
                                            onClick={() => void loadHistory(selectedPatient, nextOffset)}
                                            className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
                                        >
                                            {historyLoading && <Loader2 className="animate-spin" size={16} />}
                                            Cargar turnos anteriores
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </aside>
        </div>
    );
}
