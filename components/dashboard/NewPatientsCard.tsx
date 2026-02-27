'use client';
// Redesigned version v1.2 - Added patient profile links

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UserPlus, TrendingUp, AlertCircle, ArrowRight, ChevronLeft, ChevronRight, User, Sparkles } from 'lucide-react';
import Link from 'next/link';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Area,
    AreaChart,
} from 'recharts';

interface MonthlyTrendPoint {
    key: string;
    label: string;
    shortLabel: string;
    count: number;
    startDate: string;
    endDate: string;
}

const MONTHS_TO_SHOW = 6;

function toDateOnly(date: Date) {
    return date.toISOString().split('T')[0];
}

function buildMonthSeries(baseDate: Date, monthsToShow: number): MonthlyTrendPoint[] {
    const months: MonthlyTrendPoint[] = [];

    for (let offset = monthsToShow - 1; offset >= 0; offset--) {
        const start = new Date(baseDate.getFullYear(), baseDate.getMonth() - offset, 1);
        const end = new Date(baseDate.getFullYear(), baseDate.getMonth() - offset + 1, 1);
        const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;

        months.push({
            key,
            label: start.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
            shortLabel: start
                .toLocaleDateString('es-AR', { month: 'short' })
                .replace('.', '')
                .slice(0, 3),
            count: 0,
            startDate: toDateOnly(start),
            endDate: toDateOnly(end),
        });
    }

    return months;
}

