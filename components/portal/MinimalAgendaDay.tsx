import { CalendarDays, Clock, Stethoscope } from 'lucide-react';
import type { DoctorAgendaDay, DoctorAgendaShare, MinimalDoctorAppointment } from '@/app/actions/doctor-agenda';
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
        <div className="rounded-2xl border border-slate-800/70 bg-slate-900/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-4">
                    <div className="w-20 shrink-0 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-2 text-center">
                        <p className="text-lg font-black text-white">{appointment.startTime}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">{appointment.endTime}</p>
                    </div>
                    <div>
                        <h3 className="text-base font-bold text-white">{appointment.patientName}</h3>
                        <p className="mt-1 text-sm text-slate-300">{appointment.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                                <Stethoscope size={12} />
                                {appointment.type}
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
                <span className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${meta.className}`}>
                    {meta.label}
                </span>
            </div>
        </div>
    );
}

export default function MinimalAgendaDay({ agenda, shared = false }: { agenda: DoctorAgendaDay; shared?: boolean }) {
    return (
        <div className="mx-auto max-w-4xl space-y-8">
            <div className="rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-900 to-slate-950 p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-300">
                            {shared ? 'Agenda compartida' : 'Mi agenda'}
                        </p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
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
                    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 px-5 py-3 text-right">
                        <p className="text-3xl font-black text-white">{agenda.appointments.length}</p>
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
