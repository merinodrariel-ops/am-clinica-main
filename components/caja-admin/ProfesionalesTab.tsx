'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    Plus,
    Calendar,
    Stethoscope,
    FileText,
    Check,
    X,
    Search,
    User
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
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import MoneyInput from '@/components/ui/MoneyInput';

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
    // Form state
    const [formData, setFormData] = useState({
        profesional_id: '',
        paciente_id: '',
        tratamiento: '',
        precio: 0,
        moneda: 'ARS' as 'ARS' | 'USD'
    });
    const [selectedHonorario, setSelectedHonorario] = useState<HonorarioItem | null>(null);

    // Search states
    const [patientSearch, setPatientSearch] = useState('');
    const [patientResults, setPatientResults] = useState<{ id_paciente: string; nombre: string; apellido: string }[]>([]);
    const [treatmentSearch, setTreatmentSearch] = useState('');
    const [searchingPatients, setSearchingPatients] = useState(false);
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
        setLoading(false);
    }, [mesActual]);

    // Dynamic patient search
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (patientSearch.length >= 2) {
                setSearchingPatients(true);
                const { data } = await supabase
                    .from('pacientes')
                    .select('id_paciente, nombre, apellido')
                    .eq('is_deleted', false)
                    .or(`nombre.ilike.%${patientSearch}%,apellido.ilike.%${patientSearch}%`)
                    .limit(10);
                setPatientResults(data || []);
                setSearchingPatients(false);
            } else {
                setPatientResults([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [patientSearch]);

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mesActual]);


    function handleHonorarioSelect(item: HonorarioItem) {
        setSelectedHonorario(item);
        setTreatmentSearch(item.tratamiento);
        setFormData({
            ...formData,
            tratamiento: item.tratamiento,
            precio: item.precio,
            moneda: item.moneda as 'ARS' | 'USD',
        });
    }

    function selectPatient(p: { id_paciente: string; nombre: string; apellido: string }) {
        setFormData({ ...formData, paciente_id: p.id_paciente });
        setPatientResults([]);
        setPatientSearch(`${p.apellido}, ${p.nombre}`);
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
        setPatientSearch('');
        setTreatmentSearch('');
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
                    <div className="relative">
                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-500 pointer-events-none" />
                        <Input
                            type="month"
                            value={mesActual}
                            onChange={(e) => setMesActual(e.target.value)}
                            className="pl-10 h-10 w-full rounded-xl bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 shadow-sm focus-visible:ring-indigo-500"
                        />
                    </div>
                </div>

                <Button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg hover:shadow-xl transition-shadow"
                >
                    <Plus className="w-5 h-5" />
                    Nueva Prestación
                </Button>
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
                        <Button variant="ghost" size="icon" onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-5 h-5" />
                        </Button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                        {/* Profesional */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Profesional *
                            </label>
                            <div className="relative">
                                <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <select
                                    value={formData.profesional_id}
                                    onChange={(e) => setFormData({ ...formData, profesional_id: e.target.value })}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                >
                                    <option value="">Seleccionar profesional...</option>
                                    {profesionales.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre} - {p.especialidad}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Paciente con Búsqueda */}
                        <div className="relative">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Paciente
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <Input
                                    type="text"
                                    placeholder="Buscar paciente por nombre o apellido..."
                                    value={patientSearch}
                                    onChange={(e) => {
                                        setPatientSearch(e.target.value);
                                        if (formData.paciente_id) setFormData({ ...formData, paciente_id: '' });
                                    }}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus-visible:ring-indigo-500"
                                />
                                {searchingPatients && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                                    </div>
                                )}
                            </div>

                            {/* Resultados Paciente */}
                            {patientResults.length > 0 && (
                                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                    {patientResults.map(p => (
                                        <Button
                                            key={p.id_paciente}
                                            variant="ghost"
                                            onClick={() => selectPatient(p)}
                                            className="w-full flex justify-start items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 text-left border-b border-slate-50 dark:border-slate-700 last:border-0 h-auto font-normal rounded-none"
                                        >
                                            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
                                                <User className="w-4 h-4 text-indigo-600" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">{p.apellido}, {p.nombre}</p>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-tighter">ID: {p.id_paciente.slice(0, 8)}</p>
                                            </div>
                                        </Button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Tratamiento / Catálogo */}
                        <div className="relative">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Tratamiento / Catálogo
                            </label>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                                <Input
                                    type="text"
                                    placeholder="Buscar en catálogo o escribir..."
                                    value={treatmentSearch}
                                    onChange={(e) => {
                                        setTreatmentSearch(e.target.value);
                                        setFormData({ ...formData, tratamiento: e.target.value });
                                        if (selectedHonorario) setSelectedHonorario(null);
                                    }}
                                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus-visible:ring-indigo-500"
                                />
                            </div>

                            {/* Resultados Catálogo (Solo si hay búsqueda y no está seleccionado) */}
                            {treatmentSearch && !selectedHonorario && (
                                <div className="absolute z-50 w-full mt-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                    {honorarios
                                        .filter(h => h.tratamiento.toLowerCase().includes(treatmentSearch.toLowerCase()))
                                        .map(h => (
                                            <Button
                                                key={h.id}
                                                variant="ghost"
                                                onClick={() => handleHonorarioSelect(h)}
                                                className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/50 text-left border-b border-slate-50 dark:border-slate-700 last:border-0 h-auto font-normal rounded-none"
                                            >
                                                <span className="text-sm font-medium">{h.tratamiento}</span>
                                                <span className="text-xs font-mono text-indigo-500">{h.moneda} {h.precio.toLocaleString('es-AR')}</span>
                                            </Button>
                                        ))
                                    }
                                </div>
                            )}
                        </div>

                        {/* Tratamiento Manual */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Tratamiento (Confirmación) *
                            </label>
                            <Input
                                type="text"
                                value={formData.tratamiento}
                                onChange={(e) => setFormData({ ...formData, tratamiento: e.target.value })}
                                placeholder="Nombre del tratamiento"
                                className="w-full px-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus-visible:ring-indigo-500"
                            />
                        </div>

                        {/* Precio */}
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                Precio
                            </label>
                            <div className="flex gap-2">
                                <MoneyInput
                                    value={formData.precio}
                                    onChange={(val) => setFormData({ ...formData, precio: val })}
                                    className="flex-1"
                                    currency={formData.moneda}
                                />
                                <select
                                    value={formData.moneda}
                                    onChange={(e) =>
                                        setFormData({
                                            ...formData,
                                            moneda: e.target.value === 'USD' ? 'USD' : 'ARS',
                                        })
                                    }
                                    className="w-24 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm outline-none"
                                >
                                    <option value="ARS">ARS</option>
                                    <option value="USD">USD</option>
                                </select>
                            </div>
                            {formData.moneda === 'ARS' && tcBna && formData.precio > 0 && (
                                <p className="text-[10px] text-green-600 mt-1 font-medium ml-1">
                                    ≈ ${(formData.precio / tcBna).toFixed(2)} USD
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-end gap-3">
                        <Button
                            variant="ghost"
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={submitting || !formData.tratamiento}
                            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50 hover:bg-indigo-700"
                        >
                            {submitting ? 'Guardando...' : 'Registrar Prestación'}
                            <Check className="w-4 h-4" />
                        </Button>
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
