'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    calculateFinancingBreakdown,
    DEFAULT_MONTHLY_INTEREST_PCT,
    FINANCING_INSTALLMENT_OPTIONS,
    FINANCING_UPFRONT_OPTIONS,
} from '@/lib/financial-engine';

const INSTALLMENT_OPTIONS: number[] = [...FINANCING_INSTALLMENT_OPTIONS];
const UPFRONT_OPTIONS = [...FINANCING_UPFRONT_OPTIONS];

function fmt(n: number) {
    return new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default function CalculadoraClient() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const [monto, setMonto] = useState(() => {
        const v = parseFloat(searchParams.get('monto') || '');
        return isNaN(v) ? '' : String(v);
    });
    const [entradaPct, setEntradaPct] = useState(() => {
        const v = parseInt(searchParams.get('entrada') || '');
        return UPFRONT_OPTIONS.some((option) => option === v) ? v : 30;
    });
    const [cuotas, setCuotas] = useState(() => {
        const v = parseInt(searchParams.get('cuotas') || '');
        return INSTALLMENT_OPTIONS.includes(v) ? v : 6;
    });
    const [bna, setBna] = useState(() => {
        const v = parseFloat(searchParams.get('bna') || '');
        return isNaN(v) ? '' : String(v);
    });
    const [copied, setCopied] = useState(false);

    const montoNum = parseFloat(monto) || 0;
    const bnaNum = parseFloat(bna) || 0;
    const showArs = bnaNum > 0;

    const breakdown = montoNum > 0
        ? calculateFinancingBreakdown({
            totalUsd: montoNum,
            upfrontPct: entradaPct,
            installments: cuotas,
            monthlyInterestPct: DEFAULT_MONTHLY_INTEREST_PCT,
            bnaVentaArs: bnaNum || undefined,
        })
        : null;

    // Sync URL params
    const syncUrl = useCallback(() => {
        const params = new URLSearchParams();
        if (montoNum > 0) params.set('monto', String(montoNum));
        params.set('entrada', String(entradaPct));
        params.set('cuotas', String(cuotas));
        if (bnaNum > 0) params.set('bna', String(bnaNum));
        router.replace(`/calculadora?${params.toString()}`, { scroll: false });
    }, [montoNum, entradaPct, cuotas, bnaNum, router]);

    useEffect(() => {
        syncUrl();
    }, [syncUrl]);

    function copyLink() {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        });
    }

    return (
        <div className="min-h-screen bg-[#050505] text-white px-4 py-8 md:py-12">
            {/* Header */}
            <div className="max-w-lg mx-auto mb-8 text-center">
                <p className="text-[#D4AF37] text-xs tracking-[0.3em] uppercase mb-2">AM Clínica · Estética Dental</p>
                <h1 className="text-3xl md:text-4xl font-light tracking-wide text-white mb-2">
                    Calculadora de Financiación
                </h1>
                <p className="text-gray-400 text-sm">
                    Ingresá el valor de tu tratamiento y explorá cómo quedaría tu plan de cuotas.
                </p>
            </div>

            <div className="max-w-lg mx-auto space-y-6">

                {/* Monto */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <label className="block text-xs text-[#D4AF37] tracking-widest uppercase mb-3">
                        Valor del tratamiento (USD)
                    </label>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">USD</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="0.01"
                            value={monto}
                            onChange={e => setMonto(e.target.value)}
                            placeholder="0.00"
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-14 pr-4 py-3 text-white text-xl font-light focus:outline-none focus:border-[#D4AF37] placeholder-gray-600"
                        />
                    </div>
                </div>

                {/* Entrada */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <div className="flex justify-between items-center mb-3">
                        <label className="text-xs text-[#D4AF37] tracking-widest uppercase">
                            Anticipo
                        </label>
                        <span className="text-2xl font-light text-white">{entradaPct}%
                            {breakdown && (
                                <span className="text-sm text-gray-400 ml-2">= USD {fmt(breakdown.upfrontUsd)}</span>
                            )}
                        </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        {UPFRONT_OPTIONS.map(option => (
                            <button
                                key={option}
                                onClick={() => setEntradaPct(option)}
                                className={`py-3 rounded-xl text-center font-medium transition-all ${
                                    entradaPct === option
                                        ? 'bg-[#D4AF37] text-black'
                                        : 'bg-white/5 border border-white/10 text-gray-300 hover:border-[#D4AF37]/50'
                                }`}
                            >
                                {option}%
                            </button>
                        ))}
                    </div>
                </div>

                {/* Cuotas */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <label className="block text-xs text-[#D4AF37] tracking-widest uppercase mb-3">
                        Cantidad de cuotas
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                        {INSTALLMENT_OPTIONS.map(n => (
                            <button
                                key={n}
                                onClick={() => setCuotas(n)}
                                className={`py-3 rounded-xl text-center font-medium transition-all ${
                                    cuotas === n
                                        ? 'bg-[#D4AF37] text-black'
                                        : 'bg-white/5 border border-white/10 text-gray-300 hover:border-[#D4AF37]/50'
                                }`}
                            >
                                {n}x
                            </button>
                        ))}
                    </div>
                </div>

                {/* Resultados */}
                {breakdown && montoNum > 0 ? (
                    <div className="bg-white/5 border border-[#D4AF37]/30 rounded-2xl p-5 space-y-4">
                        <h2 className="text-xs text-[#D4AF37] tracking-widest uppercase">Tu plan</h2>

                        {/* Cuota destacada */}
                        <div className="text-center py-4 border-b border-white/10">
                            <p className="text-gray-400 text-sm mb-1">Cuota mensual</p>
                            <p className="text-5xl font-light text-white">
                                USD <span className="font-medium">{fmt(breakdown.installmentUsd)}</span>
                            </p>
                            {showArs && (
                                <p className="text-[#D4AF37] text-lg mt-1">
                                    ≈ ARS {fmt(breakdown.installmentArs)}
                                </p>
                            )}
                            <p className="text-gray-500 text-xs mt-2">por {cuotas} {cuotas === 1 ? 'mes' : 'meses'}</p>
                        </div>

                        {/* Desglose */}
                        <div className="space-y-2 text-sm">
                            <Row label="Anticipo hoy" value={`USD ${fmt(breakdown.upfrontUsd)}`} sub={showArs ? `ARS ${fmt(breakdown.upfrontArs)}` : undefined} />
                            <div className="border-t border-white/10 pt-2 mt-2">
                                <Row label="Saldo financiado" value={`USD ${fmt(breakdown.financedPrincipalUsd)}`} sub={showArs ? `ARS ${fmt(breakdown.financedPrincipalUsd * bnaNum)}` : undefined} />
                                <Row label={`TNA 18% anual (${DEFAULT_MONTHLY_INTEREST_PCT}% mensual)`} value={`USD ${fmt(breakdown.totalInterestUsd)}`} dimmed />
                                <Row label="Total financiado" value={`USD ${fmt(breakdown.financedTotalUsd)}`} bold sub={showArs ? `ARS ${fmt(breakdown.financedTotalArs)}` : undefined} />
                            </div>
                        </div>
                    </div>
                ) : montoNum === 0 && (
                    <div className="text-center py-8 text-gray-600 text-sm">
                        Ingresá el valor del tratamiento para ver tu simulación.
                    </div>
                )}

                {/* Tipo de cambio (opcional) */}
                <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                    <label className="block text-xs text-[#D4AF37] tracking-widest uppercase mb-3">
                        Tipo de cambio BNA venta (opcional)
                    </label>
                    <p className="text-gray-500 text-xs mb-3">Si completás este campo, se muestran los equivalentes en pesos.</p>
                    <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">ARS/USD</span>
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="1"
                            value={bna}
                            onChange={e => setBna(e.target.value)}
                            placeholder="Ej: 1250"
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-20 pr-4 py-3 text-white focus:outline-none focus:border-[#D4AF37] placeholder-gray-600"
                        />
                    </div>
                </div>

                {/* Compartir */}
                <button
                    onClick={copyLink}
                    className="w-full py-4 rounded-2xl border border-[#D4AF37]/50 text-[#D4AF37] font-medium tracking-wide hover:bg-[#D4AF37]/10 transition-colors"
                >
                    {copied ? '✓ Link copiado' : '🔗 Copiar link de esta simulación'}
                </button>

                {/* Footer */}
                <div className="text-center text-gray-600 text-xs pb-6 space-y-1">
                    <p>AM Clínica · Estética Dental · Buenos Aires</p>
                    <p>TNA 18% anual sobre el saldo financiado.</p>
                    <p>Financiación sujeta a evaluación y preaprobación de cada caso.</p>
                </div>
            </div>
        </div>
    );
}

function Row({ label, value, sub, dimmed, bold }: {
    label: string;
    value: string;
    sub?: string;
    dimmed?: boolean;
    bold?: boolean;
}) {
    return (
        <div className="flex justify-between items-start">
            <span className={dimmed ? 'text-gray-500' : 'text-gray-400'}>{label}</span>
            <div className="text-right">
                <span className={bold ? 'text-white font-medium' : dimmed ? 'text-gray-500' : 'text-white'}>
                    {value}
                </span>
                {sub && <p className="text-[#D4AF37] text-xs">{sub}</p>}
            </div>
        </div>
    );
}
