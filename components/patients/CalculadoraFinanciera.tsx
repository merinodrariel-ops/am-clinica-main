'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Download, ExternalLink, FileSignature, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import MoneyInput from '@/components/ui/MoneyInput';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Paciente } from '@/lib/patients';
import { fetchDolarOficialRate, type DolarOficialRate } from '@/lib/dolar-oficial';
import {
    calculateFinancingBreakdown,
    DEFAULT_MONTHLY_INTEREST_PCT,
    formatArs,
    formatUsd,
} from '@/lib/financial-engine';
import { buildContractMarkdown } from '@/lib/am-dental-contract-template';
import {
    checkContractMakerReadinessAction,
    generateAutomatedContractToDriveAction,
    type ContractMakerReadinessResult,
    type FinancingSimulationPreset,
} from '@/app/actions/contracts';
import { buildFinancingOfferHtml } from '@/lib/financing-offer-template';
import { formatIsoDateEsAr, getContractSchedule } from '@/lib/contract-dates';

interface CalculadoraFinancieraProps {
    patient: Paciente;
    initialPreset?: FinancingSimulationPreset | null;
    singleCtaMode?: boolean;
}

const TOP_TREATMENT_OPTIONS = [
    'Diseno de sonrisa',
    'Rehabilitacion full ceramica',
    'Alineadores invisibles AM',
] as const;

const OTHER_TREATMENT_OPTION = '__other__';
const INSTALLMENT_OPTIONS = [3, 6, 12] as const;
const ANTICIPO_PRESETS = [30, 40, 50] as const;
const MIN_CUSTOM_ANTICIPO = 30;
const MAX_CUSTOM_ANTICIPO = 90;

function clampAnticipo(value: number): number {
    if (!Number.isFinite(value)) return MIN_CUSTOM_ANTICIPO;
    return Math.min(MAX_CUSTOM_ANTICIPO, Math.max(MIN_CUSTOM_ANTICIPO, Math.round(value)));
}

