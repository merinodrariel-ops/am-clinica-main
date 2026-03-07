'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Search, User, DollarSign, Check, Loader2, Calendar, FileText, ImageIcon } from 'lucide-react';
import { ComprobanteUpload } from '@/components/caja/ComprobanteUpload';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import MoneyInput from "@/components/ui/MoneyInput";
import clsx from 'clsx';
import { createClient } from '@/utils/supabase/client';
import type { TarifarioItem } from '@/lib/supabase';

const supabase = createClient();
import { formatCurrency } from '@/lib/bna';
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

function isConceptRelatedToSena(tipo: SenaTipo, categoria: string, concepto: string) {
    if (!tipo) return true;
    const keywords = SENA_CONCEPTO_KEYWORDS[tipo as Exclude<SenaTipo, ''>] || [];
    const haystack = normalizeComparableText(`${categoria} ${concepto}`);
    return keywords.some(keyword => haystack.includes(keyword));
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
    // const [tarifarioItems, setTarifarioItems] = useState<TarifarioItem[]>([]);
    const [tarifarioByCategoria, setTarifarioByCategoria] = useState<Record<string, TarifarioItem[]>>({});

    // Historical load
    const { user } = useAuth();
    const canUseHistoricalLoad = user?.role === 'owner' || user?.role === 'admin';
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

    const createSplitFromCurrentForm = (): PaymentSplit => ({
        id: makeUuid(),
        monto: formData.monto || 0,
        moneda: formData.moneda,
        metodo_pago: formData.metodo_pago,
        canal_destino: formData.canal_destino,
    });

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

            // setTarifarioItems(data || []);

            // Group by category
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
            setSearchQuery('');
            setPatients([]);
            setStep(prev => (prev < 2 ? 2 : prev));
        }

        prefillPatient();

        return () => {
            cancelled = true;
        };
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
        // Optimistic UI update
        setFormData(prev => ({
            ...prev,
            paciente_id: patient.id_paciente,
            paciente_nombre: `${patient.apellido}, ${patient.nombre}`,
        }));
        setPatientWhatsapp(patient.whatsapp || '');
        setSearchQuery('');
        setPatients([]);
        setStep(2); // Move to next step immediately

        // Background fetch for financing data
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
            // Only set monto if not already entered in Step 1
            monto: prev.monto > 0 ? prev.monto : item.precio_base_usd,
            // If we are defaulting to the reference price, use USD
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
        if (moneda === 'USD' || moneda === 'USDT') {
            return monto;
        }
        if (moneda === 'ARS' && bnaRate > 0) {
            return Math.round((monto / bnaRate) * 100) / 100;
        }
        return 0;
    }

    function calculateUsdEquivalent(): number {
        return calculateUsdEquivalentForAmount(formData.monto, formData.moneda);
    }

    function getMixedUsdTotal(splits: PaymentSplit[]) {
        return splits.reduce((acc, split) => acc + calculateUsdEquivalentForAmount(split.monto, split.moneda), 0);
    }

    async function handleSubmit() {
        if (!formData.paciente_id || !formData.concepto_nombre || formData.monto <= 0) {
            alert('Complete todos los campos requeridos');
            return;
        }

        if (formData.es_sena && !formData.sena_tipo) {
            alert('Selecciona a que corresponde la sena para activar el workflow correcto.');
            return;
        }

        setSaving(true);
        try {
            const usdEquivalente = calculateUsdEquivalent();
            const senaLabel = getSenaLabel(formData.sena_tipo);
            const conceptoFinal = formData.es_sena && senaLabel
                ? `Sena - ${senaLabel}`
                : formData.concepto_nombre;
            const categoriaFinal = formData.es_sena ? 'Senas' : formData.categoria;

            const referenceUsd = usdEquivalente;
            const validPaymentSplits = useMultiplePayments
                ? paymentSplits.filter((split) => split.monto > 0)
                : [];

            if (useMultiplePayments && validPaymentSplits.length === 0) {
                alert('Debes cargar al menos una forma de pago con monto mayor a 0.');
                return;
            }

            if (useMultiplePayments) {
                const mixedUsdTotal = getMixedUsdTotal(validPaymentSplits);
                const difference = Math.abs(mixedUsdTotal - referenceUsd);
                if (difference > 1) {
                    alert(`El total de formas de pago no coincide con el monto cargado. Diferencia aproximada: USD ${difference.toFixed(2)}`);
                    return;
                }
            }

            const movementGroupTag = useMultiplePayments && validPaymentSplits.length > 1
                ? `PAGO_MIXTO:${makeUuid()}`
                : null;
            const cleanedObservation = (formData.observaciones || '').trim();

            const paymentsToInsert = useMultiplePayments
                ? validPaymentSplits.map((split, index) => ({
                    monto: split.monto,
                    moneda: split.moneda,
                    metodo_pago: split.metodo_pago,
                    canal_destino: split.canal_destino,
                    usd_equivalente: calculateUsdEquivalentForAmount(split.monto, split.moneda),
                    cuota_nro: formData.es_cuota && index === 0 ? formData.cuota_nro : null,
                    cuotas_total: formData.es_cuota && index === 0 ? formData.cuotas_total : null,
                    observaciones: [
                        movementGroupTag ? `[${movementGroupTag}]` : '',
                        useMultiplePayments && validPaymentSplits.length > 1 ? `Linea ${index + 1}/${validPaymentSplits.length}` : '',
                        cleanedObservation,
                    ].filter(Boolean).join(' · '),
                }))
                : [{
                    monto: formData.monto,
                    moneda: formData.moneda,
                    metodo_pago: formData.metodo_pago,
                    canal_destino: formData.canal_destino,
                    usd_equivalente: referenceUsd,
                    cuota_nro: formData.es_cuota ? formData.cuota_nro : null,
                    cuotas_total: formData.es_cuota ? formData.cuotas_total : null,
                    observaciones: cleanedObservation,
                }];

            const payload = paymentsToInsert.map((payment) => ({
                paciente_id: formData.paciente_id,
                concepto_id: formData.concepto_id || null,
                concepto_nombre: conceptoFinal,
                categoria: categoriaFinal,
                precio_lista_usd: formData.precio_lista_usd,
                monto: payment.monto,
                moneda: payment.moneda,
                metodo_pago: payment.metodo_pago,
                canal_destino: payment.canal_destino,
                tipo_comprobante: formData.tipo_comprobante,
                estado: formData.estado,
                observaciones: payment.observaciones,
                tc_bna_venta: payment.moneda === 'ARS' ? bnaRate : null,
                tc_fuente: payment.moneda === 'ARS' ? 'BNA_AUTO' : 'N/A',
                tc_fecha_hora: payment.moneda === 'ARS' ? new Date().toISOString() : null,
                usd_equivalente: payment.usd_equivalente,
                usuario: 'Recepción',
                created_by: user?.id || null,
                fecha_movimiento: cargaHistorica ? fechaMovimiento : getLocalISODate(),
                origen: cargaHistorica ? 'carga_historica' : 'manual',
                cuota_nro: payment.cuota_nro,
                cuotas_total: payment.cuotas_total,
                comprobante_url: formData.comprobante_url || null,
            }));

            const { data: insertedMovements, error } = await supabase
                .from('caja_recepcion_movimientos')
                .insert(payload)
                .select('id, monto, moneda, usd_equivalente, metodo_pago');

            if (error) throw error;

            const primaryMovement = insertedMovements?.[0];
            const totalUsdFromSplits = paymentsToInsert.reduce((acc, payment) => acc + (payment.usd_equivalente || 0), 0);

            // Sync planes_financiacion when a cuota payment is registered
            if (formData.es_cuota && formData.paciente_id && primaryMovement?.id) {
                const syncResult = await syncPagoCuotaAction({
                    movementId: primaryMovement.id,
                    pacienteId: formData.paciente_id,
                    pacienteNombre: formData.paciente_nombre,
                    montoUsd: Math.round(totalUsdFromSplits * 100) / 100,
                    montoOriginal: formData.monto,
                    moneda: formData.moneda,
                    cuotaNro: formData.cuota_nro,
                    cuotasTotal: formData.cuotas_total,
                    presupuestoRef: formData.presupuesto_ref?.trim() || null,
                    observaciones: formData.observaciones?.trim() || null,
                });

                if (!syncResult.success) {
                    const pendingText = syncResult.pendingSaved
                        ? ' Se guardo automaticamente en Pagos Pendientes de Asignar.'
                        : '';

                    if (syncResult.failureCode === 'plan_not_found') {
                        const wantsCreate = window.confirm(
                            `Paciente no encontrado en el plan de cuotas. ¿Desea crear una financiación nueva?${pendingText}`
                        );

                        if (wantsCreate) {
                            window.location.assign('/caja-recepcion?tab=contratos');
                        }
                    } else {
                        alert((syncResult.error || 'Pago registrado en caja, pero no se pudo acreditar la cuota.') + pendingText);
                    }
                }
            }

            // Generate receipt and show to user before closing
            if (primaryMovement?.id) {
                try {
                    const canvas = receiptCanvasRef.current;
                    if (canvas) {
                        const receiptNumber = generateReciboNumber();
                        const cuotaInfo = formData.es_cuota
                            ? `${formData.cuota_nro}/${formData.cuotas_total}`
                            : undefined;
                        const receiptMonto = useMultiplePayments ? Math.round(totalUsdFromSplits * 100) / 100 : formData.monto;
                        const receiptMoneda: MonedaIngreso = useMultiplePayments ? 'USD' : formData.moneda;
                        const receiptMetodo = useMultiplePayments
                            ? `Mixto (${paymentsToInsert.length} pagos)`
                            : formData.metodo_pago;
                        const imageDataUrl = drawReceiptOnCanvas(canvas, {
                            numero: receiptNumber,
                            fecha: new Date(),
                            paciente: formData.paciente_nombre,
                            concepto: conceptoFinal,
                            monto: receiptMonto,
                            moneda: receiptMoneda,
                            metodoPago: receiptMetodo,
                            atendidoPor: 'AM Clínica',
                            cuotaInfo,
                        });
                        setGeneratedReceiptUrl(imageDataUrl);
                        const base64Data = imageDataUrl.split(',')[1];
                        saveReceiptAndLinkToMovement(
                            primaryMovement.id,
                            receiptNumber,
                            base64Data
                        ).catch(err => console.error('Auto-receipt save failed:', err));
                    }
                } catch (receiptError) {
                    console.error('Auto-receipt generation failed:', receiptError);
                }
            }

            if (formData.es_sena && formData.sena_tipo) {
                try {
                    const workflowResult = await triggerWorkflowFromSenaPayment({
                        patientId: formData.paciente_id,
                        senaTipo: formData.sena_tipo,
                        movementId: primaryMovement?.id || null,
                        conceptoNombre: conceptoFinal,
                        monto: formData.monto,
                        moneda: formData.moneda,
                    });

                    if (!workflowResult.success) {
                        alert('Ingreso guardado, pero no se pudo activar el workflow automaticamente. Revisalo en Workflows.');
                    }
                } catch (workflowError) {
                    console.error('Error triggering workflow from sena payment:', workflowError);
                    alert('Ingreso guardado, pero fallo la activacion del workflow.');
                }
            }

            onSuccess();
            setStep(5);
        } catch (error) {
            console.error('Error saving movement:', error);
            alert('Error al guardar el ingreso');
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setStep(1);
        setGeneratedReceiptUrl(null);
        setUseMultiplePayments(false);
        setPaymentSplits([
            {
                id: makeUuid(),
                monto: 0,
                moneda: 'USD',
                metodo_pago: 'Efectivo',
                canal_destino: 'Empresa',
            },
        ]);
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

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            {/* Hidden canvas for auto-receipt generation */}
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

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {/* Step 1: Amount and Patient */}
                    {step === 1 && (
                        <div className="space-y-6">
                            {/* Amount and Currency - NOW FIRST */}
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
                                                onClick={() => setFormData({ ...formData, moneda: m as FormData['moneda'] })}
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
                                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">Este pago es una sena</p>
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
                                                    categoria: nextValue ? prev.categoria : (prev.categoria === 'Senas' ? '' : prev.categoria),
                                                }));

                                                if (!nextValue) {
                                                    setConceptoSearch('');
                                                }
                                            }}
                                            className={clsx(
                                                'px-3 py-1.5 rounded-lg text-xs font-bold transition-colors h-auto',
                                                formData.es_sena
                                                    ? 'bg-amber-600 text-white hover:bg-amber-700 border-transparent'
                                                    : 'bg-white text-amber-700 border border-amber-300 hover:bg-amber-50'
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
                                                        'px-3 py-2 rounded-lg text-xs font-semibold border transition-colors justify-start h-auto whitespace-normal text-left',
                                                        formData.sena_tipo === option.value
                                                            ? 'bg-amber-600 text-white border-amber-600 hover:bg-amber-700'
                                                            : 'bg-white dark:bg-gray-800 text-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/40'
                                                    )}
                                                >
                                                    {option.label}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="border-t border-gray-100 dark:border-gray-700 pt-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Buscar Paciente *
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                    <Input
                                        type="text"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        placeholder="Nombre, apellido o documento..."
                                        className="w-full pl-10 pr-4 py-3 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 focus-visible:ring-blue-500 h-auto"
                                    />
                                    {searchLoading && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" size={20} />
                                    )}
                                </div>

                                {patients.length > 0 && (
                                    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm max-h-[300px] overflow-y-auto">
                                        {patients.map((patient) => (
                                            <Button
                                                key={patient.id_paciente}
                                                variant="ghost"
                                                onClick={() => selectPatient(patient)}
                                                className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 text-left justify-start h-auto font-normal rounded-none"
                                            >
                                                <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                                    <User size={20} className="text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {patient.apellido}, {patient.nombre}
                                                    </p>
                                                    <p className="text-sm text-gray-500">
                                                        {patient.documento || 'Sin documento'}
                                                    </p>
                                                </div>
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Step 2: Concept and Categorization */}
                    {step === 2 && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800/30">
                                <div>
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">Monto Seleccionado</p>
                                    <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                        {formatCurrency(formData.monto, formData.moneda)}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-blue-600 dark:text-blue-400 font-bold uppercase">Paciente</p>
                                    <p className="font-medium text-blue-900 dark:text-white">{formData.paciente_nombre}</p>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 text-center">
                                    ¿A qué corresponde este ingreso?
                                </label>

                                {formData.es_sena && (
                                    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3">
                                        <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">Pago de sena detectado</p>
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                            Se registrara como <span className="font-bold">{formData.concepto_nombre || 'Sena - (definir)'}</span>
                                            {formData.sena_tipo ? ` y activara el workflow ${getSenaWorkflowLabel(formData.sena_tipo)}.` : '.'}
                                        </p>
                                    </div>
                                )}

                                {/* Manual entry and SEARCH option */}
                                <div className="mb-6 space-y-3">
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <Input
                                            type="text"
                                            placeholder={formData.es_sena && formData.sena_tipo
                                                ? 'Filtrar conceptos relacionados al flujo de sena...'
                                                : 'Buscar servicio o escribir concepto libre...'}
                                            value={conceptoSearch}
                                            onChange={(e) => {
                                                setConceptoSearch(e.target.value);
                                                setFormData({ ...formData, concepto_nombre: e.target.value, concepto_id: '' });
                                            }}
                                            className="w-full pl-10 pr-4 py-3 border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 focus-visible:ring-blue-500 font-medium h-auto"
                                        />
                                    </div>
                                    {conceptoSearch && !Object.values(tarifarioByCategoria).some(items => items.some(item => item.concepto_nombre.toLowerCase().includes(conceptoSearch.toLowerCase()))) && (
                                        <p className="text-xs text-amber-600 font-medium px-1">
                                            ✨ No hay coincidencias exactas. Se registrará como concepto libre.
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                                    {Object.entries(tarifarioByCategoria).map(([categoria, items]) => {
                                        const filteredItems = items.filter(item =>
                                            (item.concepto_nombre.toLowerCase().includes(conceptoSearch.toLowerCase()) ||
                                                categoria.toLowerCase().includes(conceptoSearch.toLowerCase())) &&
                                            (!formData.es_sena || !formData.sena_tipo || isConceptRelatedToSena(formData.sena_tipo, categoria, item.concepto_nombre))
                                        );

                                        if (filteredItems.length === 0) return null;

                                        return (
                                            <div key={categoria} className="animate-in fade-in duration-300">
                                                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 dark:border-gray-700 pb-1 flex justify-between">
                                                    <span>{categoria}</span>
                                                    <span className="text-[9px] bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{filteredItems.length}</span>
                                                </h4>
                                                <div className="grid grid-cols-1 gap-2">
                                                    {filteredItems.map((item) => (
                                                        <Button
                                                            key={item.id}
                                                            onClick={() => {
                                                                selectConcepto(item);
                                                                setConceptoSearch(item.concepto_nombre);
                                                            }}
                                                            className={clsx(
                                                                "p-3 text-left border rounded-xl transition-all group h-auto justify-start w-full whitespace-normal",
                                                                formData.concepto_id === item.id
                                                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm hover:bg-blue-100"
                                                                    : "border-gray-100 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/30 dark:hover:bg-blue-900/5 bg-transparent"
                                                            )}
                                                        >
                                                            <div className="flex justify-between items-center w-full">
                                                                <span className="font-medium text-gray-900 dark:text-white text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                                                    {item.concepto_nombre}
                                                                </span>
                                                                <span className="text-[10px] font-bold text-gray-400 px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded group-hover:bg-blue-100 dark:group-hover:bg-blue-900/30 group-hover:text-blue-600 transition-colors">
                                                                    REF: {formatCurrency(item.precio_base_usd, 'USD')}
                                                                </span>
                                                            </div>
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {formData.es_sena && formData.sena_tipo &&
                                        Object.entries(tarifarioByCategoria).every(([categoria, items]) =>
                                            items.filter(item =>
                                                (item.concepto_nombre.toLowerCase().includes(conceptoSearch.toLowerCase()) ||
                                                    categoria.toLowerCase().includes(conceptoSearch.toLowerCase())) &&
                                                isConceptRelatedToSena(formData.sena_tipo, categoria, item.concepto_nombre)
                                            ).length === 0
                                        ) && (
                                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
                                                No hay conceptos del tarifario para este tipo de sena con ese filtro. Puedes cargar un concepto libre igualmente.
                                            </div>
                                        )}
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button
                                    variant="outline"
                                    onClick={() => setStep(1)}
                                    className="flex-1 py-3 border-gray-200 dark:border-gray-700 rounded-xl font-medium text-gray-600 dark:text-gray-400 h-auto"
                                >
                                    Atrás
                                </Button>
                                <Button
                                    onClick={() => setStep(3)}
                                    disabled={!formData.concepto_nombre || (formData.es_sena && !formData.sena_tipo)}
                                    className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-xl font-medium transition-colors h-auto"
                                >
                                    Continuar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Step 3: Payment Method and Details */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl border border-gray-100 dark:border-gray-700 flex justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                        <FileText size={18} className="text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <div>
                                        <p className="font-bold text-gray-900 dark:text-white">
                                            {useMultiplePayments
                                                ? formatCurrency(getMixedUsdTotal(paymentSplits), 'USD')
                                                : formatCurrency(formData.monto, formData.moneda)}
                                        </p>
                                        <p className="text-xs text-gray-500">{formData.concepto_nombre}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] text-gray-500 uppercase">Paciente</p>
                                    <p className="font-medium text-gray-900 dark:text-white">{formData.paciente_nombre}</p>
                                </div>
                            </div>

                            {/* Payment Method */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Método de Pago
                                    </label>
                                    <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={useMultiplePayments}
                                            onChange={(e) => {
                                                const next = e.target.checked;
                                                setUseMultiplePayments(next);
                                                if (next) {
                                                    setPaymentSplits((prev) => {
                                                        if (prev.length > 0 && prev.some((split) => split.monto > 0)) return prev;
                                                        return [createSplitFromCurrentForm()];
                                                    });
                                                } else {
                                                    const first = paymentSplits[0];
                                                    if (first) {
                                                        setFormData((prev) => ({
                                                            ...prev,
                                                            metodo_pago: first.metodo_pago,
                                                            moneda: first.moneda,
                                                            monto: first.monto > 0 ? first.monto : prev.monto,
                                                            canal_destino: first.canal_destino,
                                                        }));
                                                    }
                                                }
                                            }}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        Pago mixto (varios medios)
                                    </label>
                                </div>

                                {!useMultiplePayments && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {METODOS_PAGO.map((metodo) => (
                                            <Button
                                                key={metodo.value}
                                                onClick={() => setFormData({ ...formData, metodo_pago: metodo.value as FormData['metodo_pago'] })}
                                                className={clsx(
                                                    "p-3 border rounded-xl text-left transition-colors h-auto justify-start",
                                                    formData.metodo_pago === metodo.value
                                                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100"
                                                        : "border-gray-200 dark:border-gray-700 hover:border-gray-300 bg-transparent"
                                                )}
                                            >
                                                <span className="mr-2">{metodo.icon}</span>
                                                {metodo.label}
                                            </Button>
                                        ))}
                                    </div>
                                )}

                                {useMultiplePayments && (
                                    <div className="space-y-3">
                                        {paymentSplits.map((split, idx) => {
                                            const splitUsd = calculateUsdEquivalentForAmount(split.monto, split.moneda);
                                            return (
                                                <div key={split.id} className="p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900/40 space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <p className="text-xs font-semibold text-gray-500 uppercase">Pago {idx + 1}</p>
                                                        {paymentSplits.length > 1 && (
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                onClick={() => removePaymentSplit(idx)}
                                                                className="text-xs text-red-500 hover:text-red-600 h-auto p-0"
                                                            >
                                                                Quitar
                                                            </Button>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                        <select
                                                            value={split.metodo_pago}
                                                            onChange={(e) => setSplitValue(idx, { metodo_pago: e.target.value as MetodoPagoIngreso })}
                                                            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                                                        >
                                                            {METODOS_PAGO.map((metodo) => (
                                                                <option key={metodo.value} value={metodo.value}>{metodo.label}</option>
                                                            ))}
                                                        </select>

                                                        <select
                                                            value={split.canal_destino}
                                                            onChange={(e) => setSplitValue(idx, { canal_destino: e.target.value as CanalDestinoIngreso })}
                                                            className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                                                        >
                                                            <option value="Empresa">Empresa</option>
                                                            <option value="Personal">Personal</option>
                                                            <option value="MP">MP</option>
                                                            <option value="USDT">USDT</option>
                                                        </select>
                                                    </div>

                                                    <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                                                        <MoneyInput
                                                            value={split.monto || 0}
                                                            onChange={(val) => setSplitValue(idx, { monto: val })}
                                                            className="w-full h-auto"
                                                            placeholder="0"
                                                        />
                                                        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                                                            {(['ARS', 'USD', 'USDT'] as MonedaIngreso[]).map((currency) => (
                                                                <Button
                                                                    key={currency}
                                                                    type="button"
                                                                    onClick={() => setSplitValue(idx, { moneda: currency })}
                                                                    className={clsx(
                                                                        'px-2 py-1 text-xs font-bold rounded-none h-auto',
                                                                        split.moneda === currency
                                                                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                                                                            : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                                    )}
                                                                >
                                                                    {currency}
                                                                </Button>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <p className="text-xs text-gray-500">≈ {formatCurrency(splitUsd, 'USD')}</p>
                                                </div>
                                            );
                                        })}

                                        <div className="flex items-center justify-between gap-3">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                onClick={addPaymentSplit}
                                                className="text-xs h-auto py-2"
                                            >
                                                + Agregar forma de pago
                                            </Button>
                                            <div className="text-right">
                                                <p className="text-[10px] text-gray-500 uppercase">Total en formas de pago</p>
                                                <p className="text-sm font-bold text-blue-700 dark:text-blue-300">
                                                    {formatCurrency(getMixedUsdTotal(paymentSplits), 'USD')}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {useMultiplePayments && (
                                <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/40 dark:bg-blue-900/10 p-3 text-xs text-blue-700 dark:text-blue-300">
                                    Carga todas las formas de pago y el sistema registra el ingreso en un solo paso sin duplicar la cuota.
                                </div>
                            )}

                            {/* Financiación / Cuotas */}
                            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-3">
                                <label className="flex items-center gap-2.5 text-sm font-medium text-gray-900 dark:text-white cursor-pointer w-fit">
                                    <div className={`w-5 h-5 flex items-center justify-center rounded border transition-colors ${formData.es_cuota ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300 dark:border-gray-600 dark:bg-gray-800'}`}>
                                        {formData.es_cuota && <Check size={14} className="text-white" />}
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={formData.es_cuota}
                                        onChange={(e) => setFormData({ ...formData, es_cuota: e.target.checked })}
                                        className="sr-only"
                                    />
                                    <span>Es pago de financiación / cuota</span>
                                </label>

                                {formData.es_cuota && (
                                    <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">Cuota Nro.</label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={formData.cuota_nro}
                                                    onChange={(e) => setFormData({ ...formData, cuota_nro: Math.max(1, parseInt(e.target.value) || 0) })}
                                                    className="w-full px-3 py-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-visible:ring-blue-500 h-auto"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-medium text-gray-500 mb-1">De un total de</label>
                                                <Input
                                                    type="number"
                                                    min="1"
                                                    value={formData.cuotas_total}
                                                    onChange={(e) => setFormData({ ...formData, cuotas_total: Math.max(1, parseInt(e.target.value) || 0) })}
                                                    className="w-full px-3 py-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-visible:ring-blue-500 h-auto"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">Referencia presupuesto (opcional)</label>
                                            <Input
                                                type="text"
                                                value={formData.presupuesto_ref}
                                                onChange={(e) => setFormData({ ...formData, presupuesto_ref: e.target.value })}
                                                placeholder="Ej: PRES-2026-031"
                                                className="w-full px-3 py-2 border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus-visible:ring-blue-500 h-auto"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Ticket Upload for non-cash payments */}
                            {((!useMultiplePayments && formData.metodo_pago !== 'Efectivo') ||
                                (useMultiplePayments && paymentSplits.some((split) => split.metodo_pago !== 'Efectivo'))) && (
                                <div className="p-4 border border-blue-100 dark:border-blue-900/30 rounded-xl bg-blue-50/30 dark:bg-blue-900/10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <FileText size={16} className="text-blue-600" />
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            {useMultiplePayments ? 'Comprobante del pago mixto' : 'Comprobante de operación'}
                                        </label>
                                    </div>

                                    <ComprobanteUpload
                                        area="caja-recepcion"
                                        onUploadComplete={(res) => setFormData(prev => ({ ...prev, comprobante_url: res.path || res.url }))}
                                        className="w-full"
                                    />

                                    {formData.comprobante_url && (
                                        <p className="mt-2 text-xs text-green-600 font-medium flex items-center gap-1">
                                            <Check size={12} /> Comprobante adjuntado correctamente
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Status */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Estado
                                </label>
                                <div className="flex gap-3">
                                    <Button
                                        onClick={() => setFormData({ ...formData, estado: 'pagado' })}
                                        className={clsx(
                                            "flex-1 p-3 border rounded-xl transition-colors h-auto",
                                            formData.estado === 'pagado'
                                                ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 hover:bg-green-100"
                                                : "border-gray-200 dark:border-gray-700 bg-transparent hover:bg-gray-50"
                                        )}
                                    >
                                        ✓ Pagado
                                    </Button>
                                    <Button
                                        onClick={() => setFormData({ ...formData, estado: 'pendiente' })}
                                        className={clsx(
                                            "flex-1 p-3 border rounded-xl transition-colors h-auto",
                                            formData.estado === 'pendiente'
                                                ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 hover:bg-yellow-100"
                                                : "border-gray-200 dark:border-gray-700 bg-transparent hover:bg-gray-50"
                                        )}
                                    >
                                        ⏳ Pendiente
                                    </Button>
                                </div>
                            </div>

                            {/* Historical Load Toggle - Only for admin/owner */}
                            {canUseHistoricalLoad && (
                                <div className="p-4 border border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                                    <div className="flex items-center justify-between mb-3">
                                        <div>
                                            <p className="font-medium text-amber-800 dark:text-amber-300">Carga histórica</p>
                                            <p className="text-xs text-amber-600 dark:text-amber-400">Registrar ingreso en fecha pasada</p>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setCargaHistorica(!cargaHistorica)}
                                            className={clsx(
                                                "w-12 h-6 rounded-full p-0 transition-colors relative hover:bg-transparent",
                                                cargaHistorica ? "bg-amber-500 hover:bg-amber-600" : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
                                            )}
                                        >
                                            <span
                                                className={clsx(
                                                    "absolute w-5 h-5 bg-white rounded-full top-0.5 transition-all shadow",
                                                    cargaHistorica ? "right-0.5" : "left-0.5"
                                                )}
                                            />
                                        </Button>
                                    </div>
                                    {cargaHistorica && (
                                        <div>
                                            <label className="block text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                                                <Calendar size={14} className="inline mr-1" />
                                                Fecha del movimiento
                                            </label>
                                            <Input
                                                type="date"
                                                value={fechaMovimiento}
                                                onChange={(e) => setFechaMovimiento(e.target.value)}
                                                max={getLocalISODate()}
                                                className="w-full px-4 py-2 border-amber-300 dark:border-amber-700 rounded-xl bg-white dark:bg-gray-800 focus-visible:ring-amber-500 h-auto"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <Button
                                onClick={() => setStep(4)}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors h-auto"
                            >
                                Continuar
                            </Button>

                            <Button
                                variant="link"
                                onClick={() => setStep(2)}
                                className="w-full text-sm text-blue-600 hover:underline h-auto p-0"
                            >
                                ← Cambiar concepto
                            </Button>
                        </div>
                    )}

                    {/* Step 4: Confirm */}
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
                                        <span className="text-gray-500">Workflow a activar:</span>
                                        <span className="font-medium text-amber-700 dark:text-amber-300">{getSenaWorkflowLabel(formData.sena_tipo)}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Categoría:</span>
                                    <span>{formData.categoria}</span>
                                </div>
                                <hr className="border-gray-200 dark:border-gray-700" />
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Monto:</span>
                                    <span className="font-bold text-lg">
                                        {useMultiplePayments
                                            ? formatCurrency(getMixedUsdTotal(paymentSplits), 'USD')
                                            : formatCurrency(formData.monto, formData.moneda)}
                                    </span>
                                </div>
                                {formData.es_cuota && (
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Cuota:</span>
                                        <span className="font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded text-sm">
                                            {formData.cuota_nro} de {formData.cuotas_total}
                                        </span>
                                    </div>
                                )}
                                {formData.moneda === 'ARS' && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-gray-500">Equivalente USD:</span>
                                        <span>{formatCurrency(calculateUsdEquivalent(), 'USD')}</span>
                                    </div>
                                )}
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Método:</span>
                                    <span>{useMultiplePayments ? `Mixto (${paymentSplits.filter((split) => split.monto > 0).length} pagos)` : formData.metodo_pago}</span>
                                </div>

                                {useMultiplePayments && (
                                    <div className="space-y-1 pt-1">
                                        {paymentSplits.filter((split) => split.monto > 0).map((split, idx) => (
                                            <div key={split.id} className="flex justify-between text-xs text-gray-500">
                                                <span>Pago {idx + 1}: {split.metodo_pago}</span>
                                                <span>{formatCurrency(split.monto, split.moneda)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                <div className="flex justify-between">
                                    <span className="text-gray-500">Estado:</span>
                                    <span className={formData.estado === 'pagado' ? 'text-green-600' : 'text-yellow-600'}>
                                        {formData.estado === 'pagado' ? '✓ Pagado' : '⏳ Pendiente'}
                                    </span>
                                </div>
                                {formData.comprobante_url && (
                                    <div className="flex justify-between items-center py-2">
                                        <span className="text-gray-500">Comprobante:</span>
                                        <div className="flex items-center gap-2 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                                            <ImageIcon size={14} /> Adjunto
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Observations */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Observaciones (opcional)
                                </label>
                                <Textarea
                                    value={formData.observaciones}
                                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                                    className="w-full p-3 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 resize-none min-h-[80px]"
                                    rows={3}
                                    placeholder="Notas adicionales..."
                                />
                            </div>

                            <Button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 h-auto"
                            >
                                {saving ? (
                                    <>
                                        <Loader2 size={20} className="animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Check size={20} />
                                        Confirmar Ingreso
                                    </>
                                )}
                            </Button>

                            <Button
                                variant="link"
                                onClick={() => setStep(3)}
                                className="w-full text-sm text-blue-600 hover:underline h-auto p-0"
                            >
                                ← Volver
                            </Button>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-5">
                            {/* Success header */}
                            <div className="flex flex-col items-center gap-2 pt-2 pb-1">
                                <div className="h-14 w-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                    <Check size={28} className="text-green-600 dark:text-green-400" />
                                </div>
                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">¡Ingreso registrado!</h3>
                                <p className="text-sm text-gray-500 text-center">Tu comprobante está listo para compartir</p>
                            </div>

                            {/* Receipt preview */}
                            {generatedReceiptUrl ? (
                                <div className="rounded-2xl overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={generatedReceiptUrl}
                                        alt="Comprobante de pago"
                                        className="w-full object-contain"
                                    />
                                </div>
                            ) : (
                                <div className="h-32 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    <Loader2 size={24} className="animate-spin text-gray-400" />
                                </div>
                            )}

                            {/* Sharing actions */}
                            {/* PRIMARY: Send as image via WhatsApp app (Windows/mobile) */}
                            <Button
                                onClick={() => {
                                    if (!generatedReceiptUrl || !receiptCanvasRef.current) return;
                                    receiptCanvasRef.current.toBlob(async (blob) => {
                                        if (!blob) return;
                                        const file = new File([blob], 'comprobante-AM-Clinica.jpg', { type: 'image/jpeg' });
                                        if (navigator.canShare?.({ files: [file] })) {
                                            try {
                                                await navigator.share({
                                                    files: [file],
                                                    title: 'Comprobante AM Clínica',
                                                });
                                            } catch { /* cancelled */ }
                                        } else {
                                            // Fallback: download so user can attach manually
                                            const link = document.createElement('a');
                                            link.href = generatedReceiptUrl;
                                            link.download = 'comprobante-AM-Clinica.jpg';
                                            link.click();
                                        }
                                    }, 'image/jpeg', 0.95);
                                }}
                                disabled={!generatedReceiptUrl}
                                className="w-full py-4 bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold rounded-xl h-auto border-none flex items-center justify-center gap-2 text-base"
                            >
                                📲 Enviar como imagen por WhatsApp
                            </Button>
                            <p className="text-xs text-center text-gray-400 -mt-2">
                                Abre WhatsApp (app de Windows o móvil) y adjunta la imagen automáticamente
                            </p>

                            <div className="grid grid-cols-2 gap-3">
                                <Button
                                    onClick={() => {
                                        if (!generatedReceiptUrl) return;
                                        const link = document.createElement('a');
                                        link.href = generatedReceiptUrl;
                                        link.download = 'comprobante-AM-Clinica.jpg';
                                        link.click();
                                    }}
                                    disabled={!generatedReceiptUrl}
                                    className="py-3 bg-gray-700 hover:bg-gray-800 text-white font-bold rounded-xl h-auto border-none flex items-center justify-center gap-2"
                                >
                                    💾 Descargar JPG
                                </Button>

                                <Button
                                    onClick={handleClose}
                                    className="py-3 bg-transparent border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold rounded-xl h-auto flex items-center justify-center gap-2"
                                >
                                    ✕ Cerrar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
