'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, RefreshCw } from 'lucide-react';
import { getMonthlyAgendaMetrics, type MonthlyAgendaMetric, type MonthlyAgendaMetrics } from '@/app/actions/agenda-metrics';

const CARD_STYLES: Record<MonthlyAgendaMetric['key'], string> = {
    primeras_consultas: 'border-blue-200 bg-blue-50/80 text-blue-950 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-50',
    limpiezas: 'border-emerald-200 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-50',
    control_carillas: 'border-amber-200 bg-amber-50/80 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-50',
};

function MetricSkeleton() {
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 animate-pulse">
            <div className="h-4 w-32 rounded bg-gray-200 dark:bg-gray-700 mb-3" />
            <div className="h-10 w-20 rounded bg-gray-200 dark:bg-gray-700 mb-4" />
            <div className="grid grid-cols-2 gap-2">
                <div className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800" />
                <div className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800" />
            </div>
        </div>
    );
}

function MetricCard({ metric }: { metric: MonthlyAgendaMetric }) {
    return (
        <div className={`rounded-xl border p-4 shadow-sm ${CARD_STYLES[metric.key]}`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-70">{metric.label}</p>
                    <div className="mt-1 flex items-end gap-2">
                        <span className="text-4xl font-black leading-none tabular-nums">{metric.total}</span>
                        <span className="pb-1 text-xs font-semibold opacity-70">este mes</span>
                    </div>
                </div>
                <CalendarClock size={20} className="opacity-55" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-white/65 dark:bg-black/15 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase opacity-65">
                        <CheckCircle2 size={13} />
                        Hechas
                    </div>
                    <div className="mt-1 text-2xl font-black tabular-nums">{metric.done}</div>
                </div>
                <div className="rounded-lg bg-white/65 dark:bg-black/15 px-3 py-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase opacity-65">
                        <Clock3 size={13} />
                        Por venir
                    </div>
                    <div className="mt-1 text-2xl font-black tabular-nums">{metric.upcoming}</div>
                </div>
            </div>
        </div>
    );
}

export default function MonthlyAgendaDashboard() {
    const [metrics, setMetrics] = useState<MonthlyAgendaMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadMetrics = useCallback(async () => {
        try {
            setError(null);
            const nextMetrics = await getMonthlyAgendaMetrics();
            setMetrics(nextMetrics);
        } catch (err) {
            console.error('[MonthlyAgendaDashboard] Error loading metrics:', err);
            setError('No se pudieron cargar los datos del mes.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadMetrics();
        const interval = window.setInterval(loadMetrics, 60_000);
        return () => window.clearInterval(interval);
    }, [loadMetrics]);

    const generatedAt = metrics
        ? new Date(metrics.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
        : null;

    return (
        <section className="flex-shrink-0 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm p-3">
            <div className="mb-3 flex items-center justify-between gap-3 px-1">
                <div>
                    <h2 className="text-sm font-black uppercase tracking-wide text-gray-900 dark:text-white">
                        Patrón del mes
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                        {metrics?.monthLabel ?? 'Mes actual'}{generatedAt ? ` · actualizado ${generatedAt}` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => {
                        setLoading(true);
                        loadMetrics();
                    }}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                    title="Actualizar métricas"
                    aria-label="Actualizar métricas"
                    disabled={loading}
                >
                    <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>

            {error && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
                    {error}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {loading && !metrics
                    ? Array.from({ length: 3 }, (_, index) => <MetricSkeleton key={index} />)
                    : metrics?.metrics.map((metric) => <MetricCard key={metric.key} metric={metric} />)}
            </div>
        </section>
    );
}
