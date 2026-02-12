'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowRight,
    BrainCircuit,
    CalendarClock,
    ShieldAlert,
    Sparkles,
    TrendingUp,
} from 'lucide-react';
import { getExecutiveIntelligence } from '@/app/actions/intelligence';

type ExecutiveSnapshot = Awaited<ReturnType<typeof getExecutiveIntelligence>>;

function tierStyles(tier: string) {
    if (tier === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    if (tier === 'high') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300';
    if (tier === 'watch') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';
    return 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300';
}

function severityStyles(severity: string) {
    if (severity === 'high') return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    if (severity === 'medium') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300';
}

function getTierLabel(tier: string) {
    if (tier === 'critical') return 'CRITICO';
    if (tier === 'high') return 'ALTO';
    if (tier === 'watch') return 'OBSERVAR';
    return 'BAJO';
}

function getSeverityLabel(severity: string) {
    if (severity === 'high') return 'ALTA';
    if (severity === 'medium') return 'MEDIA';
    return 'BAJA';
}

export default function ExecutiveCommandCenter() {
    const [snapshot, setSnapshot] = useState<ExecutiveSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                const data = await getExecutiveIntelligence();
                if (mounted) setSnapshot(data);
            } catch (error) {
                console.error('Error loading executive intelligence:', error);
            } finally {
                if (mounted) setLoading(false);
            }
        }

        load();
        return () => {
            mounted = false;
        };
    }, []);

    if (loading) {
        return (
            <div className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
                <div className="h-5 w-64 bg-slate-200 dark:bg-slate-700 rounded" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-700" />
                    ))}
                </div>
            </div>
        );
    }

    if (!snapshot) return null;

    return (
        <div className="mb-8 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-gray-800 p-6">
            <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                        <BrainCircuit size={20} className="text-cyan-600" />
                        Centro de Comando Inteligente
                    </h2>
                    <p className="text-sm text-slate-500">Inteligencia accionable para operacion, agenda y caja</p>
                </div>
                <span className="text-xs text-slate-400">
                    Actualizado {new Date(snapshot.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
                <StatCard
                    icon={<Sparkles size={18} className="text-cyan-600" />}
                    label="Pacientes Prioritarios"
                    value={snapshot.portfolio.highPriorityPatients.toString()}
                    hint={`de ${snapshot.portfolio.totalPatients} totales`}
                />
                <StatCard
                    icon={<TrendingUp size={18} className="text-emerald-600" />}
                    label="Recupero Proyectado"
                    value={`USD ${snapshot.portfolio.projectedRecoveryUsd.toLocaleString('es-AR')}`}
                    hint="ventana de 30 dias"
                />
                <StatCard
                    icon={<CalendarClock size={18} className="text-blue-600" />}
                    label="Agenda en Riesgo"
                    value={snapshot.agenda.noShowRiskCount.toString()}
                    hint="turnos con riesgo de inasistencia"
                />
                <StatCard
                    icon={<ShieldAlert size={18} className="text-rose-600" />}
                    label="Alertas de Caja"
                    value={snapshot.cash.highSeverityCount.toString()}
                    hint={`${snapshot.cash.anomalyCount} anomalias totales`}
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Proxima mejor accion</h3>
                        <Link href="/patients" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            Ver CRM <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {snapshot.patientActions.slice(0, 4).map((action) => (
                            <Link
                                key={action.patientId}
                                href={`/patients/${action.patientId}`}
                                className="block rounded-lg border border-slate-100 dark:border-slate-700 p-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{action.patientName}</p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tierStyles(action.tier)}`}>
                                        {getTierLabel(action.tier)} {action.score}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1 truncate">{action.nextActions[0]}</p>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Piloto automatico de agenda</h3>
                        <Link href="/agenda" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            Ir a Agenda <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {snapshot.agenda.lowOccupancyWindows.slice(0, 3).map((window) => (
                            <div key={`${window.doctorId}-${window.date}`} className="rounded-lg bg-slate-50 dark:bg-slate-900/40 px-3 py-2">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{window.doctorName}</p>
                                <p className="text-xs text-slate-500">
                                    {new Date(window.date).toLocaleDateString('es-AR')} - {window.booked}/{window.target} turnos ({window.occupancyPct}%)
                                </p>
                            </div>
                        ))}
                        {snapshot.agenda.noShowRisk.slice(0, 2).map((risk) => (
                            <div key={risk.appointmentId} className="rounded-lg border border-amber-200 dark:border-amber-800 px-3 py-2">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{risk.patientName}</p>
                                <p className="text-xs text-slate-500">
                                    {new Date(risk.startTime).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Guardian de caja</h3>
                        <Link href="/caja-recepcion" className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1">
                            Ir a Caja <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {snapshot.cash.anomalies.slice(0, 4).map((anomaly) => (
                            <div key={anomaly.id} className="rounded-lg border border-slate-100 dark:border-slate-700 p-3">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{anomaly.title}</p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${severityStyles(anomaly.severity)}`}>
                                        {getSeverityLabel(anomaly.severity)}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{anomaly.detail}</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                                    USD {anomaly.amountUsd.toLocaleString('es-AR')} - {new Date(anomaly.happenedAt).toLocaleDateString('es-AR')}
                                </p>
                            </div>
                        ))}
                        {snapshot.cash.anomalies.length === 0 && (
                            <p className="text-xs text-slate-500">Sin anomalias relevantes en la ventana de analisis.</p>
                        )}
                    </div>
                </div>
            </div>

            {snapshot.agenda.cancellationHotspots.length > 0 && (
                <div className="mt-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
                    <p className="text-xs font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} />
                        Zonas criticas de cancelacion detectadas
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                        {snapshot.agenda.cancellationHotspots.map(hotspot => `${hotspot.weekday} ${hotspot.hour} (${hotspot.cancellations})`).join(' • ')}
                    </p>
                </div>
            )}
        </div>
    );
}

function StatCard({
    icon,
    label,
    value,
    hint,
}: {
    icon: ReactNode;
    label: string;
    value: string;
    hint: string;
}) {
    return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/60 dark:bg-slate-900/30">
            <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                {icon}
                <span>{label}</span>
            </div>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-tight">{value}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>
        </div>
    );
}
