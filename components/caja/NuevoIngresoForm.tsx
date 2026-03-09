'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, User, DollarSign, Check, Loader2, Calendar, FileText, ImageIcon, Plus, Trash2 } from 'lucide-react';
import { ComprobanteUpload } from '@/components/caja/ComprobanteUpload';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import MoneyInput from "@/components/ui/MoneyInput";
import clsx from 'clsx';
import { createClient } from '@/utils/supabase/client';
import type { TarifarioItem } from '@/lib/supabase';

const supabase = createClient();
import { formatCurrency, getBnaRate } from '@/lib/bna';
import { useAuth } from '@/contexts/AuthContext';
import { triggerWorkflowFromSenaPayment } from '@/app/actions/clinical-workflows';
import { getLocalISODate } from '@/lib/local-date';
import { drawReceiptOnCanvas } from '@/lib/receipt-drawing';
import { saveReceiptAndLinkToMovement } from '@/app/actions/generate-receipt';
import { generateReciboNumber } from '@/components/caja/ReciboGenerator';
import { syncPagoCuotaAction } from '@/app/actions/financiacion-cuotas';

interface Paciente {
    id_paciente: string;
    nombre: string;
    apellido: string;
    whatsapp: string | null;
    documento: string | null;
}

interface NuevoIngresoFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    bnaRate: number;
    initialPatientId?: string;
}

type SenaTipo = '' | 'diseno_sonrisa' | 'ortodoncia_invisible' | 'cirugia_implantes';
type MonedaIngreso = 'USD' | 'ARS' | 'USDT';
type MetodoPagoIngreso = 'Efectivo' | 'Transferencia' | 'MercadoPago' | 'Cripto';
type CanalDestinoIngreso = 'Empresa' | 'Personal' | 'MP' | 'USDT';
type TipoComprobanteIngreso = 'Factura A' | 'Tipo C' | 'Sin factura' | 'Otro';

const SENA_OPCIONES: Array<{ value: SenaTipo; label: string; workflow: string }> = [
    { value: 'diseno_sonrisa', label: 'Diseno de Sonrisa', workflow: 'Diseno de Sonrisa' },
    { value: 'ortodoncia_invisible', label: 'Diseno de Alineadores Invisibles', workflow: 'Diseno de Alineadores Invisibles' },
    { value: 'cirugia_implantes', label: 'Cirugia e Implantes', workflow: 'Cirugia e Implantes' },
];

const SENA_CONCEPTO_KEYWORDS: Record<Exclude<SenaTipo, ''>, string[]> = {
    diseno_sonrisa: ['diseno', 'sonrisa', 'carilla', 'estetica'],
    ortodoncia_invisible: ['ortodoncia', 'alineador', 'alineadores', 'invisible', 'retenedor'],
    cirugia_implantes: ['cirugia', 'implante', 'injerto', 'seno', 'exodoncia', 'quirurgica'],
};

function normalizeComparableText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function getSenaLabel(tipo: SenaTipo) {
    return SENA_OPCIONES.find(option => option.value === tipo)?.label || '';
}

function getSenaWorkflowLabel(tipo: SenaTipo) {
    return SENA_OPCIONES.find(option => option.value === tipo)?.workflow || '';
}

function makeUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface FormData {
    paciente_id: string;
    paciente_nombre: string;
    concepto_id: string;
    concepto_nombre: string;
    categoria: string;
    precio_lista_usd: number;
    monto: number;
    moneda: MonedaIngreso;
    metodo_pago: MetodoPagoIngreso;
    canal_destino: CanalDestinoIngreso;
    tipo_comprobante: TipoComprobanteIngreso;
    estado: 'pagado' | 'pendiente';
    observaciones: string;
    es_sena: boolean;
    sena_tipo: SenaTipo;
    es_cuota: boolean;
    cuota_nro: number;
    cuotas_total: number;
    presupuesto_ref: string;
    comprobante_url?: string;
}

interface PaymentSplit {
    id: string;
    monto: number;
    moneda: MonedaIngreso;
    metodo_pago: MetodoPagoIngreso;
    canal_destino: CanalDestinoIngreso;
}

const METODOS_PAGO = [
    { value: 'Efectivo', label: 'Efectivo', icon: '💵' },
    { value: 'Transferencia', label: 'Transferencia', icon: '🏦' },
    { value: 'MercadoPago', label: 'Mercado Pago', icon: '📱' },
    { value: 'Cripto', label: 'Cripto (USDT)', icon: '₿' },
];

