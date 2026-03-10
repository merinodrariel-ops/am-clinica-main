'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Search, User, DollarSign, Check, Loader2, Calendar, FileText, ImageIcon, Plus, Trash2, Layout } from 'lucide-react';
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
type MetodoPagoIngreso = 'Efectivo' | 'Transferencia' | 'MercadoPago' | 'Cripto' | 'Mixto';
type CanalDestinoIngreso = 'Empresa' | 'Personal' | 'MP' | 'USDT' | 'Mixto';
type TipoComprobanteIngreso = 'Factura A' | 'Tipo C' | 'Sin factura' | 'Otro';

const SENA_OPCIONES: Array<{ value: SenaTipo; label: string; workflow: string }> = [
    { value: 'diseno_sonrisa', label: 'Diseño de Sonrisa', workflow: 'Diseño de Sonrisa' },
    { value: 'ortodoncia_invisible', label: 'Alineadores Invisibles', workflow: 'Alineadores Invisibles' },
    { value: 'cirugia_implantes', label: 'Cirugía e Implantes', workflow: 'Cirugía e Implantes' },
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

    // Update total monto when splits change if we are in multiple payment mode
    useEffect(() => {
        if (useMultiplePayments) {
            const total = paymentSplits.reduce((acc, s) => acc + s.monto, 0);
            // We don't necessarily want to sync back to formData.monto if they entered a total,
            // but for simple cases where they just start splitting, it helps.
            // setFormData(prev => ({ ...prev, monto: total }));
        }
    }, [paymentSplits, useMultiplePayments]);

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
            // Stay in Step 1 if values are 0, but if we have pre-filled we can go forward
            // setStep(prev => (prev < 2 ? 2 : prev)); 
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
        // setStep(2); // Removed auto-advance to allow configuring amount/mixto in Step 1

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
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) throw new Error('No autenticado');

            // 1. Preparation
            const bnaRateEffective = bnaRate;
            const conceptoFinal = formData.concepto_nombre || 'Sin concepto';
            const categoriaFinal = formData.categoria || 'Sin categoría';
            const cleanedObservation = formData.observaciones?.trim() || '';
            const receiptNumber = generateReciboNumber();
            const splitGroupId = useMultiplePayments ? makeUuid() : null;

            // 2. Identify and Process payments
            const activeSplits = useMultiplePayments
                ? paymentSplits.filter(s => s.monto > 0)
                : [{
                    id: 'single',
                    monto: formData.monto,
                    moneda: formData.moneda,
                    metodo_pago: formData.metodo_pago,
                    canal_destino: formData.canal_destino
                }];

            if (activeSplits.length === 0) {
                alert('Debe ingresar al menos un pago');
                setSaving(false);
                return;
            }

            const totalUsdEquiv = useMultiplePayments ? getMixedUsdTotal(activeSplits) : calculateUsdEquivalent();

            // 3. Prepare Payloads
            // We'll insert one row per active payment split to have clean accounting by method/channel
            const payloads = activeSplits.map((split, index) => {
                const usdEquiv = calculateUsdEquivalentForAmount(split.monto, split.moneda);
                const isFirst = index === 0;

                return {
                    paciente_id: formData.paciente_id,
                    concepto_nombre: conceptoFinal,
                    categoria: categoriaFinal,
                    precio_lista_usd: formData.precio_lista_usd,
                    monto: split.monto,
                    moneda: split.moneda,
                    metodo_pago: split.metodo_pago,
                    canal_destino: split.canal_destino,
                    estado: formData.estado,
                    observaciones: isFirst ? cleanedObservation : `(Pago Mixto ${index + 1}/${activeSplits.length}) ${cleanedObservation}`,
                    usd_equivalente: usdEquiv,
                    tipo_comprobante: formData.tipo_comprobante,
                    fecha_movimiento: fechaMovimiento,
                    created_by: user.id,
                    comprobante_url: formData.comprobante_url || null,
                    // Add cuota details if present
                    cuota_nro: formData.cuota_nro,
                    cuotas_total: formData.cuotas_total,
                    tc_bna_venta: bnaRate,
                    tc_fuente: 'MANUAL',
                    split_group_id: splitGroupId,
                };
            });

            // 4. Batch Insertion
            // PERFORMANCE TIP: We explicitly select only 'id' to avoid "schema cache" errors 
            // where PostgREST tries to select columns that were recently deleted/renamed.
            const { data: insertedData, error: movementError } = await supabase
                .from('caja_recepcion_movimientos')
                .insert(payloads)
                .select('id');

            if (movementError) throw movementError;
            if (!insertedData || insertedData.length === 0) throw new Error("No se pudo insertar el movimiento");

            const mainMovement = insertedData[0];

            // 7. Sync with Cuotas Plan (Using total sum)
            if (formData.es_cuota) {
                // If it's a quota, we sync using the total USD amount and referencing the first movement
                await syncPagoCuotaAction({
                    movementId: mainMovement.id,
                    pacienteId: formData.paciente_id,
                    pacienteNombre: formData.paciente_nombre,
                    montoUsd: totalUsdEquiv,
                    montoOriginal: useMultiplePayments ? totalUsdEquiv : formData.monto, // simplified for multi-currency
                    moneda: useMultiplePayments ? 'USD' : formData.moneda as any,
                    cuotaNro: formData.cuota_nro,
                    cuotasTotal: formData.cuotas_total,
                    presupuestoRef: formData.presupuesto_ref,
                    observaciones: cleanedObservation,
                });
            }

            // 8. Generate Receipt (Using Canvas)
            try {
                const canvas = receiptCanvasRef.current;
                if (canvas) {
                    const cuotaInfo = formData.es_cuota
                        ? `${formData.cuota_nro}/${formData.cuotas_total}`
                        : undefined;

                    const receiptMetodo = useMultiplePayments
                        ? activeSplits.map(s => s.metodo_pago).join('/')
                        : formData.metodo_pago;

                    const imageDataUrl = drawReceiptOnCanvas(canvas, {
                        numero: receiptNumber,
                        fecha: new Date(),
                        paciente: formData.paciente_nombre,
                        concepto: conceptoFinal,
                        monto: totalUsdEquiv,
                        moneda: 'USD',
                        metodoPago: receiptMetodo,
                        atendidoPor: 'AM Clínica',
                        cuotaInfo,
                    });

                    setGeneratedReceiptUrl(imageDataUrl);
                    const base64Data = imageDataUrl.split(',')[1];

                    // Link receipt to all movements inserted
                    await Promise.all(insertedData.map((m: any) =>
                        saveReceiptAndLinkToMovement(m.id, receiptNumber, base64Data)
                    ));
                }
            } catch (receiptError) {
                console.error('Receipt generation/saving failed:', receiptError);
                // We continue as database entries are already saved
            }

            // 9. Extra flows (Sena)
            if (formData.es_sena && formData.sena_tipo) {
                await triggerWorkflowFromSenaPayment({
                    patientId: formData.paciente_id,
                    senaTipo: formData.sena_tipo,
                    movementId: mainMovement.id,
                    conceptoNombre: conceptoFinal,
                    monto: totalUsdEquiv,
                    moneda: 'USD',
                }).catch(e => console.error("Sena workflow trigger failed:", e));
            }

            onSuccess();
            setStep(5);
        } catch (error: any) {
            console.error('Error saving income:', error);
            const errorMessage = error.message || error.details || (typeof error === 'string' ? error : 'Error desconocido');
            alert('Error al guardar el ingreso: ' + errorMessage);
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
                {/* Barra de progreso — estilo admisión */}
                {step < 5 && (
                    <div className="w-full h-1 bg-gray-100 dark:bg-gray-700 rounded-t-2xl overflow-hidden">
                        <motion.div
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-300"
                            initial={false}
                            animate={{ width: `${((step - 1) / 3) * 100}%` }}
                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                        />
                    </div>
                )}
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Nuevo Ingreso</h2>
                    </div>
                    {useMultiplePayments && (
                        <div className="hidden sm:flex px-3 py-1 bg-amber-500 text-white text-[10px] font-black rounded-full uppercase tracking-widest shadow-lg shadow-amber-500/20 animate-bounce">
                            Mixto Activo
                        </div>
                    )}
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
                        <>
                            <div className="space-y-6">
                                <div>
                                    <div className="relative">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-2">
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
                                                className="pl-10 py-3 rounded-2xl focus:ring-blue-500 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 shadow-sm transition-all focus:border-blue-500"
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
                                                    className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                >
                                                    <X size={16} />
                                                </Button>
                                            )}
                                        </div>

                                        {searchLoading && (
                                            <div className="absolute top-full left-0 right-0 mt-2 p-4 bg-white dark:bg-gray-800 rounded-xl shadow-xl z-20 border border-gray-100 dark:border-gray-700 flex justify-center">
                                                <Loader2 className="animate-spin text-blue-500" size={20} />
                                            </div>
                                        )}

                                        {patients.length > 0 && !formData.paciente_id && (
                                            <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl z-20 border border-gray-100 dark:border-gray-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                                                {patients.map((patient) => (
                                                    <button
                                                        key={patient.id_paciente}
                                                        onClick={() => selectPatient(patient)}
                                                        className="w-full p-4 text-left hover:bg-blue-50 dark:hover:bg-blue-900/10 flex items-center gap-3 transition-colors border-b border-gray-50 dark:border-gray-700 last:border-0"
                                                    >
                                                        <div className="h-10 w-10 rounded-full bg-blue-100/50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600">
                                                            <User size={20} />
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900 dark:text-white text-sm">{patient.apellido}, {patient.nombre}</p>
                                                            <p className="text-[10px] text-gray-500 font-medium">DNI: {patient.documento || 'No cargo'}</p>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {!useMultiplePayments ? (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                                    Monto del Ingreso *
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setUseMultiplePayments(true)}
                                                    className="p-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded flex items-center gap-1 transition-colors"
                                                    title="Dividir Pago"
                                                >
                                                    <Plus className="w-3.5 h-3.5" />
                                                    <span className="text-[9px] font-bold uppercase">Pago Mixto</span>
                                                </button>
                                            </div>
                                            <div className="flex gap-3">
                                                <div className="relative flex-1">
                                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                                    <MoneyInput
                                                        value={formData.monto || 0}
                                                        onChange={(val) => setFormData({ ...formData, monto: val })}
                                                        className="w-full h-auto text-3xl font-black py-4 focus-visible:ring-blue-500 bg-gray-50 dark:bg-gray-900 border-2 border-gray-100 dark:border-gray-800 shadow-inner"
                                                        placeholder="0"
                                                    />
                                                </div>
                                                <div className="flex rounded-2xl overflow-hidden border-2 border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 shadow-sm">
                                                    {['ARS', 'USD'].map((m) => (
                                                        <Button
                                                            key={m}
                                                            type="button"
                                                            onClick={() => setFormData({ ...formData, moneda: m as any })}
                                                            className={clsx(
                                                                "px-5 py-2 text-[11px] font-black transition-all rounded-none h-auto",
                                                                formData.moneda === m
                                                                    ? "bg-blue-600 text-white shadow-lg"
                                                                    : "bg-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                                                            )}
                                                        >
                                                            {m}
                                                        </Button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Simplified Payment Method Selection directly in Step 1 */}
                                            <div className="pt-2 animate-in fade-in slide-in-from-top-1 duration-400">
                                                <div className="flex items-center justify-between mb-2">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Medio de Pago</label>
                                                </div>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {METODOS_PAGO.map((m) => (
                                                        <button
                                                            key={m.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setFormData({
                                                                    ...formData,
                                                                    metodo_pago: m.value as any,
                                                                    canal_destino: m.value === 'MercadoPago' ? 'MP' : m.value === 'Cripto' ? 'USDT' : 'Empresa'
                                                                });
                                                            }}
                                                            className={clsx(
                                                                "py-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all",
                                                                formData.metodo_pago === m.value
                                                                    ? "bg-blue-600 border-blue-600 shadow-md transform scale-[1.03]"
                                                                    : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-100"
                                                            )}
                                                        >
                                                            <span className="text-xl">{m.icon}</span>
                                                            <span className={clsx(
                                                                "text-[8px] font-black uppercase tracking-tighter",
                                                                formData.metodo_pago === m.value ? "text-white" : "text-gray-500"
                                                            )}>{m.label.split(' ')[0]}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Attach file if Transfer or MP */}
                                            {(formData.metodo_pago === 'Transferencia' || formData.metodo_pago === 'MercadoPago') && (
                                                <div className="pt-2 animate-in zoom-in-95 duration-300">
                                                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 px-1">Adjuntar Comprobante</p>
                                                    <ComprobanteUpload
                                                        area="caja-recepcion"
                                                        onUploadComplete={({ url }) => setFormData(prev => ({ ...prev, comprobante_url: url }))}
                                                        className="w-full scale-95 origin-left"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                                    Desglose de Pago Mixto
                                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-lg uppercase tracking-widest">Multimoneda</span>
                                                </label>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    onClick={() => setUseMultiplePayments(false)}
                                                    className="h-7 text-[9px] font-black uppercase text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 px-2 rounded-lg"
                                                >
                                                    Volver a Pago Único
                                                </Button>
                                            </div>

                                            <div className="space-y-3">
                                                {paymentSplits.map((split, index) => (
                                                    <div key={split.id} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm relative group">
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Monto y Moneda</label>
                                                                <div className="flex gap-2">
                                                                    <MoneyInput
                                                                        value={split.monto}
                                                                        onChange={(val) => {
                                                                            const newSplits = [...paymentSplits];
                                                                            newSplits[index].monto = val;
                                                                            setPaymentSplits(newSplits);
                                                                        }}
                                                                        className="flex-1 h-10 text-lg font-bold"
                                                                        placeholder="0"
                                                                    />
                                                                    <div className="flex border rounded-lg overflow-hidden shrink-0">
                                                                        {['ARS', 'USD'].map(curr => (
                                                                            <button
                                                                                key={curr}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const newSplits = [...paymentSplits];
                                                                                    newSplits[index].moneda = curr as any;
                                                                                    setPaymentSplits(newSplits);
                                                                                }}
                                                                                className={clsx(
                                                                                    "px-2 text-[10px] font-bold",
                                                                                    split.moneda === curr ? "bg-blue-600 text-white" : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                                                                                )}
                                                                            >
                                                                                {curr}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-[10px] font-bold text-gray-400 uppercase">Método de Pago</label>
                                                                <select
                                                                    value={split.metodo_pago}
                                                                    onChange={(e) => {
                                                                        const newSplits = [...paymentSplits];
                                                                        newSplits[index].metodo_pago = e.target.value as any;
                                                                        // Auto-channel
                                                                        newSplits[index].canal_destino = e.target.value === 'MercadoPago' ? 'MP' : e.target.value === 'Cripto' ? 'USDT' : 'Empresa';
                                                                        setPaymentSplits(newSplits);
                                                                    }}
                                                                    className="w-full h-10 px-3 rounded-lg border bg-gray-50 dark:bg-gray-900 text-sm font-medium"
                                                                >
                                                                    {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.icon} {m.label}</option>)}
                                                                </select>
                                                            </div>
                                                        </div>
                                                        {paymentSplits.length > 1 && (
                                                            <button
                                                                onClick={() => setPaymentSplits(paymentSplits.filter(s => s.id !== split.id))}
                                                                className="absolute -top-2 -right-2 h-6 w-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center border border-red-200 shadow-sm hover:bg-red-200 transition-colors"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            <div className="flex items-center gap-3 mt-4">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    onClick={() => setPaymentSplits([...paymentSplits, { id: makeUuid(), monto: 0, moneda: 'USD', metodo_pago: 'Efectivo', canal_destino: 'Empresa' }])}
                                                    className="flex-1 border-dashed border-2 py-6 rounded-2xl hover:bg-gray-50 dark:hover:bg-gray-800/50 text-blue-600 font-black uppercase text-[10px] tracking-widest h-auto"
                                                >
                                                    <Plus size={16} className="mr-2" /> Agregar medio de pago
                                                </Button>

                                                {(paymentSplits.some(s => s.metodo_pago === 'Transferencia' || s.metodo_pago === 'MercadoPago')) && (
                                                    <div className="flex-1">
                                                        <ComprobanteUpload
                                                            area="caja-recepcion"
                                                            onUploadComplete={({ url }) => setFormData(prev => ({ ...prev, comprobante_url: url }))}
                                                            className="w-full"
                                                        />
                                                    </div>
                                                )}

                                                <div className="flex-1 bg-gray-950 dark:bg-black text-white p-4 rounded-2xl flex flex-col justify-center items-end shadow-xl border border-gray-800">
                                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Acumulado</span>
                                                    <span className="text-xl font-black text-blue-400 tabular-nums">
                                                        USD {getMixedUsdTotal(paymentSplits).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 bg-blue-50/30 dark:bg-blue-900/10 rounded-2xl border border-blue-100 dark:border-blue-800/50">
                                    <div className="flex items-center gap-3">
                                        <div className="h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
                                            <Calendar size={18} />
                                        </div>
                                        <span className="text-xs font-black uppercase text-gray-500 tracking-wider">Fecha del movimiento</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date"
                                            value={fechaMovimiento}
                                            onChange={(e) => setFechaMovimiento(e.target.value)}
                                            className="text-sm font-bold border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 px-4 py-2 focus:ring-blue-500 shadow-sm"
                                        />
                                        {fechaMovimiento !== getLocalISODate() && (
                                            <span className="px-2 py-1 bg-amber-500 text-white text-[8px] font-black rounded uppercase tracking-tighter shadow-sm animate-pulse">Carga Histórica</span>
                                        )}
                                    </div>
                                </div>


                                <div className="mt-4 rounded-2xl border-2 border-amber-200/50 bg-amber-50/30 dark:bg-amber-900/10 dark:border-amber-900/30 p-5 shadow-sm">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600">
                                                <FileText size={20} />
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-amber-900 dark:text-amber-200 uppercase tracking-widest">¿Este pago es una seña?</p>
                                                <p className="text-[10px] text-amber-700/60 dark:text-amber-300/60 font-medium">Activa el workflow clínico automáticamente.</p>
                                            </div>
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
                                                'px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all h-auto shadow-sm',
                                                formData.es_sena
                                                    ? 'bg-amber-600 text-white shadow-amber-200'
                                                    : 'bg-white text-amber-700 border-2 border-amber-200 hover:bg-amber-50'
                                            )}
                                        >
                                            {formData.es_sena ? 'ACTIVA' : 'Desactivada'}
                                        </Button>
                                    </div>

                                    {formData.es_sena && (
                                        <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                            {SENA_OPCIONES.map(option => (
                                                <Button
                                                    key={option.value}
                                                    type="button"
                                                    onClick={() => applySenaTipo(option.value)}
                                                    className={clsx(
                                                        'px-3 py-3 rounded-xl text-[9px] font-black uppercase tracking-tighter border-2 transition-all h-auto text-left justify-start shadow-sm',
                                                        formData.sena_tipo === option.value
                                                            ? 'bg-amber-600 text-white border-amber-600'
                                                            : 'bg-white text-amber-900 border-amber-100 hover:bg-amber-50'
                                                    )}
                                                >
                                                    {option.label}
                                                </Button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>


                            <div className="flex flex-col gap-2 mt-auto">
                                <Button
                                    onClick={() => setStep(2)}
                                    disabled={!formData.paciente_id || (useMultiplePayments ? currentTotalUsd <= 0 : formData.monto <= 0)}
                                    className={clsx(
                                        "w-full py-5 rounded-[22px] font-black uppercase tracking-widest transition-all h-auto shadow-xl",
                                        !formData.paciente_id || (useMultiplePayments ? currentTotalUsd <= 0 : formData.monto <= 0)
                                            ? "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                                            : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-[0.98]"
                                    )}
                                >
                                    Continuar al Concepto
                                </Button>
                                {(!formData.paciente_id && (useMultiplePayments ? currentTotalUsd > 0 : formData.monto > 0)) && (
                                    <div className="bg-red-50 dark:bg-red-900/10 p-2 rounded-xl border border-red-100 dark:border-red-900/30">
                                        <p className="text-[10px] text-red-600 dark:text-red-400 font-black text-center animate-pulse uppercase tracking-wider">⚠️ Debes seleccionar un paciente para continuar</p>
                                    </div>
                                )}
                            </div>
                        </>
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
                                                    <div
                                                        key={item.id}
                                                        className="flex items-center justify-between p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:border-blue-200 hover:bg-blue-50/10 dark:hover:bg-blue-900/10 transition-all text-left group"
                                                    >
                                                        <div className="flex-1">
                                                            <p className="font-medium text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">{item.concepto_nombre}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <button
                                                                onClick={() => {
                                                                    setFormData({
                                                                        ...formData,
                                                                        concepto_nombre: item.concepto_nombre,
                                                                        precio_lista_usd: item.precio_base_usd
                                                                    });
                                                                    setStep(4);
                                                                }}
                                                                className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-sm hover:bg-blue-700 transition-colors"
                                                            >
                                                                Seleccionar
                                                            </button>
                                                        </div>
                                                    </div>
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
                                        onClick={() => setStep(4)}
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
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 dark:text-white uppercase text-xs tracking-widest">Método de Pago</h3>
                                <Button
                                    variant="link"
                                    onClick={() => setStep(2)}
                                    className="text-[10px] text-blue-600 p-0 h-auto font-bold uppercase"
                                >
                                    ← Volver a Concepto
                                </Button>
                            </div>

                            {useMultiplePayments ? (
                                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                    <div className="bg-amber-50 dark:bg-amber-900/10 border-2 border-amber-100 dark:border-amber-800 rounded-2xl p-6 shadow-sm">
                                        <div className="flex items-center justify-between mb-6">
                                            <div className="flex items-center gap-2">
                                                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                                                <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest">Resumen Mixto</span>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setStep(1)}
                                                className="h-7 text-[9px] font-black uppercase bg-white border-amber-200 text-amber-700 hover:bg-amber-50 hover:text-amber-800 rounded-lg"
                                            >
                                                Editar Desglose
                                            </Button>
                                        </div>

                                        <div className="space-y-3">
                                            {paymentSplits.filter(s => s.monto > 0).map((split) => (
                                                <div key={split.id} className="flex justify-between items-center py-3 px-4 bg-white dark:bg-gray-800 rounded-2xl border border-amber-100 dark:border-amber-900/40 shadow-sm transition-all hover:border-amber-200">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center text-xl shadow-inner border border-amber-100/50">
                                                            {METODOS_PAGO.find(m => m.value === split.metodo_pago)?.icon || '💰'}
                                                        </div>
                                                        <div>
                                                            <p className="font-black text-gray-900 dark:text-white text-[10px] uppercase tracking-wider">{split.metodo_pago}</p>
                                                            <p className="text-[11px] text-gray-600 font-black tabular-nums">{formatCurrency(split.monto, split.moneda)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-0.5">Valor USD</p>
                                                        <p className="font-black text-blue-600 dark:text-blue-400 tabular-nums">
                                                            USD {calculateUsdEquivalentForAmount(split.monto, split.moneda).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-8 pt-4 border-t-2 border-amber-100 dark:border-amber-900/40 flex justify-between items-end">
                                            <div>
                                                <p className="text-[10px] font-black text-amber-900/40 dark:text-amber-200/40 uppercase tracking-widest">Total a pagar</p>
                                                <p className="text-3xl font-black text-amber-600 tracking-tighter">
                                                    USD {currentTotalUsd.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                                </p>
                                            </div>
                                            <div className="pb-1">
                                                <span className="px-2 py-1 bg-green-500 text-white text-[9px] font-black rounded-lg uppercase tracking-widest">Completado</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            <div className="mt-8">
                                <Button
                                    onClick={() => setStep(4)}
                                    className="w-full py-5 bg-gray-900 hover:bg-black dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 text-white rounded-2xl font-black uppercase tracking-widest transition-all h-auto shadow-xl"
                                >
                                    Confirmar y Revisar
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 dark:text-white uppercase text-xs tracking-widest">Confirmar Ingreso</h3>
                                <Button
                                    variant="link"
                                    onClick={() => setStep(useMultiplePayments ? 3 : 2)}
                                    className="text-[10px] text-blue-600 p-0 h-auto font-bold uppercase"
                                >
                                    ← Volver {useMultiplePayments ? 'al Resumen' : 'al Concepto'}
                                </Button>
                            </div>

                            <div className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-6 space-y-4 border border-gray-100 dark:border-gray-800">
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paciente</span>
                                    <span className="font-black text-gray-900 dark:text-white text-right">{formData.paciente_nombre}</span>
                                </div>
                                <div className="flex justify-between items-start">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto</span>
                                    <span className="font-black text-gray-900 dark:text-white text-right max-w-[200px]">{formData.concepto_nombre}</span>
                                </div>
                                {formData.es_sena && formData.sena_tipo && (
                                    <div className="flex justify-between items-center py-2 px-3 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-100 dark:border-amber-900/30">
                                        <span className="text-[9px] font-black text-amber-600 uppercase">Workflow Clínico</span>
                                        <span className="font-black text-amber-700 text-[10px] uppercase">{getSenaWorkflowLabel(formData.sena_tipo)}</span>
                                    </div>
                                )}
                                <div className="pt-4 border-t border-gray-200 dark:border-gray-800">
                                    <div className="flex justify-between items-end">
                                        <div>
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Movimiento</p>
                                            <p className="text-2xl font-black text-gray-900 dark:text-white tracking-tighter tabular-nums">
                                                {useMultiplePayments
                                                    ? formatCurrency(getMixedUsdTotal(paymentSplits), 'USD')
                                                    : formatCurrency(formData.monto, formData.moneda)}
                                            </p>
                                        </div>
                                        {useMultiplePayments && (
                                            <div className="text-right">
                                                <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Calculado en USD</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {useMultiplePayments && (
                                    <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Desglose de Pagos</p>
                                        {paymentSplits.filter(s => s.monto > 0).map((s, idx) => (
                                            <div key={idx} className="flex justify-between items-center py-1">
                                                <span className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase">{s.metodo_pago}</span>
                                                <span className="text-[10px] font-bold text-gray-900 dark:text-white tabular-nums">{formatCurrency(s.monto, s.moneda)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Notas del Movimiento</p>
                                <Textarea
                                    value={formData.observaciones}
                                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                                    className="w-full rounded-2xl bg-gray-50 dark:bg-gray-900 border-gray-100 dark:border-gray-800 text-sm p-4 h-24"
                                    placeholder="Añadir notas internas..."
                                />
                            </div>

                            <Button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="w-full py-5 bg-green-600 hover:bg-green-700 text-white rounded-2xl font-black uppercase tracking-widest transition-all h-auto shadow-xl flex items-center justify-center gap-3"
                            >
                                {saving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} />}
                                {saving ? 'PROCESANDO PAGO...' : 'CONFIRMAR E INGRESAR'}
                            </Button>
                        </div>
                    )}

                    {step === 5 && (
                        <div className="space-y-5 flex flex-col items-center py-6">
                            <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center text-green-600 shadow-inner">
                                <Check size={48} className="animate-in zoom-in-50 duration-500" />
                            </div>
                            <div className="text-center space-y-1">
                                <h3 className="text-2xl font-black uppercase tracking-tighter">¡Ingreso Exitoso!</h3>
                                <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">El movimiento ha sido registrado correctamente.</p>
                            </div>

                            {generatedReceiptUrl && (
                                <div className="w-full border-2 border-gray-100 dark:border-gray-800 rounded-3xl overflow-hidden shadow-2xl transition-all hover:scale-[1.01]">
                                    <img src={generatedReceiptUrl} alt="Comprobante" className="w-full h-auto" />
                                </div>
                            )}

                            <div className="flex gap-4 w-full pt-4">
                                <Button
                                    onClick={() => {
                                        if (generatedReceiptUrl) {
                                            const link = document.createElement('a');
                                            link.href = generatedReceiptUrl;
                                            link.download = `comprobante-${formData.paciente_nombre}.jpg`;
                                            link.click();
                                        }
                                    }}
                                    className="flex-1 bg-gray-100 text-gray-900 hover:bg-gray-200 h-auto py-4 rounded-2xl font-black uppercase tracking-widest"
                                >
                                    Descargar
                                </Button>
                                {generatedReceiptUrl && (
                                    <Button
                                        onClick={() => {
                                            const [, base64] = generatedReceiptUrl.split(',');
                                            const binary = atob(base64);
                                            const array = new Uint8Array(binary.length);
                                            for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
                                            const blob = new Blob([array], { type: 'image/jpeg' });
                                            const file = new File([blob], `comprobante-${formData.paciente_nombre}.jpg`, { type: 'image/jpeg' });
                                            if (navigator.share && navigator.canShare?.({ files: [file] })) {
                                                navigator.share({
                                                    files: [file],
                                                    title: 'Comprobante de Pago',
                                                    text: `Comprobante AM Clínica — ${formData.paciente_nombre}`,
                                                }).catch(() => {});
                                            } else {
                                                // Fallback: abrir WhatsApp web con link de storage si hay, sino descargar
                                                const link = document.createElement('a');
                                                link.href = generatedReceiptUrl;
                                                link.download = `comprobante-${formData.paciente_nombre}.jpg`;
                                                link.click();
                                            }
                                        }}
                                        className="flex-1 bg-[#25D366] hover:bg-[#20bd5a] text-white h-auto py-4 rounded-2xl font-black uppercase tracking-widest border-none"
                                    >
                                        📱 Compartir
                                    </Button>
                                )}
                                <Button
                                    onClick={handleClose}
                                    className="flex-1 bg-blue-600 text-white hover:bg-blue-700 h-auto py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-500/20"
                                >
                                    Finalizar
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