export default function CalculadoraFinanciera({
    patient,
    initialPreset,
    singleCtaMode = false,
}: CalculadoraFinancieraProps) {
    const [selectedTreatment, setSelectedTreatment] = useState<string>('Alineadores invisibles AM');
    const [customTreatment, setCustomTreatment] = useState('');
    const [totalUsd, setTotalUsd] = useState(
        patient.presupuesto_total && patient.presupuesto_total > 0 ? patient.presupuesto_total : 5000
    );
    const [anticipoPct, setAnticipoPct] = useState(30);
    const [cuotas, setCuotas] = useState(12);
    const [manualRate, setManualRate] = useState(0);
    const [rateData, setRateData] = useState<DolarOficialRate | null>(null);
    const [loadingRate, setLoadingRate] = useState(true);
    const [rateError, setRateError] = useState<string | null>(null);
    const [creatingDriveContract, setCreatingDriveContract] = useState(false);
    const [driveContractUrl, setDriveContractUrl] = useState<string | null>(null);
    const [checkingReadiness, setCheckingReadiness] = useState(false);
    const [readiness, setReadiness] = useState<ContractMakerReadinessResult | null>(null);
    const [currentSimulationId, setCurrentSimulationId] = useState<string | null>(null);

    useEffect(() => {
        if (!initialPreset) {
            setCurrentSimulationId(null);
            return;
        }

        const normalizedTreatment = (initialPreset.treatment || '').trim();
        if (normalizedTreatment && TOP_TREATMENT_OPTIONS.includes(normalizedTreatment as (typeof TOP_TREATMENT_OPTIONS)[number])) {
            setSelectedTreatment(normalizedTreatment);
            setCustomTreatment('');
        } else {
            setSelectedTreatment(OTHER_TREATMENT_OPTION);
            setCustomTreatment(normalizedTreatment);
        }

        setTotalUsd(initialPreset.totalUsd > 0 ? initialPreset.totalUsd : 5000);
        setAnticipoPct(clampAnticipo(initialPreset.upfrontPct));
        setCuotas([3, 6, 12].includes(initialPreset.installments) ? initialPreset.installments : 12);
        setManualRate(initialPreset.bnaVentaArs > 0 ? initialPreset.bnaVentaArs : 0);
        setCurrentSimulationId(initialPreset.simulationId);
    }, [initialPreset]);

    const tratamiento = useMemo(() => {
        if (selectedTreatment === OTHER_TREATMENT_OPTION) {
            return customTreatment.trim();
        }
        return selectedTreatment;
    }, [selectedTreatment, customTreatment]);

    const contractSchedule = useMemo(() => getContractSchedule(), []);
    const contractDateDisplay = useMemo(
        () => formatIsoDateEsAr(contractSchedule.contractDateIso),
        [contractSchedule.contractDateIso]
    );
    const firstDueDateDisplay = useMemo(
        () => formatIsoDateEsAr(contractSchedule.firstDueDateIso),
        [contractSchedule.firstDueDateIso]
    );

    const loadRate = useCallback(async () => {
        try {
            setLoadingRate(true);
            setRateError(null);
            const data = await fetchDolarOficialRate();
            setRateData(data);
        } catch (error) {
            setRateError(error instanceof Error ? error.message : 'No se pudo cargar la cotizacion.');
        } finally {
            setLoadingRate(false);
        }
    }, []);

    useEffect(() => {
        void loadRate();
    }, [loadRate]);

    const bnaVenta = manualRate > 0 ? manualRate : rateData?.venta || 0;

    const setAnticipoByUsd = useCallback((usdValue: number) => {
        if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
            setAnticipoPct(MIN_CUSTOM_ANTICIPO);
            return;
        }
        const pct = (usdValue / totalUsd) * 100;
        setAnticipoPct(clampAnticipo(pct));
    }, [totalUsd]);

    const quote = useMemo(
        () =>
            calculateFinancingBreakdown({
                totalUsd,
                upfrontPct: anticipoPct,
                installments: cuotas,
                monthlyInterestPct: DEFAULT_MONTHLY_INTEREST_PCT,
                bnaVentaArs: bnaVenta,
            }),
        [totalUsd, anticipoPct, cuotas, bnaVenta]
    );

    const contractMarkdown = useMemo(() => {
        return buildContractMarkdown({
            fechaContrato: contractDateDisplay,
            pacienteNombreCompleto: `${patient.nombre} ${patient.apellido}`.trim(),
            pacienteDocumento: patient.documento || '-',
            pacienteDomicilio: patient.direccion || '-',
            pacienteEmail: patient.email || '-',
            tratamiento,
            montoTotalUsd: quote.totalUsd,
            montoTotalArs: quote.totalArs,
            anticipoPct: quote.upfrontPct,
            anticipoUsd: quote.upfrontUsd,
            anticipoArs: quote.upfrontArs,
            saldoFinanciadoUsd: quote.financedPrincipalUsd,
            saldoFinanciadoArs: quote.financedTotalArs,
            cuotas: quote.installments,
            cuotaUsd: quote.installmentUsd,
            cuotaArs: quote.installmentArs,
            interesMensualPct: quote.monthlyInterestPct,
            punitorioDiarioPct: quote.dailyPenaltyPct,
            punitorioDiarioCuotaUsd: quote.dailyPenaltyPerInstallmentUsd,
            punitorioDiarioCuotaArs: quote.dailyPenaltyPerInstallmentArs,
            bnaVenta: quote.bnaVentaArs,
            fechaPrimeraCuota: firstDueDateDisplay,
        });
    }, [patient, tratamiento, quote, contractDateDisplay, firstDueDateDisplay]);

    const financingOfferHtml = useMemo(() => {
        return buildFinancingOfferHtml({
            treatment: tratamiento || 'Tratamiento odontologico',
            totalUsd: quote.totalUsd,
            installments: quote.installments,
            bnaVentaArs: bnaVenta,
        });
    }, [tratamiento, quote.totalUsd, quote.installments, bnaVenta]);

    const handleCopyContract = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(contractMarkdown);
            toast.success('Contrato copiado al portapapeles.');
        } catch {
            toast.error('No se pudo copiar el contrato.');
        }
    }, [contractMarkdown]);

    const handleDownloadContract = useCallback(() => {
        const blob = new Blob([contractMarkdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `contrato-${patient.apellido || 'paciente'}-${patient.nombre || 'am-dental'}.md`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
    }, [contractMarkdown, patient.apellido, patient.nombre]);

    const handleCopyOfferHtml = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(financingOfferHtml);
            toast.success('Bloque HTML de financiacion copiado para presupuesto.');
        } catch {
            toast.error('No se pudo copiar el bloque HTML.');
        }
    }, [financingOfferHtml]);

    const runReadinessCheck = useCallback(async () => {
        setCheckingReadiness(true);
        try {
            const result = await checkContractMakerReadinessAction({
                patientId: patient.id_paciente,
                bnaVenta,
            });
            setReadiness(result);
            return result;
        } finally {
            setCheckingReadiness(false);
        }
    }, [patient.id_paciente, bnaVenta]);

    useEffect(() => {
        if (!patient.id_paciente) return;
        const timer = setTimeout(() => {
            void runReadinessCheck();
        }, 250);
        return () => clearTimeout(timer);
    }, [patient.id_paciente, bnaVenta, runReadinessCheck]);

    const handleGenerateInDrive = useCallback(async () => {
        if (!tratamiento.trim()) {
            toast.error('Completa el tratamiento antes de generar el contrato.');
            return;
        }
        if (bnaVenta <= 0) {
            toast.error('No hay cotizacion BNA Venta valida para generar el contrato.');
            return;
        }

        const readinessResult = await runReadinessCheck();
        if (!readinessResult.ready) {
            toast.error('ContratoMaker no está listo. Revisa el semáforo de verificación.');
            return;
        }

        try {
            setCreatingDriveContract(true);
            const result = await generateAutomatedContractToDriveAction({
                patientId: patient.id_paciente,
                tratamiento,
                totalUsd,
                anticipoPct,
                cuotas,
                bnaVenta,
                simulationId: currentSimulationId || undefined,
            });

            if (!result.success) {
                toast.error(result.error || 'No se pudo generar el contrato en Drive.');
                return;
            }

            setDriveContractUrl(result.url || null);
            toast.success('Contrato legal generado en Drive (plantilla base). Imprimi y firma a puno y letra.');
        } finally {
            setCreatingDriveContract(false);
        }
    }, [patient.id_paciente, tratamiento, bnaVenta, totalUsd, anticipoPct, cuotas, runReadinessCheck, currentSimulationId]);

    const readinessChecks = readiness?.checks;
    const readinessRows = readinessChecks
        ? [
            { key: 'paciente', label: 'Paciente', ...readinessChecks.paciente },
            { key: 'cotizacion', label: 'Cotización BNA', ...readinessChecks.cotizacion },
            { key: 'carpeta', label: 'Carpeta contrato', ...readinessChecks.carpeta },
            { key: 'plantilla', label: 'Plantilla legal', ...readinessChecks.plantilla },
        ]
        : [];

    return (
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-slate-100 shadow-2xl shadow-cyan-900/20">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">AM CLINICA DENTAL · Fintech Engine</p>
                    <h3 className="mt-1 text-xl font-semibold text-white">ContratoMaker Financiero</h3>
                </div>
                <div className="rounded-xl border border-cyan-300/20 bg-slate-900/70 px-3 py-2 text-right text-xs">
                    <p className="text-slate-400">USD base + ARS equivalente diario</p>
                    <p className="font-mono text-cyan-300">BNA Venta: {bnaVenta > 0 ? formatArs(bnaVenta) : 'Sin cotizacion'}</p>
                </div>
            </div>

            {initialPreset && (
                <div className="mb-5 rounded-xl border border-cyan-300/30 bg-cyan-400/10 px-4 py-3 text-xs text-cyan-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p>
                            Simulacion precargada: <span className="font-semibold">{initialPreset.treatment}</span> · estado <span className="font-semibold uppercase">{initialPreset.status}</span>
                        </p>
                        <a
                            href={initialPreset.shareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 underline"
                        >
                            Ver link compartido <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            )}

            <div className="mb-6 rounded-xl border border-slate-700 bg-white/5 p-4 backdrop-blur-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm text-slate-300">Cotizacion oficial del dia</p>
                        <p className="text-xs text-slate-400">
                            {loadingRate
                                ? 'Consultando API...'
                                : rateData
                                    ? `Fuente: ${rateData.source} · ${new Date(rateData.fetchedAt).toLocaleString('es-AR')}`
                                    : 'Sin datos de cotizacion'}
                        </p>
                        {rateError && <p className="mt-1 text-xs text-amber-300">{rateError}</p>}
                    </div>
                    <button
                        type="button"
                        onClick={() => void loadRate()}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                        <RefreshCw size={14} />
                        Actualizar
                    </button>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                        <Label className="text-xs text-slate-300">Cotizacion BNA Venta</Label>
                        <p className="font-mono text-lg text-white">{bnaVenta > 0 ? formatArs(bnaVenta) : '-'}</p>
                    </div>
                    <div>
                        <Label htmlFor="manual-rate" className="text-xs text-slate-300">Override manual (opcional)</Label>
                        <Input
                            id="manual-rate"
                            type="number"
                            min="0"
                            step="0.01"
                            value={manualRate || ''}
                            onChange={(event) => setManualRate(Number(event.target.value) || 0)}
                            placeholder="Ej: 1245.50"
                            className="mt-1 border-slate-600 bg-slate-800/70 text-slate-100"
                        />
                    </div>
                </div>

                <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-cyan-300">Semáforo ContratoMaker</p>
                        <button
                            type="button"
                            onClick={() => void runReadinessCheck()}
                            disabled={checkingReadiness}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-60"
                        >
                            <RefreshCw size={12} className={checkingReadiness ? 'animate-spin' : ''} />
                            {checkingReadiness ? 'Verificando...' : 'Verificar estado'}
                        </button>
                    </div>

                    {readinessRows.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                            {readinessRows.map((row) => (
                                <div key={row.key} className="flex items-start gap-2 rounded-md border border-slate-700/80 bg-slate-950/50 px-2 py-1.5">
                                    {row.ok ? (
                                        <CheckCircle2 size={13} className="mt-0.5 text-emerald-400" />
                                    ) : (
                                        <AlertTriangle size={13} className="mt-0.5 text-amber-400" />
                                    )}
                                    <div className="min-w-0">
                                        <p className="text-[11px] font-semibold text-slate-200">{row.label}</p>
                                        <p className="text-[10px] text-slate-400 break-words">{row.detail}</p>
                                        {'url' in row && row.url && (
                                            <a
                                                href={row.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-cyan-300 hover:underline"
                                            >
                                                Abrir recurso <ExternalLink size={10} />
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <div className="space-y-5 rounded-xl border border-slate-700 bg-white/5 p-4 backdrop-blur-sm">
                    <div>
                        <Label htmlFor="tratamiento-select" className="text-xs text-slate-300">
                            Tratamiento
                        </Label>
                        <select
                            id="tratamiento-select"
                            value={selectedTreatment}
                            onChange={(event) => setSelectedTreatment(event.target.value)}
                            className="mt-1 flex h-10 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
                        >
                            {TOP_TREATMENT_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                    {option}
                                </option>
                            ))}
                            <option value={OTHER_TREATMENT_OPTION}>Otros (especificar)</option>
                        </select>

                        {selectedTreatment === OTHER_TREATMENT_OPTION && (
                            <Input
                                id="tratamiento-custom"
                                value={customTreatment}
                                onChange={(event) => setCustomTreatment(event.target.value)}
                                className="mt-2 border-slate-600 bg-slate-800/70 text-slate-100"
                                placeholder="Ej: Endodoncia o Cirugia"
                            />
                        )}
                    </div>

                    <div>
                        <Label className="text-xs text-slate-300">Monto total del tratamiento (USD)</Label>
                        <MoneyInput
                            value={totalUsd}
                            onChange={setTotalUsd}
                            currency="USD"
                            className="mt-1 border-slate-600 bg-slate-800/70 text-slate-100"
                        />
                    </div>

                    <div>
                        <Label className="text-xs text-slate-300">Esquema de entrega inicial</Label>
                        <div className="mt-2 flex gap-2">
                            {ANTICIPO_PRESETS.map((percent) => (
                                <button
                                    key={percent}
                                    type="button"
                                    onClick={() => setAnticipoPct(percent)}
                                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                                        anticipoPct === percent
                                            ? 'bg-cyan-400 text-slate-900 shadow-lg shadow-cyan-500/30'
                                            : 'border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700'
                                    }`}
                                >
                                    {percent}%
                                </button>
                            ))}
                        </div>
                        <div className="mt-2">
                            <Label htmlFor="anticipo-custom" className="text-[11px] text-slate-400">
                                O ingresar porcentaje libre (30% a 90%)
                            </Label>
                            <Input
                                id="anticipo-custom"
                                type="number"
                                min={MIN_CUSTOM_ANTICIPO}
                                max={MAX_CUSTOM_ANTICIPO}
                                step={1}
                                value={anticipoPct}
                                onChange={(event) => setAnticipoPct(clampAnticipo(Number(event.target.value)))}
                                className="mt-1 border-slate-600 bg-slate-800/70 text-slate-100"
                            />
                        </div>
                        <div className="mt-2">
                            <Label className="text-[11px] text-slate-400">
                                Si el paciente dice un monto de adelanto, ingresalo en USD
                            </Label>
                            <MoneyInput
                                value={quote.upfrontUsd}
                                onChange={setAnticipoByUsd}
                                currency="USD"
                                className="mt-1 border-slate-600 bg-slate-800/70 text-slate-100"
                            />
                        </div>
                    </div>

                    <div>
                        <div className="mb-2 flex items-center justify-between">
                            <Label className="text-xs text-slate-300">Cantidad de cuotas</Label>
                            <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-sm text-cyan-300">{cuotas}</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            {INSTALLMENT_OPTIONS.map((option) => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setCuotas(option)}
                                    className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
                                        cuotas === option
                                            ? 'bg-cyan-400 text-slate-900 shadow-lg shadow-cyan-500/30'
                                            : 'border border-slate-600 bg-slate-800/70 text-slate-200 hover:bg-slate-700'
                                    }`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">Opciones habilitadas: 3, 6 o 12 cuotas.</p>
                    </div>

                    <div className="rounded-lg border border-slate-700 bg-slate-900/50 p-3">
                        <p className="text-xs font-semibold text-cyan-300">Vencimientos automáticos</p>
                        <p className="mt-1 text-xs text-slate-300">
                            Fecha de firma: <strong>{contractDateDisplay}</strong>
                        </p>
                        <p className="text-xs text-slate-300">
                            1ra cuota: <strong>{firstDueDateDisplay}</strong> (día 07 del mes siguiente)
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/5 p-4 backdrop-blur-sm">
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Summary Card</p>
                    <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between"><span>Total USD</span><span className="font-mono">{formatUsd(quote.totalUsd)}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Total ARS (hoy)</span><span className="font-mono">{formatArs(quote.totalArs)}</span></div>
                        <div className="my-2 border-t border-slate-700" />
                        <div className="flex justify-between"><span>Anticipo {quote.upfrontPct}%</span><span className="font-mono">{formatUsd(quote.upfrontUsd)}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Anticipo ARS</span><span className="font-mono">{formatArs(quote.upfrontArs)}</span></div>
                        <div className="my-2 border-t border-slate-700" />
                        <div className="flex justify-between"><span>Saldo financiado</span><span className="font-mono">{formatUsd(quote.financedPrincipalUsd)}</span></div>
                        <div className="flex justify-between"><span>Interes simple ({quote.monthlyInterestPct}% x {quote.installments})</span><span className="font-mono">{formatUsd(quote.totalInterestUsd)}</span></div>
                        <div className="flex justify-between font-semibold text-cyan-300"><span>Total financiado</span><span className="font-mono">{formatUsd(quote.financedTotalUsd)}</span></div>
                        <div className="my-2 border-t border-slate-700" />
                        <div className="flex justify-between text-lg font-bold text-white"><span>Cuota fija</span><span className="font-mono">{formatUsd(quote.installmentUsd)}</span></div>
                        <div className="flex justify-between text-slate-300"><span>Cuota ARS (hoy)</span><span className="font-mono">{formatArs(quote.installmentArs)}</span></div>
                        <div className="my-2 border-t border-slate-700" />
                        <div className="flex justify-between text-amber-300"><span>Punitorio diario ({quote.dailyPenaltyPct.toFixed(2)}%)</span><span className="font-mono">{formatUsd(quote.dailyPenaltyPerInstallmentUsd)}</span></div>
                        <div className="flex justify-between text-amber-300/90"><span>Punitorio diario ARS</span><span className="font-mono">{formatArs(quote.dailyPenaltyPerInstallmentArs)}</span></div>
                    </div>
                </div>
            </div>

            <div className="mt-6 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-white">Generador de contrato (template legal)</p>
                        <p className="text-xs text-slate-400">
                            Incluye monto total, anticipo, plan de cuotas y clausula de mora ({quote.dailyPenaltyPct.toFixed(2)}% diario). Firma valida: manuscrita.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => void handleGenerateInDrive()}
                            disabled={creatingDriveContract || checkingReadiness || !readiness?.ready}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-xs font-medium text-emerald-100 transition hover:bg-emerald-400/30 disabled:opacity-60"
                        >
                            <FileSignature size={14} />
                            {creatingDriveContract ? 'Generando...' : 'Generar contrato legal en Drive'}
                        </button>
                        {!singleCtaMode && (
                            <>
                                <button
                                    type="button"
                                    onClick={() => void handleCopyContract()}
                                    className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
                                >
                                    <Copy size={14} />
                                    Copiar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDownloadContract}
                                    className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-400/20 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-400/30"
                                >
                                    <Download size={14} />
                                    Descargar .md
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {driveContractUrl && (
                    <div className="mb-3 rounded-lg border border-emerald-300/30 bg-emerald-400/10 p-2 text-xs text-emerald-100">
                        <div className="flex items-center justify-between gap-2">
                            <span>Contrato guardado en carpeta madre. Imprimir para firma manuscrita (puno y letra).</span>
                            <a
                                href={driveContractUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 underline"
                            >
                                Abrir en Drive <ExternalLink size={12} />
                            </a>
                        </div>
                    </div>
                )}

                <pre className="max-h-80 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 whitespace-pre-wrap">
                    {contractMarkdown}
                </pre>
            </div>

            {!singleCtaMode && (
                <div className="mt-6 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-white">Presentacion HTML para presupuesto</p>
                            <p className="text-xs text-slate-400">
                                Bloque visual listo para pegar en propuesta comercial con opciones de financiacion.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => void handleCopyOfferHtml()}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 transition hover:bg-slate-700"
                        >
                            <Copy size={14} />
                            Copiar HTML
                        </button>
                    </div>

                    <pre className="max-h-64 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200 whitespace-pre-wrap">
                        {financingOfferHtml}
                    </pre>
                </div>
            )}
        </div>
    );
}