export default function NuevoIngresoForm({ isOpen, onClose, onSuccess, bnaRate, initialPatientId }: NuevoIngresoFormProps) {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);
    const receiptCanvasRef = useRef<HTMLCanvasElement>(null);
    const [generatedReceiptUrl, setGeneratedReceiptUrl] = useState<string | null>(null);
    const [patientWhatsapp, setPatientWhatsapp] = useState<string>('');

    // Patient search
    const [searchQuery, setSearchQuery] = useState('');
    const [patients, setPatients] = useState<Paciente[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // Concept/Product search
    const [conceptoSearch, setConceptoSearch] = useState('');

    // Tarifario
    const [tarifarioByCategoria, setTarifarioByCategoria] = useState<Record<string, TarifarioItem[]>>({});

    // Historical load
    const { user } = useAuth();
    const [cargaHistorica, setCargaHistorica] = useState(false);
    const [fechaMovimiento, setFechaMovimiento] = useState(getLocalISODate());

    // Form data
    const [formData, setFormData] = useState<FormData>({
        paciente_id: '',
        paciente_nombre: '',
        concepto_id: '',
        concepto_nombre: '',
        categoria: '',
        precio_lista_usd: 0,
        monto: 0,
        moneda: 'USD',
        metodo_pago: 'Efectivo',
        canal_destino: 'Empresa',
        tipo_comprobante: 'Factura A',
        estado: 'pagado',
        observaciones: '',
        es_sena: false,
        sena_tipo: '',
        es_cuota: false,
        cuota_nro: 1,
        cuotas_total: 1,
        presupuesto_ref: '',
        comprobante_url: '',
    });
    const [useMultiplePayments, setUseMultiplePayments] = useState(false);
    const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>([
        {
            id: makeUuid(),
            monto: 0,
            moneda: 'USD',
            metodo_pago: 'Efectivo',
            canal_destino: 'Empresa',
        },
    ]);

    // Effect to sync the first split with currency changes if it hasn't been edited
    useEffect(() => {
        if (!useMultiplePayments && paymentSplits.length === 1 && paymentSplits[0].monto === 0) {
            setPaymentSplits([{
                ...paymentSplits[0],
                moneda: formData.moneda,
                metodo_pago: formData.metodo_pago,
                canal_destino: formData.canal_destino
            }]);
        }
    }, [formData.moneda, formData.metodo_pago, formData.canal_destino, useMultiplePayments]);

    function setSplitValue(index: number, updates: Partial<PaymentSplit>) {
        setPaymentSplits((prev) => {
            const next = [...prev];
            next[index] = { ...next[index], ...updates };
            return next;
        });
    }

    function addPaymentSplit() {
        setPaymentSplits((prev) => ([
            ...prev,
            {
                id: makeUuid(),
                monto: 0,
                moneda: formData.moneda,
                metodo_pago: formData.metodo_pago,
                canal_destino: formData.canal_destino,
            },
        ]));
    }

    function removePaymentSplit(index: number) {
        setPaymentSplits((prev) => prev.filter((_, idx) => idx !== index));
    }

    // Load tarifario on mount
    useEffect(() => {
        if (isOpen) {
            loadTarifario();
        }
    }, [isOpen]);

    async function loadTarifario() {
        try {
            const { data, error } = await supabase
                .from('tarifario_items')
                .select(`*, tarifario_versiones!inner(estado)`)
                .eq('tarifario_versiones.estado', 'vigente')
                .eq('activo', true)
                .order('categoria')
                .order('concepto_nombre');

            if (error) throw error;

            const grouped = (data || []).reduce((acc: Record<string, TarifarioItem[]>, item: TarifarioItem) => {
                if (!acc[item.categoria]) acc[item.categoria] = [];
                acc[item.categoria].push(item);
                return acc;
            }, {} as Record<string, TarifarioItem[]>);

            setTarifarioByCategoria(grouped);
        } catch (error) {
            console.error('Error loading tarifario:', error);
        }
    }

    // Debounced patient search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.length >= 2) {
                searchPatients(searchQuery);
            } else {
                setPatients([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    useEffect(() => {
        let cancelled = false;

        async function prefillPatient() {
            if (!isOpen || !initialPatientId || formData.paciente_id === initialPatientId) return;

            const { data, error } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, apellido, whatsapp, documento')
                .eq('id_paciente', initialPatientId)
                .eq('is_deleted', false)
                .single();

            if (cancelled || error || !data) return;

            setFormData(prev => ({
                ...prev,
                paciente_id: data.id_paciente,
                paciente_nombre: `${data.apellido}, ${data.nombre}`,
            }));
            setPatientWhatsapp(data.whatsapp || '');
            setStep(prev => (prev < 2 ? 2 : prev));
        }

        prefillPatient();
        return () => { cancelled = true; };
    }, [isOpen, initialPatientId, formData.paciente_id]);

    async function searchPatients(query: string) {
        setSearchLoading(true);
        try {
            const { data, error } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, apellido, whatsapp, documento')
                .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,documento.ilike.%${query}%`)
                .eq('is_deleted', false)
                .limit(10);

            if (error) throw error;
            setPatients(data || []);
        } catch (error) {
            console.error('Error searching patients:', error);
        } finally {
            setSearchLoading(false);
        }
    }

    async function selectPatient(patient: Paciente) {
        setFormData(prev => ({
            ...prev,
            paciente_id: patient.id_paciente,
            paciente_nombre: `${patient.apellido}, ${patient.nombre}`,
        }));
        setPatientWhatsapp(patient.whatsapp || '');
        setStep(2);

        try {
            const { data: activePlan } = await supabase
                .from('planes_financiacion')
                .select('id, cuotas_pagadas, cuotas_total, estado')
                .eq('paciente_id', patient.id_paciente)
                .eq('estado', 'En curso')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (activePlan) {
                const cuotasPagadas = Number(activePlan.cuotas_pagadas || 0);
                const cuotasTotal = Number(activePlan.cuotas_total || 0);
                const nextQuota = cuotasPagadas + 1;

                if (cuotasTotal > 0 && nextQuota <= cuotasTotal) {
                    setFormData(prev => ({
                        ...prev,
                        es_cuota: true,
                        cuota_nro: nextQuota,
                        cuotas_total: cuotasTotal,
                    }));
                }
            }
        } catch (e) {
            console.error('Error fetching financing data:', e);
        }
    }

    function selectConcepto(item: TarifarioItem) {
        setFormData(prev => ({
            ...prev,
            concepto_id: item.id,
            concepto_nombre: item.concepto_nombre,
            categoria: item.categoria,
            precio_lista_usd: item.precio_base_usd,
            monto: prev.monto > 0 ? prev.monto : item.precio_base_usd,
            moneda: prev.monto > 0 ? prev.moneda : 'USD'
        }));
        setStep(3);
    }

    function applySenaTipo(tipo: SenaTipo) {
        const senaLabel = getSenaLabel(tipo);
        const senaConcepto = senaLabel ? `Sena - ${senaLabel}` : '';

        setFormData(prev => ({
            ...prev,
            sena_tipo: tipo,
            concepto_id: '',
            concepto_nombre: senaConcepto,
            categoria: tipo ? 'Senas' : prev.categoria,
        }));
        setConceptoSearch('');
    }

    function calculateUsdEquivalentForAmount(monto: number, moneda: MonedaIngreso): number {
        if (moneda === 'USD' || moneda === 'USDT') return monto;
        if (moneda === 'ARS' && bnaRate > 0) return Math.round((monto / bnaRate) * 100) / 100;
        return 0;
    }

    function calculateUsdEquivalent(): number {
        return calculateUsdEquivalentForAmount(formData.monto, formData.moneda);
    }

    function getMixedUsdTotal(splits: PaymentSplit[]) {
        return splits.reduce((acc, split) => acc + calculateUsdEquivalentForAmount(split.monto, split.moneda), 0);
    }

    async function handleSubmit() {
        if (!formData.paciente_id || !formData.concepto_nombre || (formData.monto <= 0 && !useMultiplePayments)) {
            alert('Complete todos los campos requeridos');
            return;
        }

        if (formData.es_sena && !formData.sena_tipo) {
            alert('Selecciona a que corresponde la sena para activar el workflow correcto.');
            return;
        }

        try {
            setSaving(true);
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('No autenticado');

            // 1. Preparation
            const bnaRateEffective = await getBnaRate(new Date());
            const conceptoFinal = formData.concepto_nombre || 'Sin concepto';
            const categoriaFinal = formData.categoria || 'Sin categoría';
            const cleanedObservation = formData.observaciones?.trim() || '';

            // 2. Identify and Process payments
            const activeSplits = paymentSplits.filter(s => s.monto > 0);

            let finalUsdEquiv = 0;
            let totalArsEquivalent = 0;
            let finalObservations = cleanedObservation;
            let finalMonto = formData.monto;
            let finalMoneda = formData.moneda;
            let finalMetodo = formData.metodo_pago;
            let finalCanal = formData.canal_destino;

            if (useMultiplePayments && activeSplits.length > 0) {
                finalUsdEquiv = getMixedUsdTotal(activeSplits);
                finalMonto = finalUsdEquiv;
                finalMoneda = 'USD';
                finalMetodo = 'Mixto';
                finalCanal = 'Mixto';

                totalArsEquivalent = activeSplits.reduce((acc, s) => {
                    const equiv = s.moneda === 'ARS' ? s.monto : (s.monto * bnaRateEffective);
                    return acc + equiv;
                }, 0);

                const splitSummary = activeSplits.map(s =>
                    `${formatCurrency(s.monto, s.moneda)} (${s.metodo_pago} - ${s.canal_destino})`
                ).join(' + ');

                finalObservations = cleanedObservation
                    ? `${cleanedObservation} | Detalles pagos mixtos: ${splitSummary}`
                    : `Detalles pagos mixtos: ${splitSummary}`;
            } else {
                finalUsdEquiv = calculateUsdEquivalent();
                finalObservations = cleanedObservation;
            }

            const payload = {
                paciente_id: formData.paciente_id,
                paciente_nombre: formData.paciente_nombre,
                descripcion: conceptoFinal,
                categoria: categoriaFinal,
                precio_lista_usd: formData.precio_lista_usd,
                monto: finalMonto,
                moneda: finalMoneda,
                metodo_pago: finalMetodo,
                canal_destino: finalCanal,
                estado: formData.estado,
                observaciones: finalObservations,
                usd_equivalente: finalUsdEquiv,
                monto_usd: finalUsdEquiv,
                monto_original: totalArsEquivalent > 0 ? totalArsEquivalent : finalMonto,
                tipo_comprobante: formData.tipo_comprobante,
                created_at: fechaMovimiento,
                created_by: user.id,
                es_sena: formData.es_sena,
                sena_tipo: formData.sena_tipo,
                es_cuota: formData.es_cuota,
                cuota_nro: formData.es_cuota ? formData.cuota_nro : null,
                cuotas_total: formData.es_cuota ? formData.cuotas_total : null,
                presupuesto_ref: formData.presupuesto_ref || null,
            };

            const { data: movementData, error: movementError } = await supabase
                .from('caja_recepcion_movimientos')
                .insert([payload])
                .select()
                .single();

            if (movementError) throw movementError;

            // 7. Sync with Cuotas Plan
            if (formData.es_cuota && movementData) {
                await syncPagoCuotaAction({
                    movementId: movementData.id,
                    pacienteId: formData.paciente_id,
                    pacienteNombre: formData.paciente_nombre,
                    montoUsd: finalUsdEquiv,
                    montoOriginal: totalArsEquivalent > 0 ? totalArsEquivalent : finalMonto,
                    moneda: totalArsEquivalent > 0 ? 'ARS' : finalMoneda as any,
                    cuotaNro: formData.cuota_nro,
                    cuotasTotal: formData.cuotas_total,
                    presupuestoRef: formData.presupuesto_ref,
                    observaciones: finalObservations,
                });
            }

            // 8. Generate Receipt
            const receiptMetodo = useMultiplePayments
                ? activeSplits.map(s => s.metodo_pago).join('/')
                : formData.metodo_pago;

            if (movementData) {
                try {
                    const canvas = receiptCanvasRef.current;
                    if (canvas) {
                        const receiptNumber = generateReciboNumber();
                        const cuotaInfo = formData.es_cuota
                            ? `${formData.cuota_nro}/${formData.cuotas_total}`
                            : undefined;

                        const imageDataUrl = drawReceiptOnCanvas(canvas, {
                            numero: receiptNumber,
                            fecha: new Date(),
                            paciente: formData.paciente_nombre,
                            concepto: conceptoFinal,
                            monto: finalUsdEquiv,
                            moneda: 'USD',
                            metodoPago: receiptMetodo,
                            atendidoPor: 'AM Clínica',
                            cuotaInfo,
                        });

                        setGeneratedReceiptUrl(imageDataUrl);
                        const base64Data = imageDataUrl.split(',')[1];
                        await saveReceiptAndLinkToMovement(
                            movementData.id,
                            receiptNumber,
                            base64Data
                        );
                    }
                } catch (receiptError) {
                    console.error('Receipt generation failed:', receiptError);
                }
            }

            // 9. Extra flows
            if (formData.es_sena && formData.sena_tipo && movementData) {
                await triggerWorkflowFromSenaPayment({
                    patientId: formData.paciente_id,
                    senaTipo: formData.sena_tipo,
                    movementId: movementData.id,
                    conceptoNombre: conceptoFinal,
                    monto: finalMonto,
                    moneda: finalMoneda,
                }).catch(e => console.error("Sena workflow trigger failed:", e));
            }

            onSuccess();
            setStep(5);
        } catch (error) {
            console.error('Error saving income:', error);
            alert('Error al guardar el ingreso: ' + (error instanceof Error ? error.message : 'Error desconocido'));
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setStep(1);
        setGeneratedReceiptUrl(null);
        setUseMultiplePayments(false);
        setPaymentSplits([{
            id: makeUuid(),
            monto: 0,
            moneda: 'USD',
            metodo_pago: 'Efectivo',
            canal_destino: 'Empresa',
        }]);
        setPatientWhatsapp('');
        setSearchQuery('');
        setPatients([]);
        setCargaHistorica(false);
        setFechaMovimiento(getLocalISODate());
        setFormData({
            paciente_id: '',
            paciente_nombre: '',
            concepto_id: '',
            concepto_nombre: '',
            categoria: '',
            precio_lista_usd: 0,
            monto: 0,
            moneda: 'USD',
            metodo_pago: 'Efectivo',
            canal_destino: 'Empresa',
            tipo_comprobante: 'Factura A',
            estado: 'pagado',
            observaciones: '',
            es_sena: false,
            sena_tipo: '',
            es_cuota: false,
            cuota_nro: 1,
            cuotas_total: 1,
            presupuesto_ref: '',
        });
        setConceptoSearch('');
        onClose();
    }

    if (!isOpen) return null;

    const currentTotalUsd = useMultiplePayments ? getMixedUsdTotal(paymentSplits) : calculateUsdEquivalent();
    const coveragePercentage = formData.monto > 0 ? Math.min(100, (currentTotalUsd / calculateUsdEquivalent()) * 100) : 0;
    const remainingUsd = calculateUsdEquivalent() - currentTotalUsd;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <canvas ref={receiptCanvasRef} style={{ display: 'none' }} />
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-xl">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Nuevo Ingreso</h2>
                        <div className="flex items-center gap-2 mt-2">
                            {[1, 2, 3, 4].map((s) => (
                                <div
                                    key={s}
                                    className={clsx(
                                        "h-2 rounded-full transition-all",
                                        s <= step ? "w-8 bg-blue-500" : "w-2 bg-gray-200 dark:bg-gray-700"
                                    )}
                                />
                            ))}
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg h-auto w-auto"
                    >
                        <X size={20} className="text-gray-500" />
                    </Button>
                </div>

                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {step === 1 && (
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
                                    Monto del Ingreso *
                                </label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                        <MoneyInput
                                            value={formData.monto || 0}
                                            onChange={(val) => setFormData({ ...formData, monto: val })}
                                            className="w-full h-auto text-2xl font-bold py-4 focus-visible:ring-blue-500"
                                            placeholder="0"
                                        />
                                    </div>
                                    <div className="flex rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                                        {['ARS', 'USD'].map((m) => (
                                            <Button
                                                key={m}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, moneda: m as any })}
                                                className={clsx(
                                                    "px-4 py-2 text-sm font-bold transition-colors rounded-none h-auto",
                                                    formData.moneda === m
                                                        ? "bg-blue-600 text-white hover:bg-blue-700"
                                                        : "bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                                                )}
                                            >
                                                {m}
                                            </Button>
                                        ))}
                                    </div>
                                </div>
                                {formData.moneda === 'ARS' && bnaRate > 0 && (
                                    <p className="mt-2 text-sm text-gray-500 font-medium">
                                        ≈ {formatCurrency(calculateUsdEquivalent(), 'USD')} (TC BNA: ${bnaRate})
                                    </p>
                                )}

                                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-800 p-4">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Este pago es una seña</p>
                                            <p className="text-xs text-amber-700 dark:text-amber-300">Si activas esta opcion, se dispara el workflow clinico automaticamente.</p>
                                        </div>
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                const nextValue = !formData.es_sena;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    es_sena: nextValue,
                                                    sena_tipo: nextValue ? prev.sena_tipo : '',
                                                }));
                                            }}
                                            className={clsx(
                                                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors h-auto',
                                                formData.es_sena
                                                    ? 'bg-amber-600 text-white'
                                                    : 'bg-white text-amber-700 border border-amber-300'
                                            )}
                                        >
                                            {formData.es_sena ? 'ACTIVA' : 'Activar'}
                                        </Button>
                                    </div>

                                    {formData.es_sena && (
                                        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            {SENA_OPCIONES.map(option => (
                                                <Button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => applySenaTipo(option.value)}
                                                    className={clsx(
                                                        'px-3 py-2 rounded-lg text-xs font-semibold border transition-colors h-auto text-left justify-start',
                                                        formData.sena_tipo === option.value
                                                            ? 'bg-amber-600 text-white border-amber-600'
                                                            : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50'
                                                    )}
                                                >
                                                    {option.label}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="relative">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Paciente *
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <Input
                                        value={formData.paciente_id ? formData.paciente_nombre : searchQuery}
                                        onChange={(e) => {
                                            if (formData.paciente_id) {
                                                setFormData({ ...formData, paciente_id: '', paciente_nombre: '' });
                                                setPatientWhatsapp('');
                                            }
                                            setSearchQuery(e.target.value);
                                        }}
                                        className="pl-10 py-3 rounded-xl focus:ring-blue-500"
                                        placeholder="Buscar por nombre o DNI..."
                                    />
                                    {formData.paciente_id && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                setFormData({ ...formData, paciente_id: '', paciente_nombre: '' });
                                                setPatientWhatsapp('');
                                                setSearchQuery('');
                                            }}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8"
                                        >
                                            <X size={16} />
                                        </Button>
                                    )}
                                </div>

                                {searchLoading && (
                                    <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl z-10 border border-gray-100 dark:border-gray-700 flex justify-center">
                                        <Loader2 className="animate-spin text-blue-500" size={20} />
                                    </div>
                                )}

                                {patients.length > 0 && !formData.paciente_id && (
                                    <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-xl shadow-xl z-10 border border-gray-100 dark:border-gray-700 overflow-hidden">
                                        {patients.map((patient) => (
                                            <button
                                                key={patient.id_paciente}
                                                onClick={() => selectPatient(patient)}
                                                className="w-full p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-3 transition-colors border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                                                    <User size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">{patient.apellido}, {patient.nombre}</p>
                                                    <p className="text-xs text-gray-500">DNI: {patient.documento || 'No cargo'}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Button
                                onClick={() => setStep(2)}
                                disabled={!formData.paciente_id || formData.monto <= 0}
                                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all h-auto disabled:bg-gray-300 dark:disabled:bg-gray-700"
                            >
                                Continuar
                            </Button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900 dark:text-white">Seleccionar Concepto</h3>
                                <Button
                                    variant="link"
                                    onClick={() => setStep(1)}
                                    className="text-sm text-blue-600 p-0 h-auto"
                                >
                                    ← Cambiar paciente/monto
                                </Button>
                            </div>

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <Input
                                    value={conceptoSearch}
                                    onChange={(e) => setConceptoSearch(e.target.value)}
                                    className="pl-10 py-3 rounded-xl"
                                    placeholder="Buscar en el tarifario..."
                                />
                            </div>

                            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                {Object.entries(tarifarioByCategoria).map(([categoria, items]) => {
                                    const filteredItems = items.filter(item =>
                                        item.concepto_nombre.toLowerCase().includes(conceptoSearch.toLowerCase())
                                    );

                                    if (filteredItems.length === 0) return null;

                                    return (
                                        <div key={categoria} className="space-y-2">
                                            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider sticky top-0 bg-white dark:bg-gray-800 py-1">{categoria}</h4>
                                            <div className="grid grid-cols-1 gap-2">
                                                {filteredItems.map((item) => (
                                                    <button
                                                        key={item.id}
                                                        onClick={() => selectConcepto(item)}
                                                        className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 hover:bg-blue-50/10 dark:hover:bg-blue-900/10 transition-all text-left group"
                                                    >
                                                        <div className="flex-1">
                                                            <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.concepto_nombre}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(item.precio_base_usd, 'USD')}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
                                <p className="text-xs text-gray-500 mb-3 font-medium uppercase tracking-wider">O cargar manualmente:</p>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Concepto personalizado..."
                                        className="flex-1 rounded-xl"
                                        value={formData.concepto_nombre}
                                        onChange={(e) => setFormData({ ...formData, concepto_nombre: e.target.value })}
                                    />
                                    <Button
                                        onClick={() => setStep(3)}
                                        disabled={!formData.concepto_nombre}
                                        className="bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-xl h-auto"
                                    >
                                        Siguiente
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600">
                                        <DollarSign size={20} />
                                    </div>
                                    <div>
                                        <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider">A recaudar</p>
                                        <p className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                            {formatCurrency(formData.monto, formData.moneda)}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-blue-400 uppercase tracking-tighter">Equiv. Total</p>
                                    <p className="font-bold text-blue-500">{formatCurrency(calculateUsdEquivalent(), 'USD')}</p>
                                </div>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-bold text-gray-700 dark:text-gray-300">Forma de Pago</label>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setUseMultiplePayments(!useMultiplePayments)}
                                        className={clsx(
                                            "text-xs font-bold rounded-lg px-3 py-1.5 h-auto transition-all",
                                            useMultiplePayments
                                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30"
                                                : "bg-gray-100 text-gray-600 dark:bg-gray-700/50"
                                        )}
                                    >
                                        {useMultiplePayments ? "Cerrar Split ⨉" : "+ Pago Mixto"}
                                    </Button>
                                </div>

                                {!useMultiplePayments ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                        {METODOS_PAGO.map((m) => (
                                            <button
                                                key={m.value}
                                                onClick={() => setFormData({ ...formData, metodo_pago: m.value as any, canal_destino: m.value === 'MercadoPago' ? 'MP' : m.value === 'Cripto' ? 'USDT' : 'Empresa' })}
                                                className={clsx(
                                                    "p-3 rounded-xl border flex flex-col items-center gap-2 transition-all",
                                                    formData.metodo_pago === m.value
                                                        ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-500/20"
                                                        : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-200"
                                                )}
                                            >
                                                <span className="text-xl">{m.icon}</span>
                                                <span className="text-xs font-bold">{m.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between text-xs font-bold px-1">
                                            <span className="text-gray-400 uppercase tracking-widest">Distribución de pago</span>
                                            <div className="flex gap-3">
                                                <span className={clsx(remainingUsd > 1 ? "text-amber-600" : remainingUsd < -1 ? "text-red-500" : "text-green-600")}>
                                                    Restan: {formatCurrency(Math.max(0, remainingUsd), 'USD')}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="h-2 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex shadow-inner">
                                            <div
                                                className={clsx(
                                                    "h-full transition-all duration-500",
                                                    coveragePercentage >= 100 ? "bg-green-500" : "bg-blue-500"
                                                )}
                                                style={{ width: `${coveragePercentage}%` }}
                                            />
                                        </div>

                                        <div className="space-y-3 max-h-[280px] overflow-y-auto pr-1">
                                            {paymentSplits.map((split, index) => (
                                                <div key={split.id} className="relative bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <div className="grid grid-cols-12 gap-3">
                                                        <div className="col-span-12 sm:col-span-5">
                                                            <div className="relative">
                                                                <MoneyInput
                                                                    value={split.monto}
                                                                    onChange={(val) => setSplitValue(index, { monto: val })}
                                                                    className="w-full text-lg font-bold pl-8 py-3 bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 rounded-xl"
                                                                />
                                                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                            </div>
                                                        </div>
                                                        <div className="col-span-7 sm:col-span-4 flex rounded-xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                                                            {['ARS', 'USD'].map(m => (
                                                                <button
                                                                    key={m}
                                                                    onClick={() => setSplitValue(index, { moneda: m as any })}
                                                                    className={clsx(
                                                                        "flex-1 text-[10px] font-bold py-1",
                                                                        split.moneda === m ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900" : "text-gray-400"
                                                                    )}
                                                                >
                                                                    {m}
                                                                </button>
                                                            ))}
                                                        </div>
                                                        <div className="col-span-5 sm:col-span-3 flex justify-end">
                                                            {paymentSplits.length > 1 && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    onClick={() => removePaymentSplit(index)}
                                                                    className="text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                >
                                                                    <Trash2 size={18} />
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-4 gap-2 mt-3">
                                                        {METODOS_PAGO.map((m) => (
                                                            <button
                                                                key={m.value}
                                                                onClick={() => setSplitValue(index, {
                                                                    metodo_pago: m.value as any,
                                                                    canal_destino: m.value === 'MercadoPago' ? 'MP' : m.value === 'Cripto' ? 'USDT' : 'Empresa'
                                                                })}
                                                                className={clsx(
                                                                    "flex flex-col items-center py-2 rounded-lg border transition-all",
                                                                    split.metodo_pago === m.value
                                                                        ? "bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/30 dark:border-blue-800"
                                                                        : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 text-gray-400"
                                                                )}
                                                            >
                                                                <span className="text-xs">{m.icon}</span>
                                                                <span className="text-[9px] font-bold">{m.label}</span>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="pt-2">
                                            <Button
                                                variant="outline"
                                                onClick={addPaymentSplit}
                                                className="w-full py-3 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:text-blue-600 hover:border-blue-300 dark:hover:bg-blue-900/20 rounded-xl flex items-center justify-center gap-2 h-auto text-xs font-bold uppercase tracking-wider"
                                            >
                                                <Plus size={16} /> Agregar otra forma
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Button
                                onClick={() => setStep(4)}
                                className="w-full py-4 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-xl font-bold transition-all h-auto"
                            >
                                Revisar Confirmación
                            </Button>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Confirmar Ingreso</h3>

                            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Paciente:</span>
                                    <span className="font-medium">{formData.paciente_nombre}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Concepto:</span>
                                    <span className="font-medium">{formData.concepto_nombre}</span>
                                </div>
                                {formData.es_sena && formData.sena_tipo && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Workflow:</span>
                                        <span className="font-medium text-amber-600">{getSenaWorkflowLabel(formData.sena_tipo)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Monto Total:</span>
                                    <span className="font-bold text-lg">
                                        {useMultiplePayments
                                            ? formatCurrency(getMixedUsdTotal(paymentSplits), 'USD')
                                            : formatCurrency(formData.monto, formData.moneda)}
                                    </span>
                                </div>
                                {useMultiplePayments && (
                                    <div className="space-y-1 pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
                                        {paymentSplits.filter(s => s.monto > 0).map((s, idx) => (
                                            <div key={idx} className="flex justify-between text-xs text-gray-500">
                                                <span>Pago {idx + 1}: {s.metodo_pago}</span>
                                                <span>{formatCurrency(s.monto, s.moneda)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <Textarea
                                value={formData.observaciones}
                                onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                                className="w-full rounded-xl bg-gray-50 border-gray-200"
                                placeholder="Observaciones adicionales..."
                                rows={3}
                            />

                            <Button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="w-full py-4 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 h-auto"
                            >
                                {saving ? <Loader2 className="animate-spin" /> : <Check />}
                                {saving ? 'Guardando...' : 'Confirmar Todo'}
                            </Button>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-5 flex flex-col items-center">
                            <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600">
                                <Check size={40} />
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold">¡Ingreso Exitoso!</h3>
                                <p className="text-gray-500 text-sm">El movimiento ha sido registrado correctamente.</p>
                            </div>

                            {generatedReceiptUrl && (
                                <div className="w-full border rounded-xl overflow-hidden shadow-sm">
                                    <img src={generatedReceiptUrl} alt="Comprobante" className="w-full" />
                                </div>
                            )}

                            <div className="flex gap-3 w-full">
                                <Button
                                    onClick={() => {
                                        if (generatedReceiptUrl) {
                                            const link = document.createElement('a');
                                            link.href = generatedReceiptUrl;
                                            link.download = `comprobante-${formData.paciente_nombre}.jpg`;
                                            link.click();
                                        }
                                    }}
                                    className="flex-1 bg-gray-100 text-gray-900 hover:bg-gray-200 h-auto py-3 rounded-xl font-bold"
                                >
                                    Descargar
                                </Button>
                                <Button
                                    onClick={handleClose}
                                    className="flex-1 bg-blue-600 text-white hover:bg-blue-700 h-auto py-3 rounded-xl font-bold"
                                >
                                    Cerrar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
