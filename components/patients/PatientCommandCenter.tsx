'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Sparkles, Target } from 'lucide-react';
import {
    buildPatientPlaybook,
    estimateFinancingAcceptance,
    PatientAppointmentSignal,
    PatientPaymentSignal,
    PatientProfileSignal,
    simulateFinancingPlan,
} from '@/lib/patient-playbook';

interface PatientCommandCenterProps {
    patient: PatientProfileSignal;
    payments: PatientPaymentSignal[];
    appointments: PatientAppointmentSignal[];
}

function tierColors(tier: string) {
    if (tier === 'critical') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    if (tier === 'high') return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300';
    if (tier === 'watch') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300';
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
}

function getTierLabel(tier: string) {
    if (tier === 'critical') return 'CRITICO';
    if (tier === 'high') return 'ALTO';
    if (tier === 'watch') return 'OBSERVAR';
    return 'BAJO';
}

export default function PatientCommandCenter({ patient, payments, appointments }: PatientCommandCenterProps) {
    const playbook = useMemo(() => {
        return buildPatientPlaybook({ patient, payments, appointments });
    }, [patient, payments, appointments]);

    const [months, setMonths] = useState(() => {
        const suggested = Number(patient.financ_cuotas_total || 6);
        return Math.min(18, Math.max(2, suggested || 6));
    });
    const [monthlyRate, setMonthlyRate] = useState(2.2);

    const plan = useMemo(
        () => simulateFinancingPlan(playbook.outstandingUsd, months, monthlyRate),
        [playbook.outstandingUsd, months, monthlyRate]
    );

    const acceptance = useMemo(
        () => estimateFinancingAcceptance(playbook.score, plan.monthlyPayment, plan.months),
        [playbook.score, plan.monthlyPayment, plan.months]
    );

    return (
        <section className="mb-6 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <Sparkles size={16} className="text-cyan-600" />
                        Copiloto Clinico-Financiero
                    </h2>
                    <p className="text-xs text-gray-500 mt-0.5">Proxima mejor accion para retencion, agenda y cobranza saludable</p>
                </div>
                <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold ${tierColors(playbook.tier)}`}>
                    <Gauge size={13} />
                    Riesgo {getTierLabel(playbook.tier)} · Puntaje {playbook.score}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 rounded-lg bg-gray-50 dark:bg-gray-800/60 p-4">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{playbook.headline}</p>
                    <div className="space-y-1.5 mb-3">
                        {playbook.reasons.map((reason) => (
                            <p key={reason} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                                <AlertTriangle size={12} className="mt-0.5 text-amber-500" />
                                <span>{reason}</span>
                            </p>
                        ))}
                    </div>

                    <div className="rounded-lg border border-dashed border-cyan-300 dark:border-cyan-700 p-3 bg-cyan-50/60 dark:bg-cyan-900/20">
                        <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider mb-1">Accion recomendada</p>
                        <p className="text-sm text-cyan-900 dark:text-cyan-100">{playbook.nextActions[0]}</p>
                    </div>
                </div>

                <div className="rounded-lg border border-gray-100 dark:border-gray-700 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Target size={13} />
                        Simulador de regularizacion
                    </p>

                    <label className="text-xs text-gray-500 block mb-1">Cuotas ({months})</label>
                    <input
                        type="range"
                        min={2}
                        max={18}
                        step={1}
                        value={months}
                        onChange={(event) => setMonths(Number(event.target.value))}
                        className="w-full mb-2"
                    />

                    <label className="text-xs text-gray-500 block mb-1">Interes mensual ({monthlyRate.toFixed(1)}%)</label>
                    <input
                        type="range"
                        min={0}
                        max={4}
                        step={0.1}
                        value={monthlyRate}
                        onChange={(event) => setMonthlyRate(Number(event.target.value))}
                        className="w-full mb-3"
                    />

                    <div className="space-y-1 text-sm">
                        <p className="text-gray-600 dark:text-gray-300">Saldo: <span className="font-semibold text-gray-900 dark:text-white">USD {playbook.outstandingUsd.toLocaleString('es-AR')}</span></p>
                        <p className="text-gray-600 dark:text-gray-300">Cuota estimada: <span className="font-semibold text-gray-900 dark:text-white">USD {plan.monthlyPayment.toLocaleString('es-AR')}</span></p>
                        <p className="text-gray-600 dark:text-gray-300">Prob. aceptacion: <span className="font-semibold text-emerald-600">{Math.round(acceptance * 100)}%</span></p>
                    </div>
                </div>
            </div>
        </section>
    );
}
