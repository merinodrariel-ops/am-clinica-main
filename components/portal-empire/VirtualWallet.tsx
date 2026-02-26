'use client';

import { Wallet, TrendingUp, Info } from 'lucide-react';
import { GlassCard } from './GlassCard';
import { formatCurrency } from '@/lib/bna';

interface VirtualWalletProps {
    totalUsd: number;
    totalArs: number;
    exchangeRate: number;
    status: 'READY' | 'PENDING_TASKS';
}

export function VirtualWallet({ totalUsd, totalArs, exchangeRate, status }: VirtualWalletProps) {
    return (
        <GlassCard className="p-6 mb-6">
            <div className="flex justify-between items-start mb-6">
                <div>
                    <div className="flex items-center gap-2 text-indigo-200 text-xs font-bold uppercase tracking-widest mb-1">
                        <Wallet className="w-4 h-4" />
                        Billetera Virtual
                    </div>
                    <h3 className="text-3xl font-black text-white tracking-tight">
                        {formatCurrency(totalArs, 'ARS')}
                    </h3>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${status === 'READY' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    }`}>
                    {status === 'READY' ? 'Listo para Cobro' : 'Tareas Pendientes'}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-white/40 text-[10px] font-bold uppercase mb-1">Producción (USD)</p>
                    <p className="text-xl font-bold text-indigo-300">{formatCurrency(totalUsd, 'USD')}</p>
                </div>
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                    <p className="text-white/40 text-[10px] font-bold uppercase mb-1">TC BNA Venta</p>
                    <p className="text-xl font-bold text-emerald-400">$ {exchangeRate}</p>
                </div>
            </div>

            {status === 'PENDING_TASKS' && (
                <div className="mt-4 flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl">
                    <Info className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-200/80 leading-tight">
                        Completa tus tareas de <b>Slides</b> para liberar esta liquidación.
                    </p>
                </div>
            )}
        </GlassCard>
    );
}
