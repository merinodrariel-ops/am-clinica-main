'use server';

import { createAdminClient } from '@/utils/supabase/admin';

export type AgendaMetricsPeriod = 'day' | 'week' | 'month' | 'year';
export type AgendaMetricKey = 'primeras_consultas' | 'limpiezas' | 'controles_anuales';

export type AgendaMetricAppointment = {
    id: string;
    title: string;
    start_time: string;
    status: string;
    patient_id: string | null;
    patient_name: string;
    doctor_name: string;
};

export type AgendaMetric = {
    key: AgendaMetricKey;
    label: string;
    done: number;
    upcoming: number;
    total: number;
    appointments: AgendaMetricAppointment[];
};

export type AgendaMetrics = {
    period: AgendaMetricsPeriod;
    periodLabel: string;
    rangeStart: string;
    rangeEnd: string;
    generatedAt: string;
    metrics: AgendaMetric[];
};

type AgendaMetricRow = {
    id: string;
    title: string | null;
    type: string | null;
    status: string | null;
    start_time: string | null;
    end_time: string | null;
    patient_id: string | null;
    patient: { nombre: string | null; apellido: string | null } | { nombre: string | null; apellido: string | null }[] | null;
    doctor: { full_name: string | null } | { full_name: string | null }[] | null;
};

const CLEANING_TYPES = new Set(['limpieza', 'limpieza_convencional', 'limpieza_laser']);
const IGNORED_STATUSES = new Set(['cancelled', 'no_show']);

const METRIC_LABELS: Record<AgendaMetricKey, string> = {
    primeras_consultas: 'Primeras consultas',
    limpiezas: 'Limpiezas',
    controles_anuales: 'Controles anuales',
};

function normalizeText(value: string | null | undefined) {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function classifyAppointment(row: { type: string | null; title: string | null }): AgendaMetricKey | null {
    const type = row.type ?? '';
    const title = normalizeText(row.title);

    if (type === 'consulta' || title.includes('primera consulta')) {
        return 'primeras_consultas';
    }

    if (CLEANING_TYPES.has(type) || title.includes('limpieza') || title.includes('profilaxis')) {
        return 'limpiezas';
    }

    if (
        type === 'control_carilla_anual' ||
        (title.includes('control') && title.includes('anual') && (title.includes('carilla') || title.includes('veneer') || title.includes('faceta')))
    ) {
        return 'controles_anuales';
    }

    return null;
}

function buildEmptyMetrics(): Record<AgendaMetricKey, { done: number; upcoming: number; appointments: AgendaMetricAppointment[] }> {
    return {
        primeras_consultas: { done: 0, upcoming: 0, appointments: [] },
        limpiezas: { done: 0, upcoming: 0, appointments: [] },
        controles_anuales: { done: 0, upcoming: 0, appointments: [] },
    };
}

function getArgentinaDateParts(date: Date) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        weekday: 'short',
    }).formatToParts(date);

    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    const weekdayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(value('weekday'));

    return {
        year: Number(value('year')),
        month: Number(value('month')),
        day: Number(value('day')),
        weekdayIndex: weekdayIndex >= 0 ? weekdayIndex : 0,
    };
}

