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

type SharePayload = {
    doctorId: string;
    date: string;
    exp: number;
};

const ALLOWED_SHARE_CATEGORIES = new Set(['owner', 'admin', 'reception', 'asistente', 'developer']);

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
        doctorName: profile?.full_name || 'Profesional',
        date: safeDate,
        appointments: ((appointments || []) as AgendaRow[]).map(mapAgendaRow),
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

    if (!payload.doctorId || !payload.date || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
        return { success: false as const, error: 'Link vencido o inválido' };
    }

    const agenda = await getMinimalDoctorAgendaDay(payload.doctorId, payload.date);
    return { success: true as const, agenda, expiresAt: new Date(payload.exp * 1000).toISOString() };
}
