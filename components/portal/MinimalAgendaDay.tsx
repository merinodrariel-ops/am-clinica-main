import { CalendarDays, Clock, Stethoscope } from 'lucide-react';
import type { AllDoctorsAgendaShare, DoctorAgendaDay, DoctorAgendaShare, MinimalDoctorAppointment } from '@/app/actions/doctor-agenda';
import { formatDateForLocale } from '@/lib/local-date';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
    confirmed: { label: 'Confirmado', className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20' },
    pending: { label: 'Pendiente', className: 'bg-amber-500/10 text-amber-300 border-amber-500/20' },
    completed: { label: 'Completado', className: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
    cancelled: { label: 'Cancelado', className: 'bg-red-500/10 text-red-300 border-red-500/20' },
    no_show: { label: 'Ausente', className: 'bg-red-500/10 text-red-300 border-red-500/20' },
};

function statusMeta(status: string) {
    return STATUS_LABELS[status] || { label: status || 'Turno', className: 'bg-slate-500/10 text-slate-300 border-slate-500/20' };
}

function AppointmentCard({ appointment }: { appointment: MinimalDoctorAppointment }) {
    const meta = statusMeta(appointment.status);
    return (
        <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-3 sm:p-4">
            <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-[4.5rem] shrink-0 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-2 text-center sm:w-20">
                    <p className="text-base font-black leading-none text-white sm:text-lg">{appointment.startTime}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-indigo-300">{appointment.endTime}</p>
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <h3 className="truncate text-base font-bold text-white">{appointment.patientName}</h3>
                            <p className="mt-1 line-clamp-2 text-sm leading-snug text-slate-300">{appointment.title}</p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase sm:px-3 sm:text-xs ${meta.className}`}>
                            {meta.label}
                        </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span className="inline-flex min-w-0 items-center gap-1">
                            <Stethoscope size={12} className="shrink-0" />
                            <span className="truncate">{appointment.type}</span>
                        </span>
                        {appointment.durationMinutes > 0 && (
                            <span className="inline-flex items-center gap-1">
                                <Clock size={12} />
                                {appointment.durationMinutes} min
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function MinimalAgendaDay({ agenda, shared = false }: { agenda: DoctorAgendaDay; shared?: boolean }) {
    return (
        <div className="mx-auto max-w-4xl space-y-4 sm:space-y-8">
            <div className="rounded-2xl border border-slate-800/70 bg-gradient-to-br from-slate-900 to-slate-950 p-4 sm:rounded-3xl sm:p-6">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-300">
                            {shared ? 'Agenda compartida' : 'Mi agenda'}
                        </p>
                        <h1 className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">
                            {agenda.doctorName}
                        </h1>
                        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-400">
                            <CalendarDays size={16} />
                            {formatDateForLocale(agenda.date, 'es-AR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long',
                                year: 'numeric',
                            })}
                        </p>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-right sm:px-5">
                        <p className="text-2xl font-black text-white sm:text-3xl">{agenda.appointments.length}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Turnos</p>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                {agenda.appointments.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-800 p-12 text-center">
                        <CalendarDays size={34} className="mx-auto mb-3 text-slate-700" />
                        <p className="font-semibold text-slate-400">No hay turnos para este día.</p>
                    </div>
                ) : (
                    agenda.appointments.map((appointment) => (
                        <AppointmentCard key={appointment.id} appointment={appointment} />
                    ))
                )}
            </div>
        </div>
    );
}

export function MinimalAgendaRange({ agenda }: { agenda: DoctorAgendaShare }) {
    const totalAppointments = agenda.days.reduce((sum, day) => sum + day.appointments.length, 0);
    const daysWithAppointments = agenda.days.filter(day => day.appointments.length > 0);

    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <div className="rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-300">
                            Agenda compartida
                        </p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
                            {agenda.doctorName}
                        </h1>
                        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-400">
                            <CalendarDays size={16} />
                            {formatDateForLocale(agenda.startDate, 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                            {' '}→{' '}
                            {formatDateForLocale(agenda.endDate, 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-5 py-3 text-right">
                        <p className="text-3xl font-black text-white">{totalAppointments}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Turnos</p>
                    </div>
                </div>
            </div>

            {daysWithAppointments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-800 p-12 text-center">
                    <CalendarDays size={34} className="mx-auto mb-3 text-slate-700" />
                    <p className="font-semibold text-slate-400">No hay turnos en este período.</p>
                </div>
            ) : (
                <div className="space-y-8">
                    {daysWithAppointments.map(day => (
                        <section key={day.date} className="space-y-3">
                            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                                <h2 className="font-black text-white">
                                    {formatDateForLocale(day.date, 'es-AR', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                    })}
                                </h2>
                                <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-slate-400">
                                    {day.appointments.length} turno{day.appointments.length === 1 ? '' : 's'}
                                </span>
                            </div>
                            {day.appointments.map(appointment => (
                                <AppointmentCard key={appointment.id} appointment={appointment} />
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}

export function MinimalAllDoctorsAgenda({ agenda }: { agenda: AllDoctorsAgendaShare }) {
    const totalAppointments = agenda.days.reduce((sum, day) => (
        sum + day.doctors.reduce((doctorSum, doctor) => doctorSum + doctor.appointments.length, 0)
    ), 0);
    const daysWithAppointments = agenda.days.filter(day => day.doctors.some(doctor => doctor.appointments.length > 0));
    const isSingleDay = agenda.startDate === agenda.endDate;

    return (
        <div className="mx-auto max-w-5xl space-y-8">
            <div className="rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-300">
                            Agenda compartida
                        </p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
                            Toda la agenda
                        </h1>
                        <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-400">
                            <CalendarDays size={16} />
                            {isSingleDay ? (
                                formatDateForLocale(agenda.startDate, 'es-AR', {
                                    weekday: 'long',
                                    day: 'numeric',
                                    month: 'long',
                                    year: 'numeric',
                                })
                            ) : (
                                <>
                                    {formatDateForLocale(agenda.startDate, 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    {' '}→{' '}
                                    {formatDateForLocale(agenda.endDate, 'es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                                </>
                            )}
                        </p>
                    </div>
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-5 py-3 text-right">
                        <p className="text-3xl font-black text-white">{totalAppointments}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Turnos</p>
                    </div>
                </div>
            </div>

            {daysWithAppointments.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-slate-800 p-12 text-center">
                    <CalendarDays size={34} className="mx-auto mb-3 text-slate-700" />
                    <p className="font-semibold text-slate-400">No hay turnos en este período.</p>
                </div>
            ) : (
                <div className="space-y-10">
                    {daysWithAppointments.map(day => (
                        <section key={day.date} className="space-y-4">
                            {!isSingleDay && (
                                <div className="border-b border-slate-800 pb-2">
                                    <h2 className="font-black text-white">
                                        {formatDateForLocale(day.date, 'es-AR', {
                                            weekday: 'long',
                                            day: 'numeric',
                                            month: 'long',
                                        })}
                                    </h2>
                                </div>
                            )}
                            {day.doctors.map(doctor => (
                                <div key={`${day.date}-${doctor.doctorId}`} className="space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-800/70 pb-2">
                                        <h3 className="font-black text-white">{doctor.doctorName}</h3>
                                        <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-slate-400">
                                            {doctor.appointments.length} turno{doctor.appointments.length === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                    {doctor.appointments.map(appointment => (
                                        <AppointmentCard key={appointment.id} appointment={appointment} />
                                    ))}
                                </div>
                            ))}
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
