import { getCurrentWorkerProfile, getWorkerLiquidations } from '@/app/actions/worker-portal';
import { DollarSign, Calendar, FileText, CheckCircle, Clock, AlertCircle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

export default async function LiquidationPage() {
    const worker = await getCurrentWorkerProfile();

    if (!worker) {
        return <div className="p-12 text-center text-slate-500">Profile not found.</div>;
    }

    const liquidations = await getWorkerLiquidations(worker.id);

    return (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800/50 pb-8">
                <div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">Financial Transparency</h1>
                    <p className="text-slate-400 mt-2 font-medium">Review your earnings, liquidation status, and historical payments.</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Payment Model</p>
                        <p className="text-indigo-400 font-bold capitalize">{worker.rol === 'dentist' ? 'Commission Based' : 'Fixed / Hourly'}</p>
                    </div>
                </div>
            </div>

            {/* Liquidations List */}
            <div className="space-y-6">
                {liquidations.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4">
                        {liquidations.map((liq) => (
                            <div key={liq.id} className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl hover:bg-slate-900/60 transition-all group">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                                    {/* Period & Date */}
                                    <div className="flex items-center gap-6">
                                        <div className="w-16 h-16 rounded-2xl bg-slate-950/50 flex flex-col items-center justify-center border border-slate-800 group-hover:border-indigo-500/30 transition-colors">
                                            <span className="text-[10px] font-bold text-slate-500 uppercase">{new Date(liq.mes).toLocaleString('default', { month: 'short' })}</span>
                                            <span className="text-xl font-black text-white">{new Date(liq.mes).getFullYear().toString().slice(-2)}</span>
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-white tracking-tight">Monthly Liquidation</h4>
                                            <p className="text-slate-500 text-sm font-medium">
                                                Created on {new Date(liq.created_at).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Financial Totals */}
                                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-8 md:gap-12 flex-1 max-w-2xl">
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Gross Total</p>
                                            <p className="text-xl font-mono font-bold text-white">${liq.total_ars?.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">ARS</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">USD Equivalent</p>
                                            <p className="text-xl font-mono font-bold text-emerald-400">${liq.total_usd?.toLocaleString()}</p>
                                            <p className="text-[10px] text-slate-500 font-medium font-mono">@ {liq.tc_liquidacion}</p>
                                        </div>
                                        <div className="hidden lg:block">
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Hours/Units</p>
                                            <p className="text-xl font-mono font-bold text-slate-200">{liq.total_horas || liq.total_unidades || '---'}</p>
                                        </div>
                                    </div>

                                    {/* Status & Action */}
                                    <div className="flex items-center justify-between md:justify-end gap-6 border-t md:border-t-0 border-slate-800/50 pt-4 md:pt-0">
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-2">
                                                <div className={`w-2 h-2 rounded-full ${liq.estado === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                                <span className={`text-xs font-bold uppercase tracking-widest ${liq.estado === 'paid' ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                    {liq.estado}
                                                </span>
                                            </div>
                                            {liq.fecha_pago && (
                                                <p className="text-[10px] text-slate-500 mt-1 font-medium">Paid on {new Date(liq.fecha_pago).toLocaleDateString()}</p>
                                            )}
                                        </div>
                                        <button className="p-3 bg-slate-950 border border-slate-800 rounded-2xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
                                            <FileText size={20} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-slate-950/20 border border-slate-800/40 rounded-[3rem] p-24 text-center">
                        <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mx-auto mb-8 border border-slate-800">
                            <Clock className="text-slate-700" size={32} />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-300">No history yet</h3>
                        <p className="text-slate-500 mt-2 max-w-sm mx-auto font-medium">
                            Your liquidation history will appear here once your first payment period is finalized.
                        </p>
                    </div>
                )}
            </div>

            {/* Support Zone */}
            <div className="bg-gradient-to-br from-indigo-950/20 to-slate-900/40 border border-indigo-500/10 rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center justify-between gap-8">
                <div className="flex items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
                        <ArrowUpRight className="text-indigo-400" size={32} />
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-white tracking-tight">Financial Inquiry?</h3>
                        <p className="text-slate-400 text-sm font-medium mt-1">Contact the administrative department for any clarification regarding your settlements.</p>
                    </div>
                </div>
                <button className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-2xl transition-all shadow-xl shadow-indigo-500/20 whitespace-nowrap">
                    Contact Admin
                </button>
            </div>
        </div>
    );
}
