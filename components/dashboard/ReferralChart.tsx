'use client';

import { useEffect, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { getReferralStats, ReferralStat } from '@/lib/dashboard';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function ReferralChart() {
    const [data, setData] = useState<ReferralStat[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            const stats = await getReferralStats();
            // Group tiny ones into "Otros" if needed, but for now just show top 5-7
            setData(stats.slice(0, 7));
            setLoading(false);
        }
        load();
    }, []);

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 h-[400px] flex items-center justify-center animate-pulse">
                <div className="h-48 w-48 rounded-full border-8 border-gray-100 dark:border-gray-700" />
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 h-[400px] flex items-center justify-center text-gray-500">
                No hay datos de referencia suficientes
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                Origen de Pacientes
            </h3>
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                        >
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{
                                borderRadius: '12px',
                                border: 'none',
                                boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                                backgroundColor: '#fff'
                            }}
                        />
                        <Legend verticalAlign="bottom" height={36} />
                    </PieChart>
                </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
                {data.map((item, index) => (
                    <div key={item.name} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                            <span>{item.name}</span>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
