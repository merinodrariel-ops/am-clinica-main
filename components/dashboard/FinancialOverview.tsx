'use client';

import { useEffect, useState } from 'react';
import { Building2, Store } from 'lucide-react';
import { getSucursales, getCurrentBalanceAdmin, getReporteMensual } from '@/lib/caja-admin';
import { getCurrentBalanceRecepcion } from '@/lib/caja-recepcion';

interface BalanceState {
    status: string;
    lastCloseDate: string | null;
    saldoArs: number;
    saldoUsd: number;
    sucursalName?: string;
    saldosPorCuenta?: Record<string, number>;
    egresosUsd?: number;
}


export default function FinancialOverview() {
    const [recepcion, setRecepcion] = useState<BalanceState | null>(null);
    const [adminBalances, setAdminBalances] = useState<BalanceState[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                // 1. Recepción
                const recData = await getCurrentBalanceRecepcion();
                setRecepcion({
                    ...recData,
                    status: recData.status === 'cerrado' ? 'Cerrado' : 'Abierto'
                });

                // 2. Administración (All Branches)
                const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
                const sucursales = await getSucursales();
                const admins = await Promise.all(sucursales.map(async (s) => {
                    const [data, reporte] = await Promise.all([
                        getCurrentBalanceAdmin(s.id),
                        getReporteMensual(s.id, currentMonth),
                    ]);
                    return {
                        ...data,
                        status: data.status,
                        sucursalName: s.nombre,
                        egresosUsd: reporte.egresosUsd,
                    };
                }));
                setAdminBalances(admins);

            } catch (error) {
                console.error('Error loading financial overview:', error);
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, []);

    if (loading) {
        return <div className="animate-pulse bg-gray-100 h-32 rounded-xl mb-8"></div>;
    }

    const formatMoney = (val: number, currency: 'ARS' | 'USD') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency
        }).format(val);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
            {/* Caja Recepción Card */}
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1 h-full ${recepcion?.status === 'Cerrado' ? 'bg-gray-400' : 'bg-green-500'}`}></div>
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-lg text-green-600 dark:text-green-400">
                            <Store size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">Caja Recepción</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${recepcion?.status === 'Cerrado'
                                ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                }`}>
                                {recepcion?.status}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Efectivo ARS</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatMoney(recepcion?.saldoArs || 0, 'ARS')}
                        </span>
                    </div>
                    <div className="flex justify-between items-end border-t border-gray-100 dark:border-gray-700 pt-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Efectivo USD</span>
                        <span className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatMoney(recepcion?.saldoUsd || 0, 'USD')}
                        </span>
                    </div>
                </div>

                {recepcion?.lastCloseDate && (
                    <div className="mt-4 text-xs text-gray-400">
                        {recepcion.status === 'Cerrado' ? 'Cerrado el:' : 'Último cierre:'} {new Date(recepcion.lastCloseDate).toLocaleDateString()}
                    </div>
                )}
            </div>

            {/* Caja Admin Card(s) */}
            {adminBalances.map((admin, idx) => (
                <div key={idx} className="bg-white dark:bg-gray-800 rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 relative overflow-hidden">
                    <div className={`absolute top-0 left-0 w-1 h-full ${admin.status === 'Cerrado' ? 'bg-gray-400' : 'bg-blue-500'}`}></div>
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-blue-600 dark:text-blue-400">
                                <Building2 size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">Adm. {admin.sucursalName}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${admin.status === 'Cerrado'
                                    ? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                                    }`}>
                                    {admin.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Efectivo ARS</span>
                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                                {formatMoney(admin.saldoArs || 0, 'ARS')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-t border-gray-100 dark:border-gray-700 pt-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Efectivo USD</span>
                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                                {formatMoney(admin.saldoUsd || 0, 'USD')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end border-t border-gray-100 dark:border-gray-700 pt-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">Gastos del mes</span>
                            <span className="text-base font-bold text-red-600 dark:text-red-400">
                                {formatMoney(admin.egresosUsd || 0, 'USD')}
                            </span>
                        </div>
                    </div>

                    {admin.lastCloseDate && (
                        <div className="mt-4 text-xs text-gray-400">
                            {admin.status === 'Cerrado' ? 'Cerrado el:' : 'Último cierre:'} {new Date(admin.lastCloseDate).toLocaleDateString()}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
