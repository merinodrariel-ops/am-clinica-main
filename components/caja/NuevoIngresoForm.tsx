'use client';

import { useState, useEffect } from 'react';
import { X, Search, User, DollarSign, Check, Loader2, Calendar } from 'lucide-react';
import clsx from 'clsx';
import { supabase, TarifarioItem } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';
import { useAuth } from '@/contexts/AuthContext';

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
    es_cuota: boolean;
    cuota_nro: number;
    cuotas_total: number;
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

    // Tarifario
    // const [tarifarioItems, setTarifarioItems] = useState<TarifarioItem[]>([]);
    const [tarifarioByCategoria, setTarifarioByCategoria] = useState<Record<string, TarifarioItem[]>>({});

    // Historical load
    const { user } = useAuth();
    const canUseHistoricalLoad = user?.role === 'owner' || user?.role === 'admin';
    const [cargaHistorica, setCargaHistorica] = useState(false);
    const [fechaMovimiento, setFechaMovimiento] = useState(new Date().toISOString().split('T')[0]);

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
        es_cuota: false,
        cuota_nro: 1,
        cuotas_total: 1,
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

    function selectPatient(patient: Paciente) {
        setFormData({
            ...formData,
            paciente_id: patient.id_paciente,
            paciente_nombre: `${patient.apellido}, ${patient.nombre}`,
        });
        setSearchQuery('');
        setPatients([]);
        setStep(2);
    }

    function selectConcepto(item: TarifarioItem) {
        setFormData({
            ...formData,
            concepto_id: item.id,
            concepto_nombre: item.concepto_nombre,
            categoria: item.categoria,
            precio_lista_usd: item.precio_base_usd,
            monto: item.precio_base_usd,
        });
        setStep(3);
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

        setSaving(true);
        try {
            const usdEquivalente = calculateUsdEquivalent();

            const { error } = await supabase
                .from('caja_recepcion_movimientos')
                .insert({
                    paciente_id: formData.paciente_id,
                    concepto_id: formData.concepto_id || null,
                    concepto_nombre: formData.concepto_nombre,
                    categoria: formData.categoria,
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
                    fecha_movimiento: cargaHistorica ? fechaMovimiento : new Date().toISOString().split('T')[0],
                    origen: cargaHistorica ? 'carga_historica' : 'manual',
                    cuota_nro: formData.es_cuota ? formData.cuota_nro : null,
                    cuotas_total: formData.es_cuota ? formData.cuotas_total : null,
                });

            if (error) throw error;

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
        setFechaMovimiento(new Date().toISOString().split('T')[0]);
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
            es_cuota: false,
            cuota_nro: 1,
            cuotas_total: 1,
        });
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
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <X size={20} className="text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-180px)]">
                    {/* Step 1: Select Patient */}
                    {step === 1 && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Buscar Paciente *
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Nombre, apellido o documento..."
                                    className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    autoFocus
                                />
                                {searchLoading && (
                                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" size={20} />
                                )}
                            </div>

                            {patients.length > 0 && (
                                <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                    {patients.map((patient) => (
                                        <button
                                            key={patient.id_paciente}
                                            onClick={() => selectPatient(patient)}
                                            className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0 text-left"
                                        >
                                            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                                <User size={20} className="text-blue-600 dark:text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="font-medium text-gray-900 dark:text-white">
                                                    {patient.apellido}, {patient.nombre}
                                                </p>
                                                <p className="text-sm text-gray-500">
                                                    {patient.documento || 'Sin documento'} • {patient.telefono || 'Sin teléfono'}
                                                </p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}

                            {searchQuery.length >= 2 && patients.length === 0 && !searchLoading && (
                                <p className="mt-4 text-center text-gray-500">No se encontraron pacientes</p>
                            )}
                        </div>
                    )}

                    {/* Step 2: Select Concept */}
                    {step === 2 && (
                        <div>
                            <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <p className="text-sm text-gray-600 dark:text-gray-400">Paciente:</p>
                                <p className="font-medium text-gray-900 dark:text-white">{formData.paciente_nombre}</p>
                            </div>

                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                Seleccionar Concepto *
                            </label>

                            <div className="space-y-4">
                                {Object.entries(tarifarioByCategoria).map(([categoria, items]) => (
                                    <div key={categoria}>
                                        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                            {categoria}
                                        </h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {items.map((item) => (
                                                <button
                                                    key={item.id}
                                                    onClick={() => selectConcepto(item)}
                                                    className="p-3 text-left border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                                >
                                                    <div className="flex justify-between items-center">
                                                        <span className="font-medium text-gray-900 dark:text-white">
                                                            {item.concepto_nombre}
                                                        </span>
                                                        <span className="text-sm text-gray-500">
                                                            {item.precio_base_usd > 0 ? formatCurrency(item.precio_base_usd, 'USD') : 'Variable'}
                                                        </span>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <button
                                onClick={() => setStep(1)}
                                className="mt-4 text-sm text-blue-600 hover:underline"
                            >
                                ← Cambiar paciente
                            </button>
                        </div>
                    )}

                    {/* Step 3: Amount and Method */}
                    {step === 3 && (
                        <div className="space-y-6">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {formData.paciente_nombre} • {formData.concepto_nombre}
                                </p>
                            </div>

                            {/* Amount */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Monto *
                                </label>
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                        <input
                                            type="number"
                                            value={formData.monto || ''}
                                            onChange={(e) => setFormData({ ...formData, monto: parseFloat(e.target.value) || 0 })}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <select
                                        value={formData.moneda}
                                        onChange={(e) => setFormData({ ...formData, moneda: e.target.value as FormData['moneda'] })}
                                        className="px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900"
                                    >
                                        <option value="USD">USD</option>
                                        <option value="ARS">ARS</option>
                                        <option value="USDT">USDT</option>
                                    </select>
                                </div>
                                {formData.moneda === 'ARS' && bnaRate > 0 && (
                                    <p className="mt-2 text-sm text-gray-500">
                                        ≈ {formatCurrency(calculateUsdEquivalent(), 'USD')} (TC: ${bnaRate.toLocaleString('es-AR')})
                                    </p>
                                )}
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
                                            <input
                                                type="number"
                                                min="1"
                                                value={formData.cuota_nro}
                                                onChange={(e) => setFormData({ ...formData, cuota_nro: Math.max(1, parseInt(e.target.value) || 0) })}
                                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium text-gray-500 mb-1">De un total de</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={formData.cuotas_total}
                                                onChange={(e) => setFormData({ ...formData, cuotas_total: Math.max(1, parseInt(e.target.value) || 0) })}
                                                className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Payment Method */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Método de Pago
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    {METODOS_PAGO.map((metodo) => (
                                        <button
                                            key={metodo.value}
                                            onClick={() => setFormData({ ...formData, metodo_pago: metodo.value as FormData['metodo_pago'] })}
                                            className={clsx(
                                                "p-3 border rounded-xl text-left transition-colors",
                                                formData.metodo_pago === metodo.value
                                                    ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                                                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300"
                                            )}
                                        >
                                            <span className="mr-2">{metodo.icon}</span>
                                            {metodo.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Estado
                                </label>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setFormData({ ...formData, estado: 'pagado' })}
                                        className={clsx(
                                            "flex-1 p-3 border rounded-xl transition-colors",
                                            formData.estado === 'pagado'
                                                ? "border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700"
                                                : "border-gray-200 dark:border-gray-700"
                                        )}
                                    >
                                        ✓ Pagado
                                    </button>
                                    <button
                                        onClick={() => setFormData({ ...formData, estado: 'pendiente' })}
                                        className={clsx(
                                            "flex-1 p-3 border rounded-xl transition-colors",
                                            formData.estado === 'pendiente'
                                                ? "border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700"
                                                : "border-gray-200 dark:border-gray-700"
                                        )}
                                    >
                                        ⏳ Pendiente
                                    </button>
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
                                        <button
                                            onClick={() => setCargaHistorica(!cargaHistorica)}
                                            className={clsx(
                                                "w-12 h-6 rounded-full transition-colors relative",
                                                cargaHistorica ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
                                            )}
                                        >
                                            <span
                                                className={clsx(
                                                    "absolute w-5 h-5 bg-white rounded-full top-0.5 transition-all shadow",
                                                    cargaHistorica ? "right-0.5" : "left-0.5"
                                                )}
                                            />
                                        </button>
                                    </div>
                                    {cargaHistorica && (
                                        <div>
                                            <label className="block text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                                                <Calendar size={14} className="inline mr-1" />
                                                Fecha del movimiento
                                            </label>
                                            <input
                                                type="date"
                                                value={fechaMovimiento}
                                                onChange={(e) => setFechaMovimiento(e.target.value)}
                                                max={new Date().toISOString().split('T')[0]}
                                                className="w-full px-4 py-2 border border-amber-300 dark:border-amber-700 rounded-xl bg-white dark:bg-gray-800 focus:ring-2 focus:ring-amber-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            <button
                                onClick={() => setStep(4)}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
                            >
                                Continuar
                            </button>

                            <button
                                onClick={() => setStep(2)}
                                className="w-full text-sm text-blue-600 hover:underline"
                            >
                                ← Cambiar concepto
                            </button>
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
                            </div>

                            {/* Observations */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Observaciones (opcional)
                                </label>
                                <textarea
                                    value={formData.observaciones}
                                    onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 resize-none"
                                    rows={3}
                                    placeholder="Notas adicionales..."
                                />
                            </div>

                            <button
                                onClick={handleSubmit}
                                disabled={saving}
                                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
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
                            </button>

                            <button
                                onClick={() => setStep(3)}
                                className="w-full text-sm text-blue-600 hover:underline"
                            >
                                ← Volver
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div >
    );
}
