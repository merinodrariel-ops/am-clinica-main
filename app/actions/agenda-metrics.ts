'use server';

import { createAdminClient } from '@/utils/supabase/admin';

export type MonthlyAgendaMetricKey = 'primeras_consultas' | 'limpiezas' | 'control_carillas';

export type MonthlyAgendaMetric = {
    key: MonthlyAgendaMetricKey;
    label: string;
    done: number;
    upcoming: number;
    total: number;
};

export type MonthlyAgendaMetrics = {
    monthLabel: string;
    monthStart: string;
    monthEnd: string;
    generatedAt: string;
    metrics: MonthlyAgendaMetric[];
};

type AgendaMetricRow = {
    title: string | null;
    type: string | null;
    status: string | null;
    start_time: string | null;
    end_time: string | null;
};

const CLEANING_TYPES = new Set(['limpieza', 'limpieza_convencional', 'limpieza_laser']);
const VENEER_CONTROL_TYPES = new Set(['control_carilla_inmediato', 'control_carilla_anual']);
const IGNORED_STATUSES = new Set(['cancelled', 'no_show']);

const METRIC_LABELS: Record<MonthlyAgendaMetricKey, string> = {
    primeras_consultas: 'Primeras consultas',
    limpiezas: 'Limpiezas',
    control_carillas: 'Controles de carillas',
};

function normalizeText(value: string | null | undefined) {
    return (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function classifyAppointment(row: AgendaMetricRow): MonthlyAgendaMetricKey | null {
    const type = row.type ?? '';
    const title = normalizeText(row.title);

    if (type === 'consulta' || title.includes('primera consulta')) {
        return 'primeras_consultas';
    }

    if (CLEANING_TYPES.has(type) || title.includes('limpieza') || title.includes('profilaxis')) {
        return 'limpiezas';
    }

    if (
        VENEER_CONTROL_TYPES.has(type) ||
        (title.includes('control') && (title.includes('carilla') || title.includes('veneer') || title.includes('faceta')))
    ) {
        return 'control_carillas';
    }

    return null;
}

function buildEmptyMetrics(): Record<MonthlyAgendaMetricKey, { done: number; upcoming: number }> {
    return {
        primeras_consultas: { done: 0, upcoming: 0 },
        limpiezas: { done: 0, upcoming: 0 },
        control_carillas: { done: 0, upcoming: 0 },
    };
}

function toMonthlyAgendaMetrics(
    counters: Record<MonthlyAgendaMetricKey, { done: number; upcoming: number }>,
    now: Date,
    monthStart: Date,
    monthEnd: Date
): MonthlyAgendaMetrics {
    const metrics = (Object.keys(METRIC_LABELS) as MonthlyAgendaMetricKey[]).map((key) => ({
        key,
        label: METRIC_LABELS[key],
        done: counters[key].done,
        upcoming: counters[key].upcoming,
        total: counters[key].done + counters[key].upcoming,
    }));

    return {
        monthLabel: now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
        monthStart: monthStart.toISOString(),
        monthEnd: monthEnd.toISOString(),
        generatedAt: now.toISOString(),
        metrics,
    };
}

export async function getMonthlyAgendaMetrics(): Promise<MonthlyAgendaMetrics> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const counters = buildEmptyMetrics();
    const admin = createAdminClient();

    const { data, error } = await admin
        .from('agenda_appointments')
        .select('title, type, status, start_time, end_time')
        .gte('start_time', monthStart.toISOString())
        .lte('start_time', monthEnd.toISOString());

    if (error) {
        console.error('[AgendaMetrics] Error fetching monthly agenda metrics:', error);
        return toMonthlyAgendaMetrics(counters, now, monthStart, monthEnd);
    }

    for (const row of (data ?? []) as AgendaMetricRow[]) {
        if (!row.start_time || IGNORED_STATUSES.has(row.status ?? '')) continue;

        const metricKey = classifyAppointment(row);
        if (!metricKey) continue;

        const appointmentEnd = new Date(row.end_time ?? row.start_time);
        if (Number.isNaN(appointmentEnd.getTime())) continue;

        if (appointmentEnd < now) {
            counters[metricKey].done += 1;
        } else {
            counters[metricKey].upcoming += 1;
        }
    }

    return toMonthlyAgendaMetrics(counters, now, monthStart, monthEnd);
}
