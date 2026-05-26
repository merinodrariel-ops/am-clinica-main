import type {
    AmSupabaseClient,
    AppointmentResult,
    AvailabilitySlot,
    CreateAppointmentInput,
    DoctorResult,
    PatientSearchResult,
    SlotConflict,
} from './types';

export const ACTIVE_APPOINTMENT_STATUSES = ['confirmed', 'pending', 'arrived', 'in_progress'] as const;

const DEFAULT_TIMEZONE_OFFSET = '-03:00';
const DEFAULT_STEP_MINUTES = 15;
const DEFAULT_DURATION_MINUTES = 30;
const MAX_RANGE_DAYS = 45;

type PatientRow = {
    id_paciente: string;
    nombre: string | null;
    apellido: string | null;
    whatsapp: string | null;
    email: string | null;
    documento: string | null;
    estado_paciente: string | null;
    fecha_alta?: string | null;
    ciudad?: string | null;
    zona_barrio?: string | null;
    link_historia_clinica?: string | null;
    link_google_slides?: string | null;
};

type DoctorRow = {
    user_id: string | null;
    nombre: string | null;
    apellido: string | null;
};

type ProfileRow = {
    id: string;
    full_name: string | null;
    categoria: string | null;
};

type AppointmentRow = {
    id: string;
    title: string | null;
    patient_id: string | null;
    doctor_id: string | null;
    start_time: string;
    end_time: string;
    status: string;
    type: string;
    notes: string | null;
    source: string | null;
    patient_data?: PatientRow | PatientRow[] | null;
    doctor_data?: ProfileRow | ProfileRow[] | null;
};

type ScheduleRow = {
    doctor_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes: number | null;
    buffer_minutes: number | null;
    is_active: boolean | null;
};

type BlockRow = {
    id: string;
    doctor_id: string | null;
    start_time: string;
    end_time: string;
    reason: string | null;
};

