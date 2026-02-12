'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    FlaskConical,
    Plus,
    Clock,
    CheckCircle2,
    Circle,
    Search,
    MoreVertical,
    Loader2,
    Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';
import Link from 'next/link';
import NuevoTrabajoForm from '@/components/laboratorio/NuevoTrabajoForm';
import DetalleTrabajoModal from '@/components/laboratorio/DetalleTrabajoModal';

interface Trabajo {
    id: string;
    paciente_id: string;
    profesional_id: string;
    tipo_trabajo: string;
    laboratorio_nombre: string;
    fecha_envio: string;
    fecha_entrega_estimada: string;
    fecha_entrega_real: string | null;
    estado: 'Enviado' | 'Recibido' | 'Colocado' | 'Anulado';
    costo_usd: number;
    pagado: boolean;
    observaciones: string;
    paciente: {
        nombre: string;
        apellido: string;
    };
    profesional: {
        nombre: string;
    };
}

interface LaboratorioPanelProps {
    embedded?: boolean;
}

export default function LaboratorioPanel({ embedded = false }: LaboratorioPanelProps) {
    const [trabajos, setTrabajos] = useState<Trabajo[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');
    const [showNuevoTrabajo, setShowNuevoTrabajo] = useState(false);
    const [selectedTrabajo, setSelectedTrabajo] = useState<Trabajo | null>(null);

    const loadTrabajos = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('laboratorio_trabajos')
                .select(`
                    *,
                    paciente:pacientes(nombre, apellido),
                    profesional:profesionales(nombre)
                `)
                .order('fecha_envio', { ascending: false });

            if (statusFilter !== 'Todos') {
                query = query.eq('estado', statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            setTrabajos((data || []) as Trabajo[]);
        } catch (error) {
            console.error('Error loading lab works:', error);
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => {
        loadTrabajos();
    }, [loadTrabajos]);

    const filteredTrabajos = trabajos.filter(trabajo =>
        trabajo.paciente?.nombre?.toLowerCase().includes(search.toLowerCase()) ||
        trabajo.paciente?.apellido?.toLowerCase().includes(search.toLowerCase()) ||
        trabajo.tipo_trabajo.toLowerCase().includes(search.toLowerCase())
    );

    const stats = {
        pendientes: trabajos.filter(t => t.estado === 'Enviado').length,
        recibidos: trabajos.filter(t => t.estado === 'Recibido').length,
        colocados: trabajos.filter(t => t.estado === 'Colocado').length,
    };

    return (
        <div className={clsx('space-y-6', embedded ? 'h-full overflow-y-auto p-6' : 'p-6 max-w-7xl mx-auto')}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <FlaskConical className="text-indigo-600" />
                        Seguimiento de Laboratorio
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">Control de protesis, coronas y alineadores</p>
                </div>
                <div className="flex gap-2">
                    <Link
                        href="/inventario?area=LABORATORIO"
                        className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                    >
                        <Package size={20} />
                        Ver Inventario
                    </Link>
                    <button
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                        onClick={() => setShowNuevoTrabajo(true)}
                    >
                        <Plus size={20} />
                        Nuevo Trabajo
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-amber-100 dark:bg-amber-900/30 text-amber-600 rounded-lg flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Pendientes (En Lab)</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.pendientes}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center">
                            <CheckCircle2 size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Recibidos (En Clinica)</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.recibidos}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 rounded-lg flex items-center justify-center">
                            <Plus size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Colocados (Mes)</p>
                            <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.colocados}</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por paciente o trabajo..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 transition-all"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                    {['Todos', 'Enviado', 'Recibido', 'Colocado'].map(filter => (
                        <button
                            key={filter}
                            onClick={() => setStatusFilter(filter)}
                            className={clsx(
                                'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                                statusFilter === filter
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                            )}
                        >
                            {filter}
                        </button>
                    ))}
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="p-20 flex flex-col items-center justify-center text-gray-500">
                        <Loader2 className="animate-spin mb-2" size={32} />
                        <p>Cargando trabajos...</p>
                    </div>
                ) : filteredTrabajos.length === 0 ? (
                    <div className="p-20 text-center text-gray-500">
                        <FlaskConical className="mx-auto mb-4 text-gray-300" size={48} />
                        <p className="text-lg font-medium">No se encontraron trabajos</p>
                        <p className="text-sm">Proba cambiando los filtros o agregando uno nuevo.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 dark:bg-gray-900/50">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Paciente / Trabajo</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">Estado</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Fechas</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">Profesional / Lab</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filteredTrabajos.map((trabajo) => (
                                    <tr
                                        key={trabajo.id}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors cursor-pointer"
                                        onClick={() => setSelectedTrabajo(trabajo)}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="font-semibold text-gray-900 dark:text-white">
                                                {trabajo.paciente?.nombre} {trabajo.paciente?.apellido}
                                            </div>
                                            <div className="text-sm text-indigo-600 font-medium">{trabajo.tipo_trabajo}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <span className={clsx(
                                                'px-3 py-1 rounded-full text-xs font-bold uppercase',
                                                trabajo.estado === 'Enviado' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                                                trabajo.estado === 'Recibido' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                                                trabajo.estado === 'Colocado' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
                                                trabajo.estado === 'Anulado' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            )}>
                                                {trabajo.estado}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col text-xs text-gray-600 dark:text-gray-400">
                                                <span className="flex items-center gap-1">
                                                    <Circle size={8} className="fill-gray-400" /> Enviado: {new Date(trabajo.fecha_envio).toLocaleDateString()}
                                                </span>
                                                <span className="flex items-center gap-1 font-medium mt-1">
                                                    <Clock size={10} className="text-amber-500" /> Entrega: {new Date(trabajo.fecha_entrega_estimada).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-900 dark:text-white">Dr. {trabajo.profesional?.nombre}</div>
                                            <div className="text-xs text-gray-500">{trabajo.laboratorio_nombre}</div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right">
                                            <button className="p-2 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg text-gray-500">
                                                <MoreVertical size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <NuevoTrabajoForm
                isOpen={showNuevoTrabajo}
                onClose={() => setShowNuevoTrabajo(false)}
                onSuccess={loadTrabajos}
            />

            <DetalleTrabajoModal
                isOpen={!!selectedTrabajo}
                trabajo={selectedTrabajo}
                onClose={() => setSelectedTrabajo(null)}
                onSuccess={loadTrabajos}
            />
        </div>
    );
}
