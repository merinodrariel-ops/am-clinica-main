'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UserPlus, TrendingUp, AlertCircle, ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

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
                    .select('id, nombre, apellido, primera_consulta_fecha')
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
                setSelectedMonthKey((prev) => {
                    if (prev && trend.some((month) => month.key === prev)) {
                        return prev;
                    }
                    return trend.some((month) => month.key === currentMonthKey)
                        ? currentMonthKey
                        : trend[trend.length - 1]?.key || '';
                });

                const hace30Dias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const hace90Dias = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

                const { data: pacientesPotenciales } = await supabase
                    .from('pacientes')
                    .select('id')
                    .eq('is_deleted', false)
                    .not('primera_consulta_fecha', 'is', null)
                    .gte('primera_consulta_fecha', hace90Dias.split('T')[0])
                    .lte('primera_consulta_fecha', hace30Dias.split('T')[0]);

                let sinSeguimientoTemp = 0;
                if (pacientesPotenciales && pacientesPotenciales.length > 0) {
                    const ids = pacientesPotenciales.map(p => p.id);
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

                const recentCandidates = (pacientesMeses || []).slice(0, 5);
                const recentIds = recentCandidates.map((p) => p.id);

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

                const recentInfo = recentCandidates.map((paciente) => ({
                    id: paciente.id,
                    nombre: `${paciente.nombre} ${paciente.apellido}`,
                    fecha: new Date(`${paciente.primera_consulta_fecha}T12:00:00`).toLocaleDateString('es-AR', {
                        day: '2-digit',
                        month: 'short',
                    }),
                    tieneMovimientos: idsConMovimientosRecientes.has(paciente.id),
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
    const previousMonth = selectedMonthIndex > 0 ? monthlyTrend[selectedMonthIndex - 1] : null;

    const nuevosEsteMes = selectedMonth?.count || 0;
    const nuevosAnterior = previousMonth?.count || 0;
    const cambio = nuevosAnterior > 0
        ? Math.round(((nuevosEsteMes - nuevosAnterior) / nuevosAnterior) * 100)
        : 0;
    const tendencia = cambio > 0 ? 'up' : cambio < 0 ? 'down' : 'stable';
    const maxTrendCount = Math.max(1, ...monthlyTrend.map((month) => month.count));

    const canGoPrev = selectedMonthIndex > 0;
    const canGoNext = selectedMonthIndex >= 0 && selectedMonthIndex < monthlyTrend.length - 1;

    const goToPreviousMonth = () => {
        if (!canGoPrev) return;
        setSelectedMonthKey(monthlyTrend[selectedMonthIndex - 1].key);
    };

    const goToNextMonth = () => {
        if (!canGoNext) return;
        setSelectedMonthKey(monthlyTrend[selectedMonthIndex + 1].key);
    };

    if (loading) {
        return (
            <div className="glass-card rounded-xl p-5 animate-pulse h-full">
                <div className="h-5 rounded w-1/3 mb-4" style={{ background: 'hsl(230 15% 18%)' }}></div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="h-16 rounded-lg" style={{ background: 'hsl(230 15% 16%)' }}></div>
                    <div className="h-16 rounded-lg" style={{ background: 'hsl(230 15% 16%)' }}></div>
                    <div className="h-16 rounded-lg" style={{ background: 'hsl(230 15% 16%)' }}></div>
                </div>
            </div>
        );
    }

    return (
        <div className="glass-card glass-card-hover rounded-xl p-5 h-full">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'hsl(210 20% 90%)' }}>
                    <UserPlus size={14} style={{ color: 'hsl(165 100% 42%)' }} />
                    Pacientes Nuevos
                </h4>
                <div className="flex items-center gap-1 rounded-lg px-1 py-0.5" style={{ background: 'hsl(230 15% 14%)', border: '1px solid hsl(230 15% 18%)' }}>
                    <button
                        onClick={goToPreviousMonth}
                        disabled={!canGoPrev}
                        className="p-1 rounded transition-colors disabled:opacity-30"
                        style={{ color: 'hsl(230 10% 60%)' }}
                        aria-label="Mes anterior"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <span className="text-xs px-1 min-w-[110px] text-center" style={{ color: 'hsl(230 10% 50%)' }}>
                        {selectedMonth?.label || '-'}
                    </span>
                    <button
                        onClick={goToNextMonth}
                        disabled={!canGoNext}
                        className="p-1 rounded transition-colors disabled:opacity-30"
                        style={{ color: 'hsl(230 10% 60%)' }}
                        aria-label="Mes siguiente"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg p-3" style={{ background: 'hsla(165, 100%, 42%, 0.08)', border: '1px solid hsla(165, 100%, 42%, 0.15)' }}>
                    <div className="text-2xl font-bold" style={{ color: 'hsl(165 85% 50%)' }}>
                        {nuevosEsteMes}
                    </div>
                    <div className="text-xs font-medium" style={{ color: 'hsl(165 70% 45%)' }}>
                        Mes seleccionado
                    </div>
                    {tendencia !== 'stable' && (
                        <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: tendencia === 'up' ? 'hsl(165 85% 50%)' : 'hsl(0 72% 60%)' }}>
                            <TrendingUp size={12} className={tendencia === 'down' ? 'rotate-180' : ''} />
                            <span>{Math.abs(cambio)}%</span>
                        </div>
                    )}
                </div>

                <div className="rounded-lg p-3" style={{ background: 'hsl(230 15% 14%)', border: '1px solid hsl(230 15% 18%)' }}>
                    <div className="text-2xl font-bold" style={{ color: 'hsl(210 20% 80%)' }}>
                        {nuevosAnterior}
                    </div>
                    <div className="text-xs font-medium" style={{ color: 'hsl(230 10% 50%)' }}>
                        {previousMonth ? 'Mes previo' : 'Sin previo'}
                    </div>
                </div>

                <div className="rounded-lg p-3" style={{
                    background: sinSeguimiento > 0 ? 'hsla(38, 92%, 50%, 0.08)' : 'hsl(230 15% 14%)',
                    border: sinSeguimiento > 0 ? '1px solid hsla(38, 92%, 50%, 0.15)' : '1px solid hsl(230 15% 18%)'
                }}>
                    <div className="text-2xl font-bold" style={{ color: sinSeguimiento > 0 ? 'hsl(38 92% 60%)' : 'hsl(230 10% 45%)' }}>
                        {sinSeguimiento}
                    </div>
                    <div className="text-xs font-medium flex items-center gap-1" style={{ color: 'hsl(230 10% 50%)' }}>
                        {sinSeguimiento > 0 && (
                            <AlertCircle size={10} style={{ color: 'hsl(38 92% 55%)' }} />
                        )}
                        Sin seguir
                    </div>
                </div>
            </div>

            <div className="mb-4 rounded-lg p-3" style={{ background: 'hsl(230 15% 14%)', border: '1px solid hsl(230 15% 18%)' }}>
                <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'hsl(230 10% 50%)' }}>
                    <span>Comparativo últimos {MONTHS_TO_SHOW} meses</span>
                    <span>{selectedMonth?.label || '-'}</span>
                </div>
                <div className="grid grid-cols-6 gap-2 items-end h-24">
                    {monthlyTrend.map((month) => {
                        const isSelected = month.key === selectedMonth?.key;
                        const height = Math.max(8, Math.round((month.count / maxTrendCount) * 100));

                        return (
                            <button
                                key={month.key}
                                onClick={() => setSelectedMonthKey(month.key)}
                                className="flex flex-col items-center justify-end gap-1 group"
                                title={`${month.label}: ${month.count}`}
                            >
                                <span className="text-[10px]" style={{ color: isSelected ? 'hsl(165 85% 50%)' : 'hsl(230 10% 45%)' }}>
                                    {month.count}
                                </span>
                                <div
                                    className="w-full rounded-md transition-all"
                                    style={{
                                        height: `${height}%`,
                                        background: isSelected
                                            ? 'linear-gradient(180deg, hsl(165 100% 42%), hsl(160 80% 35%))'
                                            : 'hsl(230 12% 30%)',
                                        border: isSelected
                                            ? '1px solid hsla(165, 100%, 42%, 0.5)'
                                            : '1px solid hsl(230 15% 20%)',
                                    }}
                                />
                                <span className="text-[10px] uppercase" style={{ color: isSelected ? 'hsl(210 20% 80%)' : 'hsl(230 10% 45%)' }}>
                                    {month.shortLabel}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Recent Patients List */}
            <div className="pt-3" style={{ borderTop: '1px solid hsl(230 15% 18%)' }}>
                <div className="text-xs mb-2 font-medium" style={{ color: 'hsl(230 10% 50%)' }}>Últimos con primera consulta</div>
                <div className="space-y-1.5">
                    {recentPatients.map((patient) => (
                        <Link
                            key={patient.id}
                            href={`/patients/${patient.id}`}
                            className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg transition-colors table-row-hover group"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                                    background: patient.tieneMovimientos ? 'hsl(165 100% 42%)' : 'hsl(38 92% 55%)'
                                }} />
                                <span className="text-sm truncate" style={{ color: 'hsl(210 20% 85%)' }}>
                                    {patient.nombre}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs" style={{ color: 'hsl(230 10% 45%)' }}>{patient.fecha}</span>
                                <ArrowRight size={12} className="transition-colors" style={{ color: 'hsl(230 10% 35%)' }} />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
