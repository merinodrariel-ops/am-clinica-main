'use client';

import { Shield, Users, BarChart3, ArrowUpRight } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { formatCurrency } from '@/lib/bna';

interface CommanderViewProps {
    leaderboardEntries: any[];
}

export function CommanderView({ leaderboardEntries }: CommanderViewProps) {
    const totalProductionArs = leaderboardEntries.reduce((sum, e) => sum + e.points * 100, 0); // Simplified calculation
    const activeProfessionals = leaderboardEntries.length;

    return (
        <div className="mb-8">
            <div className="flex items-center gap-2 mb-4 text-purple-400">
                <Shield className="w-5 h-5" />
                <h2 className="font-black uppercase tracking-widest text-sm">Commander View</h2>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <GlassCard className="p-4 bg-purple-600/20 border-purple-500/30">
                    <div className="flex justify-between items-start mb-2">
                        <BarChart3 className="w-4 h-4 text-purple-300" />
                        <ArrowUpRight className="w-3 h-3 text-purple-300" />
                    </div>
                    <p className="text-[10px] font-bold text-purple-200/50 uppercase">Producción Total</p>
                    <p className="text-lg font-black text-white">{formatCurrency(totalProductionArs, 'ARS')}</p>
                </GlassCard>

                <GlassCard className="p-4 bg-blue-600/20 border-blue-500/30">
                    <div className="flex justify-between items-start mb-2">
                        <Users className="w-4 h-4 text-blue-300" />
                        <ArrowUpRight className="w-3 h-3 text-blue-300" />
                    </div>
                    <p className="text-[10px] font-bold text-blue-200/50 uppercase">Equipo Activo</p>
                    <p className="text-lg font-black text-white">{activeProfessionals}</p>
                </GlassCard>
            </div>

            <GlassCard className="p-4">
                <p className="text-[10px] font-bold text-white/40 uppercase mb-3 tracking-widest text-center">Resumen de Liquidación</p>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden flex">
                    <div className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]" style={{ width: '65%' }} />
                    <div className="h-full bg-amber-500 shadow-[0_0_10px_#f59e0b]" style={{ width: '35%' }} />
                </div>
                <div className="flex justify-between mt-2 text-[9px] font-bold uppercase tracking-tighter">
                    <span className="text-emerald-400">65% Listos</span>
                    <span className="text-amber-400">35% Pendientes</span>
                </div>
            </GlassCard>
        </div>
    );
}
