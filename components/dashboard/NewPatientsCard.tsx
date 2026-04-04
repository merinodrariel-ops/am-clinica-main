'use client';
// Redesigned version v1.2 - Added patient profile links

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();
import { UserPlus, TrendingUp, AlertCircle, ArrowRight, ChevronLeft, ChevronRight, User, Sparkles, Calendar } from 'lucide-react';
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

                (pacientesMeses || []).forEach((paciente: { primera_consulta_fecha?: string | null }) => {
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
                    const ids = pacientesPotenciales.map((p: { id_paciente: string }) => p.id_paciente);
                    const hace60Dias = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
                    const { data: conMovimientos } = await supabase
                        .from('caja_recepcion_movimientos')
                        .select('paciente_id')
                        .in('paciente_id', ids)
                        .eq('estado', 'pagado')
                        .eq('is_deleted', false)
                        .gte('fecha_hora', hace60Dias);

                    const idsConMovimientos = new Set(conMovimientos?.map((m: { paciente_id: string }) => m.paciente_id) || []);
                    sinSeguimientoTemp = ids.filter((id: string) => !idsConMovimientos.has(id)).length;
                }

                setSinSeguimiento(sinSeguimientoTemp);

                // Fetch more for the monthly lists
                const recentIds = (pacientesMeses || []).map((p: { id_paciente: string }) => p.id_paciente);

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
                            .map((movimiento: { paciente_id: string | null }) => movimiento.paciente_id)
                            .filter((id: string | null): id is string => Boolean(id))
                    );
                }

                const recentInfo = (pacientesMeses || []).map((paciente: { id_paciente: string; nombre: string; apellido: string; primera_consulta_fecha?: string | null }) => ({
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
            <div className="glass-card rounded-xl p-5 animate-pulse h-full border border-white/5 bg-black/20">
                <div className="h-5 rounded w-1/3 mb-4 bg-white/5"></div>
                <div className="space-y-3">
                    <div className="h-10 rounded-lg bg-white/5"></div>
                    <div className="h-10 rounded-lg bg-white/5"></div>
                    <div className="h-40 rounded-lg bg-white/5"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card rounded-xl overflow-hidden h-full flex flex-col p-5 bg-black/20 border border-white/5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h4 className="text-base font-bold text-white flex items-center gap-2">
                        <UserPlus size={18} className="text-teal-400" />
                        Nuevos Ingresos
                    </h4>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold mt-0.5">Pacientes registrados de primera vez</p>
                </div>

                <div className="flex items-center gap-1 bg-black/20 rounded-lg border border-white/5 p-0.5">
                    {monthlyTrend.map((m) => (
                        <button
                            key={m.key}
                            onClick={() => setSelectedMonthKey(m.key)}
                            className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${selectedMonthKey === m.key
                                ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20 shadow-[0_0_10px_rgba(45,212,191,0.1)]'
                                : 'text-slate-500 hover:text-slate-300'
                                }`}
                        >
                            {m.shortLabel}
                        </button>
                    ))}
                </div>
            </div>

            {/* Monthly Patient List - FULL HEIGHT */}
            <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4 px-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                        Admisiones de {selectedMonth.label}
                    </span>
                    <span className="text-[10px] font-bold bg-teal-500/10 text-teal-400 px-2 py-0.5 rounded-full border border-teal-500/20">
                        {filteredPatients.length} pacientes
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2">
                    {filteredPatients.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full grayscale opacity-30 py-20">
                            <User size={40} className="text-slate-600 mb-3" />
                            <p className="text-xs text-slate-500">No hay ingresos registrados en {selectedMonth.label}</p>
                        </div>
                    ) : (
                        filteredPatients.map((patient) => (
                            <Link
                                key={patient.id}
                                href={`/patients/${patient.id}`}
                                className="flex items-center justify-between p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all group"
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shadow-inner ${patient.tieneMovimientos
                                        ? 'bg-teal-500/10 text-teal-400 border border-teal-400/20'
                                        : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                                        }`}>
                                        {patient.nombre.charAt(0)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-100 truncate group-hover:text-teal-400 transition-colors uppercase tracking-tight">{patient.nombre}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5 text-slate-500">
                                            <Calendar size={10} />
                                            <p className="text-[10px] font-medium uppercase">{patient.fecha}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {patient.tieneMovimientos ? (
                                        <span className="text-[9px] font-black uppercase text-teal-500 bg-teal-500/5 px-2 py-0.5 rounded border border-teal-500/10">Activo</span>
                                    ) : (
                                        <span className="text-[9px] font-black uppercase text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded border border-amber-500/10">Lead</span>
                                    )}
                                    <ArrowRight size={16} className="text-slate-700 group-hover:text-teal-400 group-hover:translate-x-1 transition-all" />
                                </div>
                            </Link>
                        ))
                    )}
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5">
                 <p className="text-[9px] text-center text-slate-600 font-bold uppercase tracking-[0.2em]">Monitor de Pacientes de Primera Vez</p>
            </div>
        </div>
    );
}
