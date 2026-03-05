'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Copy, ExternalLink, Loader2, MessageCircle, RefreshCw, Send } from 'lucide-react';
import { toast } from 'sonner';
import MoneyInput from '@/components/ui/MoneyInput';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import type { Paciente } from '@/lib/patients';
import { fetchDolarOficialRate, type DolarOficialRate } from '@/lib/dolar-oficial';
import {
    createFinancingSimulationAction,
    generateAutomatedContractToDriveAction,
    getFinancingSimulationPresetAction,
    listFinancingSimulationsByPatientAction,
    type FinancingSimulationPreset,
    type FinancingSimulationRecord,
} from '@/app/actions/contracts';
import { formatArs, formatUsd } from '@/lib/financial-engine';

const TOP_TREATMENT_OPTIONS = [
    'Diseno de sonrisa',
    'Rehabilitacion full ceramica',
    'Alineadores invisibles AM',
] as const;

const OTHER_TREATMENT_OPTION = '__other__';
const INSTALLMENT_OPTIONS = [3, 6, 12] as const;
const UPFRONT_OPTIONS = [30, 40, 50] as const;
type WhatsappMessageMode = 'short' | 'formal';

interface SimuladorFinanciacionProps {
    patient: Paciente;
    onUseInContract: (preset: FinancingSimulationPreset) => void;
}

function formatSimulationDate(iso: string): string {
    return new Date(iso).toLocaleString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function sanitizePhone(raw: string | null | undefined): string {
    return (raw || '').replace(/\D/g, '');
}

function buildWhatsappUrl(params: {
    phone?: string | null;
    patientName: string;
    treatment: string;
    shareUrl: string;
    expiresAt: string;
    mode?: WhatsappMessageMode;
}): string {
    const expires = new Date(params.expiresAt).toLocaleDateString('es-AR');
    const mode = params.mode || 'short';

    const text = mode === 'formal'
        ? [
            `Hola ${params.patientName || ''}`.trim(),
            '',
            `Desde AM Clinica Dental le compartimos su simulacion de financiacion para ${params.treatment}.`,
            'Puede seleccionar anticipo y cuotas en el siguiente enlace:',
            params.shareUrl,
            '',
            `El enlace estara vigente hasta ${expires}.`,
            'Quedamos a disposicion para cualquier consulta.',
            'AM Clinica Dental',
        ].join('\n')
        : [
            `Hola ${params.patientName || ''}`.trim(),
            '',
            `Tu simulacion de ${params.treatment}:`,
            params.shareUrl,
            `Vigencia: ${expires}`,
            'AM Clinica Dental',
        ].join('\n');

    const encoded = encodeURIComponent(text);
    const cleanPhone = sanitizePhone(params.phone);
    if (cleanPhone.length >= 8) {
        return `https://wa.me/${cleanPhone}?text=${encoded}`;
    }
    return `https://wa.me/?text=${encoded}`;
}

function getStatusBadgeStyle(status: FinancingSimulationRecord['status']): {
    className: string;
    label: string;
} {
    switch (status) {
        case 'contracted':
            return {
                className: 'border-emerald-300/25 bg-emerald-400/10 text-emerald-200',
                label: 'Contrato listo',
            };
        case 'selected':
            return {
                className: 'border-cyan-300/25 bg-cyan-400/10 text-cyan-200',
                label: 'Paciente eligio',
            };
        case 'expired':
            return {
                className: 'border-amber-300/25 bg-amber-400/10 text-amber-200',
                label: 'Expirada',
            };
        default:
            return {
                className: 'border-slate-300/25 bg-slate-400/10 text-slate-200',
                label: 'Link enviado',
            };
    }
}

function playNotificationTone() {
    try {
        const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(980, audioContext.currentTime);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.16, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.22);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.23);

        window.setTimeout(() => {
            void audioContext.close();
        }, 300);
    } catch {
        // Non-blocking: some browsers can deny auto audio.
    }
}

