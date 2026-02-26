'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
    Wallet, RefreshCw, ChevronLeft, ChevronRight,
    CheckCircle2, Clock, Banknote, AlertTriangle, XCircle, Play,
    DollarSign, TrendingUp, Users, FileVideo, FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getLiquidacionesAdmin,
    generateLiquidacion,
    approveLiquidacion,
    markLiquidacionPaid,
    rejectLiquidacion,
    LiquidacionAdminRow,
} from '@/app/actions/liquidaciones';

const ProsoftImporter = dynamic(() => import('@/components/portal/ProsoftImporter'), { ssr: false });

// ─── helpers ─────────────────────────────────────────────────────────────────

function mesLabel(ym: string) {
    const [y, m] = ym.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${meses[parseInt(m) - 1]} ${y}`;
}

function prevMes(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMes(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatARS(n: number) {
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function formatUSD(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

const ESTADO_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    pending:  { label: 'Pendiente', icon: <Clock size={12} />, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    approved: { label: 'Aprobada',  icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    paid:     { label: 'Pagada',    icon: <Banknote size={12} />, cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    rejected: { label: 'Rechazada', icon: <XCircle size={12} />, cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

// ─── PayDateModal ─────────────────────────────────────────────────────────────

function PayDateModal({ onConfirm, onClose }: { onConfirm: (d: string) => void; onClose: () => void }) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-80 shadow-2xl">
                <h3 className="text-white font-semibold mb-3">Fecha de pago</h3>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-4"
                />
                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(date)}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        Confirmar pago
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiquidacionesPage() {
    const now = new Date();
    const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [tab, setTab] = useState<'liquidaciones' | 'prosoft'>('liquidaciones');
    const [mes, setMes] = useState(defaultMes);
    const [rows, setRows] = useState<LiquidacionAdminRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState<string | null>(null);
    const [payModal, setPayModal] = useState<string | null>(null); // liq id
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'sin_generar'>('all');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getLiquidacionesAdmin(mes);
            setRows(data);
        } catch {
            toast.error('Error al cargar liquidaciones');
        } finally {
            setLoading(false);
        }
    }, [mes]);

    useEffect(() => { load(); }, [load]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const totalArs = rows.reduce((s, r) => s + Number(r.liquidacion?.total_ars || 0), 0);
    const conLiq = rows.filter(r => r.liquidacion).length;
    const sinLiq = rows.filter(r => !r.liquidacion).length;
    const pendientes = rows.filter(r => r.liquidacion?.estado === 'pending').length;
    const withPendSlides = rows.filter(r => r.tiene_pendientes).length;

    // Sample TC from first liquidacion that has it
    const tcBna = rows.find(r => r.liquidacion?.tc_bna_venta)?.liquidacion?.tc_bna_venta;

    // ── Filter ───────────────────────────────────────────────────────────────
    const filteredRows = rows.filter(r => {
        if (filter === 'all') return true;
        if (filter === 'sin_generar') return !r.liquidacion;
        return r.liquidacion?.estado === filter;
    });

    // ── Actions ──────────────────────────────────────────────────────────────
    async function handleGenerate(personalId: string) {
        setGenerating(personalId);
        try {
            await generateLiquidacion(personalId, mes);
            toast.success('Liquidación generada');
            load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al generar');
        } finally {
            setGenerating(null);
        }
    }

    async function handleApprove(liqId: string) {
        try {
            await approveLiquidacion(liqId);
            toast.success('Liquidación aprobada');
            load();
        } catch {
            toast.error('Error al aprobar');
        }
    }

    async function handlePay(liqId: string, date: string) {
        try {
            await markLiquidacionPaid(liqId, date);
            toast.success('Liquidación marcada como pagada');
            setPayModal(null);
            load();
        } catch {
            toast.error('Error al registrar pago');
        }
    }

    async function handleReject(liqId: string) {
        const motivo = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
        try {
            await rejectLiquidacion(liqId, motivo);
            toast.success('Liquidación rechazada');
            load();
        } catch {
            toast.error('Error al rechazar');
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-950 text-white p-6">
            {payModal && (
                <PayDateModal
                    onConfirm={(d) => handlePay(payModal, d)}
                    onClose={() => setPayModal(null)}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/20">
                        <Wallet size={22} className="text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Liquidaciones</h1>
                        <p className="text-xs text-slate-400">Gestión de pagos al equipo</p>
                    </div>
                </div>

                {tab === 'liquidaciones' && (
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                        <button onClick={() => setMes(prevMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-medium text-white min-w-[80px] text-center">{mesLabel(mes)}</span>
                        <button onClick={() => setMes(nextMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5">
                <button
                    onClick={() => setTab('liquidaciones')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === 'liquidaciones' ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <Wallet size={14} />
                    Liquidaciones
                </button>
                <button
                    onClick={() => setTab('prosoft')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === 'prosoft' ? 'bg-teal-600 border-teal-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <FileSpreadsheet size={14} />
                    Importar Prosoft
                </button>
            </div>

            {tab === 'prosoft' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <ProsoftImporter />
                </div>
            )}

            {tab === 'liquidaciones' && <>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <TrendingUp size={14} className="text-violet-400" />
                        <span className="text-xs text-slate-400">Total nómina</span>
                    </div>
                    <p className="text-lg font-bold text-white">{formatARS(totalArs)}</p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <DollarSign size={14} className="text-emerald-400" />
                        <span className="text-xs text-slate-400">TC BNA Venta</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                        {tcBna ? `$${Number(tcBna).toLocaleString('es-AR')}` : '—'}
                    </p>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <Users size={14} className="text-blue-400" />
                        <span className="text-xs text-slate-400">Generadas / Total</span>
                    </div>
                    <p className="text-lg font-bold text-white">{conLiq} / {rows.length}</p>
                    {sinLiq > 0 && (
                        <p className="text-xs text-amber-400 mt-0.5">{sinLiq} sin generar</p>
                    )}
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={14} className="text-amber-400" />
                        <span className="text-xs text-slate-400">Con alertas</span>
                    </div>
                    <p className="text-lg font-bold text-white">{withPendSlides}</p>
                    {pendientes > 0 && (
                        <p className="text-xs text-amber-400 mt-0.5">{pendientes} pendientes de aprobación</p>
                    )}
                </div>
            </div>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {([
                    ['all', 'Todos', rows.length],
                    ['sin_generar', 'Sin generar', sinLiq],
                    ['pending', 'Pendiente', pendientes],
                    ['approved', 'Aprobada', rows.filter(r => r.liquidacion?.estado === 'approved').length],
                    ['paid', 'Pagada', rows.filter(r => r.liquidacion?.estado === 'paid').length],
                ] as const).map(([val, label, count]) => (
                    <button
                        key={val}
                        onClick={() => setFilter(val as typeof filter)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            filter === val
                                ? 'bg-violet-600 border-violet-500 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                        }`}
                    >
                        {label} ({count})
                    </button>
                ))}

                <button
                    onClick={load}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
                >
                    <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                    Actualizar
                </button>
            </div>

            {/* Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-500">
                        <RefreshCw size={20} className="animate-spin mr-2" />
                        Cargando...
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="text-center py-16 text-slate-500 text-sm">
                        No hay liquidaciones que coincidan con el filtro.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-800">
                                    <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Prestador</th>
                                    <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Modelo</th>
                                    <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Monto</th>
                                    <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Estado</th>
                                    <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50">
                                {filteredRows.map(row => {
                                    const liq = row.liquidacion;
                                    const estadoCfg = liq ? ESTADO_CONFIG[liq.estado] : null;
                                    const isGenerating = generating === row.personal_id;

                                    return (
                                        <tr key={row.personal_id} className="hover:bg-slate-800/30 transition-colors">
                                            {/* Prestador */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    {row.foto_url ? (
                                                        // eslint-disable-next-line @next/next/no-img-element
                                                        <img src={row.foto_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                                            {row.nombre[0]}{row.apellido?.[0] || ''}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-medium text-white text-xs">
                                                            {row.nombre} {row.apellido}
                                                        </p>
                                                        <p className="text-xs text-slate-500">{row.area || '—'}</p>
                                                    </div>
                                                    {row.tiene_pendientes && (
                                                        <div title="Prestaciones sin Slides" className="ml-1">
                                                            <FileVideo size={14} className="text-amber-400" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Modelo */}
                                            <td className="px-4 py-3">
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${
                                                    row.modelo_pago === 'prestacion_usd'
                                                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                                                        : 'bg-teal-500/10 text-teal-300 border-teal-500/20'
                                                }`}>
                                                    {row.modelo_pago === 'prestacion_usd' ? '$ USD/prestación' : '⏱ ARS/hora'}
                                                </span>
                                            </td>

                                            {/* Monto */}
                                            <td className="px-4 py-3 text-right">
                                                {liq ? (
                                                    <div>
                                                        <p className="font-semibold text-white">{formatARS(Number(liq.total_ars || 0))}</p>
                                                        {liq.total_usd && (
                                                            <p className="text-xs text-slate-400">{formatUSD(Number(liq.total_usd))}</p>
                                                        )}
                                                        {liq.prestaciones_pendientes > 0 && (
                                                            <p className="text-xs text-amber-400">
                                                                +{liq.prestaciones_pendientes} sin slides
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-600 text-xs">—</span>
                                                )}
                                            </td>

                                            {/* Estado */}
                                            <td className="px-4 py-3 text-center">
                                                {estadoCfg ? (
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${estadoCfg.cls}`}>
                                                        {estadoCfg.icon}
                                                        {estadoCfg.label}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-600 text-xs">Sin liquidar</span>
                                                )}
                                            </td>

                                            {/* Acciones */}
                                            <td className="px-4 py-3">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {!liq && (
                                                        <button
                                                            onClick={() => handleGenerate(row.personal_id)}
                                                            disabled={isGenerating}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
                                                        >
                                                            {isGenerating
                                                                ? <RefreshCw size={11} className="animate-spin" />
                                                                : <Play size={11} />
                                                            }
                                                            Generar
                                                        </button>
                                                    )}

                                                    {liq?.estado === 'pending' && (
                                                        <>
                                                            <button
                                                                onClick={() => handleGenerate(row.personal_id)}
                                                                disabled={isGenerating}
                                                                className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg text-xs transition-colors"
                                                                title="Recalcular"
                                                            >
                                                                <RefreshCw size={11} className={isGenerating ? 'animate-spin' : ''} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleApprove(liq.id)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs transition-colors"
                                                            >
                                                                <CheckCircle2 size={11} />
                                                                Aprobar
                                                            </button>
                                                            <button
                                                                onClick={() => handleReject(liq.id)}
                                                                className="px-2 py-1.5 text-red-400 hover:text-red-300 text-xs transition-colors"
                                                                title="Rechazar"
                                                            >
                                                                <XCircle size={14} />
                                                            </button>
                                                        </>
                                                    )}

                                                    {liq?.estado === 'approved' && (
                                                        <button
                                                            onClick={() => setPayModal(liq.id)}
                                                            className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition-colors"
                                                        >
                                                            <Banknote size={11} />
                                                            Marcar pagada
                                                        </button>
                                                    )}

                                                    {liq?.estado === 'paid' && (
                                                        <span className="text-xs text-slate-500">
                                                            {liq.fecha_pago
                                                                ? new Date(liq.fecha_pago).toLocaleDateString('es-AR')
                                                                : 'Pagada'}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                    <FileVideo size={12} className="text-amber-400" />
                    Prestaciones sin link de Google Slides (no se incluyen en el cálculo)
                </span>
            </div>

            </>}
        </div>
    );
}
