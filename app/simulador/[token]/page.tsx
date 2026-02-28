'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import {
    calculateFinancingBreakdown,
    formatArs,
    formatUsd,
} from '@/lib/financial-engine';

type PublicSimulation = {
    id: string;
    treatment: string;
    totalUsd: number;
    bnaVentaArs: number;
    monthlyInterestPct: number;
    allowedInstallments: number[];
    allowedUpfront: number[];
    status: 'shared' | 'selected' | 'contracted' | 'expired';
    selectedInstallments: number | null;
    selectedUpfrontPct: number | null;
    selectedAt: string | null;
    expiresAt: string;
};

type PublicPatient = {
    nombre?: string | null;
    apellido?: string | null;
};

export default function PatientSimulationPage() {
    const params = useParams<{ token: string }>();
    const token = params?.token;
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [simulation, setSimulation] = useState<PublicSimulation | null>(null);
    const [patient, setPatient] = useState<PublicPatient | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedUpfront, setSelectedUpfront] = useState<number | null>(null);
    const [selectedInstallments, setSelectedInstallments] = useState<number | null>(null);
    const [saved, setSaved] = useState(false);

    const loadSimulation = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/financing-sim/${token}`, { cache: 'no-store' });
            const payload = await response.json();
            if (!response.ok) {
                setError(payload?.error || 'No se pudo cargar la simulacion.');
                setSimulation(null);
                return;
            }

            const nextSimulation = payload.simulation as PublicSimulation;
            setSimulation(nextSimulation);
            setPatient((payload.patient || null) as PublicPatient | null);
            setSelectedUpfront(nextSimulation.selectedUpfrontPct || nextSimulation.allowedUpfront[0] || null);
            setSelectedInstallments(nextSimulation.selectedInstallments || nextSimulation.allowedInstallments[0] || null);
            setSaved(nextSimulation.status === 'selected' || nextSimulation.status === 'contracted');
        } catch {
            setError('No se pudo conectar con el servidor.');
            setSimulation(null);
        } finally {
            setLoading(false);
        }
    }, [token]);

    useEffect(() => {
        void loadSimulation();
    }, [loadSimulation]);

    const quote = useMemo(() => {
        if (!simulation || !selectedUpfront || !selectedInstallments) return null;
        return calculateFinancingBreakdown({
            totalUsd: simulation.totalUsd,
            upfrontPct: selectedUpfront,
            installments: selectedInstallments,
            monthlyInterestPct: simulation.monthlyInterestPct,
            bnaVentaArs: simulation.bnaVentaArs,
        });
    }, [simulation, selectedUpfront, selectedInstallments]);

    const handleSubmitChoice = useCallback(async () => {
        if (!simulation || !token || !selectedUpfront || !selectedInstallments) return;
        setSubmitting(true);
        setError(null);
        try {
            const response = await fetch(`/api/financing-sim/${token}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    upfrontPct: selectedUpfront,
                    installments: selectedInstallments,
                }),
            });
            const payload = await response.json();
            if (!response.ok) {
                setError(payload?.error || 'No se pudo guardar tu eleccion.');
                return;
            }

            setSaved(true);
            setSimulation((current) => {
                if (!current) return current;
                return {
                    ...current,
                    status: 'selected',
                    selectedUpfrontPct: selectedUpfront,
                    selectedInstallments,
                    selectedAt: new Date().toISOString(),
                };
            });
        } catch {
            setError('No se pudo guardar tu seleccion. Intenta nuevamente.');
        } finally {
            setSubmitting(false);
        }
    }, [simulation, token, selectedUpfront, selectedInstallments]);

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-100">
                <div className="inline-flex items-center gap-2 text-sm">
                    <Loader2 size={18} className="animate-spin" /> Cargando simulacion...
                </div>
            </div>
        );
    }

    if (!simulation) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
                <div className="w-full max-w-xl rounded-2xl border border-red-400/30 bg-red-500/10 p-5 text-sm text-red-100">
                    <p className="font-semibold">No pudimos abrir esta simulacion.</p>
                    <p className="mt-1">{error || 'El enlace es invalido o fue dado de baja.'}</p>
                </div>
            </div>
        );
    }

    const patientName = `${patient?.nombre || ''} ${patient?.apellido || ''}`.trim();

    return (
        <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950 px-4 py-8 text-slate-100">
            <div className="mx-auto w-full max-w-3xl space-y-5">
                <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">AM Clinica Dental</p>
                    <h1 className="mt-1 text-2xl font-semibold text-white">Tu simulacion de financiacion</h1>
                    <p className="mt-2 text-sm text-slate-300">
                        {patientName ? `${patientName}, ` : ''}
                        revisa las opciones y elige la combinacion de anticipo y cuotas que prefieras.
                    </p>
                    <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/50 p-3 text-sm">
                        <p className="font-medium text-slate-200">Tratamiento: {simulation.treatment}</p>
                        <p className="text-slate-400">Total: {formatUsd(simulation.totalUsd)} · BNA Venta: {formatArs(simulation.bnaVentaArs)}</p>
                    </div>
                </section>

                <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                    <p className="text-sm font-semibold text-white">1) Elige anticipo</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {simulation.allowedUpfront.map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setSelectedUpfront(value)}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                    selectedUpfront === value
                                        ? 'bg-cyan-400 text-slate-900'
                                        : 'border border-slate-600 bg-slate-800 text-slate-200'
                                }`}
                            >
                                {value}%
                            </button>
                        ))}
                    </div>

                    <p className="mt-5 text-sm font-semibold text-white">2) Elige cantidad de cuotas</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {simulation.allowedInstallments.map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setSelectedInstallments(value)}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                    selectedInstallments === value
                                        ? 'bg-cyan-400 text-slate-900'
                                        : 'border border-slate-600 bg-slate-800 text-slate-200'
                                }`}
                            >
                                {value} cuotas
                            </button>
                        ))}
                    </div>
                </section>

                {quote && (
                    <section className="rounded-2xl border border-cyan-300/20 bg-cyan-400/5 p-5">
                        <p className="text-sm font-semibold text-white">Resumen de tu opcion</p>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                            <p className="flex justify-between"><span>Anticipo</span><span className="font-mono">{formatUsd(quote.upfrontUsd)}</span></p>
                            <p className="flex justify-between"><span>Anticipo ARS</span><span className="font-mono">{formatArs(quote.upfrontArs)}</span></p>
                            <p className="flex justify-between"><span>Saldo financiado</span><span className="font-mono">{formatUsd(quote.financedTotalUsd)}</span></p>
                            <p className="flex justify-between"><span>Cuota mensual</span><span className="font-mono">{formatUsd(quote.installmentUsd)}</span></p>
                            <p className="flex justify-between md:col-span-2"><span>Cuota ARS hoy</span><span className="font-mono">{formatArs(quote.installmentArs)}</span></p>
                        </div>
                    </section>
                )}

                {error && (
                    <section className="rounded-xl border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-100">
                        {error}
                    </section>
                )}

                <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-5">
                    {saved ? (
                        <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                            <p className="inline-flex items-center gap-2 font-semibold">
                                <CheckCircle2 size={16} /> Eleccion guardada correctamente
                            </p>
                            <p className="mt-1 text-emerald-100/90">
                                Gracias. Nuestro equipo recibio tu seleccion y te contactara para avanzar con la documentacion.
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => void handleSubmitChoice()}
                            disabled={submitting || !selectedUpfront || !selectedInstallments}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-400/20 px-4 py-3 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-60"
                        >
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                            {submitting ? 'Guardando eleccion...' : 'Confirmar esta opcion'}
                        </button>
                    )}
                </section>
            </div>
        </main>
    );
}
