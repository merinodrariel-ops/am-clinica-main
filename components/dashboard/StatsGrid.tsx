'use client';

import { useEffect, useState } from 'react';
import { Users, Banknote, BarChart3, Wallet, Loader2 } from 'lucide-react';
import { getDashboardStats, DashboardStats } from '@/lib/dashboard';

export default function StatsGrid() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadStats() {
            const data = await getDashboardStats();
            setStats(data);
            setLoading(false);
        }
        loadStats();
    }, []);

    if (loading) {
        return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl bg-gray-100 dark:bg-gray-700" />
                            <div className="space-y-2">
                                <div className="h-4 w-20 bg-gray-100 dark:bg-gray-700 rounded" />
                                <div className="h-6 w-12 bg-gray-100 dark:bg-gray-700 rounded" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                        <Users size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Pacientes</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {stats?.patientsCount.toLocaleString() || 0}
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                        <Banknote size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Ingresos Hoy</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            ${stats?.todayIncome.toLocaleString() || 0} USD
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                        <BarChart3 size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Ingresos Mes</p>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            ${stats?.monthIncome.toLocaleString() || 0} USD
                        </p>
                    </div>
                </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                        <Wallet size={24} />
                    </div>
                    <div>
                        <p className="text-sm text-gray-500">Caja Admin (Efectivo)</p>
                        <div className="flex flex-col">
                            <span className="text-lg font-bold text-gray-900 dark:text-white">
                                USD {stats?.adminCash?.usd.toLocaleString() || 0}
                            </span>
                            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                ARS {stats?.adminCash?.ars.toLocaleString() || 0}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
