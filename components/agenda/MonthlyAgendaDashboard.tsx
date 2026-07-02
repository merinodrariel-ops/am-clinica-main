'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, RefreshCw, Users, ExternalLink } from 'lucide-react';
import {
    getAgendaMetrics,
    type AgendaMetric,
    type AgendaMetrics,
    type AgendaMetricsPeriod,
} from '@/app/actions/agenda-metrics';

const PERIOD_OPTIONS: { value: AgendaMetricsPeriod; label: string; scopeLabel: string }[] = [
    { value: 'day', label: 'Día', scopeLabel: 'hoy' },
    { value: 'week', label: 'Semana', scopeLabel: 'esta semana' },
    { value: 'month', label: 'Mes', scopeLabel: 'este mes' },
    { value: 'year', label: 'Año', scopeLabel: 'este año' },
];

const CARD_STYLES: Record<AgendaMetric['key'], string> = {
    primeras_consultas: 'border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-50',
    limpiezas: 'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-50',
    controles_anuales: 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50',
};

function MetricSkeleton() {
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-2.5 animate-pulse">
            <div className="flex items-center justify-between gap-3">
                <div className="space-y-2">
                    <div className="h-3 w-28 rounded bg-gray-200 dark:bg-gray-700" />
                    <div className="h-7 w-16 rounded bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="flex gap-1.5">
                    <div className="h-8 w-12 rounded-md bg-gray-100 dark:bg-gray-800" />
                    <div className="h-8 w-12 rounded-md bg-gray-100 dark:bg-gray-800" />
                </div>
            </div>
        </div>
    );
}

