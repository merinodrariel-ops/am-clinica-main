'use client';

import { useState, useEffect } from 'react';
import { X, Search, User, DollarSign, Check, Loader2, Calendar, FileText, ImageIcon } from 'lucide-react';
import { ComprobanteUpload } from '@/components/caja/ComprobanteUpload';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import clsx from 'clsx';
import { supabase, TarifarioItem } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';
import { useAuth } from '@/contexts/AuthContext';
import { triggerWorkflowFromSenaPayment } from '@/app/actions/clinical-workflows';
import { getLocalISODate } from '@/lib/local-date';

interface Paciente {
    id_paciente: string;
    nombre: string;
    apellido: string;
    telefono: string | null;
    documento: string | null;
}

interface NuevoIngresoFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    bnaRate: number;
}

type SenaTipo = '' | 'diseno_sonrisa' | 'ortodoncia_invisible' | 'cirugia_implantes';

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

interface FormData {
    paciente_id: string;
    paciente_nombre: string;
    concepto_id: string;
    concepto_nombre: string;
    categoria: string;
    precio_lista_usd: number;
    monto: number;
    moneda: 'USD' | 'ARS' | 'USDT';
    metodo_pago: 'Efectivo' | 'Transferencia' | 'MercadoPago' | 'Cripto';
    canal_destino: 'Empresa' | 'Personal' | 'MP' | 'USDT';
    tipo_comprobante: 'Factura A' | 'Tipo C' | 'Sin factura' | 'Otro';
    estado: 'pagado' | 'pendiente';
    observaciones: string;
    es_sena: boolean;
    sena_tipo: SenaTipo;
    es_cuota: boolean;
    cuota_nro: number;
    cuotas_total: number;
    comprobante_url?: string;
}

const METODOS_PAGO = [
    { value: 'Efectivo', label: 'Efectivo', icon: '💵' },
    { value: 'Transferencia', label: 'Transferencia', icon: '🏦' },
    { value: 'MercadoPago', label: 'Mercado Pago', icon: '📱' },
    { value: 'Cripto', label: 'Cripto (USDT)', icon: '₿' },
];



export default function NuevoIngresoForm({ isOpen, onClose, onSuccess, bnaRate }: NuevoIngresoFormProps) {
    const [step, setStep] = useState(1);
    const [saving, setSaving] = useState(false);

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
        comprobante_url: '',
    });

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

    async function searchPatients(query: string) {
        setSearchLoading(true);
        try {
            const { data, error } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, apellido, telefono, documento')
                .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%,documento.ilike.%${query}%`)
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
        setSearchQuery('');
        setPatients([]);
        setStep(2); // Move to next step immediately

        // Background fetch for financing data
        try {
            const { data: pData } = await supabase
                .from('pacientes')
                .select('financ_estado, financ_cuotas_total, financ_monto_total')
                .eq('id_paciente', patient.id_paciente)
                .single();

            if (pData?.financ_estado === 'activo') {
                const { count } = await supabase
                    .from('caja_recepcion_movimientos')
                    .select('*', { count: 'exact', head: true })
                    .eq('paciente_id', patient.id_paciente)
                    .neq('estado', 'Anulado')
                    .gt('cuota_nro', 0);

                const nextQuota = (count || 0) + 1;

                if (nextQuota <= (pData.financ_cuotas_total || 0)) {
                    setFormData(prev => ({
                        ...prev,
                        es_cuota: true,
                        cuota_nro: nextQuota,
                        cuotas_total: pData.financ_cuotas_total || 0
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



    function calculateUsdEquivalent(): number {
        if (formData.moneda === 'USD' || formData.moneda === 'USDT') {
            return formData.monto;
        }
        if (formData.moneda === 'ARS' && bnaRate > 0) {
            return Math.round((formData.monto / bnaRate) * 100) / 100;
        }
        return 0;
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

            const { data: insertedMovement, error } = await supabase
                .from('caja_recepcion_movimientos')
                .insert({
                    paciente_id: formData.paciente_id,
                    concepto_id: formData.concepto_id || null,
                    concepto_nombre: conceptoFinal,
                    categoria: categoriaFinal,
                    precio_lista_usd: formData.precio_lista_usd,
                    monto: formData.monto,
                    moneda: formData.moneda,
                    metodo_pago: formData.metodo_pago,
                    canal_destino: formData.canal_destino,
                    tipo_comprobante: formData.tipo_comprobante,
                    estado: formData.estado,
                    observaciones: formData.observaciones,
                    tc_bna_venta: formData.moneda === 'ARS' ? bnaRate : null,
                    tc_fuente: formData.moneda === 'ARS' ? 'BNA_AUTO' : 'N/A',
                    tc_fecha_hora: formData.moneda === 'ARS' ? new Date().toISOString() : null,
                    usd_equivalente: usdEquivalente,
                    usuario: 'Recepción', // TODO: Get from auth
                    // Dual date fields
                    fecha_movimiento: cargaHistorica ? fechaMovimiento : getLocalISODate(),
                    origen: cargaHistorica ? 'carga_historica' : 'manual',
                    cuota_nro: formData.es_cuota ? formData.cuota_nro : null,
                    cuotas_total: formData.es_cuota ? formData.cuotas_total : null,
                    comprobante_url: formData.comprobante_url || null,
                })
                .select('id')
                .single();

            if (error) throw error;

            if (formData.es_sena && formData.sena_tipo) {
                try {
                    const workflowResult = await triggerWorkflowFromSenaPayment({
                        patientId: formData.paciente_id,
                        senaTipo: formData.sena_tipo,
                        movementId: insertedMovement?.id || null,
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
            handleClose();
        } catch (error) {
            console.error('Error saving movement:', error);
            alert('Error al guardar el ingreso');
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setStep(1);
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
        });
        setConceptoSearch('');
        onClose();
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                                        <Input
                                            type="number"
                                            value={formData.monto || ''}
                                            onChange={(e) => setFormData({ ...formData, monto: parseFloat(e.target.value) || 0 })}
                                            className="w-full pl-10 pr-4 py-4 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 focus-visible:ring-blue-500 text-2xl font-bold h-auto"
                                            placeholder="0.00"
                                            autoFocus
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
                                        <p className="font-bold text-gray-900 dark:text-white">{formatCurrency(formData.monto, formData.moneda)}</p>
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
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Método de Pago
                                </label>
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
                            </div>

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
                                    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                                )}
                            </div>

                            {/* Ticket Upload for non-cash payments */}
                            {formData.metodo_pago !== 'Efectivo' && (
                                <div className="p-4 border border-blue-100 dark:border-blue-900/30 rounded-xl bg-blue-50/30 dark:bg-blue-900/10">
                                    <div className="flex items-center gap-2 mb-3">
                                        <FileText size={16} className="text-blue-600" />
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Comprobante de operación
                                        </label>
                                    </div>

                                    <ComprobanteUpload
                                        area="caja-recepcion"
                                        onUploadComplete={(res) => setFormData(prev => ({ ...prev, comprobante_url: res.url }))}
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
                                        {formatCurrency(formData.monto, formData.moneda)}
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
                                    <span>{formData.metodo_pago}</span>
                                </div>

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
                </div>
            </div>
        </div >
    );
}
