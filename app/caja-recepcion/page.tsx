'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Loader2, TrendingUp, CreditCard, Clock, Plus, ArrowRightLeft, DollarSign, Calendar, ExternalLink, RefreshCw, X, Copy, CheckCircle, FileText, Lock, AlertTriangle, Info, Pencil, MessageCircle, QrCode, Bitcoin, Landmark, Building2, PersonStanding, Smartphone, History, Eye, EyeOff, Share2, Search, Filter, ChevronDown, FileImage } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import clsx from 'clsx';
import { formatCurrency } from '@/lib/bna';
import { supabase } from '@/lib/supabase';
import NuevoIngresoForm from '@/components/caja/NuevoIngresoForm';
import ArqueoPanel from '@/components/caja/ArqueoPanel';
import TransferenciaAdmin from '@/components/caja/TransferenciaAdmin';
import HistorialEdicionesModal from '@/components/caja/HistorialEdicionesModal';
import NuevoGastoForm from '@/components/caja/NuevoGastoForm';
import { ReciboGenerator, generateReciboNumber } from '@/components/caja/ReciboGenerator';
import { logMovimientoEdit } from '@/lib/caja-recepcion';


// Types
interface Stats {
    totalDiaUsd: number;
    totalMesUsd: number;
    porMetodo: Record<string, number>;
    porCategoria: Record<string, number>;
    movimientosHoy: number;
    pendientes: number;
}

interface Movimiento {
    id: string;
    fecha_hora: string;
    fecha_movimiento?: string;
    paciente?: {
        nombre: string;
        apellido: string;
        id_paciente: string;
        financ_estado?: string;
        financ_monto_total?: number;
        financ_cuotas_total?: number;
    };
    concepto_nombre: string;
    categoria: string | null;
    monto: number;
    moneda: string;
    metodo_pago: string;
    estado: string;
    usd_equivalente: number | null;
    registro_editado?: boolean;
    origen?: string;
}

interface BnaRate {
    venta: number;
    fecha: string;
    fuente: string;
    warning?: boolean;
    error?: boolean;
}

// Payment data for copy functionality
// Payment data types and constant
type PaymentCategory = 'banco' | 'mp' | 'cripto';

interface PaymentMethod {
    category: PaymentCategory;
    group: string;
    label: string;
    details: Record<string, string>;
    qrValue?: string; // Specific value for QR generation
}

const PAYMENT_DATA: Record<string, PaymentMethod> = {
    santander_empresa_ars: {
        category: 'banco',
        group: 'Empresa (Fullesthetic)',
        label: 'SANTANDER EMPRESA PESOS (Factura A)',
        details: {
            'Cuenta': 'CC 760-014436/2',
            'CBU': '0720760220000001443622',
            'Alias': 'amesteticadental',
            'Razón Social': 'FULLESTHETIC SA',
            'CUIT': '30717748421'
        },
        qrValue: '0720760220000001443622' // CBU
    },
    santander_empresa_usd: {
        category: 'banco',
        group: 'Empresa (Fullesthetic)',
        label: 'SANTANDER EMPRESA DÓLARES (Factura A)',
        details: {
            'Cuenta': 'CC 760-014785/9',
            'CBU': '07207602210000001478591',
            'Alias': 'AMesteticaDentalUSD',
            'Razón Social': 'FULLESTHETIC SA',
            'CUIT': '30717748421'
        },
        qrValue: '07207602210000001478591' // CBU
    },
    santander_personal: {
        category: 'banco',
        group: 'Personal',
        label: 'SANTANDER PERSONAL (DÓLARES Y PESOS)',
        details: {
            'Titular': 'ARIEL ALEXIS MERINO BAHAMONDEZ',
            'CUIT': '20-33447153-6',
            'Cuenta': '760-011706/1',
            'CBU': '0720760288000001170618',
            'Alias': 'dr.arielmerino'
        },
        qrValue: '0720760288000001170618' // CBU
    },
    mp_ars: {
        category: 'mp',
        group: 'Mercado Pago',
        label: 'MERCADO PAGO PESOS',
        details: {
            'Alias': 'amdentalpesos',
            'CVU': '0000003100006597395484'
        },
        qrValue: '0000003100006597395484' // CVU
    },
    mp_usd: {
        category: 'mp',
        group: 'Mercado Pago',
        label: 'MERCADO PAGO DÓLARES',
        details: {
            'Alias': 'mozo.aceptas.catre',
            'CBU': '3220001888065006450017',
            'Nota': 'Al transferir figura Banco Industrial (BIND)'
        },
        qrValue: '3220001888065006450017' // CBU/CVU
    },
    cripto_usdt: {
        category: 'cripto',
        group: 'Cripto',
        label: 'CRIPTO – USDT TRC20',
        details: {
            'Dirección': 'TLYiSCFSHtqPySok77PofZ5YwiBwHJTCjU',
            'Red': 'TRC20'
        },
        qrValue: 'TLYiSCFSHtqPySok77PofZ5YwiBwHJTCjU' // Dirección
    },
};