export default function SimuladorFinanciacion({ patient, onUseInContract }: SimuladorFinanciacionProps) {
    const [selectedTreatment, setSelectedTreatment] = useState<string>('Alineadores invisibles AM');
    const [customTreatment, setCustomTreatment] = useState('');
    const [totalUsd, setTotalUsd] = useState(
        patient.presupuesto_total && patient.presupuesto_total > 0 ? patient.presupuesto_total : 5000
    );
    const [manualRate, setManualRate] = useState(0);
    const [rateData, setRateData] = useState<DolarOficialRate | null>(null);
    const [loadingRate, setLoadingRate] = useState(true);
    const [creating, setCreating] = useState(false);
    const [loadingList, setLoadingList] = useState(false);
    const [usingSimulationId, setUsingSimulationId] = useState<string | null>(null);
    const [expiresInDays, setExpiresInDays] = useState(14);
    const [allowedInstallments, setAllowedInstallments] = useState<number[]>([3, 6, 12]);
    const [allowedUpfronts, setAllowedUpfronts] = useState<number[]>([30, 40, 50]);
    const [simulations, setSimulations] = useState<FinancingSimulationRecord[]>([]);
    const [latestShareUrl, setLatestShareUrl] = useState<string | null>(null);
    const [messageMode, setMessageMode] = useState<WhatsappMessageMode>('short');
    const [pendingOnly, setPendingOnly] = useState(false);
    const [generatingContractSimulationId, setGeneratingContractSimulationId] = useState<string | null>(null);
    const previousStatusRef = useRef<Record<string, FinancingSimulationRecord['status']>>({});

    const tratamiento = useMemo(() => {
        if (selectedTreatment === OTHER_TREATMENT_OPTION) {
            return customTreatment.trim();
        }
        return selectedTreatment;
    }, [selectedTreatment, customTreatment]);

    const patientName = useMemo(() => {
        return `${patient.nombre || ''} ${patient.apellido || ''}`.trim() || 'paciente';
    }, [patient.apellido, patient.nombre]);

    const bnaVenta = manualRate > 0 ? manualRate : rateData?.venta || 0;

    const latestSelectedSimulation = useMemo(() => {
        return simulations.find((simulation) => simulation.status === 'selected') || null;
    }, [simulations]);

    const latestSimulation = useMemo(() => {
        return simulations[0] || null;
    }, [simulations]);

    const pendingSharedCount = useMemo(() => {
        return simulations.filter((simulation) => simulation.status === 'shared').length;
    }, [simulations]);

    const displayedSimulations = useMemo(() => {
        if (!pendingOnly) return simulations;
        return simulations.filter((simulation) => simulation.status === 'shared');
    }, [pendingOnly, simulations]);

    const loadRate = useCallback(async () => {
        try {
            setLoadingRate(true);
            const data = await fetchDolarOficialRate();
            setRateData(data);
        } catch {
            toast.error('No se pudo cargar la cotizacion oficial.');
        } finally {
            setLoadingRate(false);
        }
    }, []);

    const loadSimulations = useCallback(async (silent = false) => {
        if (!patient.id_paciente) return;
        if (!silent) {
            setLoadingList(true);
        }
        try {
            const result = await listFinancingSimulationsByPatientAction(patient.id_paciente);
            if (!result.success) {
                if (!silent) {
                    toast.error(result.error || 'No se pudieron cargar las simulaciones.');
                }
                return;
            }

            const previousMap = previousStatusRef.current;
            const nextMap: Record<string, FinancingSimulationRecord['status']> = {};
            const newlySelected = result.simulations.filter((simulation) => {
                nextMap[simulation.id] = simulation.status;
                return previousMap[simulation.id] && previousMap[simulation.id] !== 'selected' && simulation.status === 'selected';
            });

            setSimulations(result.simulations);
            previousStatusRef.current = nextMap;

            if (newlySelected.length > 0) {
                const latest = newlySelected[0];
                playNotificationTone();
                toast.success(`Paciente eligio una opcion: ${latest.treatment}`, {
                    description: 'Ya puedes continuar directo con ContractMaker.',
                    duration: 6000,
                });
            }
        } finally {
            if (!silent) {
                setLoadingList(false);
            }
        }
    }, [patient.id_paciente]);

    useEffect(() => {
        void loadRate();
    }, [loadRate]);

    useEffect(() => {
        setLatestShareUrl(null);
        void loadSimulations();
    }, [loadSimulations]);

    useEffect(() => {
        if (!patient.id_paciente) return;
        const intervalId = window.setInterval(() => {
            void loadSimulations(true);
        }, 30000);

        return () => window.clearInterval(intervalId);
    }, [patient.id_paciente, loadSimulations]);

    const openWhatsapp = useCallback((payload: {
        treatment: string;
        shareUrl: string;
        expiresAt: string;
        mode?: WhatsappMessageMode;
    }) => {
        const whatsappUrl = buildWhatsappUrl({
            phone: patient.whatsapp,
            patientName,
            treatment: payload.treatment,
            shareUrl: payload.shareUrl,
            expiresAt: payload.expiresAt,
            mode: payload.mode || messageMode,
        });
        window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }, [messageMode, patient.whatsapp, patientName]);

    const handleCopyAndOpenWhatsapp = useCallback(async (simulation: FinancingSimulationRecord) => {
        try {
            await navigator.clipboard.writeText(simulation.shareUrl);
            toast.success('Link copiado y WhatsApp abierto.');
        } catch {
            toast.error('No se pudo copiar el link, pero abrimos WhatsApp igual.');
        } finally {
            openWhatsapp({
                treatment: simulation.treatment,
                shareUrl: simulation.shareUrl,
                expiresAt: simulation.expiresAt,
            });
        }
    }, [openWhatsapp]);

    const toggleInstallment = useCallback((value: number) => {
        setAllowedInstallments((current) => {
            if (current.includes(value)) {
                const next = current.filter((entry) => entry !== value);
                return next.length > 0 ? next : current;
            }
            return [...current, value].sort((a, b) => a - b);
        });
    }, []);

    const toggleUpfront = useCallback((value: number) => {
        setAllowedUpfronts((current) => {
            if (current.includes(value)) {
                const next = current.filter((entry) => entry !== value);
                return next.length > 0 ? next : current;
            }
            return [...current, value].sort((a, b) => a - b);
        });
    }, []);

    const handleCreateSimulation = useCallback(async () => {
        if (!tratamiento) {
            toast.error('Completa el tratamiento para compartir la simulacion.');
            return;
        }
        if (!Number.isFinite(totalUsd) || totalUsd <= 0) {
            toast.error('El monto total USD debe ser mayor a 0.');
            return;
        }
        if (!Number.isFinite(bnaVenta) || bnaVenta <= 0) {
            toast.error('No hay cotizacion BNA valida para compartir.');
            return;
        }

        setCreating(true);
        try {
            const result = await createFinancingSimulationAction({
                patientId: patient.id_paciente,
                treatment: tratamiento,
                totalUsd,
                bnaVentaArs: bnaVenta,
                baseInstallments: allowedInstallments[allowedInstallments.length - 1] || 12,
                allowedInstallmentOptions: allowedInstallments,
                allowedUpfrontOptions: allowedUpfronts,
                expiresInDays,
            });

            if (!result.success || !result.simulation) {
                toast.error(result.error || 'No se pudo generar la simulacion compartible.');
                return;
            }

            setLatestShareUrl(result.simulation.shareUrl);
            setSimulations((current) => [result.simulation!, ...current]);
            toast.success('Simulacion creada y lista para enviar al paciente.');

            openWhatsapp({
                treatment: result.simulation.treatment,
                shareUrl: result.simulation.shareUrl,
                expiresAt: result.simulation.expiresAt,
            });
        } finally {
            setCreating(false);
        }
    }, [
        patient.id_paciente,
        tratamiento,
        totalUsd,
        bnaVenta,
        allowedInstallments,
        allowedUpfronts,
        expiresInDays,
        openWhatsapp,
    ]);

    const handleCopyLink = useCallback(async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success('Link copiado al portapapeles.');
        } catch {
            toast.error('No se pudo copiar el link.');
        }
    }, []);

    const handleUseInContract = useCallback(async (simulationId: string) => {
        setUsingSimulationId(simulationId);
        try {
            const result = await getFinancingSimulationPresetAction(patient.id_paciente, simulationId);
            if (!result.success || !result.preset) {
                toast.error(result.error || 'No se pudo cargar la simulacion para contrato.');
                return;
            }
            onUseInContract(result.preset);
            toast.success('Simulacion cargada en ContractMaker.');
        } finally {
            setUsingSimulationId(null);
        }
    }, [onUseInContract, patient.id_paciente]);

    const handleGenerateContractNow = useCallback(async (simulation: FinancingSimulationRecord) => {
        if (simulation.status !== 'selected') return;

        setGeneratingContractSimulationId(simulation.id);
        try {
            const presetResult = await getFinancingSimulationPresetAction(patient.id_paciente, simulation.id);
            if (!presetResult.success || !presetResult.preset) {
                toast.error(presetResult.error || 'No se pudo preparar el contrato.');
                return;
            }

            const preset = presetResult.preset;
            const result = await generateAutomatedContractToDriveAction({
                patientId: patient.id_paciente,
                tratamiento: preset.treatment,
                totalUsd: preset.totalUsd,
                anticipoPct: preset.upfrontPct,
                cuotas: preset.installments,
                bnaVenta: preset.bnaVentaArs,
                simulationId: preset.simulationId,
            });

            if (!result.success) {
                toast.error(result.error || 'No se pudo generar el contrato en Drive.');
                return;
            }

            toast.success('Contrato generado en Drive.');
            if (result.url) {
                window.open(result.url, '_blank', 'noopener,noreferrer');
            }

            await loadSimulations(true);
        } finally {
            setGeneratingContractSimulationId(null);
        }
    }, [loadSimulations, patient.id_paciente]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target) {
                const tag = target.tagName.toLowerCase();
                if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
                    return;
                }
            }

            if (event.key === 'Enter' && latestSimulation) {
                event.preventDefault();
                openWhatsapp({
                    treatment: latestSimulation.treatment,
                    shareUrl: latestSimulation.shareUrl,
                    expiresAt: latestSimulation.expiresAt,
                });
                return;
            }

            if ((event.key === 'g' || event.key === 'G') && latestSelectedSimulation) {
                event.preventDefault();
                void handleGenerateContractNow(latestSelectedSimulation);
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [handleGenerateContractNow, latestSelectedSimulation, latestSimulation, openWhatsapp]);

    return (
        <div className="space-y-5 rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-5 text-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Flujo Paciente</p>
                    <h3 className="text-lg font-semibold text-white">Simulador compartible</h3>
                    <p className="text-xs text-slate-400">Crea un link para que el paciente elija anticipo y cuotas.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {latestSimulation && (
                        <button
                            type="button"
                            onClick={() => openWhatsapp({
                                treatment: latestSimulation.treatment,
                                shareUrl: latestSimulation.shareUrl,
                                expiresAt: latestSimulation.expiresAt,
                            })}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-300/40 bg-emerald-400/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/30"
                        >
                            <MessageCircle size={14} />
                            Reenviar ultimo link
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            void loadRate();
                            void loadSimulations();
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-700"
                    >
                        <RefreshCw size={14} />
                        Actualizar
                    </button>
                </div>
            </div>

            <p className="text-[11px] text-slate-500">Estado de simulaciones con auto-refresh cada 30s.</p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                <span className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1">Pendientes: {pendingSharedCount}</span>
                <span>Atajos: Enter reenvia WhatsApp · G genera contrato del seleccionado</span>
            </div>

            {latestSelectedSimulation && (
                <div className="rounded-xl border border-cyan-300/30 bg-cyan-400/10 p-3 text-xs text-cyan-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-2">
                            <CheckCircle2 size={14} />
                            El paciente ya eligio una opcion. Continua directo con ContractMaker.
                        </p>
                        <button
                            type="button"
                            onClick={() => void handleUseInContract(latestSelectedSimulation.id)}
                            disabled={usingSimulationId === latestSelectedSimulation.id}
                            className="inline-flex items-center gap-1 rounded-md border border-cyan-200/35 bg-cyan-400/20 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 disabled:opacity-60"
                        >
                            {usingSimulationId === latestSelectedSimulation.id ? <Loader2 size={11} className="animate-spin" /> : null}
                            Continuar a ContractMaker
                        </button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="space-y-4 rounded-xl border border-slate-700 bg-white/5 p-4">
                    <div>
                        <Label htmlFor="sim-treatment" className="text-xs text-slate-300">Tratamiento</Label>
                        <select
                            id="sim-treatment"
                            value={selectedTreatment}
                            onChange={(event) => setSelectedTreatment(event.target.value)}
                            className="mt-1 flex h-10 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                        >
                            {TOP_TREATMENT_OPTIONS.map((option) => (
                                <option key={option} value={option}>{option}</option>
                            ))}
                            <option value={OTHER_TREATMENT_OPTION}>Otros (especificar)</option>
                        </select>
                        {selectedTreatment === OTHER_TREATMENT_OPTION && (
                            <Input
                                value={customTreatment}
                                onChange={(event) => setCustomTreatment(event.target.value)}
                                className="mt-2 border-slate-600 bg-slate-800/70 text-slate-100"
                                placeholder="Ej: Rehabilitacion integral"
                            />
                        )}
                    </div>

                    <div>
                        <Label className="text-xs text-slate-300">Monto total (USD)</Label>
                        <MoneyInput
                            value={totalUsd}
                            onChange={setTotalUsd}
                            currency="USD"
                            className="mt-1 border-slate-600 bg-slate-800/70 text-slate-100"
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div>
                            <Label className="text-xs text-slate-300">BNA Venta</Label>
                            <p className="mt-1 font-mono text-white">{bnaVenta > 0 ? formatArs(bnaVenta) : 'Sin cotizacion'}</p>
                            <p className="text-[11px] text-slate-500">
                                {loadingRate ? 'Consultando API...' : rateData ? `Fuente: ${rateData.source}` : 'Carga manual requerida'}
                            </p>
                        </div>
                        <div>
                            <Label htmlFor="sim-manual-rate" className="text-xs text-slate-300">Override manual</Label>
                            <Input
                                id="sim-manual-rate"
                                type="number"
                                min="0"
                                step="0.01"
                                value={manualRate || ''}
                                onChange={(event) => setManualRate(Number(event.target.value) || 0)}
                                className="mt-1 border-slate-600 bg-slate-800/70 text-slate-100"
                                placeholder="Ej: 1234.50"
                            />
                        </div>
                    </div>
                </div>

                <div className="space-y-4 rounded-xl border border-slate-700 bg-white/5 p-4">
                    <div>
                        <Label className="text-xs text-slate-300">Opciones de anticipo para paciente</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {UPFRONT_OPTIONS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => toggleUpfront(value)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                        allowedUpfronts.includes(value)
                                            ? 'bg-cyan-400 text-slate-900'
                                            : 'border border-slate-600 bg-slate-800 text-slate-200'
                                    }`}
                                >
                                    {value}%
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs text-slate-300">Opciones de cuotas para paciente</Label>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {INSTALLMENT_OPTIONS.map((value) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => toggleInstallment(value)}
                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                        allowedInstallments.includes(value)
                                            ? 'bg-cyan-400 text-slate-900'
                                            : 'border border-slate-600 bg-slate-800 text-slate-200'
                                    }`}
                                >
                                    {value} cuotas
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs text-slate-300">Formato de mensaje WhatsApp</Label>
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                onClick={() => setMessageMode('short')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    messageMode === 'short'
                                        ? 'bg-cyan-400 text-slate-900'
                                        : 'border border-slate-600 bg-slate-800 text-slate-200'
                                }`}
                            >
                                Rapido
                            </button>
                            <button
                                type="button"
                                onClick={() => setMessageMode('formal')}
                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                    messageMode === 'formal'
                                        ? 'bg-cyan-400 text-slate-900'
                                        : 'border border-slate-600 bg-slate-800 text-slate-200'
                                }`}
                            >
                                Formal
                            </button>
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="sim-expire" className="text-xs text-slate-300">Vencimiento del link</Label>
                        <select
                            id="sim-expire"
                            value={expiresInDays}
                            onChange={(event) => setExpiresInDays(Number(event.target.value) || 14)}
                            className="mt-1 h-10 w-full rounded-md border border-slate-600 bg-slate-800/70 px-3 py-2 text-sm text-slate-100"
                        >
                            <option value={7}>7 dias</option>
                            <option value={14}>14 dias</option>
                            <option value={21}>21 dias</option>
                            <option value={30}>30 dias</option>
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={() => void handleCreateSimulation()}
                        disabled={creating}
                        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/40 bg-cyan-400/20 px-4 py-2.5 text-sm font-semibold text-cyan-100 hover:bg-cyan-400/30 disabled:opacity-60"
                    >
                        {creating ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        {creating ? 'Generando link...' : 'Crear y enviar por WhatsApp'}
                    </button>
                    <p className="text-[11px] text-slate-400">
                        CTA principal: al crear se abre WhatsApp con mensaje {messageMode === 'formal' ? 'formal' : 'rapido'} y link.
                    </p>
                </div>
            </div>

            {latestShareUrl && (
                <div className="rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-3 text-xs text-emerald-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>Link listo para enviar por WhatsApp o email.</span>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    openWhatsapp({
                                        treatment: latestSimulation?.treatment || tratamiento || 'tratamiento odontologico',
                                        shareUrl: latestShareUrl,
                                        expiresAt: latestSimulation?.expiresAt || new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
                                        mode: 'short',
                                    });
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200/30 px-2 py-1"
                            >
                                <MessageCircle size={12} /> WA rapido
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    openWhatsapp({
                                        treatment: latestSimulation?.treatment || tratamiento || 'tratamiento odontologico',
                                        shareUrl: latestShareUrl,
                                        expiresAt: latestSimulation?.expiresAt || new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString(),
                                        mode: 'formal',
                                    });
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200/30 px-2 py-1"
                            >
                                <MessageCircle size={12} /> WA formal
                            </button>
                            <button
                                type="button"
                                onClick={() => void handleCopyLink(latestShareUrl)}
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200/30 px-2 py-1"
                            >
                                <Copy size={12} /> Copiar
                            </button>
                            <a href={latestShareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                                Abrir <ExternalLink size={12} />
                            </a>
                        </div>
                    </div>
                    <p className="mt-1 break-all font-mono text-[11px] text-emerald-200/90">{latestShareUrl}</p>
                </div>
            )}

            <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">Simulaciones del paciente</p>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPendingOnly((current) => !current)}
                            className={`rounded-md border px-2 py-1 text-[11px] font-semibold ${
                                pendingOnly
                                    ? 'border-cyan-300/30 bg-cyan-400/20 text-cyan-100'
                                    : 'border-slate-600 bg-slate-800 text-slate-200'
                            }`}
                        >
                            {pendingOnly ? 'Solo pendientes: ON' : 'Solo pendientes: OFF'}
                        </button>
                        {loadingList && <Loader2 size={14} className="animate-spin text-slate-300" />}
                    </div>
                </div>

                {displayedSimulations.length === 0 ? (
                    <p className="text-xs text-slate-400">
                        {pendingOnly
                            ? 'No hay simulaciones pendientes de eleccion.'
                            : 'Todavia no hay simulaciones compartidas para este paciente.'}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {displayedSimulations.map((simulation) => {
                            const statusMeta = getStatusBadgeStyle(simulation.status);

                            return (
                                <div key={simulation.id} className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <p className="text-sm font-medium text-slate-100">{simulation.treatment}</p>
                                            <p className="text-[11px] text-slate-400">
                                                {formatUsd(simulation.totalUsd)} · {formatArs(simulation.bnaVentaArs)} · creada {formatSimulationDate(simulation.createdAt)}
                                            </p>
                                        </div>
                                        <span className={`rounded-md border px-2 py-1 text-[10px] uppercase tracking-wider ${statusMeta.className}`}>
                                            {statusMeta.label}
                                        </span>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => void handleCopyLink(simulation.shareUrl)}
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-100"
                                        >
                                            <Copy size={11} /> Copiar link
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleCopyAndOpenWhatsapp(simulation)}
                                            className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-400/15 px-2 py-1 text-[11px] font-medium text-emerald-100"
                                        >
                                            <MessageCircle size={11} /> Copiar + WhatsApp
                                        </button>
                                        <a
                                            href={simulation.shareUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-[11px] text-slate-100"
                                        >
                                            <ExternalLink size={11} /> Ver
                                        </a>
                                        <button
                                            type="button"
                                            onClick={() => void handleUseInContract(simulation.id)}
                                            disabled={usingSimulationId === simulation.id}
                                            className="inline-flex items-center gap-1 rounded-md border border-cyan-300/30 bg-cyan-400/20 px-2 py-1 text-[11px] font-medium text-cyan-100 disabled:opacity-60"
                                        >
                                            {usingSimulationId === simulation.id ? <Loader2 size={11} className="animate-spin" /> : null}
                                            {simulation.status === 'selected' ? 'Continuar a ContractMaker' : 'Usar en ContractMaker'}
                                        </button>
                                        {simulation.status === 'selected' && (
                                            <button
                                                type="button"
                                                onClick={() => void handleGenerateContractNow(simulation)}
                                                disabled={generatingContractSimulationId === simulation.id}
                                                className="inline-flex items-center gap-1 rounded-md border border-emerald-300/30 bg-emerald-400/20 px-2 py-1 text-[11px] font-semibold text-emerald-100 disabled:opacity-60"
                                            >
                                                {generatingContractSimulationId === simulation.id ? <Loader2 size={11} className="animate-spin" /> : null}
                                                Generar contrato ahora
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
