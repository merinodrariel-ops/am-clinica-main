'use client';

import { useEffect, useState } from 'react';
import { Users, Banknote, BarChart3, Wallet } from 'lucide-react';
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
                {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="glass-card rounded-2xl p-6 animate-pulse">
                        <div className="flex items-center gap-4">
                            <div className="h-12 w-12 rounded-xl" style={{ background: 'hsl(230 15% 18%)' }} />
                            <div className="space-y-2">
                                <div className="h-4 w-20 rounded" style={{ background: 'hsl(230 15% 18%)' }} />
                                <div className="h-6 w-12 rounded" style={{ background: 'hsl(230 15% 18%)' }} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    const cards = [
        {
            icon: Users,
            label: 'Pacientes',
            value: stats?.patientsCount.toLocaleString() || '0',
            gradient: 'linear-gradient(135deg, hsl(217 91% 60%), hsl(224 76% 48%))',
            iconBg: 'hsla(217, 91%, 60%, 0.12)',
            iconColor: 'hsl(217 91% 65%)',
        },
        {
            icon: Banknote,
            label: 'Ingresos Hoy',
            value: `$${stats?.todayIncome.toLocaleString() || 0} USD`,
            gradient: 'linear-gradient(135deg, hsl(165 100% 42%), hsl(160 80% 35%))',
            iconBg: 'hsla(165, 100%, 42%, 0.12)',
            iconColor: 'hsl(165 85% 50%)',
        },
        {
            icon: BarChart3,
            label: 'Ingresos Mes',
            value: `$${stats?.monthIncome.toLocaleString() || 0} USD`,
            gradient: 'linear-gradient(135deg, hsl(280 67% 55%), hsl(265 70% 50%))',
            iconBg: 'hsla(280, 67%, 55%, 0.12)',
            iconColor: 'hsl(280 67% 65%)',
        },
        {
            icon: Wallet,
            label: 'Caja Admin (Efectivo)',
            isDouble: true,
            valueUsd: `USD ${stats?.adminCash?.usd.toLocaleString() || 0}`,
            valueArs: `ARS ${stats?.adminCash?.ars.toLocaleString() || 0}`,
            gradient: 'linear-gradient(135deg, hsl(25 95% 53%), hsl(15 80% 48%))',
            iconBg: 'hsla(25, 95%, 53%, 0.12)',
            iconColor: 'hsl(25 95% 60%)',
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger-children">
            {cards.map((card, i) => {
                const Icon = card.icon;
                return (
                    <div key={i} className="glass-card glass-card-hover rounded-2xl p-6">
                        <div className="flex items-center gap-4">
                            <div
                                className="h-12 w-12 rounded-xl flex items-center justify-center"
                                style={{ background: card.iconBg }}
                            >
                                <Icon size={24} style={{ color: card.iconColor }} />
                            </div>
                            <div>
                                <p className="text-sm" style={{ color: 'hsl(230 10% 50%)' }}>{card.label}</p>
                                {card.isDouble ? (
                                    <div className="flex flex-col">
                                        <span className="text-lg font-bold" style={{ color: 'hsl(210 20% 95%)' }}>
                                            {card.valueUsd}
                                        </span>
                                        <span className="text-sm font-medium" style={{ color: 'hsl(230 10% 50%)' }}>
                                            {card.valueArs}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col">
                                        <div className="flex items-baseline gap-2">
                                            <p className="text-2xl font-bold" style={{ color: 'hsl(210 20% 95%)' }}>
                                                {card.value}
                                            </p>
                                            {card.label === 'Pacientes' && (
                                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-500/10 text-teal-400 font-medium border border-teal-500/20">
                                                    +{stats?.newPatientsCount || 0} mes
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
