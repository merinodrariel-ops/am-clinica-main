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
        return <div className="animate-pulse glass-card bg-black/20 border border-white/5 h-32 rounded-xl mb-8"></div>;
    }

    const formatMoney = (val: number, currency: 'ARS' | 'USD') => {
        return new Intl.NumberFormat('es-AR', {
            style: 'currency',
            currency: currency
        }).format(val);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8 stagger-children">
            {/* Caja Recepción Card */}
            <div className="glass-card glass-card-hover rounded-xl p-6 relative overflow-hidden border border-white/5">
                <div
                    className={`absolute top-0 left-0 w-1 h-full ${recepcion?.status === 'Cerrado' ? 'bg-slate-600' : 'bg-teal-500'}`}
                />
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                            <Store size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-200">Caja Recepción</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recepcion?.status === 'Cerrado' ? 'badge-teal' : 'badge-success'}`}>
                                {recepcion?.status}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-sm text-slate-400">Efectivo ARS</span>
                        <span className="text-lg font-bold text-slate-200 drop-shadow-sm">
                            {formatMoney(recepcion?.saldoArs || 0, 'ARS')}
                        </span>
                    </div>
                    <div className="flex justify-between items-end pt-2 border-t border-white/5">
                        <span className="text-sm text-slate-400">Efectivo USD</span>
                        <span className="text-lg font-bold text-slate-200 drop-shadow-sm">
                            {formatMoney(recepcion?.saldoUsd || 0, 'USD')}
                        </span>
                    </div>
                </div>

                {recepcion?.lastCloseDate && (
                    <div className="mt-4 text-xs text-slate-500">
                        {recepcion.status === 'Cerrado' ? 'Cerrado el:' : 'Último cierre:'} {new Date(recepcion.lastCloseDate).toLocaleDateString()}
                    </div>
                )}
            </div>

            {/* Caja Admin Card(s) */}
            {adminBalances.map((admin, idx) => (
                <div key={idx} className="glass-card glass-card-hover rounded-xl p-6 relative overflow-hidden border border-white/5">
                    <div
                        className={`absolute top-0 left-0 w-1 h-full ${admin.status === 'Cerrado' ? 'bg-slate-600' : 'bg-blue-500'}`}
                    />
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                                <Building2 size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-200">Adm. {admin.sucursalName}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${admin.status === 'Cerrado' ? 'badge-teal' : 'badge-success'}`}>
                                    {admin.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-sm text-slate-400">Efectivo ARS</span>
                            <span className="text-lg font-bold text-slate-200 drop-shadow-sm">
                                {formatMoney(admin.saldoArs || 0, 'ARS')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end pt-2 border-t border-white/5">
                            <span className="text-sm text-slate-400">Efectivo USD</span>
                            <span className="text-lg font-bold text-slate-200 drop-shadow-sm">
                                {formatMoney(admin.saldoUsd || 0, 'USD')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end pt-2 border-t border-white/5">
                            <span className="text-sm text-slate-400">Gastos del mes</span>
                            <span className="text-base font-bold text-rose-400">
                                {formatMoney(admin.egresosUsd || 0, 'USD')}
                            </span>
                        </div>
                    </div>

                    {admin.lastCloseDate && (
                        <div className="mt-4 text-xs text-slate-500">
                            {admin.status === 'Cerrado' ? 'Cerrado el:' : 'Último cierre:'} {new Date(admin.lastCloseDate).toLocaleDateString()}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
