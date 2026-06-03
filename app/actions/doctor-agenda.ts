'use server';

import crypto from 'crypto';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { getLocalISODate } from '@/lib/local-date';

type PatientName = {
    nombre?: string | null;
    apellido?: string | null;
};

type AgendaRow = {
    id: string;
    title: string | null;
    start_time: string;
    end_time: string;
    status: string | null;
    type: string | null;
    patient_data?: PatientName | PatientName[] | null;
};

export type MinimalDoctorAppointment = {
    id: string;
    patientName: string;
    title: string;
    type: string;
    status: string;
    startTime: string;
    endTime: string;
    durationMinutes: number;
};

export type DoctorAgendaDay = {
    doctorId: string;
    doctorName: string;
    date: string;
    appointments: MinimalDoctorAppointment[];
};

export type DoctorAgendaShare = {
    doctorId: string;
    doctorName: string;
    startDate: string;
    endDate: string;
    days: DoctorAgendaDay[];
};

export type AllDoctorsAgendaDay = {
    date: string;
    doctors: DoctorAgendaDay[];
};

export type AllDoctorsAgendaShare = {
    startDate: string;
    endDate: string;
    days: AllDoctorsAgendaDay[];
};

type SharePayload = {
    scope?: 'doctor' | 'all';
    doctorId?: string;
    date: string;
    exp: number;
    mode?: 'day' | 'range';
    days?: number;
};

const ALLOWED_SHARE_CATEGORIES = new Set(['owner', 'admin', 'reception', 'developer', 'partner_viewer']);

function getAdminClient() {
    return createAdminClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
}

function tokenSecret() {
    return process.env.DOCTOR_AGENDA_SHARE_SECRET
        || process.env.SUPABASE_SERVICE_ROLE_KEY
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        || 'am-clinica-dev-secret';
}

function base64UrlEncode(value: string) {
    return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value: string) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload: string) {
    return crypto
        .createHmac('sha256', tokenSecret())
        .update(encodedPayload)
        .digest('base64url');
}

function normalizeDateInput(date?: string | null) {
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
    return getLocalISODate();
}

function dayBounds(date: string) {
    return {
        start: `${date}T00:00:00-03:00`,
        end: `${date}T23:59:59-03:00`,
    };
}

function addDays(date: string, days: number) {
    const [year, month, day] = date.split('-').map(Number);
    const value = new Date(year, month - 1, day);
    value.setDate(value.getDate() + days);
    return getLocalISODate(value);
}

function clampRangeDays(days?: number | null) {
    if (!days || !Number.isFinite(days)) return 60;
    return Math.max(1, Math.min(90, Math.round(days)));
}

function timeLabel(value: string) {
    return new Date(value).toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Argentina/Buenos_Aires',
    });
}

function durationMinutes(start: string, end: string) {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (!Number.isFinite(diff) || diff <= 0) return 0;
    return Math.round(diff / 60000);
}

function normalizePatientName(patient?: PatientName | PatientName[] | null) {
    const row = Array.isArray(patient) ? patient[0] : patient;
    const name = `${row?.nombre || ''} ${row?.apellido || ''}`.trim();
    return name || 'Paciente';
}

function mapAgendaRow(row: AgendaRow): MinimalDoctorAppointment {
    return {
        id: row.id,
        patientName: normalizePatientName(row.patient_data),
        title: row.title || row.type || 'Turno',
        type: row.type || 'turno',
        status: row.status || 'confirmed',
        startTime: timeLabel(row.start_time),
        endTime: timeLabel(row.end_time),
        durationMinutes: durationMinutes(row.start_time, row.end_time),
    };
}

function normalizeDoctorName(value?: string | null) {
    return value?.trim() || 'Profesional';
}

function getDoctorIdsFromAgendaRows(rows: { doctor_id?: string | null }[]) {
    return Array.from(new Set(rows.map(row => row.doctor_id).filter((id): id is string => Boolean(id))));
}

async function getDoctorNameMap(admin: ReturnType<typeof getAdminClient>, doctorIds: string[]) {
    if (doctorIds.length === 0) return new Map<string, string>();

    const { data, error } = await admin
        .from('profiles')
        .select('id, full_name')
        .in('id', doctorIds);

    if (error) {
        console.error('[getDoctorNameMap] profiles error:', error);
        return new Map<string, string>();
    }

    return new Map((data || []).map(row => [row.id, normalizeDoctorName(row.full_name)]));
}

