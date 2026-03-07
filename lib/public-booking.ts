import { createAdminClient } from '@/utils/supabase/admin';

const AR_OFFSET = '-03:00';
const BLOCKING_STATUSES = new Set(['confirmed', 'pending', 'arrived', 'in_progress', 'completed']);

export const MAX_BOOKING_DAYS_AHEAD = 90;

type StaffRow = {
    user_id: string | null;
    nombre: string | null;
    apellido: string | null;
};

type ProfileRow = {
    id: string;
    full_name: string | null;
    is_active: boolean | null;
};

type ScheduleRow = {
    doctor_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    slot_duration_minutes: number;
    buffer_minutes: number;
    max_appointments: number;
    is_active: boolean;
};

type AppointmentRow = {
    id: string;
    start_time: string;
    end_time: string;
    status: string;
};

type DoctorModeRow = {
    doctor_id: string;
    booking_mode: 'merino' | 'staff';
    is_active: boolean;
};

export type BookingMode = 'all' | 'merino' | 'staff';

export interface PublicDoctor {
    id: string;
    full_name: string;
}

export interface PublicSlot {
    time: string;
    startIso: string;
    endIso: string;
}

function normalizeText(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function isLikelyMerinoDoctorName(fullName: string): boolean {
    const normalized = normalizeText(fullName);
    return normalized.includes('ariel') && normalized.includes('merino');
}

export function normalizeBookingMode(value?: string): BookingMode {
    const normalized = (value || '').toLowerCase().trim();
    if (normalized === 'merino' || normalized === 'staff') return normalized;
    return 'all';
}

export function parseDateOnlyLocal(dateStr: string): Date | null {
    const parts = dateStr.split('-').map(Number);
    if (parts.length !== 3) return null;

    const [year, month, day] = parts;
    if (!year || !month || !day) return null;
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > 31) return null;

    const d = new Date(year, month - 1, day);
    if (Number.isNaN(d.getTime())) return null;
    return d;
}

export function isDateWithinBookingWindow(dateStr: string): boolean {
    const localDate = parseDateOnlyLocal(dateStr);
    if (!localDate) return false;

    const today = new Date();
    const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const maxDate = new Date(todayLocal);
    maxDate.setDate(maxDate.getDate() + MAX_BOOKING_DAYS_AHEAD);

    return localDate >= todayLocal && localDate <= maxDate;
}

export function parseClockToMinutes(clock: string): number | null {
    const match = /^(\d{2}):(\d{2})$/.exec(clock);
    if (!match) return null;

    const hour = Number(match[1]);
    const minute = Number(match[2]);

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
}

export function minutesToClock(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60)
        .toString()
        .padStart(2, '0');
    const m = Math.floor(totalMinutes % 60)
        .toString()
        .padStart(2, '0');
    return `${h}:${m}`;
}

export function toArIso(date: string, time: string): string {
    return `${date}T${time}:00${AR_OFFSET}`;
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
    return startA < endB && endA > startB;
}

export async function listPublicDoctors(mode: BookingMode = 'all'): Promise<PublicDoctor[]> {
    const admin = createAdminClient();

    const { data: staff, error: staffError } = await admin
        .from('personal')
        .select('user_id, nombre, apellido')
        .eq('activo', true)
        .in('tipo', ['odontologo', 'profesional'])
        .not('user_id', 'is', null)
        .order('nombre', { ascending: true });

    if (staffError) throw new Error(staffError.message);

    const staffRows = (staff || []) as StaffRow[];
    const userIds = staffRows
        .map((row) => row.user_id)
        .filter((id): id is string => Boolean(id));

    if (userIds.length === 0) {
        return [];
    }

    const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id, full_name, is_active')
        .in('id', userIds);

    if (profileError) throw new Error(profileError.message);

    const profileRows = (profiles || []) as ProfileRow[];
    const profileById = new Map(profileRows.map((row) => [row.id, row]));

    const doctors = staffRows
        .map((row) => {
            if (!row.user_id) return null;
            const profile = profileById.get(row.user_id);
            if (!profile || profile.is_active === false) return null;

            const fallbackName = `${row.nombre || ''} ${row.apellido || ''}`.trim();
            return {
                id: row.user_id,
                full_name: profile.full_name || fallbackName || 'Profesional',
            };
        })
        .filter((doctor): doctor is PublicDoctor => Boolean(doctor))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, 'es', { sensitivity: 'base' }));

    const normalizedMode = normalizeBookingMode(mode);
    if (normalizedMode === 'all' || doctors.length === 0) return doctors;

    const doctorIds = doctors.map((doctor) => doctor.id);
    const { data: modeRows, error: modeError } = await admin
        .from('public_booking_doctor_modes')
        .select('doctor_id, booking_mode, is_active')
        .eq('is_active', true)
        .in('doctor_id', doctorIds);

    if (modeError) throw new Error(modeError.message);

    const activeModeRows = ((modeRows || []) as DoctorModeRow[])
        .filter((row) => row.is_active);

    if (activeModeRows.length > 0) {
        const allowedDoctorIds = new Set(
            activeModeRows
                .filter((row) => row.booking_mode === normalizedMode)
                .map((row) => row.doctor_id)
        );

        if (allowedDoctorIds.size > 0) {
            return doctors.filter((doctor) => allowedDoctorIds.has(doctor.id));
        }
    }

    // Backward-compatible fallback for environments without explicit mode mapping.
    return doctors.filter((doctor) => {
        const isMerino = isLikelyMerinoDoctorName(doctor.full_name);
        return normalizedMode === 'merino' ? isMerino : !isMerino;
    });
}

