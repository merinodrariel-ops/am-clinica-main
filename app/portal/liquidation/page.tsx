import { getCurrentWorkerProfile, getWorkerLiquidations, getWorkerLogs } from '@/app/actions/worker-portal';
import { DollarSign, TrendingUp, Calendar, CheckCircle2, Clock, ArrowDown, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

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
    const workerLogs = await getWorkerLogs(worker.id);

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

            {/* Daily Breakdown */}
            <div className="mt-8">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Clock className="text-teal-400" size={20} />
                        Detalle Diario
                    </h2>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Últimos Registros</span>
                </div>

                <div className="grid gap-3">
                    {workerLogs.length === 0 ? (
                        <div className="bg-slate-900/50 rounded-xl border border-slate-800 p-8 text-center">
                            <Clock size={32} className="mx-auto text-slate-700 mb-3 opacity-20" />
                            <p className="text-slate-500 text-sm">No se encontraron registros diarios para este período.</p>
                        </div>
                    ) : (
                        workerLogs.map((log: any, idx: number) => {
                            const dailyEarning = worker?.valor_hora_ars ? log.horas * worker.valor_hora_ars : 0;
                            return (
                                <div key={idx} className="group relative overflow-hidden bg-slate-900/40 hover:bg-slate-800/40 border border-slate-800/60 rounded-xl p-4 transition-all duration-300">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-slate-800 border border-slate-700 flex flex-col items-center justify-center text-white">
                                                <span className="text-[10px] font-bold text-slate-500 uppercase">{format(new Date(log.fecha), 'EEE', { locale: es })}</span>
                                                <span className="text-lg font-bold leading-none">{format(new Date(log.fecha), 'dd')}</span>
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-white font-bold">{format(new Date(log.fecha), 'MMMM yyyy', { locale: es })}</span>
                                                    {log.estado === 'pending' && (
                                                        <span className="px-1.5 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20 text-teal-400 text-[9px] font-bold uppercase">Validado</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3 text-sm">
                                                    <div className="flex items-center gap-1 text-slate-400">
                                                        <ArrowRight size={12} className="text-teal-500" />
                                                        <span>{log.entrada}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-slate-400">
                                                        <ArrowLeft size={12} className="text-rose-500" />
                                                        <span>{log.salida}</span>
                                                    </div>
                                                    <div className="w-px h-3 bg-slate-700 mx-1" />
                                                    <span className="text-slate-300 font-medium">{log.horas} horas</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-6 text-right sm:pr-2">
                                            <div>
                                                <p className="text-[10px] text-slate-500 uppercase font-bold mb-0.5 tracking-tighter">Ganancia Estimada</p>
                                                <p className="text-lg font-black text-white">
                                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(dailyEarning)}
                                                </p>
                                            </div>
                                            <div className="text-teal-400/20 group-hover:text-teal-400/40 transition-colors">
                                                <Sparkles size={24} />
                                            </div>
                                        </div>
                                    </div>
                                    {/* Subtly highlight incomplete logs */}
                                    {log.horas === 0 && (
                                        <div className="absolute top-0 right-0 p-1">
                                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}

                    <p className="text-center text-[10px] text-slate-600 mt-2 uppercase tracking-[0.2em]">
                        * Las ganancias son estimadas en base al valor hora configurado.
                    </p>
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
