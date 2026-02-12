'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, BrainCircuit, Clock3, TrendingDown, UserRoundX } from 'lucide-react';
import { getAgendaAutopilotSummary } from '@/app/actions/intelligence';

type AutopilotSnapshot = Awaited<ReturnType<typeof getAgendaAutopilotSummary>>;

export default function AgendaAutopilotPanel() {
    const [snapshot, setSnapshot] = useState<AutopilotSnapshot | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        async function load() {
            try {
                const data = await getAgendaAutopilotSummary();
                if (mounted) setSnapshot(data);
            } catch (error) {
                console.error('Error loading agenda autopilot:', error);
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
        return <div className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 animate-pulse h-72" />;
    }

    if (!snapshot) return null;

    return (
        <aside className="rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5 h-full overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <BrainCircuit size={17} className="text-cyan-600" />
                    Piloto automatico de agenda
                </h2>
                <span className="text-[11px] text-gray-400">
                    {new Date(snapshot.generatedAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
                <MiniMetric icon={<UserRoundX size={14} />} value={snapshot.agenda.noShowRiskCount} label="Ausentismo" />
                <MiniMetric icon={<TrendingDown size={14} />} value={snapshot.agenda.lowOccupancyCount} label="Huecos" />
                <MiniMetric icon={<Clock3 size={14} />} value={snapshot.agenda.cancellationHotspotCount} label="Zonas criticas" />
            </div>

            <section className="mb-4">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">Huecos de baja ocupacion</p>
                <div className="space-y-2">
                    {snapshot.agenda.lowOccupancyWindows.slice(0, 4).map(window => (
                        <div key={`${window.doctorId}-${window.date}`} className="rounded-lg bg-gray-50 dark:bg-gray-800/70 p-2.5">
                            <p className="text-sm font-medium text-gray-900 dark:text-white">{window.doctorName}</p>
                            <p className="text-xs text-gray-500">
                                {new Date(window.date).toLocaleDateString('es-AR')} · {window.booked}/{window.target} turnos ({window.occupancyPct}%)
                            </p>
                        </div>
                    ))}
                    {snapshot.agenda.lowOccupancyWindows.length === 0 && (
                        <p className="text-xs text-gray-500">No se detectan ventanas criticas de ocupacion.</p>
                    )}
                </div>
            </section>

            <section>
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider mb-2">Pacientes para reconfirmar</p>
                <div className="space-y-2">
                    {snapshot.agenda.noShowRisk.slice(0, 4).map(risk => (
                        <Link
                            key={risk.appointmentId}
                            href={`/patients/${risk.patientId}`}
                            className="block rounded-lg border border-amber-200 dark:border-amber-800 p-2.5 hover:bg-amber-50/70 dark:hover:bg-amber-900/20 transition-colors"
                        >
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{risk.patientName}</p>
                            <p className="text-xs text-gray-500">
                                Riesgo {risk.riskScore}% · {new Date(risk.startTime).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </Link>
                    ))}
                    {snapshot.agenda.noShowRisk.length === 0 && (
                        <p className="text-xs text-gray-500">Sin turnos con riesgo alto de inasistencia.</p>
                    )}
                </div>
            </section>

            <Link
                href="/patients"
                className="mt-4 inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
            >
                Ejecutar contacto inteligente
                <ArrowRight size={12} />
            </Link>
        </aside>
    );
}

function MiniMetric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
    return (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/70 px-2 py-2 text-center">
            <div className="flex items-center justify-center text-gray-500 mb-1">{icon}</div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-none">{value}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wide mt-1">{label}</p>
        </div>
    );
}
