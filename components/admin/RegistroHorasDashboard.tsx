'use client';

import { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { Clock, TrendingUp, Users, ChevronLeft, ChevronRight, RefreshCw, X } from 'lucide-react';
import { getResumenHorasMes, getRegistrosHorasMes, editarRegistroHoras, ResumenMes, ResumenPrestador, RegistroHoras } from '@/app/actions/registro-horas';
import { calculateWorkedHours } from '@/lib/caja-admin/attendance-utils';
import { toast } from 'sonner';

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
    const [detalleModalPrestador, setDetalleModalPrestador] = useState<ResumenPrestador | null>(null);
    const [detalleByPrestador, setDetalleByPrestador] = useState<Record<string, RegistroHoras[]>>({});
    const [loadingDetalleId, setLoadingDetalleId] = useState<string | null>(null);
    const [editingRegistro, setEditingRegistro] = useState<RegistroHoras | null>(null);
    const [editForm, setEditForm] = useState({
        hora_ingreso: '',
        hora_egreso: '',
        salida_dia_siguiente: false,
        motivo: ''
    });
    const [submitting, setSubmitting] = useState(false);

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

    async function openDetallePrestador(prestador: ResumenPrestador) {
        const personalId = prestador.personal_id;
        setDetalleModalPrestador(prestador);
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

    async function handleSaveEdit() {
        if (!editingRegistro) return;
        if (!editForm.motivo.trim()) {
            toast.error('Debe ingresar un motivo para la corrección');
            return;
        }

        setSubmitting(true);
        try {
            const horas = calculateWorkedHours({
                horaIngreso: editForm.hora_ingreso,
                horaEgreso: editForm.hora_egreso,
                salidaDiaSiguiente: editForm.salida_dia_siguiente
            });

            const res = await editarRegistroHoras({
                registroId: editingRegistro.id,
                motivo: editForm.motivo,
                cambios: {
                    hora_ingreso: editForm.hora_ingreso,
                    hora_egreso: editForm.hora_egreso,
                    salida_dia_siguiente: editForm.salida_dia_siguiente,
                    horas
                }
            });

            if (res.success) {
                toast.success('Registro actualizado correctamente');
                setEditingRegistro(null);
                // Refresh detail
                const pid = editingRegistro.personal_id;
                const rows = await getRegistrosHorasMes(mes, pid);
                setDetalleByPrestador(prev => ({ ...prev, [pid]: rows }));
                // Also refresh main summary
                const curr = await getResumenHorasMes(mes);
                setResumen(curr);
            } else {
                toast.error(res.error || 'Error al actualizar');
            }
        } catch (error) {
            console.error(error);
            toast.error('Error inesperado');
        } finally {
            setSubmitting(false);
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
                                        return (
                                            <tr key={e.personal_id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <button
                                                        onClick={() => { void openDetallePrestador(e); }}
                                                        className="text-left group"
                                                    >
                                                        <p className="text-white font-medium group-hover:text-blue-300 transition-colors">
                                                            {e.apellido ? `${e.apellido}, ${e.nombre}` : e.nombre}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500 group-hover:text-slate-300 transition-colors">
                                                            Ver detalle de horarios
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

            {detalleModalPrestador && (
                <div className="fixed inset-0 z-50 bg-black/70 p-4 md:p-8 overflow-y-auto">
                    <div className="max-w-4xl mx-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                            <div>
                                <h3 className="text-white font-semibold">Detalle de horarios</h3>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {detalleModalPrestador.apellido ? `${detalleModalPrestador.apellido}, ${detalleModalPrestador.nombre}` : detalleModalPrestador.nombre} · {mesLabel(mes)}
                                </p>
                            </div>
                            <button
                                onClick={() => setDetalleModalPrestador(null)}
                                className="text-slate-400 hover:text-white text-sm transition-colors"
                                aria-label="Cerrar"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="p-5">
                            {loadingDetalleId === detalleModalPrestador.personal_id ? (
                                <div className="flex items-center justify-center py-16 text-slate-500">
                                    <RefreshCw size={18} className="animate-spin mr-2" />
                                    Cargando detalle...
                                </div>
                            ) : (detalleByPrestador[detalleModalPrestador.personal_id] || []).length === 0 ? (
                                <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                                    No hay registros de horarios para este prestador en {mesLabel(mes)}.
                                </div>
                            ) : (
                                <div className="max-h-[65vh] overflow-auto rounded-lg border border-slate-800">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-900/90 sticky top-0">
                                            <tr className="text-slate-400">
                                                <th className="text-left px-3 py-2 font-medium">Fecha</th>
                                                <th className="text-left px-3 py-2 font-medium">Ingreso</th>
                                                <th className="text-left px-3 py-2 font-medium">Egreso</th>
                                                <th className="text-right px-3 py-2 font-medium">Horas</th>
                                                <th className="text-left px-3 py-2 font-medium">Estado</th>
                                                <th className="text-left px-3 py-2 font-medium">Observaciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800/70">
                                            {[...(detalleByPrestador[detalleModalPrestador.personal_id] || [])]
                                                .sort((a, b) => a.fecha.localeCompare(b.fecha))
                                                .map((reg) => (
                                                    <tr key={reg.id} className="text-slate-300 hover:bg-slate-800/40">
                                                        <td className="px-3 py-1.5">
                                                            {new Date(`${reg.fecha}T12:00:00`).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono">
                                                            {reg.hora_ingreso || '--:--'}
                                                        </td>
                                                        <td className="px-3 py-1.5 font-mono">
                                                            <div className="flex items-center gap-1">
                                                                {reg.hora_egreso || '--:--'}
                                                                {reg.salida_dia_siguiente && (
                                                                    <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 font-sans">
                                                                        +1 día
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-3 py-1.5 text-right">{Number(reg.horas || 0).toFixed(2)}h</td>
                                                        <td className="px-3 py-1.5">
                                                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                                                reg.estado === 'Observado' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                                                                reg.estado === 'OK' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                                                                'bg-slate-700 text-slate-400'
                                                            }`}>
                                                                {reg.estado || '—'}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-1.5">
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="truncate max-w-[150px]">{reg.observaciones || '—'}</span>
                                                                <button
                                                                    onClick={() => {
                                                                        setEditingRegistro(reg);
                                                                        setEditForm({
                                                                            hora_ingreso: reg.hora_ingreso || '',
                                                                            hora_egreso: reg.hora_egreso || '',
                                                                            salida_dia_siguiente: reg.salida_dia_siguiente || false,
                                                                            motivo: ''
                                                                        });
                                                                    }}
                                                                    className="p-1 hover:bg-blue-500/20 text-blue-400 rounded transition-colors"
                                                                    title="Editar registro"
                                                                >
                                                                    <TrendingUp size={12} className="rotate-90" />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {editingRegistro && (
                <div className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/50">
                            <h4 className="font-semibold text-white">Editar marcación</h4>
                            <button onClick={() => setEditingRegistro(null)} className="text-slate-500 hover:text-white">
                                <X size={18} />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Ingreso</label>
                                    <input
                                        type="time"
                                        value={editForm.hora_ingreso}
                                        onChange={e => setEditForm(prev => ({ ...prev, hora_ingreso: e.target.value }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Egreso</label>
                                    <input
                                        type="time"
                                        value={editForm.hora_egreso}
                                        onChange={e => setEditForm(prev => ({ ...prev, hora_egreso: e.target.value }))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                    />
                                </div>
                            </div>

                            <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl p-3">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={editForm.salida_dia_siguiente}
                                        onChange={e => setEditForm(prev => ({ ...prev, salida_dia_siguiente: e.target.checked }))}
                                        className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-offset-slate-900"
                                    />
                                    <div>
                                        <p className="text-sm font-medium text-blue-200">Salida al día siguiente</p>
                                        <p className="text-[11px] text-blue-400/70">Marca esto si el turno cruza la medianoche.</p>
                                    </div>
                                </label>
                            </div>

                            <div className="flex items-center justify-between px-1 text-slate-400">
                                <span className="text-xs">Cálculo estimado:</span>
                                <span className="text-sm font-bold text-white">
                                    {calculateWorkedHours({
                                        horaIngreso: editForm.hora_ingreso,
                                        horaEgreso: editForm.hora_egreso,
                                        salidaDiaSiguiente: editForm.salida_dia_siguiente
                                    })}h
                                </span>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Motivo del cambio</label>
                                <textarea
                                    value={editForm.motivo}
                                    onChange={e => setEditForm(prev => ({ ...prev, motivo: e.target.value }))}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white focus:ring-1 focus:ring-blue-500 outline-none text-sm min-h-[80px] resize-none"
                                    placeholder="Ej: Marcación incorrecta en Prosoft..."
                                />
                            </div>
                        </div>
                        <div className="px-5 py-4 border-t border-slate-800 bg-slate-800/30 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setEditingRegistro(null)}
                                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={submitting || !editForm.motivo.trim()}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:bg-slate-700 text-white rounded-xl text-sm font-semibold shadow-lg shadow-blue-900/20 transition-all"
                            >
                                {submitting ? 'Guardando...' : 'Aplicar corrección'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
