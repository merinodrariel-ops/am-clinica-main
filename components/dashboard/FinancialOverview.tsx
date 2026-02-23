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
        return <div className="animate-pulse glass-card h-32 rounded-xl mb-8"></div>;
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
            <div className="glass-card glass-card-hover rounded-xl p-6 relative overflow-hidden">
                <div
                    className="absolute top-0 left-0 w-1 h-full"
                    style={{ background: recepcion?.status === 'Cerrado' ? 'hsl(230 10% 35%)' : 'hsl(165 100% 42%)' }}
                />
                <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div
                            className="p-2 rounded-lg"
                            style={{ background: 'hsla(165, 100%, 42%, 0.12)', color: 'hsl(165 85% 50%)' }}
                        >
                            <Store size={24} />
                        </div>
                        <div>
                            <h3 className="font-semibold" style={{ color: 'hsl(210 20% 93%)' }}>Caja Recepción</h3>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recepcion?.status === 'Cerrado' ? 'badge-teal' : 'badge-success'
                                }`}>
                                {recepcion?.status}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="space-y-3">
                    <div className="flex justify-between items-end">
                        <span className="text-sm" style={{ color: 'hsl(230 10% 50%)' }}>Efectivo ARS</span>
                        <span className="text-lg font-bold" style={{ color: 'hsl(210 20% 95%)' }}>
                            {formatMoney(recepcion?.saldoArs || 0, 'ARS')}
                        </span>
                    </div>
                    <div className="flex justify-between items-end pt-2" style={{ borderTop: '1px solid hsl(230 15% 18%)' }}>
                        <span className="text-sm" style={{ color: 'hsl(230 10% 50%)' }}>Efectivo USD</span>
                        <span className="text-lg font-bold" style={{ color: 'hsl(210 20% 95%)' }}>
                            {formatMoney(recepcion?.saldoUsd || 0, 'USD')}
                        </span>
                    </div>
                </div>

                {recepcion?.lastCloseDate && (
                    <div className="mt-4 text-xs" style={{ color: 'hsl(230 10% 40%)' }}>
                        {recepcion.status === 'Cerrado' ? 'Cerrado el:' : 'Último cierre:'} {new Date(recepcion.lastCloseDate).toLocaleDateString()}
                    </div>
                )}
            </div>

            {/* Caja Admin Card(s) */}
            {adminBalances.map((admin, idx) => (
                <div key={idx} className="glass-card glass-card-hover rounded-xl p-6 relative overflow-hidden">
                    <div
                        className="absolute top-0 left-0 w-1 h-full"
                        style={{ background: admin.status === 'Cerrado' ? 'hsl(230 10% 35%)' : 'hsl(217 91% 60%)' }}
                    />
                    <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="p-2 rounded-lg"
                                style={{ background: 'hsla(217, 91%, 60%, 0.12)', color: 'hsl(217 91% 65%)' }}
                            >
                                <Building2 size={24} />
                            </div>
                            <div>
                                <h3 className="font-semibold" style={{ color: 'hsl(210 20% 93%)' }}>Adm. {admin.sucursalName}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${admin.status === 'Cerrado' ? 'badge-teal' : 'badge-success'
                                    }`}>
                                    {admin.status}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-end">
                            <span className="text-sm" style={{ color: 'hsl(230 10% 50%)' }}>Efectivo ARS</span>
                            <span className="text-lg font-bold" style={{ color: 'hsl(210 20% 95%)' }}>
                                {formatMoney(admin.saldoArs || 0, 'ARS')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end pt-2" style={{ borderTop: '1px solid hsl(230 15% 18%)' }}>
                            <span className="text-sm" style={{ color: 'hsl(230 10% 50%)' }}>Efectivo USD</span>
                            <span className="text-lg font-bold" style={{ color: 'hsl(210 20% 95%)' }}>
                                {formatMoney(admin.saldoUsd || 0, 'USD')}
                            </span>
                        </div>
                        <div className="flex justify-between items-end pt-2" style={{ borderTop: '1px solid hsl(230 15% 18%)' }}>
                            <span className="text-sm" style={{ color: 'hsl(230 10% 50%)' }}>Gastos del mes</span>
                            <span className="text-base font-bold" style={{ color: 'hsl(0 72% 60%)' }}>
                                {formatMoney(admin.egresosUsd || 0, 'USD')}
                            </span>
                        </div>
                    </div>

                    {admin.lastCloseDate && (
                        <div className="mt-4 text-xs" style={{ color: 'hsl(230 10% 40%)' }}>
                            {admin.status === 'Cerrado' ? 'Cerrado el:' : 'Último cierre:'} {new Date(admin.lastCloseDate).toLocaleDateString()}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}
