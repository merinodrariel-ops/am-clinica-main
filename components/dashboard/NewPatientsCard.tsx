'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UserPlus, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface NewPatientsStats {
    nuevosEsteMes: number;
    nuevosAnterior: number;
    sinSeguimiento: number;
    tendencia: 'up' | 'down' | 'stable';
    porcentajeCambio: number;
}

export default function NewPatientsCard() {
    const [stats, setStats] = useState<NewPatientsStats | null>(null);
    const [loading, setLoading] = useState(true);
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
                const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
                const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
                const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

                const { count: nuevosEsteMes } = await supabase
                    .from('pacientes')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', inicioMes);

                const { count: nuevosAnterior } = await supabase
                    .from('pacientes')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', inicioMesAnterior)
                    .lte('created_at', finMesAnterior);

                const hace30Dias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
                const hace90Dias = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

                const { data: pacientesPotenciales } = await supabase
                    .from('pacientes')
                    .select('id')
                    .gte('created_at', hace90Dias)
                    .lte('created_at', hace30Dias);

                let sinSeguimiento = 0;
                if (pacientesPotenciales && pacientesPotenciales.length > 0) {
                    const ids = pacientesPotenciales.map(p => p.id);
                    const hace60Dias = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
                    const { data: conMovimientos } = await supabase
                        .from('caja_recepcion_movimientos')
                        .select('paciente_id')
                        .in('paciente_id', ids)
                        .gte('fecha_hora', hace60Dias);

                    const idsConMovimientos = new Set(conMovimientos?.map(m => m.paciente_id) || []);
                    sinSeguimiento = ids.filter(id => !idsConMovimientos.has(id)).length;
                }

                const { data: ultimos } = await supabase
                    .from('pacientes')
                    .select('id, nombre, apellido, created_at')
                    .order('created_at', { ascending: false })
                    .limit(5);

                const recentInfo: Array<{
                    id: string;
                    nombre: string;
                    fecha: string;
                    tieneMovimientos: boolean;
                }> = [];
                if (ultimos) {
                    for (const p of ultimos) {
                        const { count } = await supabase
                            .from('caja_recepcion_movimientos')
                            .select('*', { count: 'exact', head: true })
                            .eq('paciente_id', p.id);

                        recentInfo.push({
                            id: p.id,
                            nombre: `${p.nombre} ${p.apellido}`,
                            fecha: new Date(p.created_at).toLocaleDateString('es-AR', {
                                day: '2-digit',
                                month: 'short'
                            }),
                            tieneMovimientos: (count || 0) > 0
                        });
                    }
                }

                const cambio = nuevosAnterior && nuevosAnterior > 0
                    ? Math.round(((nuevosEsteMes || 0) - nuevosAnterior) / nuevosAnterior * 100)
                    : 0;

                setStats({
                    nuevosEsteMes: nuevosEsteMes || 0,
                    nuevosAnterior: nuevosAnterior || 0,
                    sinSeguimiento,
                    tendencia: cambio > 0 ? 'up' : cambio < 0 ? 'down' : 'stable',
                    porcentajeCambio: Math.abs(cambio)
                });
                setRecentPatients(recentInfo);
            } catch (error) {
                console.error('Error loading new patients stats:', error);
            } finally {
                setLoading(false);
            }
        }
        loadStats();
    }, []);

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
                <span className="text-xs" style={{ color: 'hsl(230 10% 45%)' }}>
                    {new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="rounded-lg p-3" style={{ background: 'hsla(165, 100%, 42%, 0.08)', border: '1px solid hsla(165, 100%, 42%, 0.15)' }}>
                    <div className="text-2xl font-bold" style={{ color: 'hsl(165 85% 50%)' }}>
                        {stats?.nuevosEsteMes || 0}
                    </div>
                    <div className="text-xs font-medium" style={{ color: 'hsl(165 70% 45%)' }}>
                        Este mes
                    </div>
                    {stats && stats.tendencia !== 'stable' && (
                        <div className="flex items-center gap-1 mt-1 text-xs" style={{ color: stats.tendencia === 'up' ? 'hsl(165 85% 50%)' : 'hsl(0 72% 60%)' }}>
                            <TrendingUp size={12} className={stats.tendencia === 'down' ? 'rotate-180' : ''} />
                            <span>{stats.porcentajeCambio}%</span>
                        </div>
                    )}
                </div>

                <div className="rounded-lg p-3" style={{ background: 'hsl(230 15% 14%)', border: '1px solid hsl(230 15% 18%)' }}>
                    <div className="text-2xl font-bold" style={{ color: 'hsl(210 20% 80%)' }}>
                        {stats?.nuevosAnterior || 0}
                    </div>
                    <div className="text-xs font-medium" style={{ color: 'hsl(230 10% 50%)' }}>
                        Mes anterior
                    </div>
                </div>

                <div className="rounded-lg p-3" style={{
                    background: (stats?.sinSeguimiento || 0) > 0 ? 'hsla(38, 92%, 50%, 0.08)' : 'hsl(230 15% 14%)',
                    border: (stats?.sinSeguimiento || 0) > 0 ? '1px solid hsla(38, 92%, 50%, 0.15)' : '1px solid hsl(230 15% 18%)'
                }}>
                    <div className="text-2xl font-bold" style={{ color: (stats?.sinSeguimiento || 0) > 0 ? 'hsl(38 92% 60%)' : 'hsl(230 10% 45%)' }}>
                        {stats?.sinSeguimiento || 0}
                    </div>
                    <div className="text-xs font-medium flex items-center gap-1" style={{ color: 'hsl(230 10% 50%)' }}>
                        {(stats?.sinSeguimiento || 0) > 0 && (
                            <AlertCircle size={10} style={{ color: 'hsl(38 92% 55%)' }} />
                        )}
                        Sin seguir
                    </div>
                </div>
            </div>

            {/* Recent Patients List */}
            <div className="pt-3" style={{ borderTop: '1px solid hsl(230 15% 18%)' }}>
                <div className="text-xs mb-2 font-medium" style={{ color: 'hsl(230 10% 50%)' }}>Últimos registrados</div>
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
