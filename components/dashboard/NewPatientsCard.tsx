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
        loadStats();
    }, []);

    async function loadStats() {
        try {
            const now = new Date();
            const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const inicioMesAnterior = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            const finMesAnterior = new Date(now.getFullYear(), now.getMonth(), 0).toISOString();

            // Pacientes nuevos este mes (por fecha de creación)
            const { count: nuevosEsteMes } = await supabase
                .from('pacientes')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', inicioMes);

            // Pacientes nuevos mes anterior
            const { count: nuevosAnterior } = await supabase
                .from('pacientes')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', inicioMesAnterior)
                .lte('created_at', finMesAnterior);

            // Pacientes sin seguimiento - creados hace más de 30 días sin movimientos recientes
            const hace30Dias = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
            const hace90Dias = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

            // Get patients created 30-90 days ago
            const { data: pacientesPotenciales } = await supabase
                .from('pacientes')
                .select('id')
                .gte('created_at', hace90Dias)
                .lte('created_at', hace30Dias);

            let sinSeguimiento = 0;
            if (pacientesPotenciales && pacientesPotenciales.length > 0) {
                const ids = pacientesPotenciales.map(p => p.id);

                // Check which ones have recent movements (last 60 days)
                const hace60Dias = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
                const { data: conMovimientos } = await supabase
                    .from('caja_recepcion_movimientos')
                    .select('paciente_id')
                    .in('paciente_id', ids)
                    .gte('fecha_hora', hace60Dias);

                const idsConMovimientos = new Set(conMovimientos?.map(m => m.paciente_id) || []);
                sinSeguimiento = ids.filter(id => !idsConMovimientos.has(id)).length;
            }

            // Últimos 5 pacientes creados con info de si tienen movimientos
            const { data: ultimos } = await supabase
                .from('pacientes')
                .select('id, nombre, apellido, created_at')
                .order('created_at', { ascending: false })
                .limit(5);

            const recentInfo: typeof recentPatients = [];
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

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 animate-pulse h-full">
                <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
                    <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
                    <div className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg"></div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 h-full">
            <div className="flex items-center justify-between mb-4">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                    <UserPlus size={14} className="text-green-500" />
                    Pacientes Nuevos
                </h4>
                <span className="text-xs text-gray-400">
                    {new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                {/* Este Mes */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-3 border border-green-100 dark:border-green-800/30">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {stats?.nuevosEsteMes || 0}
                    </div>
                    <div className="text-xs text-green-600/70 dark:text-green-400/70 font-medium">
                        Este mes
                    </div>
                    {stats && stats.tendencia !== 'stable' && (
                        <div className={`flex items-center gap-1 mt-1 text-xs ${stats.tendencia === 'up' ? 'text-green-600' : 'text-red-500'
                            }`}>
                            <TrendingUp size={12} className={stats.tendencia === 'down' ? 'rotate-180' : ''} />
                            <span>{stats.porcentajeCambio}%</span>
                        </div>
                    )}
                </div>

                {/* Mes Anterior */}
                <div className="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 border border-gray-100 dark:border-gray-700">
                    <div className="text-2xl font-bold text-gray-600 dark:text-gray-300">
                        {stats?.nuevosAnterior || 0}
                    </div>
                    <div className="text-xs text-gray-500 font-medium">
                        Mes anterior
                    </div>
                </div>

                {/* Sin Seguimiento */}
                <div className={`rounded-lg p-3 border ${(stats?.sinSeguimiento || 0) > 0
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/30'
                        : 'bg-gray-50 dark:bg-gray-700/30 border-gray-100 dark:border-gray-700'
                    }`}>
                    <div className={`text-2xl font-bold ${(stats?.sinSeguimiento || 0) > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-400'
                        }`}>
                        {stats?.sinSeguimiento || 0}
                    </div>
                    <div className="text-xs text-gray-500 font-medium flex items-center gap-1">
                        {(stats?.sinSeguimiento || 0) > 0 && (
                            <AlertCircle size={10} className="text-amber-500" />
                        )}
                        Sin seguir
                    </div>
                </div>
            </div>

            {/* Recent Patients List */}
            <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                <div className="text-xs text-gray-500 mb-2 font-medium">Últimos registrados</div>
                <div className="space-y-1.5">
                    {recentPatients.map((patient) => (
                        <Link
                            key={patient.id}
                            href={`/patients/${patient.id}`}
                            className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${patient.tieneMovimientos
                                        ? 'bg-green-500'
                                        : 'bg-amber-400'
                                    }`} />
                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate">
                                    {patient.nombre}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{patient.fecha}</span>
                                <ArrowRight size={12} className="text-gray-300 group-hover:text-gray-500 transition-colors" />
                            </div>
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
}