export async function getPublicDoctorById(doctorId: string): Promise<PublicDoctor | null> {
    const doctors = await listPublicDoctors();
    return doctors.find((doctor) => doctor.id === doctorId) || null;
}

export async function getDoctorScheduleForDate(doctorId: string, dateStr: string): Promise<ScheduleRow | null> {
    const localDate = parseDateOnlyLocal(dateStr);
    if (!localDate) return null;

    const dayOfWeek = localDate.getDay();
    const admin = createAdminClient();

    const { data, error } = await admin
        .from('doctor_schedules')
        .select('doctor_id, day_of_week, start_time, end_time, slot_duration_minutes, buffer_minutes, max_appointments, is_active')
        .eq('doctor_id', doctorId)
        .eq('day_of_week', dayOfWeek)
        .eq('is_active', true)
        .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return null;

    return data as ScheduleRow;
}

export async function getDoctorAppointmentsForDate(doctorId: string, dateStr: string): Promise<AppointmentRow[]> {
    const admin = createAdminClient();

    const dayStart = `${dateStr}T00:00:00${AR_OFFSET}`;
    const dayEnd = `${dateStr}T23:59:59${AR_OFFSET}`;

    const { data, error } = await admin
        .from('agenda_appointments')
        .select('id, start_time, end_time, status')
        .eq('doctor_id', doctorId)
        .gte('start_time', dayStart)
        .lte('start_time', dayEnd);

    if (error) throw new Error(error.message);

    return ((data || []) as AppointmentRow[]).filter((row) => BLOCKING_STATUSES.has(String(row.status)));
}

export function buildAvailableSlots(
    schedule: ScheduleRow,
    appointments: AppointmentRow[],
    dateStr: string,
    now = new Date()
): PublicSlot[] {
    const startMinutes = parseClockToMinutes(schedule.start_time.slice(0, 5));
    const endMinutes = parseClockToMinutes(schedule.end_time.slice(0, 5));

    if (startMinutes === null || endMinutes === null) return [];
    if (endMinutes <= startMinutes) return [];

    const slotDuration = Math.max(5, Number(schedule.slot_duration_minutes) || 30);
    const bufferMinutes = Math.max(0, Number(schedule.buffer_minutes) || 0);
    const step = slotDuration + bufferMinutes;

    if (Number(schedule.max_appointments) > 0 && appointments.length >= Number(schedule.max_appointments)) {
        return [];
    }

    const slots: PublicSlot[] = [];
    const nowMs = now.getTime();

    for (let current = startMinutes; current + slotDuration <= endMinutes; current += step) {
        const clock = minutesToClock(current);
        const startIso = toArIso(dateStr, clock);
        const startMs = new Date(startIso).getTime();

        if (startMs <= nowMs) continue;

        const endMs = startMs + slotDuration * 60_000;
        const isBusy = appointments.some((appointment) => {
            const appointmentStart = new Date(appointment.start_time).getTime();
            const appointmentEnd = new Date(appointment.end_time).getTime();
            return overlaps(startMs, endMs, appointmentStart, appointmentEnd);
        });

        if (isBusy) continue;

        slots.push({
            time: clock,
            startIso,
            endIso: new Date(endMs).toISOString(),
        });
    }

    return slots;
}

export function isTimeAlignedWithSchedule(time: string, schedule: ScheduleRow): boolean {
    const selectedMinutes = parseClockToMinutes(time);
    const startMinutes = parseClockToMinutes(schedule.start_time.slice(0, 5));
    const endMinutes = parseClockToMinutes(schedule.end_time.slice(0, 5));

    if (selectedMinutes === null || startMinutes === null || endMinutes === null) return false;

    const slotDuration = Math.max(5, Number(schedule.slot_duration_minutes) || 30);
    const bufferMinutes = Math.max(0, Number(schedule.buffer_minutes) || 0);
    const step = slotDuration + bufferMinutes;

    if (selectedMinutes < startMinutes) return false;
    if (selectedMinutes + slotDuration > endMinutes) return false;
    if ((selectedMinutes - startMinutes) % step !== 0) return false;

    return true;
}
