'use client';

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Calendar,
    TrendingUp,
    TrendingDown,
    DollarSign,
    Users,
    Clock,
    Receipt,
    AlertTriangle,
    BarChart3,
    PieChart,
    Info,
    ExternalLink,
    Download
} from 'lucide-react';
import {
    type Sucursal,
    getReporteMensual,
    getEgresosPorSubtipo,
    type ReporteSummary
} from '@/lib/caja-admin';
import { supabase } from '@/lib/supabase';


interface Props {
    sucursal: Sucursal;
}

interface Alert {
    tipo: 'warning' | 'error' | 'info';
    mensaje: string;
}

export default function ReportesTab({ sucursal }: Props) {
    const [loading, setLoading] = useState(true);
    const [mesActual, setMesActual] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [summary, setSummary] = useState<ReporteSummary | null>(null);
    const [egresosPorSubtipo, setEgresosPorSubtipo] = useState<{ subtipo: string; total_usd: number }[]>([]);
    const [alerts, setAlerts] = useState<Alert[]>([]);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

    async function loadData() {
        setLoading(true);
        try {
            const [summaryData, egresosData] = await Promise.all([
                getReporteMensual(sucursal.id, mesActual),
                getEgresosPorSubtipo(sucursal.id, mesActual),
            ]);

            setSummary(summaryData);
            setEgresosPorSubtipo(egresosData);
            setLastUpdate(new Date());

            // Check for alerts
            const newAlerts: Alert[] = [];

            // Check for movements without attachments in critical subtipos
            const { data: sinAdjuntos } = await supabase
                .from('caja_admin_movimientos')
                .select('id, subtipo')
                .eq('sucursal_id', sucursal.id)
                .in('subtipo', ['Alquileres', 'Expensas', 'Materiales Dentales', 'Laboratorio', 'Equipamiento', 'Servicios', 'Banco', 'Liquidaciones'])
                .or('adjuntos.is.null,adjuntos.eq.[]')
                .neq('estado', 'Anulado');

            if (sinAdjuntos && sinAdjuntos.length > 0) {
                newAlerts.push({
                    tipo: 'warning',
                    mensaje: `${sinAdjuntos.length} movimientos sin comprobante adjunto`,
                });
            }

            // Check for arqueos with difference
            const { data: arqConDif } = await supabase
                .from('caja_admin_arqueos')
                .select('id, diferencia_usd')
                .eq('sucursal_id', sucursal.id)
                .neq('diferencia_usd', 0)
                .limit(5);

            if (arqConDif && arqConDif.length > 0) {
                newAlerts.push({
                    tipo: 'warning',
                    mensaje: `${arqConDif.length} cierres con diferencia de caja`,
                });
            }

            setAlerts(newAlerts);
        } catch (error) {
            console.error('Error loading report data:', error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sucursal.id, mesActual]);

    // Calculate max for chart scaling
    const maxEgreso = useMemo(() => {
        if (egresosPorSubtipo.length === 0) return 100;
        return Math.max(...egresosPorSubtipo.map(e => e.total_usd));
    }, [egresosPorSubtipo]);

    // Format currency
    const formatUSD = (value: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
        }).format(value);
    };

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                Cargando reportes...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <BarChart3 className="w-6 h-6 text-indigo-500" />
                        Dashboard Financiero
                    </h2>
                    <p className="text-sm text-slate-500 flex items-center gap-1 mt-1">
                        <Info className="w-4 h-4" />
                        Reportes en modo lectura • Fuente: {sucursal.modo_caja === 'SEPARADA' ? 'Caja Recepción + Admin' : 'Caja Admin'}
                        {lastUpdate && (
                            <span className="ml-2">
                                • Actualizado: {lastUpdate.toLocaleTimeString('es-AR')}
                            </span>
                        )}
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                        <input
                            type="month"
                            value={mesActual}
                            onChange={(e) => setMesActual(e.target.value)}
                            className="bg-transparent border-none outline-none text-sm font-medium"
                        />
                    </div>

                    <button className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 rounded-xl text-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50">
                        <Download className="w-4 h-4" />
                        Exportar
                    </button>
                </div>
            </div>

            {/* Alerts */}
            {alerts.length > 0 && (
                <div className="space-y-2">
                    {alerts.map((alert, idx) => (
                        <div
                            key={idx}
                            className={`flex items-center gap-3 p-4 rounded-xl ${alert.tipo === 'error'
                                ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
                                : alert.tipo === 'warning'
                                    ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                                    : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                                }`}
                        >
                            <AlertTriangle className={`w-5 h-5 ${alert.tipo === 'error' ? 'text-red-600' :
                                alert.tipo === 'warning' ? 'text-amber-600' : 'text-blue-600'
                                }`} />
                            <span className="text-sm font-medium">{alert.mensaje}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Ingresos */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-2xl p-6 border border-green-200 dark:border-green-800"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                            <TrendingUp className="w-6 h-6 text-green-600" />
                        </div>
                        <span className="text-xs font-medium text-green-600 bg-green-100 dark:bg-green-900/50 px-2 py-1 rounded-full">
                            INGRESOS
                        </span>
                    </div>
                    <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                        {formatUSD(summary?.ingresosPacientesUsd || 0)}
                    </p>
                    <p className="text-sm text-green-600 mt-1">Ingresos pacientes</p>
                </motion.div>

                {/* Egresos */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20 rounded-2xl p-6 border border-red-200 dark:border-red-800"
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                            <TrendingDown className="w-6 h-6 text-red-600" />
                        </div>
                        <span className="text-xs font-medium text-red-600 bg-red-100 dark:bg-red-900/50 px-2 py-1 rounded-full">
                            EGRESOS
                        </span>
                    </div>
                    <p className="text-3xl font-bold text-red-700 dark:text-red-400">
                        {formatUSD(summary?.egresosUsd || 0)}
                    </p>
                    <p className="text-sm text-red-600 mt-1">Gastos operativos</p>
                </motion.div>

                {/* Margen Bruto */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className={`rounded-2xl p-6 border ${(summary?.margenBruto || 0) >= 0
                        ? 'bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-800'
                        : 'bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 border-orange-200 dark:border-orange-800'
                        }`}
                >
                    <div className="flex items-center justify-between mb-4">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${(summary?.margenBruto || 0) >= 0 ? 'bg-indigo-100 dark:bg-indigo-900/50' : 'bg-orange-100 dark:bg-orange-900/50'
                            }`}>
                            <DollarSign className={`w-6 h-6 ${(summary?.margenBruto || 0) >= 0 ? 'text-indigo-600' : 'text-orange-600'
                                }`} />
                        </div>
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${(summary?.margenBruto || 0) >= 0
                            ? 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900/50'
                            : 'text-orange-600 bg-orange-100 dark:bg-orange-900/50'
                            }`}>
                            MARGEN
                        </span>
                    </div>
                    <p className={`text-3xl font-bold ${(summary?.margenBruto || 0) >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-orange-700 dark:text-orange-400'
                        }`}>
                        {formatUSD(summary?.margenBruto || 0)}
                    </p>
                    <p className={`text-sm mt-1 ${(summary?.margenBruto || 0) >= 0 ? 'text-indigo-600' : 'text-orange-600'
                        }`}>
                        Margen bruto estimado
                    </p>
                </motion.div>
            </div>

            {/* Secondary KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <Users className="w-5 h-5 text-purple-500" />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Honorarios Profesionales</span>
                    </div>
                    <p className="text-2xl font-bold">
                        {formatUSD(summary?.honorariosProfesionalesUsd || 0)}
                    </p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <Clock className="w-5 h-5 text-blue-500" />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Sueldos Staff</span>
                    </div>
                    <p className="text-2xl font-bold">
                        {formatUSD(summary?.sueldosStaffUsd || 0)}
                    </p>
                </div>

                <div className="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-3 mb-3">
                        <Receipt className="w-5 h-5 text-teal-500" />
                        <span className="text-sm font-medium text-slate-600 dark:text-slate-400">Cashflow Neto</span>
                    </div>
                    <p className={`text-2xl font-bold ${(summary?.cashflowNeto || 0) >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                        {formatUSD(summary?.cashflowNeto || 0)}
                    </p>
                </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Egresos por Subtipo */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <BarChart3 className="w-5 h-5 text-indigo-500" />
                        Egresos por Categoría (Top 10)
                    </h3>

                    {egresosPorSubtipo.length === 0 ? (
                        <div className="text-center py-8 text-slate-400">
                            <PieChart className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p>No hay egresos registrados este mes</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {egresosPorSubtipo.map((item, idx) => (
                                <div key={idx}>
                                    <div className="flex items-center justify-between text-sm mb-1">
                                        <span className="font-medium">{item.subtipo}</span>
                                        <span className="text-slate-500">{formatUSD(item.total_usd)}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-2">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${(item.total_usd / maxEgreso) * 100}%` }}
                                            transition={{ duration: 0.5, delay: idx * 0.1 }}
                                            className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Summary Card */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-200 dark:border-slate-700">
                    <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                        <PieChart className="w-5 h-5 text-indigo-500" />
                        Resumen del Mes
                    </h3>

                    <div className="space-y-4">
                        <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-xl">
                            <div className="flex items-center justify-between">
                                <span className="text-green-700 dark:text-green-400">Ingresos Totales</span>
                                <span className="text-lg font-bold text-green-700 dark:text-green-400">
                                    {formatUSD(summary?.ingresosPacientesUsd || 0)}
                                </span>
                            </div>
                        </div>

                        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-xl">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-red-700 dark:text-red-400">Gastos Totales</span>
                                <span className="text-lg font-bold text-red-700 dark:text-red-400">
                                    {formatUSD(
                                        (summary?.egresosUsd || 0) +
                                        (summary?.honorariosProfesionalesUsd || 0) +
                                        (summary?.sueldosStaffUsd || 0)
                                    )}
                                </span>
                            </div>
                            <div className="text-xs text-red-600 dark:text-red-400 space-y-1">
                                <div className="flex justify-between">
                                    <span>• Egresos operativos</span>
                                    <span>{formatUSD(summary?.egresosUsd || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>• Honorarios</span>
                                    <span>{formatUSD(summary?.honorariosProfesionalesUsd || 0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>• Sueldos</span>
                                    <span>{formatUSD(summary?.sueldosStaffUsd || 0)}</span>
                                </div>
                            </div>
                        </div>

                        <div className={`p-4 rounded-xl ${(summary?.margenBruto || 0) >= 0
                            ? 'bg-indigo-50 dark:bg-indigo-900/20'
                            : 'bg-orange-50 dark:bg-orange-900/20'
                            }`}>
                            <div className="flex items-center justify-between">
                                <span className={`font-medium ${(summary?.margenBruto || 0) >= 0
                                    ? 'text-indigo-700 dark:text-indigo-400'
                                    : 'text-orange-700 dark:text-orange-400'
                                    }`}>
                                    = Resultado del Mes
                                </span>
                                <span className={`text-xl font-bold ${(summary?.margenBruto || 0) >= 0
                                    ? 'text-indigo-700 dark:text-indigo-400'
                                    : 'text-orange-700 dark:text-orange-400'
                                    }`}>
                                    {formatUSD(summary?.margenBruto || 0)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Note */}
            <div className="text-center text-sm text-slate-400 py-4">
                <p>
                    Todos los valores en USD • Tipo de cambio histórico por movimiento •
                    <span className="text-indigo-500 cursor-pointer hover:underline inline-flex items-center gap-1 ml-1">
                        Metodología de cálculo <ExternalLink className="w-3 h-3" />
                    </span>
                </p>
            </div>
        </div>
    );
}