export async function getMinimalDoctorAgendaDay(doctorId: string, date?: string | null): Promise<DoctorAgendaDay> {
    const safeDate = normalizeDateInput(date);
    const { start, end } = dayBounds(safeDate);
    const admin = getAdminClient();

    const [{ data: profile }, { data: appointments, error }] = await Promise.all([
        admin
            .from('profiles')
            .select('id, full_name')
            .eq('id', doctorId)
            .maybeSingle(),
        admin
            .from('agenda_appointments')
            .select('id, title, start_time, end_time, status, type, patient_data:patient_id(nombre, apellido)')
            .eq('doctor_id', doctorId)
            .gte('start_time', start)
            .lte('start_time', end)
            .order('start_time', { ascending: true }),
    ]);

    if (error) {
        console.error('[getMinimalDoctorAgendaDay] agenda error:', error);
        return {
            doctorId,
            doctorName: profile?.full_name || 'Profesional',
            date: safeDate,
            appointments: [],
        };
    }

    return {
        doctorId,
        doctorName: normalizeDoctorName(profile?.full_name),
        date: safeDate,
        appointments: ((appointments || []) as AgendaRow[]).map(mapAgendaRow),
    };
}

export async function getMinimalDoctorAgendaRange(
    doctorId: string,
    startDate?: string | null,
    days?: number | null
): Promise<DoctorAgendaShare> {
    const safeStartDate = normalizeDateInput(startDate);
    const rangeDays = clampRangeDays(days);
    const safeEndDate = addDays(safeStartDate, rangeDays - 1);
    const admin = getAdminClient();
    const { start } = dayBounds(safeStartDate);
    const { end } = dayBounds(safeEndDate);

    const [{ data: profile }, { data: appointments, error }] = await Promise.all([
        admin
            .from('profiles')
            .select('id, full_name')
            .eq('id', doctorId)
            .maybeSingle(),
        admin
            .from('agenda_appointments')
            .select('id, title, start_time, end_time, status, type, patient_data:patient_id(nombre, apellido)')
            .eq('doctor_id', doctorId)
            .gte('start_time', start)
            .lte('start_time', end)
            .order('start_time', { ascending: true }),
    ]);

    const doctorName = normalizeDoctorName(profile?.full_name);
    const dayMap = new Map<string, MinimalDoctorAppointment[]>();

    if (error) {
        console.error('[getMinimalDoctorAgendaRange] agenda error:', error);
    } else {
        for (const row of ((appointments || []) as AgendaRow[])) {
            const date = getLocalISODate(new Date(row.start_time));
            if (!dayMap.has(date)) dayMap.set(date, []);
            dayMap.get(date)!.push(mapAgendaRow(row));
        }
    }

    const groupedDays: DoctorAgendaDay[] = Array.from({ length: rangeDays }, (_, index) => {
        const date = addDays(safeStartDate, index);
        return {
            doctorId,
            doctorName,
            date,
            appointments: dayMap.get(date) || [],
        };
    });

    return {
        doctorId,
        doctorName,
        startDate: safeStartDate,
        endDate: safeEndDate,
        days: groupedDays,
    };
}

export async function getMinimalAllDoctorsAgendaRange(
    startDate?: string | null,
    days?: number | null
): Promise<AllDoctorsAgendaShare> {
    const safeStartDate = normalizeDateInput(startDate);
    const rangeDays = clampRangeDays(days);
    const safeEndDate = addDays(safeStartDate, rangeDays - 1);
    const admin = getAdminClient();
    const { start } = dayBounds(safeStartDate);
    const { end } = dayBounds(safeEndDate);

    const { data: appointments, error } = await admin
        .from('agenda_appointments')
        .select('id, title, doctor_id, start_time, end_time, status, type, patient_data:patient_id(nombre, apellido)')
        .not('doctor_id', 'is', null)
        .gte('start_time', start)
        .lte('start_time', end)
        .order('start_time', { ascending: true });

    if (error) {
        console.error('[getMinimalAllDoctorsAgendaRange] agenda error:', error);
    }

    const rows = ((appointments || []) as (AgendaRow & { doctor_id: string | null })[]);
    const doctorNameMap = await getDoctorNameMap(admin, getDoctorIdsFromAgendaRows(rows));
    const dayDoctorMap = new Map<string, Map<string, MinimalDoctorAppointment[]>>();

    for (const row of rows) {
        if (!row.doctor_id) continue;
        const date = getLocalISODate(new Date(row.start_time));
        if (!dayDoctorMap.has(date)) dayDoctorMap.set(date, new Map());
        const doctorMap = dayDoctorMap.get(date)!;
        if (!doctorMap.has(row.doctor_id)) doctorMap.set(row.doctor_id, []);
        doctorMap.get(row.doctor_id)!.push(mapAgendaRow(row));
    }

    const groupedDays: AllDoctorsAgendaDay[] = Array.from({ length: rangeDays }, (_, index) => {
        const date = addDays(safeStartDate, index);
        const doctorMap = dayDoctorMap.get(date) || new Map<string, MinimalDoctorAppointment[]>();
        const doctors = Array.from(doctorMap.entries())
            .map(([doctorId, doctorAppointments]) => ({
                doctorId,
                doctorName: doctorNameMap.get(doctorId) || 'Profesional',
                date,
                appointments: doctorAppointments,
            }))
            .sort((a, b) => a.doctorName.localeCompare(b.doctorName, 'es'));

        return { date, doctors };
    });

    return {
        startDate: safeStartDate,
        endDate: safeEndDate,
        days: groupedDays,
    };
}

