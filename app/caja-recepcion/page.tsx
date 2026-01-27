'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Plus,
    Clock,
    DollarSign,
    TrendingUp,
    CreditCard,
    RefreshCw,
    Copy,
    ExternalLink,
    CheckCircle,
    ArrowRightLeft,
    FileText,
} from 'lucide-react';
import clsx from 'clsx';
import { formatCurrency } from '@/lib/bna';
import { supabase } from '@/lib/supabase';
import NuevoIngresoForm from '@/components/caja/NuevoIngresoForm';
import ArqueoPanel from '@/components/caja/ArqueoPanel';
import TransferenciaAdmin from '@/components/caja/TransferenciaAdmin';

// Types
interface DashboardStats {
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
    paciente?: { nombre: string; apellido: string; id_paciente: string };
    concepto_nombre: string;
    categoria: string | null;
    monto: number;
    moneda: string;
    metodo_pago: string;
    estado: string;
    usd_equivalente: number | null;
}

interface BNARate {
    venta: number;
    fecha: string;
    fuente: string;
    warning?: boolean;
    error?: boolean;
}

// Payment data for copy functionality
const PAYMENT_DATA = {
    santander_empresa_ars: {
        label: 'Santander Empresa PESOS (Factura A)',
        cuenta: 'CC 760-014436/2',
        cbu: '0720760220000001443622',
        alias: 'amesteticadental',
        razon_social: 'FULLESTHETIC SA',
        cuit: '30717748421',
    },
    santander_empresa_usd: {
        label: 'Santander Empresa DÓLARES (Factura A)',
        cuenta: 'CC 760-014785/9',
        cbu: '0720760221000001478591',
        alias: 'AMesteticaDentalUSD',
        razon_social: 'FULLESTHETIC SA',
        cuit: '30717748421',
    },
    santander_personal: {
        label: 'Santander Personal (Tipo C)',
        titular: 'ARIEL ALEXIS MERINO BAHAMONDEZ',
        cuit: '20-33447153-6',
        cuenta: '760-011706/1',
        cbu: '0720760288000001170618',
        alias: 'dr.arielmerino',
    },
    cripto_usdt: {
        label: 'Cripto – USDT TRC20',
        direccion: 'TLYiSCFSHtqPySok77PofZ5YwiBwHJTCjU',
    },
    mp_ars: {
        label: 'Mercado Pago PESOS',
        alias: 'amdentalpesos',
        cvu: '0000003100006597395484',
    },
    mp_usd: {
        label: 'Mercado Pago DÓLARES',
        alias: 'mozo.aceptas.catre',
        cbu: '3220001888065006450017',
        nota: 'Al transferir figura Banco Industrial (BIND)',
    },
};

export default function CajaRecepcionPage() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [bnaRate, setBnaRate] = useState<BNARate | null>(null);
    const [loading, setLoading] = useState(true);
    const [showNuevoIngreso, setShowNuevoIngreso] = useState(false);
    const [showTransferencia, setShowTransferencia] = useState(false);
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const [isBoxClosed, setIsBoxClosed] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    async function loadData() {
        setLoading(true);
        try {
            // Check closure status for today
            const today = new Date().toISOString().split('T')[0];
            const { data: cierre, error: cierreError } = await supabase
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

            // Get today's date range
            const firstDayOfMonth = `${today.substring(0, 7)}-01`;

            // Fetch today's movements from Supabase
            const { data: movHoy, error: movError } = await supabase
                .from('caja_recepcion_movimientos')
                .select(`
                    *,
                    paciente:pacientes(id_paciente, nombre, apellido)
                `)
                .gte('fecha_hora', `${today}T00:00:00`)
                .lt('fecha_hora', `${today}T23:59:59`)
                .order('fecha_hora', { ascending: false });

            if (movError) {
                console.error('Error fetching movements:', movError);
            } else {
                setMovimientos(movHoy || []);
            }

            // Fetch month's totals
            const { data: movMes } = await supabase
                .from('caja_recepcion_movimientos')
                .select('usd_equivalente, estado')
                .gte('fecha_hora', `${firstDayOfMonth}T00:00:00`)
                .neq('estado', 'anulado');

            // Calculate stats
            const pagadosHoy = (movHoy || []).filter(m => m.estado !== 'anulado');
            const pendientesHoy = (movHoy || []).filter(m => m.estado === 'pendiente');
            const totalDiaUsd = pagadosHoy.reduce((sum, m) => sum + (m.usd_equivalente || 0), 0);
            const totalMesUsd = (movMes || []).reduce((sum, m) => sum + (m.usd_equivalente || 0), 0);

            setStats({
                totalDiaUsd: Math.round(totalDiaUsd * 100) / 100,
                totalMesUsd: Math.round(totalMesUsd * 100) / 100,
                porMetodo: {},
                porCategoria: {},
                movimientosHoy: pagadosHoy.length,
                pendientes: pendientesHoy.length,
            });
        } catch (error) {
            console.error('Error loading data:', error);
        } finally {
            setLoading(false);
        }
    }

    function copyToClipboard(key: string, text: string) {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    }

    function formatPaymentData(key: keyof typeof PAYMENT_DATA): string {
        const data = PAYMENT_DATA[key];
        let text = `${data.label}\n`;
        Object.entries(data).forEach(([k, v]) => {
            if (k !== 'label') {
                text += `${k.charAt(0).toUpperCase() + k.slice(1).replace('_', ' ')}: ${v}\n`;
            }
        });
        return text.trim();
    }

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
                        {formatCurrency(stats?.totalDiaUsd || 0, 'USD')}
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
                        {formatCurrency(stats?.totalMesUsd || 0, 'USD')}
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
                        {stats?.movimientosHoy || 0}
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
                        {stats?.pendientes || 0}
                    </p>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Movements Table */}
                <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                    <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                        <h3 className="font-semibold text-gray-900 dark:text-white">Movimientos del Día</h3>
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
                                        <th className="px-4 py-3 text-left">Hora</th>
                                        <th className="px-4 py-3 text-left">Paciente</th>
                                        <th className="px-4 py-3 text-left">Concepto</th>
                                        <th className="px-4 py-3 text-left">Método</th>
                                        <th className="px-4 py-3 text-right">Monto</th>
                                        <th className="px-4 py-3 text-center">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {movimientos.map((mov) => (
                                        <tr key={mov.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                            <td className="px-4 py-3 text-gray-500">
                                                {new Date(mov.fecha_hora).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                {mov.paciente ? `${mov.paciente.apellido}, ${mov.paciente.nombre}` : '-'}
                                            </td>
                                            <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{mov.concepto_nombre}</td>
                                            <td className="px-4 py-3 text-gray-500">{mov.metodo_pago}</td>
                                            <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">
                                                {formatCurrency(mov.usd_equivalente || mov.monto, 'USD')}
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
                        {(Object.keys(PAYMENT_DATA) as Array<keyof typeof PAYMENT_DATA>).map((key) => {
                            const data = PAYMENT_DATA[key];
                            const isCopied = copiedKey === key;

                            return (
                                <div
                                    key={key}
                                    className="p-3 rounded-lg border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/50 cursor-pointer transition-colors"
                                    onClick={() => copyToClipboard(key, formatPaymentData(key))}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {data.label}
                                        </span>
                                        {isCopied ? (
                                            <CheckCircle size={16} className="text-green-500" />
                                        ) : (
                                            <Copy size={14} className="text-gray-400" />
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">
                                        {'alias' in data ? data.alias : ('direccion' in data ? data.direccion : '')}
                                    </p>
                                </div>
                            );
                        })}
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
        </div>
    );
}