function MetricCard({ metric, scopeLabel }: { metric: AgendaMetric; scopeLabel: string }) {
    const [expanded, setExpanded] = useState(false);

    // Color styles for different status badges
    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'completed':
                return 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300';
            case 'confirmed':
                return 'bg-blue-100 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300';
            case 'pending':
                return 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300';
            default:
                return 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300';
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case 'completed': return 'Hecho';
            case 'confirmed': return 'Confirmado';
            case 'pending': return 'Pendiente';
            default: return status;
        }
    };

    return (
        <div className={`rounded-lg border p-2.5 shadow-sm flex flex-col transition-all duration-300 ${CARD_STYLES[metric.key]}`}>
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="truncate text-[10px] font-bold uppercase tracking-wide opacity-70">{metric.label}</p>
                    <div className="mt-0.5 flex items-baseline gap-1.5">
                        <span className="text-2xl font-black leading-none tabular-nums">{metric.total}</span>
                        <span className="truncate text-[10px] font-semibold opacity-70">{scopeLabel}</span>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <div className="hidden xl:flex items-center gap-1.5 text-[10px] font-bold">
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/65 dark:bg-black/15 px-1.5 py-1 tabular-nums">
                            <CheckCircle2 size={11} />
                            {metric.done}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-white/65 dark:bg-black/15 px-1.5 py-1 tabular-nums">
                            <Clock3 size={11} />
                            {metric.upcoming}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setExpanded(!expanded)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-white/40 dark:hover:bg-black/20 text-current transition-all opacity-75 hover:opacity-100"
                        title={expanded ? "Ocultar pacientes" : "Ver pacientes"}
                    >
                        <Users size={14} />
                    </button>
                    <CalendarClock size={16} className="opacity-45" />
                </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs xl:hidden">
                <div className="rounded-md bg-white/65 dark:bg-black/15 px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase opacity-65">
                        <CheckCircle2 size={11} />
                        Hechas
                    </div>
                    <div className="text-lg font-black tabular-nums">{metric.done}</div>
                </div>
                <div className="rounded-md bg-white/65 dark:bg-black/15 px-2 py-1.5">
                    <div className="flex items-center gap-1 text-[10px] font-bold uppercase opacity-65">
                        <Clock3 size={11} />
                        Por venir
                    </div>
                    <div className="text-lg font-black tabular-nums">{metric.upcoming}</div>
                </div>
            </div>

            {expanded && (
                <div className="mt-2 border-t border-current/15 pt-2 animate-fadeIn">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase opacity-75 tracking-wider">Lista de Pacientes</span>
                        <span className="text-[9px] bg-white/40 dark:bg-black/20 px-2 py-0.5 rounded-full font-bold tabular-nums">
                            {metric.appointments?.length ?? 0}
                        </span>
                    </div>

                    {(!metric.appointments || metric.appointments.length === 0) ? (
                        <p className="text-xs italic opacity-60 text-center py-4">No hay pacientes registrados</p>
                    ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                            {metric.appointments.map((apt) => {
                                const time = new Date(apt.start_time).toLocaleTimeString('es-AR', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    timeZone: 'America/Argentina/Buenos_Aires',
                                });
                                return (
                                    <div 
                                        key={apt.id} 
                                        className="bg-white/40 dark:bg-black/15 border border-current/5 hover:border-current/15 rounded-md p-2 transition-all text-xs flex flex-col gap-1 shadow-sm"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            {apt.patient_id ? (
                                                <a 
                                                    href={`/patients/${apt.patient_id}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="font-bold underline hover:text-blue-600 dark:hover:text-blue-400 inline-flex items-center gap-1 leading-snug group"
                                                >
                                                    {apt.patient_name}
                                                    <ExternalLink size={10} className="inline opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </a>
                                            ) : (
                                                <span className="font-bold leading-snug">{apt.patient_name}</span>
                                            )}
                                            <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 leading-none ${getStatusStyles(apt.status)}`}>
                                                {getStatusLabel(apt.status)}
                                            </span>
                                        </div>
                                        
                                        <div className="flex items-center justify-between gap-2 opacity-80 text-[11px] font-medium mt-0.5">
                                            <span className="font-bold tracking-tight bg-white/50 dark:bg-black/10 px-1.5 py-0.5 rounded text-[10px]">
                                                {time} hs
                                            </span>
                                            <span className="truncate max-w-[120px]" title={apt.doctor_name}>
                                                👨‍⚕️ {apt.doctor_name}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function MonthlyAgendaDashboard() {
    const [period, setPeriod] = useState<AgendaMetricsPeriod>('month');
    const [metrics, setMetrics] = useState<AgendaMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMetrics = useCallback(async () => {
        try {
            setError(null);
            const nextMetrics = await getAgendaMetrics(period);
            setMetrics(nextMetrics);
        } catch (err) {
            console.error('[MonthlyAgendaDashboard] Error loading metrics:', err);
            setError('No se pudieron cargar los datos del período.');
        } finally {
            setLoading(false);
        }
    }, [period]);

    useEffect(() => {
        loadMetrics();
        const interval = window.setInterval(loadMetrics, 60_000);
        return () => window.clearInterval(interval);
    }, [loadMetrics]);

    const generatedAt = metrics
        ? new Date(metrics.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : null;
    const activeScopeLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.scopeLabel ?? 'este período';

    return (
        <section className="hidden md:block flex-shrink-0 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 flex-wrap">
                <div>
                    <h2 className="text-xs font-black uppercase tracking-wide text-gray-900 dark:text-white">
                        Patrón de agenda
                    </h2>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 capitalize">
                        {metrics?.periodLabel ?? 'Período actual'}{generatedAt ? ` · actualizado ${generatedAt}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-0.5">
                        {PERIOD_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => {
                                    setPeriod(option.value);
                                    setLoading(true);
                                }}
                                className={`h-7 px-2.5 rounded-md text-[11px] font-black transition-all ${period === option.value
                                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'
                                    }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setLoading(true);
                            loadMetrics();
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                        title="Actualizar métricas"
                        aria-label="Actualizar métricas"
                        disabled={loading}
                    >
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
                {loading && !metrics
                    ? Array.from({ length: 3 }, (_, index) => <MetricSkeleton key={index} />)
                    : metrics?.metrics.map((metric) => (
                        <MetricCard key={metric.key} metric={metric} scopeLabel={activeScopeLabel} />
                    ))}
            </div>
        </section>
    );
}