function argentinaDate(year: number, month: number, day: number, time = '00:00:00.000') {
    return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${time}-03:00`);
}

function endOfRangeFromNextStart(nextStart: Date) {
    return new Date(nextStart.getTime() - 1);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

function buildPeriodRange(period: AgendaMetricsPeriod, now: Date) {
    const local = getArgentinaDateParts(now);
    const todayStart = argentinaDate(local.year, local.month, local.day);
    const todayEnd = argentinaDate(local.year, local.month, local.day, '23:59:59.999');

    if (period === 'day') {
        return {
            rangeStart: todayStart,
            rangeEnd: todayEnd,
            periodLabel: 'Hoy',
        };
    }

    if (period === 'week') {
        const mondayOffset = local.weekdayIndex === 0 ? -6 : 1 - local.weekdayIndex;
        const weekStart = addDays(todayStart, mondayOffset);
        const weekEnd = endOfRangeFromNextStart(addDays(weekStart, 7));

        return {
            rangeStart: weekStart,
            rangeEnd: weekEnd,
            periodLabel: 'Esta semana',
        };
    }

    if (period === 'year') {
        return {
            rangeStart: argentinaDate(local.year, 1, 1),
            rangeEnd: argentinaDate(local.year, 12, 31, '23:59:59.999'),
            periodLabel: String(local.year),
        };
    }

    return {
        rangeStart: argentinaDate(local.year, local.month, 1),
        rangeEnd: endOfRangeFromNextStart(
            local.month === 12
                ? argentinaDate(local.year + 1, 1, 1)
                : argentinaDate(local.year, local.month + 1, 1)
        ),
        periodLabel: now.toLocaleDateString('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            month: 'long',
            year: 'numeric',
        }),
    };
}

function toAgendaMetrics(
    counters: Record<AgendaMetricKey, { done: number; upcoming: number; appointments: AgendaMetricAppointment[] }>,
    period: AgendaMetricsPeriod,
    now: Date,
    rangeStart: Date,
    rangeEnd: Date,
    periodLabel: string
): AgendaMetrics {
    const metrics = (Object.keys(METRIC_LABELS) as AgendaMetricKey[]).map((key) => ({
        key,
        label: METRIC_LABELS[key],
        done: counters[key].done,
        upcoming: counters[key].upcoming,
        total: counters[key].done + counters[key].upcoming,
        appointments: counters[key].appointments,
    }));

    return {
        period,
        periodLabel,
        rangeStart: rangeStart.toISOString(),
        rangeEnd: rangeEnd.toISOString(),
        generatedAt: now.toISOString(),
        metrics,
    };
}

export async function getAgendaMetrics(period: AgendaMetricsPeriod = 'month'): Promise<AgendaMetrics> {
    const now = new Date();
    const normalizedPeriod: AgendaMetricsPeriod = ['day', 'week', 'month', 'year'].includes(period) ? period : 'month';
    const { rangeStart, rangeEnd, periodLabel } = buildPeriodRange(normalizedPeriod, now);
    const counters = buildEmptyMetrics();
    const admin = createAdminClient();

    const { data, error } = await admin
        .from('agenda_appointments')
        .select(`
            id,
            title,
            type,
            status,
            start_time,
            end_time,
            patient_id,
            patient:patient_id (nombre, apellido),
            doctor:doctor_id (full_name)
        `)
        .gte('start_time', rangeStart.toISOString())
        .lte('start_time', rangeEnd.toISOString());

    if (error) {
        console.error('[AgendaMetrics] Error fetching agenda metrics:', error);
        return toAgendaMetrics(counters, normalizedPeriod, now, rangeStart, rangeEnd, periodLabel);
    }

    for (const row of (data ?? []) as unknown as AgendaMetricRow[]) {
        if (!row.start_time || IGNORED_STATUSES.has(row.status ?? '')) continue;

        const metricKey = classifyAppointment(row);
        if (!metricKey) continue;

        const appointmentEnd = new Date(row.end_time ?? row.start_time);
        if (Number.isNaN(appointmentEnd.getTime())) continue;

        const isPast = appointmentEnd < now;
        if (isPast) {
            counters[metricKey].done += 1;
        } else {
            counters[metricKey].upcoming += 1;
        }

        // Get patient name
        const p = row.patient ? (Array.isArray(row.patient) ? row.patient[0] : row.patient) : null;
        const patientName = p ? `${p.nombre ?? ''} ${p.apellido ?? ''}`.trim() : (row.title ?? 'Paciente');

        // Get doctor name
        const d = row.doctor ? (Array.isArray(row.doctor) ? row.doctor[0] : row.doctor) : null;
        const doctorName = d?.full_name ?? 'Sin asignar';

        // Regla de Oro AM Clínica: turnos pasados no cancelados son virtuales 'completed'
        const virtualStatus = (isPast && !['cancelled', 'no_show'].includes(row.status ?? ''))
            ? 'completed'
            : (row.status ?? 'confirmed');

        counters[metricKey].appointments.push({
            id: row.id,
            title: row.title ?? '',
            start_time: row.start_time,
            status: virtualStatus,
            patient_id: row.patient_id,
            patient_name: patientName,
            doctor_name: doctorName,
        });
    }

    // Sort appointments chronologically
    for (const key of Object.keys(counters) as AgendaMetricKey[]) {
        counters[key].appointments.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    }

    return toAgendaMetrics(counters, normalizedPeriod, now, rangeStart, rangeEnd, periodLabel);
}

export async function getMonthlyAgendaMetrics(): Promise<AgendaMetrics> {
    return getAgendaMetrics('month');
}
