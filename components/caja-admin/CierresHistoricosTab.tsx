'use client';

import { useState, useEffect } from 'react';
import {
    Calendar,
    User,
    ArrowRightLeft,
    AlertCircle,
    CheckCircle2,
    Search,
    Download,
    History
} from 'lucide-react';
import {
    type Sucursal,
    type CajaAdminArqueo,
    type CuentaFinanciera,
    getArqueosForMonth,
    getCuentas
} from '@/lib/caja-admin';
import { formatDateForLocale } from '@/lib/local-date';
import { Button } from "@/components/ui/Button";

interface Props {
    sucursal: Sucursal;
}

export default function CierresHistoricosTab({ sucursal }: Props) {
    const [mes, setMes] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [arqueos, setArqueos] = useState<CajaAdminArqueo[]>([]);
    const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [sucursal.id, mes]);

    async function loadData() {
        setLoading(true);
        try {
            const [arqueosData, cuentasData] = await Promise.all([
                getArqueosForMonth(sucursal.id, mes),
                getCuentas(sucursal.id)
            ]);
            setArqueos(arqueosData);
            setCuentas(cuentasData.filter(c => c.tipo_cuenta === 'EFECTIVO'));
        } catch (error) {
            console.error('Error loading historical arqueos:', error);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/10 glass-card">
                <div className="flex items-center gap-3">
                    <History className="text-teal-400 w-6 h-6" />
                    <div>
                        <h3 className="text-lg font-bold text-white">Historial de Cierres</h3>
                        <p className="text-sm text-slate-400">Auditoría diaria de arqueos y diferencias</p>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        type="month"
                        value={mes}
                        onChange={(e) => setMes(e.target.value)}
                        className="bg-navy-900 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:ring-2 focus:ring-teal-500/50 outline-none transition-all"
                    />
                    <Button
                        onClick={loadData}
                        variant="ghost"
                        className="p-2 h-10 w-10 text-slate-400 hover:text-white"
                    >
                        <Search size={18} />
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="py-20 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    <p className="text-slate-400 text-sm">Cargando historial...</p>
                </div>
            ) : arqueos.length === 0 ? (
                <div className="py-20 text-center bg-white/5 rounded-2xl border border-dashed border-white/10">
                    <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">No hay cierres registrados para este mes.</p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {arqueos.map((arqueo) => (
                        <div
                            key={arqueo.id}
                            className="bg-navy-900/50 border border-white/10 rounded-2xl overflow-hidden glass-card hover:border-teal-500/30 transition-all group"
                        >
                            <div className="p-4 sm:p-6">
                                <div className="flex flex-col md:flex-row justify-between gap-4">
                                    <div className="flex gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 group-hover:scale-110 transition-transform">
                                            <Archive size={24} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-lg font-bold text-white">
                                                    {formatDateForLocale(arqueo.fecha)}
                                                </h4>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full uppercase tracking-wider ${arqueo.estado.toLowerCase() === 'cerrado'
                                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                                    }`}>
                                                    {arqueo.estado}
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-400">
                                                <span className="flex items-center gap-1.5">
                                                    <User size={14} className="text-slate-500" />
                                                    {arqueo.usuario || 'Sistema'}
                                                </span>
                                                <span className="flex items-center gap-1.5">
                                                    <Calendar size={14} className="text-slate-500" />
                                                    {arqueo.hora_cierre ? new Date(arqueo.hora_cierre).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-xs text-slate-500 uppercase font-semibold tracking-wider mb-1">Diferencia</div>
                                            <div className={`text-lg font-mono font-bold ${Math.abs(arqueo.diferencia_usd) < 0.01
                                                    ? 'text-emerald-400'
                                                    : arqueo.diferencia_usd > 0
                                                        ? 'text-blue-400'
                                                        : 'text-red-400'
                                                }`}>
                                                {arqueo.diferencia_usd > 0 ? '+' : ''}
                                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(arqueo.diferencia_usd)}
                                            </div>
                                        </div>
                                        {Math.abs(arqueo.diferencia_usd) > 0.01 ? (
                                            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center text-red-400">
                                                <AlertCircle size={20} />
                                            </div>
                                        ) : (
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                                                <CheckCircle2 size={20} />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {cuentas.map((cuenta) => {
                                        const inicial = arqueo.saldos_iniciales?.[cuenta.id] || 0;
                                        const final = arqueo.saldos_finales?.[cuenta.id] || 0;
                                        const delta = final - inicial;

                                        return (
                                            <div key={cuenta.id} className="bg-white/5 border border-white/5 rounded-xl p-3">
                                                <div className="text-xs font-medium text-slate-500 mb-2 truncate" title={cuenta.nombre_cuenta}>
                                                    {cuenta.nombre_cuenta}
                                                </div>
                                                <div className="flex justify-between items-end">
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 leading-none mb-1">Cierre</div>
                                                        <div className="text-sm font-bold text-white font-mono">
                                                            {new Intl.NumberFormat('es-AR', { style: 'currency', currency: cuenta.moneda }).format(final)}
                                                        </div>
                                                    </div>
                                                    <div className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${delta >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                                        }`}>
                                                        {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toLocaleString('es-AR')}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {arqueo.observaciones && (
                                    <div className="mt-4 p-3 bg-white/5 rounded-xl border border-white/5">
                                        <p className="text-xs text-slate-400 italic">
                                            &ldquo;{arqueo.observaciones}&rdquo;
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function Archive(props: any) {
    return (
        <svg
            {...props}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
        </svg>
    )
}
