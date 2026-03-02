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
    if (tier === 'critical') return 'badge-destructive';
    if (tier === 'high') return 'badge-warning';
    if (tier === 'watch') return 'badge-teal';
    return 'badge-success';
}

function severityStyles(severity: string) {
    if (severity === 'high') return 'badge-destructive';
    if (severity === 'medium') return 'badge-warning';
    return 'badge-teal';
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
            <div className="mb-8 rounded-2xl glass-card p-6 animate-pulse border border-white/10">
                <div className="h-5 w-64 rounded bg-white/5" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-4">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="h-20 rounded-xl bg-white/5" />
                    ))}
                </div>
            </div>
        );
    }

    if (!snapshot) return null;

    return (
        <div className="mb-8 rounded-2xl glass-card p-6 border border-white/10">
            <div className="flex items-center justify-between gap-4 mb-5">
                <div>
                    <h2 className="text-xl font-semibold flex items-center gap-2 text-white drop-shadow-md">
                        <BrainCircuit size={20} className="text-teal-400" />
                        Centro de Comando Inteligente
                    </h2>
                    <p className="text-sm text-slate-400">Inteligencia accionable para operacion, agenda y caja</p>
                </div>
                <span className="text-xs text-slate-500">
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
                <div className="rounded-xl p-4 bg-black/20 border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-200">Proxima mejor accion</h3>
                        <Link href="/patients" className="text-xs hover:underline inline-flex items-center gap-1 text-teal-400">
                            Ver CRM <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {snapshot.patientActions.slice(0, 4).map((action) => (
                            <Link
                                key={action.patientId}
                                href={`/patients/${action.patientId}`}
                                className="block rounded-lg p-3 transition-colors bg-white/5 border border-white/5 hover:bg-white/10"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium truncate text-slate-200">{action.patientName}</p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${tierStyles(action.tier)}`}>
                                        {getTierLabel(action.tier)} {action.score}
                                    </span>
                                </div>
                                <p className="text-xs mt-1 truncate text-slate-400">{action.nextActions[0]}</p>
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl p-4 bg-black/20 border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-200">Piloto automatico de agenda</h3>
                        <Link href="/agenda" className="text-xs hover:underline inline-flex items-center gap-1 text-teal-400">
                            Ir a Agenda <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {snapshot.agenda.lowOccupancyWindows.slice(0, 3).map((window) => (
                            <div key={`${window.doctorId}-${window.date}`} className="rounded-lg px-3 py-2 bg-white/5 border border-white/5">
                                <p className="text-sm font-medium text-slate-200">{window.doctorName}</p>
                                <p className="text-xs text-slate-400">
                                    {new Date(window.date).toLocaleDateString('es-AR')} - {window.booked}/{window.target} turnos ({window.occupancyPct}%)
                                </p>
                            </div>
                        ))}
                        {snapshot.agenda.noShowRisk.slice(0, 2).map((risk) => (
                            <div key={risk.appointmentId} className="rounded-lg badge-warning px-3 py-2 bg-yellow-500/10 border border-yellow-500/20">
                                <p className="text-sm font-medium text-yellow-500">{risk.patientName}</p>
                                <p className="text-xs text-yellow-500/70">
                                    {new Date(risk.startTime).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-xl p-4 bg-black/20 border border-white/5">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-slate-200">Guardian de caja</h3>
                        <Link href="/caja-recepcion" className="text-xs hover:underline inline-flex items-center gap-1 text-teal-400">
                            Ir a Caja <ArrowRight size={12} />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {snapshot.cash.anomalies.slice(0, 4).map((anomaly) => (
                            <div key={anomaly.id} className="rounded-lg p-3 bg-white/5 border border-white/5">
                                <div className="flex items-start justify-between gap-2">
                                    <p className="text-sm font-medium text-slate-200">{anomaly.title}</p>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${severityStyles(anomaly.severity)}`}>
                                        {getSeverityLabel(anomaly.severity)}
                                    </span>
                                </div>
                                <p className="text-xs mt-1 text-slate-400">{anomaly.detail}</p>
                                <p className="text-xs mt-1 text-slate-300">
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
                <div className="mt-4 rounded-xl glass-card bg-amber-500/5 border border-amber-500/20 p-3">
                    <p className="text-xs font-semibold text-amber-500 flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} />
                        Zonas criticas de cancelacion detectadas
                    </p>
                    <p className="text-xs text-amber-500/80">
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
        <div className="rounded-xl p-3 bg-black/20 border border-white/5">
            <div className="flex items-center gap-2 text-xs mb-1 text-slate-400">
                {icon}
                <span>{label}</span>
            </div>
            <p className="text-lg font-semibold leading-tight text-white drop-shadow-sm">{value}</p>
            <p className="text-[11px] mt-0.5 text-slate-500">{hint}</p>
        </div>
    );
}
