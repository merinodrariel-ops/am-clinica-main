'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Plus,
    Calendar,
    Stethoscope,
    FileText,
    Check,
    X
} from 'lucide-react';
import {
    type Sucursal,
    type Profesional,
    type Prestacion,
    type HonorarioItem,
    getProfesionales,
    getPrestaciones,
    getHonorariosItems,
    createPrestacion
} from '@/lib/caja-admin';
import { supabase } from '@/lib/supabase';

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
}

export default function ProfesionalesTab({ tcBna }: Props) {
    const [profesionales, setProfesionales] = useState<Profesional[]>([]);
    const [prestaciones, setPrestaciones] = useState<Prestacion[]>([]);
    const [honorarios, setHonorarios] = useState<HonorarioItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [mesActual, setMesActual] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [pacientes, setPacientes] = useState<{ id_paciente: string; nombre: string; apellido: string }[]>([]);

    // Form state
    const [formData, setFormData] = useState({
        profesional_id: '',
        paciente_id: '',
        tratamiento: '',
        precio: 0,
        moneda: 'ARS',
    });
    const [selectedHonorario, setSelectedHonorario] = useState<HonorarioItem | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const loadData = useCallback(async () => {
        setLoading(true);
        const [profData, prestData, honorariosData] = await Promise.all([
            getProfesionales(),
            getPrestaciones({ mes: mesActual }),
            getHonorariosItems()
        ]);

        setProfesionales(profData);
        setPrestaciones(prestData);
        setHonorarios(honorariosData);

        // Load patients for selector
        const { data: pacientesData } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido')
            .eq('is_deleted', false)
            .order('apellido')
            .limit(100);
        setPacientes(pacientesData || []);

        setLoading(false);
    }, [mesActual]);

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mesActual]);


    function handleHonorarioSelect(itemId: string) {
        const item = honorarios.find(h => h.id === itemId);
        if (item) {
            setSelectedHonorario(item);
            setFormData({
                ...formData,
                tratamiento: item.tratamiento,
                precio: item.precio,
                moneda: item.moneda,
            });
        }
    }

    async function handleSubmit() {
        if (!formData.profesional_id || !formData.tratamiento) return;

        setSubmitting(true);

        const usdEquivalente = formData.moneda === 'USD'
            ? formData.precio
            : tcBna ? formData.precio / tcBna : undefined;

        await createPrestacion({
            fecha: new Date().toISOString().split('T')[0],
            profesional_id: formData.profesional_id,
            paciente_id: formData.paciente_id || undefined,
            tratamiento: formData.tratamiento,
            precio_snapshot: formData.precio,
            moneda_snapshot: formData.moneda,
            tc_dia: tcBna || undefined,
            usd_equivalente: usdEquivalente,
        });

        setSubmitting(false);
        setShowForm(false);
        setFormData({ profesional_id: profesionales[0]?.id || '', paciente_id: '', tratamiento: '', precio: 0, moneda: 'ARS' });
        setSelectedHonorario(null);
        loadData();
    }

    // Group prestaciones by profesional
    const prestacionesPorProf = profesionales.map(prof => ({
        profesional: prof,
        prestaciones: prestaciones.filter(p => p.profesional_id === prof.id),
        totalUsd: prestaciones
            .filter(p => p.profesional_id === prof.id && p.estado === 'Registrado')
            .reduce((sum, p) => sum + (p.usd_equivalente || 0), 0),
    }));

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                Cargando profesionales...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                        <input
                            type="month"
                            value={mesActual}
                            onChange={(e) => setMesActual(e.target.value)}
                            className="bg-transparent border-none outline-none text-sm font-medium"
                        />
                    </div>
                </div>

                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Prestación
                </motion.button>
            </div>

            {/* New Prestacion Form */}
            {showForm && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold">Nueva Prestación</h3>
                        <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Profesional *
                            </label>
                            <select
                                value={formData.profesional_id}
                                onChange={(e) => setFormData({ ...formData, profesional_id: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            >
                                {profesionales.map(p => (
                                    <option key={p.id} value={p.id}>{p.nombre} - {p.especialidad}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Paciente
                            </label>
                            <select
                                value={formData.paciente_id}
                                onChange={(e) => setFormData({ ...formData, paciente_id: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            >
                                <option value="">Seleccionar paciente...</option>
                                {pacientes.map(p => (
                                    <option key={p.id_paciente} value={p.id_paciente}>
                                        {p.apellido}, {p.nombre}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Tratamiento del Catálogo
                            </label>
                            <select
                                value={selectedHonorario?.id || ''}
                                onChange={(e) => handleHonorarioSelect(e.target.value)}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            >
                                <option value="">Seleccionar del catálogo...</option>
                                {honorarios.map(h => (
                                    <option key={h.id} value={h.id}>
                                        {h.tratamiento} - {h.moneda} {h.precio.toLocaleString('es-AR')}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Tratamiento *
                            </label>
                            <input
                                type="text"
                                value={formData.tratamiento}
                                onChange={(e) => setFormData({ ...formData, tratamiento: e.target.value })}
                                placeholder="Nombre del tratamiento"
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Precio
                            </label>
                            <div className="flex gap-2">
                                <input
                                    type="number"
                                    value={formData.precio}
                                    onChange={(e) => setFormData({ ...formData, precio: parseFloat(e.target.value) || 0 })}
                                    className="flex-1 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                />
                                <select
                                    value={formData.moneda}
                                    onChange={(e) => setFormData({ ...formData, moneda: e.target.value })}
                                    className="w-24 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                >
                                    <option value="ARS">ARS</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>
                            {formData.moneda === 'ARS' && tcBna && formData.precio > 0 && (
                                <p className="text-xs text-green-600 mt-1">
                                    ≈ ${(formData.precio / tcBna).toFixed(2)} USD
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting || !formData.tratamiento}
                            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50"
                        >
                            {submitting ? 'Guardando...' : 'Registrar Prestación'}
                            <Check className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Profesionales Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {prestacionesPorProf.map(({ profesional, prestaciones: prests, totalUsd }) => (
                    <div
                        key={profesional.id}
                        className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4"
                    >
                        <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                <Stethoscope className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h4 className="font-medium text-sm">{profesional.nombre}</h4>
                                <p className="text-xs text-slate-500">{profesional.especialidad}</p>
                            </div>
                        </div>
                        <div className="flex items-end justify-between">
                            <div>
                                <p className="text-2xl font-bold text-indigo-600">
                                    ${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </p>
                                <p className="text-xs text-slate-500">USD este mes</p>
                            </div>
                            <div className="text-right">
                                <p className="text-lg font-semibold">{prests.length}</p>
                                <p className="text-xs text-slate-500">prestaciones</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Prestaciones Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                    <h3 className="font-semibold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-indigo-500" />
                        Prestaciones del Mes
                    </h3>
                </div>

                {prestaciones.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <Stethoscope className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No hay prestaciones registradas este mes</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Profesional</th>
                                <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Tratamiento</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Precio</th>
                                <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">USD</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {prestaciones.map((prest) => (
                                <tr key={prest.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                    <td className="px-6 py-3 text-sm">
                                        {new Date(prest.fecha).toLocaleDateString('es-AR')}
                                    </td>
                                    <td className="px-6 py-3 text-sm">{prest.profesional?.nombre || '-'}</td>
                                    <td className="px-6 py-3 text-sm font-medium">{prest.tratamiento}</td>
                                    <td className="px-6 py-3 text-sm text-right">
                                        {prest.moneda_snapshot} {prest.precio_snapshot.toLocaleString('es-AR')}
                                    </td>
                                    <td className="px-6 py-3 text-sm text-right font-mono text-green-600">
                                        ${prest.usd_equivalente?.toFixed(2) || '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