export default function CajaRecepcionPage() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [bnaRate, setBnaRate] = useState<BnaRate | null>(null);
    const [loading, setLoading] = useState(true);
    const [mesActual, setMesActual] = useState(() => new Date().toISOString().substring(0, 7));
    const [showNuevoGasto, setShowNuevoGasto] = useState(false);
    const [privacyMode, setPrivacyMode] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMetodo, setFilterMetodo] = useState('');

    const [showNuevoIngreso, setShowNuevoIngreso] = useState(false);
    const [showTransferencia, setShowTransferencia] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [historialMovId, setHistorialMovId] = useState<string | null>(null);

    const [isBoxClosed, setIsBoxClosed] = useState(false);

    // Edit date modal state
    const [editingMov, setEditingMov] = useState<Movimiento | null>(null);
    const [newFecha, setNewFecha] = useState('');
    const [savingDate, setSavingDate] = useState(false);
    const [editMonto, setEditMonto] = useState<number>(0);
    const [displayMonto, setDisplayMonto] = useState<string>('');
    const [editMoneda, setEditMoneda] = useState<string>('ARS');
    const [editMotivo, setEditMotivo] = useState('');

    // QR Modal state
    const [qrModal, setQrModal] = useState<{ open: boolean; value: string; title: string }>({
        open: false,
        value: '',
        title: ''
    });

    // Recibo Modal state
    const [reciboMov, setReciboMov] = useState<Movimiento | null>(null);

    function getWhatsappLink(text: string) {
        return `https://wa.me/?text=${encodeURIComponent(text)}`;

    }


    const loadData = useCallback(async () => {
        try {
            // Check closure status for today
            const today = new Date().toISOString().split('T')[0];
            const { data: cierre } = await supabase
                .from('caja_recepcion_arqueos')
                .select('id')
                .eq('fecha', today)
                .eq('estado', 'cerrado')
                .maybeSingle();

            setIsBoxClosed(!!cierre);

            // Fetch BNA rate
            const rateRes = await fetch('/api/bna-cotizacion');
            const rateData = await rateRes.json();
            setBnaRate(rateData);

            // Range calculation for the month
            const nextMonth = new Date(mesActual + '-01');
            nextMonth.setMonth(nextMonth.getMonth() + 1);
            const nextMonthStr = nextMonth.toISOString().substring(0, 7);

            // Fetch movements for selected month from Supabase
            const { data: movMesRaw, error: movError } = await supabase
                .from('caja_recepcion_movimientos')
                .select(`
                    *,
                    paciente:pacientes(
                        id_paciente, 
                        nombre, 
                        apellido,
                        financ_estado,
                        financ_monto_total,
                        financ_cuotas_total
                    )
                `)
                .gte('fecha_hora', `${mesActual}-01T00:00:00`)
                .lt('fecha_hora', `${nextMonthStr}-01T00:00:00`)
                .order('fecha_hora', { ascending: false });

            // Cast to Movimiento[] to avoid any
            const movs = movMesRaw as unknown as Movimiento[] | null;

            if (movError) {
                console.error('Error fetching movements:', movError);
            } else {
                setMovimientos(movs || []);
            }

            // Calculate stats
            const pagados = (movs || []).filter((m) => m.estado !== 'anulado');
            const pagadosHoy = pagados.filter(m => m.fecha_hora.startsWith(today));
            const totalDiaUsd = pagadosHoy.reduce((sum, m) => sum + (m.usd_equivalente || 0), 0);
            const totalMesUsd = pagados.reduce((sum, m) => sum + (m.usd_equivalente || 0), 0);
            const pendientes = (movs || []).filter((m) => m.estado === 'pendiente');

            setStats({
                totalDiaUsd: Math.round(totalDiaUsd * 100) / 100,
                totalMesUsd: Math.round(totalMesUsd * 100) / 100,
                porMetodo: {},
                porCategoria: {},
                movimientosHoy: pagadosHoy.length,
                pendientes: pendientes.length,
            });
        } catch (error) {
            console.error('Error loading data:', error);
        }
    }, []);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [loadData]);

    function copyToClipboard(key: string, text: string) {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    }

    function formatPaymentData(key: keyof typeof PAYMENT_DATA): string {
        const data = PAYMENT_DATA[key];
        const lines = [data.label];
        Object.entries(data.details).forEach(([label, value]) => {
            lines.push(`${label}: ${value}`);
        });
        return lines.join('\n');
    }

    function openEditMovimiento(mov: Movimiento) {
        const currentDate = mov.fecha_movimiento || mov.fecha_hora.split('T')[0];
        setNewFecha(currentDate);

        const initialMonto = mov.monto || 0;
        setEditMonto(initialMonto);

        // Format initial display value (e.g. 123456 -> 123.456 or 1234.56 -> 1.234,56)
        // We use 'es-AR' forcing standard decimal grouping
        const formatted = new Intl.NumberFormat('es-AR', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
            useGrouping: true
        }).format(initialMonto);

        setDisplayMonto(formatted);

        setEditMoneda(mov.moneda || 'ARS');
        setEditingMov(mov);
    }

    async function handleUpdateMovimiento() {
        if (!editingMov || !newFecha || !editMotivo) {
            alert('Por favor complete la fecha y el motivo del cambio');
            return;
        }

        setSavingDate(true);
        try {
            // Log changes before updating
            if (newFecha !== editingMov.fecha_movimiento) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'fecha_movimiento',
                    editingMov.fecha_movimiento || null,
                    newFecha,
                    editMotivo
                );
            }
            if (editMonto !== editingMov.monto) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'monto',
                    editingMov.monto.toString(),
                    editMonto.toString(),
                    editMotivo
                );
            }
            if (editMoneda !== editingMov.moneda) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_recepcion_movimientos',
                    'moneda',
                    editingMov.moneda,
                    editMoneda,
                    editMotivo
                );
            }

            const updates: any = {
                fecha_movimiento: newFecha,
                monto: editMonto,
                moneda: editMoneda,
                registro_editado: true // Mark as edited
            };

            // Recalculate USD equivalent if amount/currency changed or if it was null
            if (editMoneda === 'USD') {
                updates.usd_equivalente = editMonto;
            } else if (editMoneda === 'ARS' && bnaRate?.venta) {
                updates.usd_equivalente = editMonto / bnaRate.venta;
            }

            const { error } = await supabase
                .from('caja_recepcion_movimientos')
                .update(updates)
                .eq('id', editingMov.id);

            if (error) throw error;

            // Reload data
            await loadData();
            setEditingMov(null);
            setEditMotivo('');
        } catch (err) {
            console.error('Error updating movement:', err);
            alert('Error al guardar los cambios');
        } finally {
            setSavingDate(false);
        }
    }

    // --- Helper for Privacy Mode ---
    const formatPrivacy = (content: React.ReactNode) => {
        if (!privacyMode) return content;
        return <span className="blur-sm select-none">••••</span>;
    };

    // --- Helper for Daily Summary ---
    const getDailySummary = () => {
        const ingresosArs = movimientos.filter(m => m.moneda === 'ARS' && m.estado !== 'anulado' && m.categoria !== 'Egreso').reduce((a, b) => a + b.monto, 0);
        const ingresosUsd = movimientos.filter(m => (m.moneda === 'USD' || m.moneda === 'USDT') && m.estado !== 'anulado' && m.categoria !== 'Egreso').reduce((a, b) => a + b.monto, 0);
        const gastosArs = movimientos.filter(m => m.categoria === 'Egreso' && m.estado !== 'anulado').reduce((a, b) => a + Math.abs(b.monto), 0);
        const movCount = movimientos.filter(m => m.estado !== 'anulado').length;
        const pendingCount = movimientos.filter(m => m.estado === 'pendiente').length;

        const summaryText = `📅 *Reporte Cierre - ${new Date().toLocaleDateString('es-AR')}*

✅ *Ingresos:*
• ARS: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(ingresosArs)}
• USD: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ingresosUsd)}

📉 *Gastos/Salidas:*
• ARS: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(gastosArs)}

👥 *Movimientos:* ${movCount}
⚠️ *Pendientes:* ${pendingCount}

_Caja Recepción - AM Clínica_`;

        return summaryText;
    };

    // --- Helper for Receipt ---
    const getReceiptMessage = (mov: Movimiento) => {
        const patientName = mov.paciente ? `${mov.paciente.nombre} ${mov.paciente.apellido}` : 'Paciente General';
        const formattedAmount = new Intl.NumberFormat(mov.moneda === 'ARS' ? 'es-AR' : 'en-US', { style: 'currency', currency: mov.moneda }).format(mov.monto);

        return `🧾 *Comprobante de Pago*
📅 *Fecha:* ${new Date(mov.fecha_hora).toLocaleDateString('es-AR')}
👤 *Paciente:* ${patientName}
💰 *Monto:* ${formattedAmount}
📝 *Concepto:* ${mov.concepto_nombre}

✅ *Estado:* ${mov.estado.toUpperCase()}

Gracias por su visita!
_AM Clínica_`;
    };

    // --- Helper for Collection Reminder ---
    const getCollectionMessage = (mov: Movimiento) => {
        const formattedAmount = new Intl.NumberFormat(mov.moneda === 'ARS' ? 'es-AR' : 'en-US', { style: 'currency', currency: mov.moneda }).format(mov.monto);
        const patientName = mov.paciente ? `${mov.paciente.nombre} ${mov.paciente.apellido}` : 'Paciente';

        return `👋 *Hola ${patientName}! Recordatorio de Saldo*

Te escribimos amablemente de *AM Estética Dental* para recordarte que quedó un saldo pendiente de tu última visita:

🗓 *Fecha:* ${new Date(mov.fecha_hora).toLocaleDateString('es-AR')}
🦷 *Concepto:* ${mov.concepto_nombre}
💰 *Saldo Pendiente:* ${formattedAmount}

Podés abonarlo por transferencia o en tu próxima visita. ¡Gracias! ✨`;
    };

    const filteredMovimientos = movimientos.filter(mov => {
        const matchesSearch = searchTerm === '' ||
            `${mov.paciente?.nombre} ${mov.paciente?.apellido}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
            mov.concepto_nombre.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesMetodo = filterMetodo === '' || mov.metodo_pago === filterMetodo;

        return matchesSearch && matchesMetodo;
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Caja Recepción
                    </h1>
                    <p className="text-gray-500 mt-1">
                        Gestión de ingresos y cobros de pacientes
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Daily Summary Button */}
                    <button
                        onClick={() => {
                            const summary = getDailySummary();
                            window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
                        }}
                        className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors border border-transparent hover:border-green-200"
                        title="Enviar Cierre del Día por WhatsApp"
                    >
                        <Share2 size={20} />
                    </button>

                    {/* Privacy Toggle */}
                    <button
                        onClick={() => setPrivacyMode(!privacyMode)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                        title={privacyMode ? "Mostrar montos" : "Ocultar montos (Modo Discreto)"}
                    >
                        {privacyMode ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>

                    <Link
                        href="/caja-recepcion/tarifario"
                        className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-300 font-medium transition-colors"
                    >
                        <FileText size={18} />
                        Tarifario
                    </Link>
                    <button
                        onClick={() => setShowTransferencia(true)}
                        disabled={isBoxClosed}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2.5 border border-orange-200 dark:border-orange-800 rounded-lg font-medium transition-colors",
                            isBoxClosed
                                ? "opacity-50 cursor-not-allowed text-gray-400 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                : "hover:bg-orange-50 dark:hover:bg-orange-900/20 text-orange-600 dark:text-orange-400"
                        )}
                    >
                        <ArrowRightLeft size={18} />
                        Transferir
                    </button>
                    <button
                        onClick={() => setShowNuevoGasto(true)}
                        disabled={isBoxClosed}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2.5 border border-red-200 dark:border-red-800 rounded-lg font-medium transition-colors",
                            isBoxClosed
                                ? "opacity-50 cursor-not-allowed text-gray-400 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800"
                                : "hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                        )}
                    >
                        <TrendingUp className="rotate-180" size={18} />
                        Gasto
                    </button>
                    <button
                        onClick={() => setShowNuevoIngreso(true)}
                        disabled={isBoxClosed}
                        className={clsx(
                            "flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors",
                            isBoxClosed
                                ? "bg-gray-300 cursor-not-allowed text-gray-500"
                                : "bg-blue-600 hover:bg-blue-700 text-white"
                        )}
                    >
                        <Plus size={20} />
                        Nuevo Ingreso
                    </button>
                </div>
            </div>

            {/* Arqueo Panel */}
            <div className="mb-6">
                <ArqueoPanel bnaRate={bnaRate?.venta || 0} onArqueoChange={loadData} />
            </div>

            {/* BNA Rate Banner */}
            {bnaRate && (
                <div className={clsx(
                    "mb-6 p-4 rounded-xl flex items-center justify-between",
                    bnaRate.error || bnaRate.warning
                        ? "bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800"
                        : "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
                )}>
                    <div className="flex items-center gap-3">
                        <DollarSign size={20} className={bnaRate.error ? "text-yellow-600" : "text-green-600"} />
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                Dólar Banco Nación (Venta): ${bnaRate.venta?.toLocaleString('es-AR') || 'N/A'}
                            </p>
                            <p className="text-xs text-gray-500">
                                Fuente: {bnaRate.fuente} • Actualizado: {new Date(bnaRate.fecha).toLocaleTimeString('es-AR')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href="https://www.bna.com.ar/Personas"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                            Ver BNA <ExternalLink size={14} />
                        </a>
                        <button
                            onClick={loadData}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg"
                        >
                            <RefreshCw size={16} className="text-gray-500" />
                        </button>
                    </div>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                            <DollarSign size={20} className="text-green-600 dark:text-green-400" />
                        </div>
                        <span className="text-sm text-gray-500">Ingresos Hoy</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrivacy(formatCurrency(stats?.totalDiaUsd || 0, 'USD'))}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                            <TrendingUp size={20} className="text-blue-600 dark:text-blue-400" />
                        </div>
                        <span className="text-sm text-gray-500">Ingresos Mes</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrivacy(formatCurrency(stats?.totalMesUsd || 0, 'USD'))}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                            <CreditCard size={20} className="text-purple-600 dark:text-purple-400" />
                        </div>
                        <span className="text-sm text-gray-500">Movimientos Hoy</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrivacy(stats?.movimientosHoy || 0)}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="h-10 w-10 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                            <Clock size={20} className="text-yellow-600 dark:text-yellow-400" />
                        </div>
                        <span className="text-sm text-gray-500">Pendientes</span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {formatPrivacy(stats?.pendientes || 0)}
                    </p>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Movements Table */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-gray-50/50 dark:bg-gray-900/50">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-4 flex-1">
                            <h3 className="font-semibold text-gray-900 dark:text-white whitespace-nowrap">
                                Movimientos
                            </h3>

                            {/* Notion-style Search Bar */}
                            <div className="relative flex-1 max-w-sm">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <input
                                    type="text"
                                    placeholder="Buscar paciente o concepto..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                />
                            </div>

                            {/* Method Filter */}
                            <div className="relative">
                                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                <select
                                    value={filterMetodo}
                                    onChange={(e) => setFilterMetodo(e.target.value)}
                                    className="pl-10 pr-8 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
                                >
                                    <option value="">Todos los métodos</option>
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Transferencia">Transferencia</option>
                                    <option value="MercadoPago">Mercado Pago</option>
                                    <option value="Cripto">Cripto</option>
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                            </div>
                        </div>

                        {/* Month Selector */}
                        <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-xl px-4 py-2 border border-gray-200 dark:border-gray-700 shadow-sm">
                            <Calendar size={18} className="text-blue-500" />
                            <input
                                type="month"
                                value={mesActual}
                                onChange={(e) => setMesActual(e.target.value)}
                                className="bg-transparent border-none outline-none text-sm font-medium focus:ring-0 cursor-pointer"
                            />
                        </div>
                    </div>

                    {movimientos.length === 0 ? (
                        <div className="p-10 text-center text-gray-500">
                            <CreditCard className="mx-auto mb-3 text-gray-300" size={40} />
                            <p>No hay movimientos registrados hoy.</p>
                            <button
                                onClick={() => setShowNuevoIngreso(true)}
                                className="mt-4 text-blue-600 hover:underline text-sm"
                            >
                                Registrar primer ingreso
                            </button>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Fecha/Hora</th>
                                        <th className="px-4 py-3 text-left">Paciente</th>
                                        <th className="px-4 py-3 text-left">Concepto</th>
                                        <th className="px-4 py-3 text-left">Método</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                        <th className="px-4 py-3 text-center">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredMovimientos.map((mov: Movimiento) => (
                                        <tr key={mov.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                            <td className="px-4 py-3 text-gray-500">
                                                <div className="flex flex-col">
                                                    <span>{new Date(mov.fecha_hora).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                                                    <span className="text-[10px] opacity-60">
                                                        {new Date(mov.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                {mov.categoria === 'Egreso' ? (
                                                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                                                        <span className="p-1 bg-red-100 dark:bg-red-900/30 rounded-full">
                                                            <TrendingUp className="rotate-180" size={14} />
                                                        </span>
                                                        <span>Gasto / Salida</span>
                                                    </div>
                                                ) : (
                                                    mov.paciente ? (
                                                        <Link
                                                            href={`/patients/${mov.paciente.id_paciente}?tab=financiamiento`}
                                                            className="group flex flex-col items-start"
                                                        >
                                                            <span className="group-hover:text-blue-600 group-hover:underline transition-colors">
                                                                {`${mov.paciente.apellido}, ${mov.paciente.nombre}`}
                                                            </span>
                                                            {mov.paciente.financ_estado === 'activo' && (
                                                                <span className="mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                                                                    Financiación Activa
                                                                </span>
                                                            )}
                                                        </Link>
                                                    ) : '-'
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                                                <div className="flex flex-col">
                                                    <span>{mov.concepto_nombre}</span>
                                                    {(mov as any).cuota_nro && (mov as any).cuota_nro > 0 && (
                                                        <span className="text-[10px] text-gray-400">
                                                            Cuota {(mov as any).cuota_nro} de {(mov as any).cuotas_total || '?'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-gray-500">{mov.metodo_pago}</td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                <span className={clsx(
                                                    mov.categoria === 'Egreso' ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white"
                                                )}>
                                                    {formatPrivacy(formatCurrency(mov.usd_equivalente || mov.monto, 'USD'))}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <span className={clsx(
                                                    "px-2 py-1 rounded-full text-xs font-medium",
                                                    mov.estado === 'pagado' && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                                    mov.estado === 'pendiente' && "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
                                                    mov.estado === 'anulado' && "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                                )}>
                                                    {mov.estado}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    {mov.registro_editado && (
                                                        <span title="Este registro ha sido editado">
                                                            <AlertTriangle size={16} className="text-amber-500" />
                                                        </span>
                                                    )}
                                                    {mov.origen === 'importado_csv' && (
                                                        <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                                                            CSV
                                                        </span>
                                                    )}

                                                    {mov.categoria !== 'Egreso' && (
                                                        <>
                                                            <button
                                                                onClick={() => {
                                                                    const isCollection = mov.estado === 'pendiente';
                                                                    const msg = isCollection ? getCollectionMessage(mov) : getReceiptMessage(mov);
                                                                    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
                                                                }}
                                                                className={clsx(
                                                                    "p-1.5 rounded-lg transition-colors",
                                                                    mov.estado === 'pendiente'
                                                                        ? "hover:bg-amber-50 dark:hover:bg-amber-900/20 text-amber-500 hover:text-amber-600"
                                                                        : "hover:bg-green-50 dark:hover:bg-green-900/20 text-green-500 hover:text-green-600"
                                                                )}
                                                                title={mov.estado === 'pendiente' ? "Enviar Recordatorio de Cobro" : "Enviar Comprobante (texto)"}
                                                            >
                                                                <MessageCircle size={16} />
                                                            </button>
                                                            {mov.estado === 'pagado' && (
                                                                <button
                                                                    onClick={() => setReciboMov(mov)}
                                                                    className="p-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg text-purple-500 hover:text-purple-600 transition-colors"
                                                                    title="Generar Recibo Visual (imagen)"
                                                                >
                                                                    <FileImage size={16} />
                                                                </button>
                                                            )}
                                                        </>
                                                    )}
                                                    <button
                                                        onClick={() => openEditMovimiento(mov)}
                                                        className="p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                                                        title="Editar movimiento (Monto, Fecha, Moneda)"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <button
                                                        onClick={() => setHistorialMovId(mov.id)}
                                                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                                        title="Ver historial de ediciones"
                                                    >
                                                        <History size={16} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Payment Data Panel */}
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Datos para Cobro</h3>
                        <p className="text-xs text-gray-500 mt-1">Click para copiar</p>
                    </div>

                    <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
                        <div className="space-y-6">
                            {/* Bancos */}
                            <div>
                                <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                                    <div className="p-1.5 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                        <Landmark size={18} className="text-red-600 dark:text-red-400" />
                                    </div>
                                    Transferencias Bancarias
                                </h4>
                                <div className="space-y-4 pl-2 border-l-2 border-gray-100 dark:border-gray-700 ml-3">
                                    {/* Empresa */}
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 pl-3">Empresa (Fullesthetic)</p>
                                        <div className="space-y-2">
                                            {['santander_empresa_ars', 'santander_empresa_usd'].map((key) => {
                                                const data = PAYMENT_DATA[key];
                                                if (!data) return null;
                                                return (
                                                    <div
                                                        key={key}
                                                        className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ml-3"
                                                    >
                                                        <div
                                                            className="flex-1 cursor-pointer"
                                                            onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                        >
                                                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label.replace('SANTANDER EMPRESA ', '').replace(' (Factura A)', '')}</p>
                                                            <p className="text-xs text-gray-500 mt-0.5">{data.details['Cuenta'] || data.details['Alias']}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {data.qrValue && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                    title="Ver QR"
                                                                >
                                                                    <QrCode size={18} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                                }}
                                                                className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                                title="Enviar por WhatsApp"
                                                            >
                                                                <MessageCircle size={18} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    copyToClipboard(key, formatPaymentData(key));
                                                                }}
                                                                className={clsx(
                                                                    "p-2 rounded-lg transition-colors",
                                                                    copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                )}
                                                                title="Copiar datos"
                                                            >
                                                                {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Personal */}
                                    <div>
                                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 pl-3">Personal</p>
                                        <div className="space-y-2">
                                            {['santander_personal'].map((key) => {
                                                const data = PAYMENT_DATA[key];
                                                if (!data) return null;
                                                return (
                                                    <div
                                                        key={key}
                                                        className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all ml-3"
                                                    >
                                                        <div
                                                            className="flex-1 cursor-pointer"
                                                            onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                        >
                                                            <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label.replace('SANTANDER PERSONAL ', '')}</p>
                                                            <p className="text-xs text-gray-500 mt-0.5">{data.details['Alias']}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            {data.qrValue && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                                    }}
                                                                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                                    title="Ver QR"
                                                                >
                                                                    <QrCode size={18} />
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                                }}
                                                                className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                                title="Enviar por WhatsApp"
                                                            >
                                                                <MessageCircle size={18} />
                                                            </button>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    copyToClipboard(key, formatPaymentData(key));
                                                                }}
                                                                className={clsx(
                                                                    "p-2 rounded-lg transition-colors",
                                                                    copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                                )}
                                                                title="Copiar datos"
                                                            >
                                                                {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Mercado Pago */}
                            <div>
                                <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                                    <div className="p-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                        <Smartphone size={18} className="text-blue-600 dark:text-blue-400" />
                                    </div>
                                    Mercado Pago
                                </h4>
                                <div className="space-y-2 pl-5">
                                    {['mp_ars', 'mp_usd'].map((key) => {
                                        const data = PAYMENT_DATA[key];
                                        if (!data) return null;
                                        return (
                                            <div
                                                key={key}
                                                className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                            >
                                                <div
                                                    className="flex-1 cursor-pointer"
                                                    onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                >
                                                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label.replace('MERCADO PAGO ', '')}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5">{data.details['Alias']}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {data.qrValue && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                            }}
                                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                            title="Ver QR"
                                                        >
                                                            <QrCode size={18} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                        }}
                                                        className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                        title="Enviar por WhatsApp"
                                                    >
                                                        <MessageCircle size={18} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyToClipboard(key, formatPaymentData(key));
                                                        }}
                                                        className={clsx(
                                                            "p-2 rounded-lg transition-colors",
                                                            copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                        )}
                                                        title="Copiar datos"
                                                    >
                                                        {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Cripto */}
                            <div>
                                <h4 className="flex items-center gap-2 font-medium text-gray-900 dark:text-white mb-3">
                                    <div className="p-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
                                        <Bitcoin size={18} className="text-green-600 dark:text-green-400" />
                                    </div>
                                    Cripto
                                </h4>
                                <div className="space-y-2 pl-5">
                                    {['cripto_usdt'].map((key) => {
                                        const data = PAYMENT_DATA[key];
                                        if (!data) return null;
                                        return (
                                            <div
                                                key={key}
                                                className="group flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                                            >
                                                <div
                                                    className="flex-1 cursor-pointer"
                                                    onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                                >
                                                    <p className="font-medium text-sm text-gray-900 dark:text-gray-100">{data.label}</p>
                                                    <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[200px]">{data.details['Dirección']}</p>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    {data.qrValue && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setQrModal({ open: true, value: data.qrValue!, title: data.label });
                                                            }}
                                                            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                                            title="Ver QR"
                                                        >
                                                            <QrCode size={18} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            window.open(getWhatsappLink(formatPaymentData(key)), '_blank');
                                                        }}
                                                        className="p-2 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                                                        title="Enviar por WhatsApp"
                                                    >
                                                        <MessageCircle size={18} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyToClipboard(key, formatPaymentData(key));
                                                        }}
                                                        className={clsx(
                                                            "p-2 rounded-lg transition-colors",
                                                            copiedKey === key ? "text-green-500 bg-green-50 dark:bg-green-900/20" : "text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                                        )}
                                                        title="Copiar datos"
                                                    >
                                                        {copiedKey === key ? <CheckCircle size={18} /> : <Copy size={18} />}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 mb-2">Mensaje base:</p>
                        <div
                            className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-xs text-gray-600 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                            onClick={() => copyToClipboard('msg', 'Te paso los datos para realizar la transferencia. Por favor enviá el comprobante luego del pago.')}
                        >
                            &quot;Te paso los datos para realizar la transferencia. Por favor enviá el comprobante luego del pago.&quot;
                            {copiedKey === 'msg' && <CheckCircle size={14} className="inline ml-2 text-green-500" />}
                        </div>
                    </div>
                </div>
            </div>

            {/* Nuevo Ingreso Modal */}
            {/* Expense Modal */}
            <NuevoGastoForm
                isOpen={showNuevoGasto}
                onClose={() => setShowNuevoGasto(false)}
                onSuccess={loadData}
                bnaRate={bnaRate?.venta || 0}
            />

            {/* Existing Income Modal */}
            <NuevoIngresoForm
                isOpen={showNuevoIngreso}
                onClose={() => setShowNuevoIngreso(false)}
                onSuccess={loadData}
                bnaRate={bnaRate?.venta || 0}
            />

            {/* Transferencia Modal */}
            <TransferenciaAdmin
                isOpen={showTransferencia}
                onClose={() => setShowTransferencia(false)}
                onSuccess={loadData}
                bnaRate={bnaRate?.venta || 0}
            />

            {/* Historial Ediciones Modal */}
            <HistorialEdicionesModal
                isOpen={!!historialMovId}
                onClose={() => setHistorialMovId(null)}
                registroId={historialMovId || ''}
                tabla="caja_recepcion_movimientos"
            />

            {/* Recibo Visual Modal */}
            {reciboMov && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <FileImage size={20} className="text-purple-500" />
                                    Recibo de Pago
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    Genera una imagen del recibo para compartir
                                </p>
                            </div>
                            <button
                                onClick={() => setReciboMov(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6">
                            <ReciboGenerator
                                data={{
                                    numero: generateReciboNumber(),
                                    fecha: new Date(reciboMov.fecha_hora),
                                    paciente: reciboMov.paciente
                                        ? `${reciboMov.paciente.nombre} ${reciboMov.paciente.apellido}`
                                        : 'Paciente General',
                                    concepto: reciboMov.concepto_nombre,
                                    monto: reciboMov.usd_equivalente || reciboMov.monto,
                                    metodoPago: reciboMov.metodo_pago,
                                    atendidoPor: 'AM Clínica',
                                }}
                                onGenerated={(result) => {
                                    console.log('Recibo generado:', result.imageUrl);
                                }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Date Modal */}

            {editingMov && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full">
                        <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Editar movimiento de ingreso
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    {editingMov.paciente
                                        ? `${editingMov.paciente.apellido}, ${editingMov.paciente.nombre}`
                                        : editingMov.concepto_nombre}
                                </p>
                            </div>
                            <button
                                onClick={() => setEditingMov(null)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            {/* Fecha */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    <Calendar size={14} className="inline mr-2" />
                                    Fecha del movimiento
                                </label>
                                <input
                                    type="date"
                                    value={newFecha}
                                    onChange={(e) => setNewFecha(e.target.value)}
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            {/* Monto y Moneda */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Monto
                                    </label>
                                    <input
                                        type="text"
                                        value={displayMonto}
                                        onChange={(e) => {
                                            // 1. Get raw input (digits and comma only)
                                            let val = e.target.value.replace(/[^0-9,]/g, '');

                                            // 2. Handle multiple commas (keep first)
                                            const parts = val.split(',');
                                            if (parts.length > 2) val = parts[0] + ',' + parts.slice(1).join('');

                                            // 3. Format integer part with dots
                                            const integerPart = parts[0].replace(/\./g, '');
                                            // Prevent leading zeros unless it's just "0"
                                            const cleanInteger = integerPart === '' ? '' : Number(integerPart).toString();

                                            const formattedInteger = cleanInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

                                            // 4. Reconstruct display value
                                            let newDisplay = formattedInteger;
                                            if (val.includes(',')) {
                                                newDisplay += ',' + (parts[1] || '');
                                            }

                                            // 5. Update state
                                            setDisplayMonto(newDisplay);

                                            // 6. Update numeric value for logic
                                            // ARS uses comma as decimal separator, JS uses dot.
                                            const numericVal = parseFloat(val.replace(',', '.') || '0');
                                            setEditMonto(numericVal);
                                        }}
                                        placeholder="0"
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-1 font-mono text-lg"
                                    />
                                    <p className="text-sm font-medium text-green-600 dark:text-green-400">
                                        Equivalente: {
                                            editMoneda === 'ARS' && bnaRate?.venta
                                                ? formatCurrency(editMonto / bnaRate.venta, 'USD')
                                                : formatCurrency(editMonto, 'USD')
                                        }
                                    </p>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Moneda
                                    </label>
                                    <select
                                        value={editMoneda}
                                        onChange={(e) => setEditMoneda(e.target.value)}
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent h-[50px]"
                                    >
                                        <option value="ARS">Pesos (ARS)</option>
                                        <option value="USD">Dólares (USD)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-red-600 dark:text-red-400 mb-2 font-bold">
                                    Motivo del cambio (Obligatorio)
                                </label>
                                <textarea
                                    value={editMotivo}
                                    onChange={(e) => setEditMotivo(e.target.value)}
                                    placeholder="Explique por qué se realiza este cambio..."
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent min-h-[80px]"
                                />
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/10 p-3 rounded-lg flex items-start gap-2 text-sm text-amber-800 dark:text-amber-400 border border-amber-100 dark:border-amber-900/20">
                                <History size={16} className="shrink-0 mt-0.5" />
                                <p>Este cambio será recalculado y quedará registrado <strong>permanentemente</strong> en el historial de auditoría.</p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingMov(null)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleUpdateMovimiento}
                                disabled={savingDate}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                {savingDate ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* QR Modal */}
            {qrModal.open && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setQrModal({ ...qrModal, open: false })}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-sm w-full p-6 text-center transform transition-all" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
                                {qrModal.title}
                            </h3>
                            <button
                                onClick={() => setQrModal({ ...qrModal, open: false })}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors"
                            >
                                <X size={20} className="text-gray-500" />
                            </button>
                        </div>

                        <div className="bg-white p-4 rounded-xl border-2 border-gray-100 dark:border-gray-700 inline-block mb-6 shadow-sm">
                            <QRCodeSVG
                                value={qrModal.value}
                                size={200}
                                level="H"
                                includeMargin={true}
                            />
                        </div>

                        <p className="text-sm text-gray-500 mb-6 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg break-all font-mono border border-gray-100 dark:border-gray-700">
                            {qrModal.value}
                        </p>

                        <button
                            onClick={() => copyToClipboard('qr', qrModal.value)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium"
                        >
                            {copiedKey === 'qr' ? <CheckCircle size={18} /> : <Copy size={18} />}
                            Copiar código de pago
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
