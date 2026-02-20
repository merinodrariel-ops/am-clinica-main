import { getCurrentWorkerProfile, getWorkerLiquidations } from '@/app/actions/worker-portal';
import { DollarSign, TrendingUp, Calendar, CheckCircle2, Clock, ArrowDown } from 'lucide-react';

const STATUS_CONFIG = {
    paid: { label: 'Pagado', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    approved: { label: 'Aprobado', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    pending: { label: 'Pendiente', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    rejected: { label: 'Rechazado', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
};

export default async function LiquidationPage() {
    const worker = await getCurrentWorkerProfile();
    if (!worker) return <div className="p-12 text-center text-slate-500">Perfil no encontrado.</div>;

    const liquidations = await getWorkerLiquidations(worker.id);

    const totalEarned = liquidations.filter(l => l.estado === 'paid').reduce((s, l) => s + (l.total_ars || 0), 0);
    const totalHours = liquidations.reduce((s, l) => s + (l.total_horas || 0), 0);
    const lastLiq = liquidations[0];

    return (
        <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in duration-700 pb-16">
            {/* Header */}
            <div className="border-b border-slate-800/50 pb-6">
                <h1 className="text-3xl font-extrabold text-white tracking-tight">Mis Liquidaciones</h1>
                <p className="text-slate-400 mt-1 font-medium">Historial de pagos y detalles mensuales.</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-emerald-900/20 to-slate-900 border border-emerald-500/20 rounded-2xl p-5">
                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-2">Total Cobrado</p>
                    <p className="text-2xl font-black text-white">${totalEarned.toLocaleString()}</p>
                    <p className="text-emerald-500/60 text-[11px] mt-1">{liquidations.filter(l => l.estado === 'paid').length} liquidaciones pagas</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Horas Totales</p>
                    <p className="text-2xl font-black text-white">{totalHours}h</p>
                    <p className="text-slate-600 text-[11px] mt-1">Registradas en el sistema</p>
                </div>
                <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Valor/Hora</p>
                    <p className="text-2xl font-black text-white">${(worker.valor_hora_ars || 0).toLocaleString()}</p>
                    <p className="text-slate-600 text-[11px] mt-1">Tarifa actual</p>
                </div>
            </div>

            {/* Timeline */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold text-white">Historial detallado</h2>

                {liquidations.length === 0 ? (
                    <div className="text-center py-20 border border-dashed border-slate-800 rounded-3xl">
                        <DollarSign size={40} className="mx-auto text-slate-700 mb-4" />
                        <p className="text-slate-500">No hay liquidaciones registradas aún.</p>
                        <p className="text-slate-600 text-sm mt-1">Las liquidaciones son generadas por administración cada mes.</p>
                    </div>
                ) : (
                    liquidations.map((liq, idx) => {
                        const status = STATUS_CONFIG[liq.estado as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                        const tc = liq.tc_liquidacion || 1;
                        const mesLabel = new Date(liq.mes + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

                        return (
                            <div
                                key={liq.id}
                                className={`bg-slate-900/40 border border-slate-800/60 rounded-3xl overflow-hidden ${idx === 0 ? 'border-indigo-500/20 bg-indigo-500/5' : ''}`}
                            >
                                {/* Header row */}
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${idx === 0 ? 'bg-indigo-500/10 border-indigo-500/20' : 'bg-slate-900 border-slate-800'}`}>
                                            <Calendar className={idx === 0 ? 'text-indigo-400' : 'text-slate-500'} size={20} />
                                        </div>
                                        <div>
                                            <h3 className="font-bold text-white capitalize">{mesLabel}</h3>
                                            {idx === 0 && <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Más reciente</span>}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 flex-wrap">
                                        <div className="text-right">
                                            <p className="text-2xl font-black text-white">${(liq.total_ars || 0).toLocaleString()}</p>
                                            {liq.total_usd && (
                                                <p className="text-xs text-slate-400">≈ USD {liq.total_usd.toFixed(2)} @ {tc}</p>
                                            )}
                                        </div>
                                        <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase border ${status.color}`}>
                                            {status.label}
                                        </span>
                                    </div>
                                </div>

                                {/* Details row */}
                                <div className="border-t border-slate-800/50 px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950/20">
                                    <div>
                                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">Horas</p>
                                        <div className="flex items-center gap-1.5">
                                            <Clock size={13} className="text-slate-500" />
                                            <span className="font-mono font-bold text-slate-300 text-sm">{liq.total_horas}h</span>
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">Valor/hora</p>
                                        <span className="font-mono font-bold text-slate-300 text-sm">
                                            ${(liq.valor_hora_snapshot || 0).toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">TC Liquidación</p>
                                        <span className="font-mono font-bold text-slate-300 text-sm">{tc}</span>
                                    </div>
                                    <div>
                                        <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest mb-1">Fecha de Pago</p>
                                        <span className="font-mono font-bold text-slate-300 text-sm">
                                            {liq.fecha_pago
                                                ? new Date(liq.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR')
                                                : '---'}
                                        </span>
                                    </div>
                                </div>

                                {liq.observaciones && (
                                    <div className="px-6 py-3 bg-amber-500/5 border-t border-amber-500/10">
                                        <p className="text-xs text-amber-400/80 font-medium">💬 {liq.observaciones}</p>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
