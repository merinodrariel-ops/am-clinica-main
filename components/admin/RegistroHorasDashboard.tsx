'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Clock, TrendingUp, Users, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { getResumenHorasMes, getRegistrosHorasMes, ResumenMes, RegistroHoras } from '@/app/actions/registro-horas';
import { Fragment } from 'react';

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

function currentMes() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const COLORS = [
    '#6366f1', '#8b5cf6', '#a855f7', '#c084fc',
    '#818cf8', '#60a5fa', '#34d399', '#f59e0b',
];

export default function RegistroHorasDashboard() {
    const [mes, setMes] = useState(currentMes());
    const [resumen, setResumen] = useState<ResumenMes | null>(null);
    const [resumenPrev, setResumenPrev] = useState<ResumenMes | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedPrestadorId, setExpandedPrestadorId] = useState<string | null>(null);
    const [detalleByPrestador, setDetalleByPrestador] = useState<Record<string, RegistroHoras[]>>({});
    const [loadingDetalleId, setLoadingDetalleId] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const prev = prevMes(mes);
        Promise.all([
            getResumenHorasMes(mes),
            getResumenHorasMes(prev),
        ]).then(([curr, prevData]) => {
            setResumen(curr);
            setResumenPrev(prevData);
        }).catch(console.error)
            .finally(() => setLoading(false));
    }, [mes]);

    // Build chart data: merge current and previous by provider name
    const chartData = (() => {
        if (!resumen) return [];
        return resumen.prestadores.map(e => {
            const prevEmp = resumenPrev?.prestadores.find(
                p => p.personal_id === e.personal_id
            );
            return {
                nombre: e.apellido ? `${e.apellido.split(' ')[0]}` : e.nombre,
                [mesLabel(mes)]: e.total_horas,
                [mesLabel(prevMes(mes))]: prevEmp?.total_horas ?? 0,
            };
        });
    })();

    const diff = resumen && resumenPrev
        ? resumen.total_horas - resumenPrev.total_horas
        : null;

    async function toggleDetallePrestador(personalId: string) {
        if (expandedPrestadorId === personalId) {
            setExpandedPrestadorId(null);
            return;
        }

        setExpandedPrestadorId(personalId);
        if (detalleByPrestador[personalId]) return;

        setLoadingDetalleId(personalId);
        try {
            const rows = await getRegistrosHorasMes(mes, personalId);
            setDetalleByPrestador(prev => ({ ...prev, [personalId]: rows }));
        } catch (error) {
            console.error('Error loading provider schedule detail:', error);
            setDetalleByPrestador(prev => ({ ...prev, [personalId]: [] }));
        } finally {
            setLoadingDetalleId(null);
        }
    }

    return (
        <div className="space-y-6">
            {/* Header + month nav */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20">
                        <Clock size={18} className="text-blue-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">Registro de Horas</h2>
                        <p className="text-xs text-slate-400">Comparación mes a mes · datos importados de Prosoft</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                    <button onClick={() => setMes(prevMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                        <ChevronLeft size={16} />
                    </button>
                    <span className="text-sm font-medium text-white min-w-[80px] text-center">{mesLabel(mes)}</span>
                    <button onClick={() => setMes(nextMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20 text-slate-500">
                    <RefreshCw size={20} className="animate-spin mr-2" /> Cargando...
                </div>
            ) : !resumen || resumen.prestadores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-500">
                    <Clock size={36} className="text-slate-700 mb-3" />
                    <p>No hay registros de horas para {mesLabel(mes)}</p>
                    <p className="text-xs text-slate-600 mt-1">Importá la planilla Prosoft para ver los datos</p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock size={13} className="text-blue-400" />
                                <span className="text-xs text-slate-400">Total horas</span>
                            </div>
                            <p className="text-xl font-bold text-white">{resumen.total_horas}h</p>
                            {diff !== null && (
                                <p className={`text-xs mt-1 ${diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {diff >= 0 ? '+' : ''}{Math.round(diff * 10) / 10}h vs {mesLabel(prevMes(mes))}
                                </p>
                            )}
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Users size={13} className="text-violet-400" />
                                <span className="text-xs text-slate-400">Prestadores activos</span>
                            </div>
                            <p className="text-xl font-bold text-white">{resumen.prestadores.length}</p>
                            {resumenPrev && (
                                <p className="text-xs text-slate-500 mt-1">vs {resumenPrev.prestadores.length} en {mesLabel(prevMes(mes))}</p>
                            )}
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <TrendingUp size={13} className="text-teal-400" />
                                <span className="text-xs text-slate-400">Prom. por prestador</span>
                            </div>
                            <p className="text-xl font-bold text-white">
                                {resumen.prestadores.length > 0
                                    ? `${Math.round(resumen.total_horas / resumen.prestadores.length * 10) / 10}h`
                                    : '—'
                                }
                            </p>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock size={13} className="text-amber-400" />
                                <span className="text-xs text-slate-400">Días-persona</span>
                            </div>
                            <p className="text-xl font-bold text-white">{resumen.total_dias_persona}</p>
                        </div>
                    </div>

                    {/* Bar chart: current vs previous */}
                    {chartData.length > 0 && (
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide mb-4">
                                Horas por prestador — {mesLabel(prevMes(mes))} vs {mesLabel(mes)}
                            </p>
                            <ResponsiveContainer width="100%" height={220}>
                                <BarChart data={chartData} barGap={4} margin={{ left: -10, right: 10 }}>
                                    <XAxis dataKey="nombre" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} unit="h" />
                                    <Tooltip
                                        contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                                        labelStyle={{ color: '#e2e8f0' }}
                                        formatter={(v: number | string | undefined) => [typeof v === 'number' ? `${v}h` : v || '0h']}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
                                    <Bar dataKey={mesLabel(prevMes(mes))} fill="#334155" radius={[3, 3, 0, 0]} />
                                    <Bar dataKey={mesLabel(mes)} radius={[3, 3, 0, 0]}>
                                        {chartData.map((_, i) => (
                                            <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}

                    {/* Detail table */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-800">
                            <p className="text-xs font-semibold text-slate-300 uppercase tracking-wide">Detalle {mesLabel(mes)}</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400">
                                        <th className="px-4 py-2.5 text-left font-medium">Prestador</th>
                                        <th className="px-3 py-2.5 text-center font-medium">Días</th>
                                        <th className="px-3 py-2.5 text-right font-medium">{mesLabel(prevMes(mes))}</th>
                                        <th className="px-3 py-2.5 text-right font-medium">{mesLabel(mes)}</th>
                                        <th className="px-3 py-2.5 text-right font-medium">Dif.</th>
                                        <th className="px-3 py-2.5 text-right font-medium">Prom/día</th>
                                        <th className="px-3 py-2.5 text-center font-medium">Horario</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {resumen.prestadores.map(e => {
                                        const prev = resumenPrev?.prestadores.find(p => p.personal_id === e.personal_id);
                                        const dif = prev ? e.total_horas - prev.total_horas : null;
                                        const horario = e.hora_ingreso_min && e.hora_egreso_max
                                            ? `${e.hora_ingreso_min} – ${e.hora_egreso_max}`
                                            : '—';
                                        const isExpanded = expandedPrestadorId === e.personal_id;
                                        const detalleRows = detalleByPrestador[e.personal_id] || [];
                                        const isLoadingDetail = loadingDetalleId === e.personal_id;
                                        return (
                                            <Fragment key={e.personal_id}>
                                                <tr className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-2.5">
                                                        <button
                                                            onClick={() => { void toggleDetallePrestador(e.personal_id); }}
                                                            className="text-left group"
                                                        >
                                                            <p className="text-white font-medium group-hover:text-blue-300 transition-colors">
                                                                {e.apellido ? `${e.apellido}, ${e.nombre}` : e.nombre}
                                                            </p>
                                                            <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
                                                                {isExpanded ? 'Ocultar horarios' : 'Ver detalle de horarios'}
                                                            </p>
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-2.5 text-center text-slate-300">{e.dias}</td>
                                                    <td className="px-3 py-2.5 text-right text-slate-500">
                                                        {prev ? `${prev.total_horas}h` : '—'}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right font-semibold text-blue-400">{e.total_horas}h</td>
                                                    <td className={`px-3 py-2.5 text-right font-medium ${dif === null ? 'text-slate-600' : dif > 0 ? 'text-emerald-400' : dif < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                                                        {dif === null ? '—' : `${dif > 0 ? '+' : ''}${Math.round(dif * 10) / 10}h`}
                                                    </td>
                                                    <td className="px-3 py-2.5 text-right text-slate-300">{e.prom_horas_dia}h</td>
                                                    <td className="px-3 py-2.5 text-center text-slate-400 font-mono text-[10px]">{horario}</td>
                                                </tr>

                                                {isExpanded && (
                                                    <tr className="bg-slate-900/60">
                                                        <td colSpan={7} className="px-4 py-3 border-t border-slate-800/70">
                                                            {isLoadingDetail ? (
                                                                <div className="text-xs text-slate-400 flex items-center gap-2 py-3">
                                                                    <RefreshCw size={12} className="animate-spin" /> Cargando horarios...
                                                                </div>
                                                            ) : detalleRows.length === 0 ? (
                                                                <div className="text-xs text-slate-500 py-3">No hay registros de horarios para este prestador en {mesLabel(mes)}.</div>
                                                            ) : (
                                                                <div className="max-h-56 overflow-auto rounded-lg border border-slate-800">
                                                                    <table className="w-full text-[11px]">
                                                                        <thead className="bg-slate-900/90 sticky top-0">
                                                                            <tr className="text-slate-400">
                                                                                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                                                                                <th className="text-left px-3 py-2 font-medium">Ingreso</th>
                                                                                <th className="text-left px-3 py-2 font-medium">Egreso</th>
                                                                                <th className="text-right px-3 py-2 font-medium">Horas</th>
                                                                                <th className="text-left px-3 py-2 font-medium">Estado</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-slate-800/70">
                                                                            {[...detalleRows]
                                                                                .sort((a, b) => a.fecha.localeCompare(b.fecha))
                                                                                .map((reg) => (
                                                                                    <tr key={reg.id} className="text-slate-300 hover:bg-slate-800/40">
                                                                                        <td className="px-3 py-1.5">
                                                                                            {new Date(`${reg.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                                                        </td>
                                                                                        <td className="px-3 py-1.5 font-mono">{reg.hora_ingreso || '--:--'}</td>
                                                                                        <td className="px-3 py-1.5 font-mono">{reg.hora_egreso || '--:--'}</td>
                                                                                        <td className="px-3 py-1.5 text-right">{Number(reg.horas || 0).toFixed(2)}h</td>
                                                                                        <td className="px-3 py-1.5">{reg.estado || '—'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-700 bg-slate-800/40 font-semibold">
                                        <td className="px-4 py-2.5 text-white">TOTAL</td>
                                        <td className="px-3 py-2.5 text-center text-slate-300">{resumen.total_dias_persona}</td>
                                        <td className="px-3 py-2.5 text-right text-slate-500">
                                            {resumenPrev ? `${resumenPrev.total_horas}h` : '—'}
                                        </td>
                                        <td className="px-3 py-2.5 text-right text-blue-300">{resumen.total_horas}h</td>
                                        <td className={`px-3 py-2.5 text-right ${diff === null ? '' : diff >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {diff === null ? '—' : `${diff >= 0 ? '+' : ''}${Math.round(diff * 10) / 10}h`}
                                        </td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
