'use client';

import { useEffect, useState } from 'react';
import { getReferralStats, ReferralStat } from '@/lib/dashboard';
import { Users } from 'lucide-react';

const COLORS = ['#00d4aa', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#64748b'];

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
            <div className="glass-card rounded-xl p-4 animate-pulse">
                <div className="h-4 rounded w-1/3 mb-4" style={{ background: 'hsl(230 15% 18%)' }}></div>
                <div className="space-y-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-3 rounded" style={{ background: 'hsl(230 15% 16%)' }}></div>
                    ))}
                </div>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 text-sm" style={{ color: 'hsl(230 10% 50%)' }}>
                    <Users size={16} />
                    <span>Sin datos de origen</span>
                </div>
            </div>
        );
    }

    const maxValue = Math.max(...data.map(d => d.value));

    return (
        <div className="glass-card glass-card-hover rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(210 20% 90%)' }}>
                    <Users size={14} style={{ color: 'hsl(165 100% 42%)' }} />
                    Origen de Pacientes
                </h4>
                <span className="text-xs" style={{ color: 'hsl(230 10% 45%)' }}>{total} total</span>
            </div>

            <div className="space-y-2.5">
                {data.map((item, index) => {
                    const percentage = total > 0 ? Math.round((item.value / total) * 100) : 0;
                    const barWidth = maxValue > 0 ? (item.value / maxValue) * 100 : 0;

                    return (
                        <div key={item.name} className="group">
                            <div className="flex items-center justify-between text-xs mb-1">
                                <div className="flex items-center gap-1.5" style={{ color: 'hsl(230 10% 55%)' }}>
                                    <div
                                        className="w-2 h-2 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                                    />
                                    <span className="truncate max-w-[120px]" title={item.name}>
                                        {item.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium" style={{ color: 'hsl(210 20% 93%)' }}>
                                        {item.value}
                                    </span>
                                    <span className="w-8 text-right" style={{ color: 'hsl(230 10% 45%)' }}>
                                        {percentage}%
                                    </span>
                                </div>
                            </div>
                            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(230 15% 16%)' }}>
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