export function normalizeText(value: string | null | undefined): string {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

export function getSearchTokens(search: string): string[] {
    return normalizeText(search)
        .split(/\s+/)
        .map((token) => token.trim())
        .filter(Boolean);
}

function escapeSupabaseSearchTerm(term: string): string {
    return term.replace(/[%_,]/g, '\\$&');
}

function patientFullName(patient: Pick<PatientRow, 'nombre' | 'apellido'>): string {
    return `${patient.nombre ?? ''} ${patient.apellido ?? ''}`.trim() || 'Paciente';
}

function mapPatient(patient: PatientRow): PatientSearchResult {
    return {
        id: patient.id_paciente,
        nombre: patient.nombre,
        apellido: patient.apellido,
        fullName: patientFullName(patient),
        whatsapp: patient.whatsapp,
        email: patient.email,
        documento: patient.documento,
        estado: patient.estado_paciente,
    };
}

function firstJoin<T>(value: T | T[] | null | undefined): T | null {
    if (!value) return null;
    return Array.isArray(value) ? value[0] ?? null : value;
}

function mapAppointment(row: AppointmentRow): AppointmentResult {
    const patient = firstJoin(row.patient_data);
    const doctor = firstJoin(row.doctor_data);

    return {
        id: row.id,
        title: row.title,
        patientId: row.patient_id,
        patientName: patient ? patientFullName(patient) : null,
        doctorId: row.doctor_id,
        doctorName: doctor?.full_name ?? null,
        startTime: row.start_time,
        endTime: row.end_time,
        status: row.status,
        type: row.type,
        notes: row.notes,
        source: row.source,
    };
}

function assertIsoDateTime(value: string, field: string): Date {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${field} must be a valid ISO datetime`);
    }
    return parsed;
}

export function addMinutes(date: Date, minutes: number): Date {
    return new Date(date.getTime() + minutes * 60_000);
}

export function rangesOverlap(
    startA: Date,
    endA: Date,
    startB: Date,
    endB: Date,
): boolean {
    return startA < endB && endA > startB;
}

export function dayOfWeekForClinicDate(date: string): number {
    return new Date(`${date}T12:00:00${DEFAULT_TIMEZONE_OFFSET}`).getDay();
}

export function clinicDateTime(date: string, time: string): Date {
    return new Date(`${date}T${time}${DEFAULT_TIMEZONE_OFFSET}`);
}

function assertRange(start: Date, end: Date): void {
    if (end <= start) {
        throw new Error('endTime must be after startTime');
    }

    const days = (end.getTime() - start.getTime()) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
        throw new Error(`Date ranges are limited to ${MAX_RANGE_DAYS} days`);
    }
}

function formatSupabaseOrForPatients(tokens: string[]): string {
    const terms = Array.from(new Set([tokens.join(' '), ...tokens])).filter(Boolean);
    return terms.flatMap((rawTerm) => {
        const term = `%${escapeSupabaseSearchTerm(rawTerm)}%`;
        return [
            `apellido.ilike.${term}`,
            `nombre.ilike.${term}`,
            `email.ilike.${term}`,
            `documento.ilike.${term}`,
            `whatsapp.ilike.${term}`,
        ];
    }).join(',');
}

function patientMatchesTokens(patient: PatientRow, tokens: string[]): boolean {
    const haystack = normalizeText([
        patient.apellido,
        patient.nombre,
        `${patient.apellido ?? ''} ${patient.nombre ?? ''}`,
        `${patient.nombre ?? ''} ${patient.apellido ?? ''}`,
        patient.email,
        patient.documento,
        patient.whatsapp,
    ].filter(Boolean).join(' '));

    return tokens.every((token) => haystack.includes(token));
}

export async function searchPatients(
    supabase: AmSupabaseClient,
    search: string,
    limit = 10,
): Promise<PatientSearchResult[]> {
    const tokens = getSearchTokens(search);
    if (tokens.length === 0) return [];

    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente,nombre,apellido,whatsapp,email,documento,estado_paciente')
        .eq('is_deleted', false)
        .or(formatSupabaseOrForPatients(tokens))
        .order('apellido', { ascending: true })
        .limit(tokens.length > 1 ? 100 : limit);

    if (error) throw new Error(`searchPatients failed: ${error.message}`);

    return ((data ?? []) as PatientRow[])
        .filter((patient) => patientMatchesTokens(patient, tokens))
        .slice(0, limit)
        .map(mapPatient);
}

export async function getPatientSummary(
    supabase: AmSupabaseClient,
    patientId: string,
): Promise<{ patient: PatientSearchResult & Pick<PatientRow, 'fecha_alta' | 'ciudad' | 'zona_barrio' | 'link_historia_clinica' | 'link_google_slides'>; upcomingAppointments: AppointmentResult[] }> {
    const { data: patient, error } = await supabase
        .from('pacientes')
        .select('id_paciente,nombre,apellido,whatsapp,email,documento,estado_paciente,fecha_alta,ciudad,zona_barrio,link_historia_clinica,link_google_slides')
        .eq('id_paciente', patientId)
        .eq('is_deleted', false)
        .single();

    if (error) throw new Error(`getPatientSummary failed: ${error.message}`);

    const upcomingAppointments = await getPatientAppointments(supabase, patientId, 5, true);
    return {
        patient: {
            ...mapPatient(patient as PatientRow),
            fecha_alta: patient.fecha_alta,
            ciudad: patient.ciudad,
            zona_barrio: patient.zona_barrio,
            link_historia_clinica: patient.link_historia_clinica,
            link_google_slides: patient.link_google_slides,
        },
        upcomingAppointments,
    };
}

export async function getPatientAppointments(
    supabase: AmSupabaseClient,
    patientId: string,
    limit = 10,
    upcomingOnly = false,
): Promise<AppointmentResult[]> {
    let query = supabase
        .from('agenda_appointments')
        .select('id,title,patient_id,doctor_id,start_time,end_time,status,type,notes,source,patient_data:patient_id(nombre,apellido),doctor_data:doctor_id(id,full_name,categoria)')
        .eq('patient_id', patientId)
        .order('start_time', { ascending: upcomingOnly })
        .limit(limit);

    if (upcomingOnly) {
        query = query.gte('start_time', new Date().toISOString()).not('status', 'in', '("cancelled","no_show")');
    }

    const { data, error } = await query;
    if (error) throw new Error(`getPatientAppointments failed: ${error.message}`);
    return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
}

export async function listDoctors(supabase: AmSupabaseClient): Promise<DoctorResult[]> {
    const { data: staff, error: staffError } = await supabase
        .from('personal')
        .select('user_id,nombre,apellido')
        .eq('activo', true)
        .in('tipo', ['odontologo', 'profesional'])
        .not('user_id', 'is', null)
        .order('nombre');

    if (staffError) throw new Error(`listDoctors staff failed: ${staffError.message}`);

    const userIds = ((staff ?? []) as DoctorRow[])
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id));

    if (userIds.length === 0) return [];

    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id,full_name,categoria')
        .in('id', userIds);

    if (profileError) throw new Error(`listDoctors profiles failed: ${profileError.message}`);

    const profileById = new Map(((profiles ?? []) as ProfileRow[]).map((profile) => [profile.id, profile]));

    return ((staff ?? []) as DoctorRow[])
        .map((row) => {
            if (!row.user_id) return null;
            const profile = profileById.get(row.user_id);
            if (!profile) return null;
            const fallbackName = `${row.nombre ?? ''} ${row.apellido ?? ''}`.trim();
            return {
                id: profile.id,
                fullName: profile.full_name ?? fallbackName ?? 'Odontologo',
                role: profile.categoria,
            };
        })
        .filter((doctor): doctor is DoctorResult => Boolean(doctor))
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es', { sensitivity: 'base' }));
}

export async function getAgenda(
    supabase: AmSupabaseClient,
    startTime: string,
    endTime: string,
    doctorId?: string,
): Promise<AppointmentResult[]> {
    const start = assertIsoDateTime(startTime, 'startTime');
    const end = assertIsoDateTime(endTime, 'endTime');
    assertRange(start, end);

    let query = supabase
        .from('agenda_appointments')
        .select('id,title,patient_id,doctor_id,start_time,end_time,status,type,notes,source,patient_data:patient_id(nombre,apellido),doctor_data:doctor_id(id,full_name,categoria)')
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString())
        .order('start_time', { ascending: true });

    if (doctorId) query = query.eq('doctor_id', doctorId);

    const { data, error } = await query;
    if (error) throw new Error(`getAgenda failed: ${error.message}`);
    return ((data ?? []) as AppointmentRow[]).map(mapAppointment);
}

async function getDoctorOrThrow(supabase: AmSupabaseClient, doctorId: string): Promise<DoctorResult> {
    const doctors = await listDoctors(supabase);
    const doctor = doctors.find((item) => item.id === doctorId);
    if (!doctor) throw new Error('Doctor not found or inactive');
    return doctor;
}

async function getPatientOrThrow(supabase: AmSupabaseClient, patientId: string): Promise<PatientSearchResult> {
    const { data, error } = await supabase
        .from('pacientes')
        .select('id_paciente,nombre,apellido,whatsapp,email,documento,estado_paciente')
        .eq('id_paciente', patientId)
        .eq('is_deleted', false)
        .single();

    if (error) throw new Error('Patient not found');
    return mapPatient(data as PatientRow);
}

async function findConflicts(
    supabase: AmSupabaseClient,
    doctorId: string,
    start: Date,
    end: Date,
): Promise<SlotConflict[]> {
    const [{ data: appointments, error: appointmentError }, { data: blocks, error: blockError }] = await Promise.all([
        supabase
            .from('agenda_appointments')
            .select('id,title,start_time,end_time,status')
            .eq('doctor_id', doctorId)
            .lt('start_time', end.toISOString())
            .gt('end_time', start.toISOString())
            .in('status', [...ACTIVE_APPOINTMENT_STATUSES]),
        supabase
            .from('agenda_blocks')
            .select('id,doctor_id,start_time,end_time,reason')
            .lt('start_time', end.toISOString())
            .gt('end_time', start.toISOString())
            .or(`doctor_id.is.null,doctor_id.eq.${doctorId}`),
    ]);

    if (appointmentError) throw new Error(`appointment conflict check failed: ${appointmentError.message}`);
    if (blockError) throw new Error(`block conflict check failed: ${blockError.message}`);

    return [
        ...((appointments ?? []) as Array<{ id: string; title: string | null; start_time: string; end_time: string }>).map((row) => ({
            kind: 'appointment' as const,
            id: row.id,
            title: row.title,
            startTime: row.start_time,
            endTime: row.end_time,
        })),
        ...((blocks ?? []) as BlockRow[]).map((row) => ({
            kind: 'block' as const,
            id: row.id,
            title: row.reason,
            startTime: row.start_time,
            endTime: row.end_time,
        })),
    ];
}

async function getActiveDoctorSchedulesForDate(
    supabase: AmSupabaseClient,
    doctorId: string,
    date: string,
): Promise<ScheduleRow[]> {
    const dayOfWeek = dayOfWeekForClinicDate(date);
    const { data, error } = await supabase
        .from('doctor_schedules')
        .select('doctor_id,day_of_week,start_time,end_time,slot_duration_minutes,buffer_minutes,is_active')
        .eq('doctor_id', doctorId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true);

    if (error) throw new Error(`doctor schedule lookup failed: ${error.message}`);
    return (data ?? []) as ScheduleRow[];
}

export function clinicDateFromDateTime(date: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(date);
}

async function assertWithinDoctorSchedule(
    supabase: AmSupabaseClient,
    doctorId: string,
    start: Date,
    end: Date,
): Promise<void> {
    const clinicDate = clinicDateFromDateTime(start);
    if (clinicDate !== clinicDateFromDateTime(end)) {
        throw new Error('Appointments must start and end on the same clinic date');
    }

    const schedules = await getActiveDoctorSchedulesForDate(supabase, doctorId, clinicDate);
    const withinSchedule = schedules.some((schedule) => {
        const scheduleStart = clinicDateTime(clinicDate, schedule.start_time);
        const scheduleEnd = clinicDateTime(clinicDate, schedule.end_time);
        return start >= scheduleStart && end <= scheduleEnd;
    });

    if (!withinSchedule) {
        throw new Error('Appointment is outside the doctor active schedule');
    }
}

export async function findAvailableSlots(
    supabase: AmSupabaseClient,
    doctorId: string,
    date: string,
    durationMinutes = DEFAULT_DURATION_MINUTES,
    stepMinutes = DEFAULT_STEP_MINUTES,
): Promise<AvailabilitySlot[]> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new Error('date must use YYYY-MM-DD format');
    }
    if (durationMinutes < 10 || durationMinutes > 240) {
        throw new Error('durationMinutes must be between 10 and 240');
    }
    if (stepMinutes < 5 || stepMinutes > 120) {
        throw new Error('stepMinutes must be between 5 and 120');
    }

    const doctor = await getDoctorOrThrow(supabase, doctorId);
    const schedules = await getActiveDoctorSchedulesForDate(supabase, doctorId, date);
    if (schedules.length === 0) return [];

    const dayStart = clinicDateTime(date, '00:00:00');
    const dayEnd = clinicDateTime(date, '23:59:59');
    const conflicts = await findConflicts(supabase, doctorId, dayStart, dayEnd);

    const slots: AvailabilitySlot[] = [];
    for (const schedule of schedules) {
        const scheduleStart = clinicDateTime(date, schedule.start_time);
        const scheduleEnd = clinicDateTime(date, schedule.end_time);
        const effectiveStep = schedule.slot_duration_minutes ?? stepMinutes;
        const bufferMinutes = schedule.buffer_minutes ?? 0;

        for (let slotStart = scheduleStart; addMinutes(slotStart, durationMinutes) <= scheduleEnd; slotStart = addMinutes(slotStart, effectiveStep || stepMinutes)) {
            const slotEnd = addMinutes(slotStart, durationMinutes);
            const bufferedStart = addMinutes(slotStart, -bufferMinutes);
            const bufferedEnd = addMinutes(slotEnd, bufferMinutes);
            const hasConflict = conflicts.some((conflict) => (
                rangesOverlap(bufferedStart, bufferedEnd, new Date(conflict.startTime), new Date(conflict.endTime))
            ));

            if (!hasConflict) {
                slots.push({
                    startTime: slotStart.toISOString(),
                    endTime: slotEnd.toISOString(),
                    doctorId,
                    doctorName: doctor.fullName,
                });
            }
        }
    }

    return slots;
}

export async function createAppointmentDirect(
    supabase: AmSupabaseClient,
    input: CreateAppointmentInput,
): Promise<{ appointment: AppointmentResult; patient: PatientSearchResult; doctor: DoctorResult }> {
    const patient = await getPatientOrThrow(supabase, input.patientId);
    const doctor = await getDoctorOrThrow(supabase, input.doctorId);
    const start = assertIsoDateTime(input.startTime, 'startTime');
    const end = input.endTime
        ? assertIsoDateTime(input.endTime, 'endTime')
        : addMinutes(start, input.durationMinutes ?? DEFAULT_DURATION_MINUTES);
    assertRange(start, end);
    await assertWithinDoctorSchedule(supabase, input.doctorId, start, end);

    const conflicts = await findConflicts(supabase, input.doctorId, start, end);
    if (conflicts.length > 0) {
        throw new Error(`Appointment conflicts with existing ${conflicts[0].kind}: ${conflicts[0].title ?? conflicts[0].id}`);
    }

    const title = input.title?.trim() || `${patient.fullName} - ${input.type ?? 'consulta'}`;
    const { data, error } = await supabase
        .from('agenda_appointments')
        .insert({
            title,
            patient_id: input.patientId,
            doctor_id: input.doctorId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            status: input.status ?? 'confirmed',
            type: input.type ?? 'consulta',
            notes: input.notes ?? null,
            created_by: input.createdBy ?? null,
            source: 'mcp',
        })
        .select('id,title,patient_id,doctor_id,start_time,end_time,status,type,notes,source,patient_data:patient_id(nombre,apellido),doctor_data:doctor_id(id,full_name,categoria)')
        .single();

    if (error) throw new Error(`createAppointmentDirect failed: ${error.message}`);

    return {
        appointment: mapAppointment(data as AppointmentRow),
        patient,
        doctor,
    };
}
