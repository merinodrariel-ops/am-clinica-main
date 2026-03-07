'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Calendar, Clock, Loader2, Mail, Phone, UserRound } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

type Doctor = {
    id: string;
    full_name: string;
};

type Slot = {
    time: string;
    startIso: string;
    endIso: string;
};

type BookingResponse = {
    success: boolean;
    error?: string;
    warnings?: string[];
    appointment?: {
        id: string;
        startTime: string;
        endTime: string;
        doctorName: string;
        patientName: string;
    };
};

function dateToInputValue(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatAppointmentDate(iso: string): string {
    return new Date(iso).toLocaleString('es-AR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Argentina/Buenos_Aires',
    });
}

export default function PublicBookingScheduler() {
    const searchParams = useSearchParams();

    const bookingMode = useMemo<'all' | 'merino' | 'staff'>(() => {
        const raw = (
            searchParams.get('modo') ||
            searchParams.get('tipo') ||
            searchParams.get('profesional') ||
            ''
        )
            .toLowerCase()
            .trim();

        if (raw.includes('merino') || raw.includes('ariel')) return 'merino';
        if (raw.includes('staff')) return 'staff';
        return 'all';
    }, [searchParams]);

    const tomorrow = useMemo(() => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        return dateToInputValue(date);
    }, []);

    const title = bookingMode === 'merino'
        ? 'Agenda con Dr. Ariel Merino'
        : bookingMode === 'staff'
            ? 'Agenda con Staff Medico'
            : 'Agenda tu primera consulta';

    const description = bookingMode === 'merino'
        ? 'Turnos para primera consulta con Dr. Ariel Merino.'
        : bookingMode === 'staff'
            ? 'Turnos para primera consulta con nuestro staff medico.'
            : 'Elegi profesional, horario disponible y confirma tu turno en menos de 1 minuto.';

    const [doctors, setDoctors] = useState<Doctor[]>([]);
    const [doctorId, setDoctorId] = useState('');
    const [date, setDate] = useState(tomorrow);
    const [slots, setSlots] = useState<Slot[]>([]);
    const [selectedTime, setSelectedTime] = useState('');

    const [nombre, setNombre] = useState('');
    const [apellido, setApellido] = useState('');
    const [email, setEmail] = useState('');
    const [whatsapp, setWhatsapp] = useState('');
    const [notes, setNotes] = useState('');

    const [loadingDoctors, setLoadingDoctors] = useState(true);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [bookingResult, setBookingResult] = useState<BookingResponse | null>(null);

    useEffect(() => {
        async function loadDoctors() {
            try {
                setLoadingDoctors(true);
                setError('');

                const params = new URLSearchParams();
                if (bookingMode !== 'all') {
                    params.set('mode', bookingMode);
                }

                const url = params.size > 0
                    ? `/api/public-booking/doctors?${params.toString()}`
                    : '/api/public-booking/doctors';

                const response = await fetch(url, { cache: 'no-store' });
                const payload = (await response.json()) as { success: boolean; doctors?: Doctor[]; error?: string };

                if (!response.ok || !payload.success) {
                    throw new Error(payload.error || 'No se pudieron cargar los profesionales');
                }

                const list = payload.doctors || [];

                setDoctors(list);
                if (list.length > 0) {
                    setDoctorId(list[0].id);
                }
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error cargando profesionales');
            } finally {
                setLoadingDoctors(false);
            }
        }

        void loadDoctors();
    }, [bookingMode]);

    useEffect(() => {
        async function loadSlots() {
            if (!doctorId || !date) return;

            setLoadingSlots(true);
            setError('');
            setSelectedTime('');

            try {
                const params = new URLSearchParams({ doctorId, date });
                const response = await fetch(`/api/public-booking/slots?${params.toString()}`, {
                    cache: 'no-store',
                });

                const payload = (await response.json()) as {
                    success: boolean;
                    slots?: Slot[];
                    error?: string;
                };

                if (!response.ok || !payload.success) {
                    throw new Error(payload.error || 'No se pudieron cargar horarios');
                }

                setSlots(payload.slots || []);
            } catch (e) {
                setSlots([]);
                setError(e instanceof Error ? e.message : 'Error cargando horarios');
            } finally {
                setLoadingSlots(false);
            }
        }

        void loadSlots();
    }, [doctorId, date]);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (!doctorId || !date || !selectedTime) {
            setError('Seleccioná profesional, fecha y horario para continuar.');
            return;
        }

        setSubmitting(true);
        setError('');
        setBookingResult(null);

        try {
            const response = await fetch('/api/public-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    doctorId,
                    date,
                    time: selectedTime,
                    nombre,
                    apellido,
                    email,
                    whatsapp,
                    notes,
                }),
            });

            const payload = (await response.json()) as BookingResponse;

            if (!response.ok || !payload.success) {
                throw new Error(payload.error || 'No se pudo agendar el turno');
            }

            setBookingResult(payload);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo agendar el turno');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="max-w-4xl mx-auto px-6 py-16 text-white">
            <div className="mb-10 text-center">
                <p className="text-[11px] tracking-[0.25em] uppercase text-zinc-500">AM Estetica Dental</p>
                <h1 className="text-3xl md:text-4xl font-light mt-3">{title}</h1>
                <p className="text-zinc-400 mt-3 text-sm md:text-base">
                    {description}
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8 bg-zinc-950/70 border border-zinc-800 rounded-3xl p-6 md:p-8">
                <section className="space-y-4">
                    <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">1. Profesional</h2>

                    {loadingDoctors ? (
                        <div className="flex items-center gap-2 text-zinc-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando profesionales...
                        </div>
                    ) : doctors.length === 0 ? (
                        <p className="text-sm text-zinc-400">No hay profesionales disponibles para agenda publica.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {doctors.map((doctor) => {
                                const isActive = doctor.id === doctorId;
                                return (
                                    <button
                                        key={doctor.id}
                                        type="button"
                                        onClick={() => setDoctorId(doctor.id)}
                                        className={`text-left rounded-2xl px-4 py-3 border transition-colors ${
                                            isActive
                                                ? 'border-white bg-white/10'
                                                : 'border-zinc-800 bg-zinc-900/40 hover:border-zinc-600'
                                        }`}
                                    >
                                        <p className="font-medium">{doctor.full_name}</p>
                                        <p className="text-xs text-zinc-400 mt-1">Consulta inicial</p>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">2. Fecha y horario</h2>

                    <div className="flex items-center gap-3 max-w-xs">
                        <Calendar className="w-4 h-4 text-zinc-400" />
                        <input
                            type="date"
                            value={date}
                            onChange={(event) => setDate(event.target.value)}
                            min={dateToInputValue(new Date())}
                            max={dateToInputValue(new Date(new Date().setDate(new Date().getDate() + 90)))}
                            className="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-white"
                        />
                    </div>

                    {loadingSlots ? (
                        <div className="flex items-center gap-2 text-zinc-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" /> Cargando horarios...
                        </div>
                    ) : slots.length === 0 ? (
                        <p className="text-sm text-zinc-400">No hay horarios disponibles para esa fecha.</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {slots.map((slot) => {
                                const isSelected = selectedTime === slot.time;
                                return (
                                    <button
                                        key={slot.startIso}
                                        type="button"
                                        onClick={() => setSelectedTime(slot.time)}
                                        className={`rounded-xl border px-3 py-2 text-sm transition-colors ${
                                            isSelected
                                                ? 'border-white bg-white text-black'
                                                : 'border-zinc-700 hover:border-zinc-500 text-zinc-100'
                                        }`}
                                    >
                                        <span className="inline-flex items-center gap-2">
                                            <Clock className="w-3.5 h-3.5" /> {slot.time}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </section>

                <section className="space-y-4">
                    <h2 className="text-sm uppercase tracking-[0.2em] text-zinc-400">3. Tus datos</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <label className="space-y-1 text-sm">
                            <span className="text-zinc-400 inline-flex items-center gap-2"><UserRound className="w-3.5 h-3.5" /> Nombre</span>
                            <input
                                value={nombre}
                                onChange={(event) => setNombre(event.target.value)}
                                required
                                className="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-white"
                            />
                        </label>

                        <label className="space-y-1 text-sm">
                            <span className="text-zinc-400">Apellido</span>
                            <input
                                value={apellido}
                                onChange={(event) => setApellido(event.target.value)}
                                required
                                className="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-white"
                            />
                        </label>

                        <label className="space-y-1 text-sm">
                            <span className="text-zinc-400 inline-flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Email</span>
                            <input
                                type="email"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                                required
                                className="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-white"
                            />
                        </label>

                        <label className="space-y-1 text-sm">
                            <span className="text-zinc-400 inline-flex items-center gap-2"><Phone className="w-3.5 h-3.5" /> WhatsApp (opcional)</span>
                            <input
                                value={whatsapp}
                                onChange={(event) => setWhatsapp(event.target.value)}
                                className="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-white"
                            />
                        </label>
                    </div>

                    <label className="space-y-1 text-sm block">
                        <span className="text-zinc-400">Comentario breve (opcional)</span>
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            rows={3}
                            className="w-full bg-zinc-900/60 border border-zinc-700 rounded-xl px-3 py-2 outline-none focus:border-white"
                            placeholder="Ej: tema principal de consulta"
                        />
                    </label>
                </section>

                {error && (
                    <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                        {error}
                    </div>
                )}

                {bookingResult?.success && bookingResult.appointment && (
                    <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100 space-y-2">
                        <p className="font-medium">Turno confirmado.</p>
                        <p>
                            {bookingResult.appointment.patientName}, tu consulta quedo reservada para
                            {' '}
                            <strong>{formatAppointmentDate(bookingResult.appointment.startTime)}</strong>
                            {' '}con <strong>{bookingResult.appointment.doctorName}</strong>.
                        </p>
                        <p>Te enviamos confirmacion al email registrado.</p>
                        {bookingResult.warnings && bookingResult.warnings.length > 0 && (
                            <ul className="text-xs text-amber-200 list-disc ml-4 space-y-1">
                                {bookingResult.warnings.map((warning) => (
                                    <li key={warning}>{warning}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

                <button
                    type="submit"
                    disabled={submitting || !doctorId || !selectedTime}
                    className="w-full md:w-auto px-7 py-3 rounded-full bg-white text-black text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                >
                    {submitting ? (
                        <>
                            <Loader2 className="w-4 h-4 animate-spin" /> Reservando...
                        </>
                    ) : (
                        'Confirmar turno'
                    )}
                </button>
            </form>
        </div>
    );
}