export default function NewPatientsCard() {
    const [loading, setLoading] = useState(true);
    const [sinSeguimiento, setSinSeguimiento] = useState(0);
    const [monthlyTrend, setMonthlyTrend] = useState<MonthlyTrendPoint[]>([]);
    const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
    const [recentPatients, setRecentPatients] = useState<Array<{
        id: string;
        nombre: string;
        fecha: string;
        fechaISO: string;
        tieneMovimientos: boolean;
    }>>([]);

    useEffect(() => {
        async function loadStats() {
            try {
                const now = new Date();
                const months = buildMonthSeries(now, MONTHS_TO_SHOW);
                const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

                const { data: pacientesMeses } = await supabase
                    .from('pacientes')
                    .select('id_paciente, nombre, apellido, primera_consulta_fecha')
                    .eq('is_deleted', false)
                    .not('primera_consulta_fecha', 'is', null)
                    .gte('primera_consulta_fecha', months[0].startDate)
                    .lt('primera_consulta_fecha', months[months.length - 1].endDate)
                    .order('primera_consulta_fecha', { ascending: false });

                const countsByMonth = months.reduce<Record<string, number>>((acc, month) => {
                    acc[month.key] = 0;
                    return acc;
                }, {});

                (pacientesMeses || []).forEach((paciente) => {
                    if (!paciente.primera_consulta_fecha) return;
                    const key = paciente.primera_consulta_fecha.slice(0, 7);
                    if (key in countsByMonth) {
                        countsByMonth[key] += 1;
                    }
                });

                const trend = months.map((month) => ({
                    ...month,
                    count: countsByMonth[month.key] || 0,
                }));

                setMonthlyTrend(trend);

                // Default to 6 months trend, but for filtering lists we can use selectedMonthKey
                setSelectedMonthKey(currentMonthKey);

                const hace30Dias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const hace90Dias = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

                const { data: pacientesPotenciales } = await supabase
                    .from('pacientes')
                    .select('id_paciente')
                    .eq('is_deleted', false)
                    .not('primera_consulta_fecha', 'is', null)
                    .gte('primera_consulta_fecha', hace90Dias.split('T')[0])
                    .lte('primera_consulta_fecha', hace30Dias.split('T')[0]);

                let sinSeguimientoTemp = 0;
                if (pacientesPotenciales && pacientesPotenciales.length > 0) {
                    const ids = pacientesPotenciales.map(p => p.id_paciente);
                    const hace60Dias = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
                    const { data: conMovimientos } = await supabase
                        .from('caja_recepcion_movimientos')
                        .select('paciente_id')
                        .in('paciente_id', ids)
                        .eq('estado', 'pagado')
                        .eq('is_deleted', false)
                        .gte('fecha_hora', hace60Dias);

                    const idsConMovimientos = new Set(conMovimientos?.map(m => m.paciente_id) || []);
                    sinSeguimientoTemp = ids.filter(id => !idsConMovimientos.has(id)).length;
                }

                setSinSeguimiento(sinSeguimientoTemp);

                // Fetch more for the monthly lists
                const recentIds = (pacientesMeses || []).map((p) => p.id_paciente);

                let idsConMovimientosRecientes = new Set<string>();
                if (recentIds.length > 0) {
                    const { data: movimientosRecientes } = await supabase
                        .from('caja_recepcion_movimientos')
                        .select('paciente_id')
                        .in('paciente_id', recentIds)
                        .eq('is_deleted', false)
                        .eq('estado', 'pagado');

                    idsConMovimientosRecientes = new Set(
                        (movimientosRecientes || [])
                            .map((movimiento) => movimiento.paciente_id)
                            .filter((id): id is string => Boolean(id))
                    );
                }

                const recentInfo = (pacientesMeses || []).map((paciente) => ({
                    id: paciente.id_paciente,
                    nombre: `${paciente.nombre} ${paciente.apellido}`,
                    fechaISO: paciente.primera_consulta_fecha,
                    fecha: new Date(`${paciente.primera_consulta_fecha}T12:00:00`).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: 'short',
                    }),
                    tieneMovimientos: idsConMovimientosRecientes.has(paciente.id_paciente),
                }));

                setRecentPatients(recentInfo);
            } catch (error) {
                console.error('Error loading new patients stats:', error);
            } finally {
                setLoading(false);
            }
        }
        loadStats();
    }, []);

    const selectedMonthIndex = monthlyTrend.findIndex((month) => month.key === selectedMonthKey);
    const selectedMonth = selectedMonthIndex >= 0
        ? monthlyTrend[selectedMonthIndex]
        : monthlyTrend[monthlyTrend.length - 1];

    // Filter patients by selected month key
    const filteredPatients = recentPatients.filter(p => p.fechaISO.startsWith(selectedMonthKey));

    const totalPeriodPatients = monthlyTrend.reduce((acc, m) => acc + m.count, 0);
    const growthRate = monthlyTrend.length >= 2
        ? Math.round(((monthlyTrend[monthlyTrend.length - 1].count - monthlyTrend[monthlyTrend.length - 2].count) / (monthlyTrend[monthlyTrend.length - 2].count || 1)) * 100)
        : 0;

    if (loading) {
        return (
            <div className="glass-card rounded-xl p-5 animate-pulse h-full">
                <div className="h-5 rounded w-1/3 mb-4" style={{ background: 'hsl(230 15% 18%)' }}></div>
                <div className="space-y-3">
                    <div className="h-10 rounded-lg" style={{ background: 'hsl(230 15% 16%)' }}></div>
                    <div className="h-10 rounded-lg" style={{ background: 'hsl(230 15% 16%)' }}></div>
                    <div className="h-40 rounded-lg" style={{ background: 'hsl(230 15% 16%)' }}></div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card rounded-xl overflow-hidden h-full flex flex-col p-5 bg-slate-900/40 border border-slate-800/50">
            {/* SVG Filter for Neon Glow */}
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur className="blur" stdDeviation="3" result="blur" />
                        <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
                    </linearGradient>
                </defs>
            </svg>

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <UserPlus size={18} className="text-teal-400" />
                        Nuevos Ingresos
                    </h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">Gestión de crecimiento</p>
                </div>

                <div className="flex items-center gap-1 bg-slate-950/40 rounded-lg border border-slate-800 p-0.5">
                    {monthlyTrend.map((m) => (
                        <button
                            key={m.key}
                            onClick={() => setSelectedMonthKey(m.key)}
                            className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all ${selectedMonthKey === m.key
                                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                                : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {m.shortLabel}
                        </button>
                    ))}
                </div>
            </div>

            {/* Monthly Patient List - PRIORITIZED */}
            <div className="flex-1 min-h-[220px] mb-8">
                <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        Pacientes de {selectedMonth.label}
                    </span>
                    <span className="text-[10px] font-bold bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded-full border border-teal-500/20">
                        {filteredPatients.length} nuevos
                    </span>
                </div>

                <div className="grid grid-cols-1 gap-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {filteredPatients.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 grayscale opacity-30">
                            <User size={30} className="text-slate-600 mb-2" />
                            <p className="text-xs text-slate-500">No hay ingresos registrados</p>
                        </div>
                    ) : (
                        filteredPatients.map((patient) => (
                            <Link
                                key={patient.id}
                                href={`/patients/${patient.id}`}
                                className="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 hover:bg-slate-800/60 border border-slate-800/50 transition-all group"
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${patient.tieneMovimientos
                                        ? 'bg-teal-500/10 text-teal-400 border border-teal-400/20'
                                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        }`}>
                                        {patient.nombre.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-white">{patient.nombre}</p>
                                        <p className="text-[10px] text-slate-500 font-medium">Primera consulta: {patient.fecha}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {patient.tieneMovimientos ? (
                                        <span className="text-[9px] font-black uppercase text-teal-500 bg-teal-500/10 border border-teal-500/20 px-1.5 py-0.5 rounded">Fidelizado</span>
                                    ) : (
                                        <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Pendiente</span>
                                    )}
                                    <ArrowRight size={14} className="text-slate-700 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>

            {/* Neon Glowing Trend Chart */}
            <div className="relative mt-auto border-t border-slate-800/50 pt-6">
                <div className="flex items-center justify-between mb-4 px-1">
                    <div>
                        <h5 className="text-xs font-bold text-slate-300">Tendencia de Crecimiento</h5>
                        <p className="text-[9px] text-slate-500 tracking-wider">Último semestre</p>
                    </div>
                </div>

                <div className="h-[140px] w-full mt-2">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#2DD4BF" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#2DD4BF" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                            <XAxis
                                dataKey="shortLabel"
                                fontSize={9}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'rgba(255,255,255,0.3)', fontWeight: 700 }}
                                dy={10}
                            />
                            <YAxis
                                fontSize={9}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: 'rgba(255,255,255,0.2)' }}
                            />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: '#0F172A',
                                    border: '1px solid #1E293B',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 'bold',
                                    color: '#fff'
                                }}
                            />
                            <Area
                                type="monotone"
                                dataKey="count"
                                stroke="#2DD4BF"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorCount)"
                                filter="url(#glow)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Footer Summary Cards */}
            <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800 transition-hover hover:border-teal-500/30">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Crecimiento</p>
                    <div className="flex items-end gap-2">
                        <span className="text-xl font-black text-white">{growthRate > 0 ? `+${growthRate}` : growthRate}%</span>
                        <div className={`flex items-center gap-0.5 text-[10px] font-bold mb-1 ${growthRate >= 0 ? 'text-teal-400' : 'text-rose-400'}`}>
                            <TrendingUp size={10} className={growthRate < 0 ? 'rotate-180' : ''} />
                            {growthRate >= 0 ? 'Mensual' : 'Baja'}
                        </div>
                    </div>
                </div>

                <div className="bg-slate-950/50 rounded-xl p-3 border border-slate-800 transition-hover hover:border-amber-500/30">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-tighter mb-1">Sin Seguimiento</p>
                    <div className="flex items-end gap-2">
                        <span className="text-xl font-black text-amber-500">{sinSeguimiento}</span>
                        <div className="flex items-center gap-0.5 text-[10px] font-bold mb-1 text-amber-600/70">
                            <AlertCircle size={10} />
                            Atención
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 text-center">
                <button className="text-[10px] font-bold text-slate-600 uppercase tracking-widest hover:text-teal-400 transition-colors flex items-center justify-center gap-2 mx-auto">
                    Analítica Completa <TrendingUp size={10} />
                </button>
            </div>
        </div>
    );
}