export async function getMyMinimalAgendaDay(date?: string | null): Promise<DoctorAgendaDay | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: worker } = await supabase
        .from('personal')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

    if (!worker?.user_id) return null;
    return getMinimalDoctorAgendaDay(worker.user_id, date);
}

export async function createDoctorAgendaShareLink(doctorId: string, date?: string | null) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false as const, error: 'No autenticado' };

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    if (!ALLOWED_SHARE_CATEGORIES.has(profile?.categoria || '')) {
        return { success: false as const, error: 'No tenés permisos para compartir agendas' };
    }

    const safeDate = normalizeDateInput(date);
    const payload: SharePayload = {
        doctorId,
        date: safeDate,
        exp: Math.floor(Date.now() / 1000) + 48 * 60 * 60,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const token = `${encodedPayload}.${signPayload(encodedPayload)}`;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');

    return {
        success: true as const,
        url: `${baseUrl}/agenda-compartida?t=${encodeURIComponent(token)}`,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
}

export async function createDoctorAgendaRangeShareLink(doctorId: string, date?: string | null, days = 60) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false as const, error: 'No autenticado' };

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    if (!ALLOWED_SHARE_CATEGORIES.has(profile?.categoria || '')) {
        return { success: false as const, error: 'No tenés permisos para compartir agendas' };
    }

    const safeDate = normalizeDateInput(date);
    const rangeDays = clampRangeDays(days);
    const payload: SharePayload = {
        doctorId,
        date: safeDate,
        mode: 'range',
        days: rangeDays,
        exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const token = `${encodedPayload}.${signPayload(encodedPayload)}`;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');

    return {
        success: true as const,
        url: `${baseUrl}/agenda-compartida?t=${encodeURIComponent(token)}`,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
}

export async function createAllDoctorsAgendaShareLink(date?: string | null, days = 1) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false as const, error: 'No autenticado' };

    const { data: profile } = await supabase
        .from('profiles')
        .select('categoria')
        .eq('id', user.id)
        .maybeSingle();

    if (!ALLOWED_SHARE_CATEGORIES.has(profile?.categoria || '')) {
        return { success: false as const, error: 'No tenés permisos para compartir agendas' };
    }

    const safeDate = normalizeDateInput(date);
    const rangeDays = Math.max(1, Math.min(30, Math.round(days)));
    const payload: SharePayload = {
        scope: 'all',
        date: safeDate,
        mode: rangeDays > 1 ? 'range' : 'day',
        days: rangeDays,
        exp: Math.floor(Date.now() / 1000) + (rangeDays > 1 ? 7 * 24 * 60 * 60 : 48 * 60 * 60),
    };
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const token = `${encodedPayload}.${signPayload(encodedPayload)}`;
    const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://am-clinica-main.vercel.app').replace(/\/$/, '');

    return {
        success: true as const,
        url: `${baseUrl}/agenda-compartida?t=${encodeURIComponent(token)}`,
        expiresAt: new Date(payload.exp * 1000).toISOString(),
    };
}

export async function getAgendaFromShareToken(token?: string | null) {
    if (!token || !token.includes('.')) {
        return { success: false as const, error: 'Link inválido' };
    }

    const [encodedPayload, signature] = token.split('.');
    const expectedSignature = signPayload(encodedPayload);
    const signatureBuffer = Buffer.from(signature || '');
    const expectedSignatureBuffer = Buffer.from(expectedSignature);
    const validSignature = signatureBuffer.length === expectedSignatureBuffer.length
        && crypto.timingSafeEqual(signatureBuffer, expectedSignatureBuffer);

    if (!validSignature) {
        return { success: false as const, error: 'Link inválido' };
    }

    let payload: SharePayload;
    try {
        payload = JSON.parse(base64UrlDecode(encodedPayload)) as SharePayload;
    } catch {
        return { success: false as const, error: 'Link inválido' };
    }

    if (!payload.date || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
        return { success: false as const, error: 'Link vencido o inválido' };
    }

    if (payload.scope === 'all') {
        const agenda = await getMinimalAllDoctorsAgendaRange(payload.date, payload.days || 1);
        return { success: true as const, mode: 'all' as const, agenda, expiresAt: new Date(payload.exp * 1000).toISOString() };
    }

    if (!payload.doctorId) {
        return { success: false as const, error: 'Link vencido o inválido' };
    }

    if (payload.mode === 'range') {
        const agenda = await getMinimalDoctorAgendaRange(payload.doctorId, payload.date, payload.days);
        return { success: true as const, mode: 'range' as const, agenda, expiresAt: new Date(payload.exp * 1000).toISOString() };
    }

    const agenda = await getMinimalDoctorAgendaDay(payload.doctorId, payload.date);
    return { success: true as const, mode: 'day' as const, agenda, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
