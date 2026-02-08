'use client';

import { useEffect, useState } from 'react';
import { getReferralStats, ReferralStat } from '@/lib/dashboard';
import { Users } from 'lucide-react';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#64748b'];

export default function ReferralChart() {
    const [data, setData] = useState<ReferralStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [total, setTotal] = useState(0);

    useEffect(() => {
        async function load() {
            const stats = await getReferralStats();
            const topStats = stats.slice(0, 5);
            setData(topStats);
            setTotal(stats.reduce((sum, s) => sum + s.value, 0));
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-3 bg-gray-100 dark:bg-gray-700 rounded"></div>
                    ))}
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Users size={16} />
                    <span>Sin datos de origen</span>
                </div>
            </div>
        );
    }

    const maxValue = Math.max(...data.map(d => d.value));

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <Users size={14} className="text-blue-500" />
                    Origen de Pacientes
                </h4>
                <span className="text-xs text-gray-400">{total} total</span>
            </div>

            <div className="space-y-2.5">
                {data.map((item, index) => {
                    const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

                    return (
                        <div key={item.name} className="group">
                            <div className="flex items-center justify-between text-xs mb-1">
                                <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400">
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                    />
                                    <span className="truncate max-w-[120px]" title={item.name}>
                                        {item.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-gray-900 dark:text-white font-medium">
                                        {item.value}
                                    </span>
                                    <span className="text-gray-400 w-8 text-right">
                                        {percentage}%
                                    </span>
                                </div>
                            </div>
                            <div className="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full rounded-full transition-all duration-500 ease-out"
                                    style={{
                                        width: `${barWidth}%`,
                                        backgroundColor: COLORS[index % COLORS.length]
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
