'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Plus,
    Calendar,
    Clock,
    FileText,
    Check,
    X,
    DollarSign,
    User,
    AlertTriangle
} from 'lucide-react';
import {
    type Sucursal,
    type Personal,
    type RegistroHoras,
    type LiquidacionMensual,
    getPersonal,
    getRegistroHoras,
    getLiquidaciones,
    registrarHoras,
    generarLiquidacion,
    countObservadosPendientes
} from '@/lib/caja-admin';
import ObservadosTab from './ObservadosTab';
import SensitiveValue from '@/components/ui/SensitiveValue';

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
}

type SubTab = 'registros' | 'observados';

export default function PersonalTab({ sucursal, tcBna }: Props) {
    const [activeSubTab, setActiveSubTab] = useState<SubTab>('registros');
    const [observadosCount, setObservadosCount] = useState(0);
    const [personal, setPersonal] = useState<Personal[]>([]);
    const [registros, setRegistros] = useState<RegistroHoras[]>([]);
    const [liquidaciones, setLiquidaciones] = useState<LiquidacionMensual[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHorasForm, setShowHorasForm] = useState(false);
    const [mesActual, setMesActual] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Form state
    const [horasForm, setHorasForm] = useState({
        personal_id: '',
        fecha: new Date().toISOString().split('T')[0],
        horas: 0,
        observaciones: '',
    });
    const [submitting, setSubmitting] = useState(false);

    async function loadData() {
        setLoading(true);
        const [personalData, registrosData, liquidacionesData, obsCount] = await Promise.all([
            getPersonal(),
            getRegistroHoras({ mes: mesActual }),
            getLiquidaciones({ mes: mesActual }),
            countObservadosPendientes(mesActual),
        ]);
        setPersonal(personalData);
        setRegistros(registrosData);
        setLiquidaciones(liquidacionesData);
        setObservadosCount(obsCount);

        if (personalData.length > 0) {
            setHorasForm(f => ({ ...f, personal_id: personalData[0].id }));
        }

        setLoading(false);
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mesActual]);

    async function handleRegistrarHoras() {
        if (!horasForm.personal_id || horasForm.horas <= 0) return;

        setSubmitting(true);
        await registrarHoras(
            horasForm.personal_id,
            horasForm.fecha,
            horasForm.horas,
            horasForm.observaciones || undefined
        );
        setSubmitting(false);
        setShowHorasForm(false);
        setHorasForm({
            personal_id: personal[0]?.id || '',
            fecha: new Date().toISOString().split('T')[0],
            horas: 0,
            observaciones: '',
        });
        loadData();
    }

    async function handleGenerarLiquidacion(personalId: string) {
        setSubmitting(true);
        await generarLiquidacion(personalId, mesActual, tcBna || undefined);
        setSubmitting(false);
        loadData();
    }

    // Calculate hours per person
    const horasPorPersona = personal.map(p => {
        const regs = registros.filter(r => r.personal_id === p.id);
        const totalHoras = regs.reduce((sum, r) => sum + r.horas, 0);
        const liquidacion = liquidaciones.find(l => l.personal_id === p.id);
        return {
            personal: p,
            registros: regs,
            totalHoras,
            liquidacion,
        };
    });

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                Cargando personal...
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

                {activeSubTab === 'registros' && (
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowHorasForm(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg"
                    >
                        <Plus className="w-5 h-5" />
                        Registrar Horas
                    </motion.button>
                )}
            </div>

            {/* Sub-Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-700">
                <button
                    onClick={() => setActiveSubTab('registros')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'registros'
                        ? 'border-indigo-500 text-indigo-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Registros
                    </div>
                </button>
                <button
                    onClick={() => setActiveSubTab('observados')}
                    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSubTab === 'observados'
                        ? 'border-amber-500 text-amber-600'
                        : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4" />
                        Observados
                        {observadosCount > 0 && (
                            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-amber-500 rounded-full">
                                {observadosCount}
                            </span>
                        )}
                    </div>
                </button>
            </div>

            {/* Observados Tab */}
            {activeSubTab === 'observados' && (
                <ObservadosTab
                    mes={mesActual}
                    onCountChange={(count) => setObservadosCount(count)}
                />
            )}

            {/* Registros Tab Content */}
            {activeSubTab === 'registros' && (
                <>

                    {/* Register Hours Form */}
                    {showHorasForm && (
                        <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-lg font-semibold">Registrar Horas</h3>
                                <button onClick={() => setShowHorasForm(false)} className="text-slate-400 hover:text-slate-600">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Personal *
                                    </label>
                                    <select
                                        value={horasForm.personal_id}
                                        onChange={(e) => setHorasForm({ ...horasForm, personal_id: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    >
                                        {personal.map(p => (
                                            <option key={p.id} value={p.id}>{p.nombre} - {p.rol}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Fecha *
                                    </label>
                                    <input
                                        type="date"
                                        value={horasForm.fecha}
                                        onChange={(e) => setHorasForm({ ...horasForm, fecha: e.target.value })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Horas *
                                    </label>
                                    <input
                                        type="number"
                                        step="0.5"
                                        min="0"
                                        value={horasForm.horas}
                                        onChange={(e) => setHorasForm({ ...horasForm, horas: parseFloat(e.target.value) || 0 })}
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Observaciones
                                    </label>
                                    <input
                                        type="text"
                                        value={horasForm.observaciones}
                                        onChange={(e) => setHorasForm({ ...horasForm, observaciones: e.target.value })}
                                        placeholder="Opcional..."
                                        className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setShowHorasForm(false)}
                                    className="px-4 py-2 text-slate-600 hover:text-slate-800"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleRegistrarHoras}
                                    disabled={submitting || horasForm.horas <= 0}
                                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50"
                                >
                                    {submitting ? 'Guardando...' : 'Registrar'}
                                    <Check className="w-4 h-4" />
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* Personal Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {horasPorPersona.map(({ personal: p, totalHoras, liquidacion }) => (
                            <div
                                key={p.id}
                                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-5"
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                                        <User className="w-6 h-6 text-purple-600" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold">{p.nombre}</h4>
                                        <p className="text-sm text-slate-500">{p.rol}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4 mb-4">
                                    <div>
                                        <p className="text-sm text-slate-500">Horas este mes</p>
                                        <p className="text-xl font-bold">{totalHoras}h</p>
                                    </div>
                                    <div>
                                        <p className="text-sm text-slate-500">Valor hora</p>
                                        <p className="text-xl font-bold text-green-600">
                                            <SensitiveValue
                                                value={p.valor_hora_ars}
                                                format="currency"
                                                fieldId={`valor-hora-${p.id}`}
                                            />
                                        </p>
                                    </div>
                                </div>

                                <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl mb-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm text-slate-600">Total estimado:</span>
                                        <span className="font-bold">
                                            <SensitiveValue
                                                value={totalHoras * p.valor_hora_ars}
                                                format="currency-ars"
                                                fieldId={`total-${p.id}`}
                                            />
                                        </span>
                                    </div>
                                    {tcBna && (
                                        <div className="flex items-center justify-between mt-1">
                                            <span className="text-xs text-slate-400">Equiv. USD:</span>
                                            <span className="text-sm text-green-600">
                                                <SensitiveValue
                                                    value={(totalHoras * p.valor_hora_ars) / tcBna}
                                                    format="currency"
                                                    fieldId={`total-usd-${p.id}`}
                                                />
                                            </span>
                                        </div>
                                    )}
                                </div>

                                {liquidacion ? (
                                    <div className={`p-3 rounded-xl text-center ${liquidacion.estado === 'Pagado'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700'
                                        : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700'
                                        }`}>
                                        <span className="text-sm font-medium">
                                            Liquidación: {liquidacion.estado}
                                        </span>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleGenerarLiquidacion(p.id)}
                                        disabled={submitting || totalHoras === 0}
                                        className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 rounded-xl font-medium disabled:opacity-50 hover:bg-indigo-200"
                                    >
                                        <DollarSign className="w-4 h-4" />
                                        Generar Liquidación
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Recent Registros Table */}
                    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Clock className="w-5 h-5 text-indigo-500" />
                                Registro de Horas del Mes
                            </h3>
                        </div>

                        {registros.length === 0 ? (
                            <div className="p-12 text-center text-slate-400">
                                <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                <p>No hay horas registradas este mes</p>
                            </div>
                        ) : (
                            <table className="w-full">
                                <thead className="bg-slate-50 dark:bg-slate-900">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Personal</th>
                                        <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Horas</th>
                                        <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Observaciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {registros.map((reg) => {
                                        const persona = personal.find(p => p.id === reg.personal_id);
                                        return (
                                            <tr key={reg.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                                                <td className="px-6 py-3 text-sm">
                                                    {new Date(reg.fecha).toLocaleDateString('es-AR')}
                                                </td>
                                                <td className="px-6 py-3 text-sm font-medium">{persona?.nombre || '-'}</td>
                                                <td className="px-6 py-3 text-sm text-center font-bold">{reg.horas}h</td>
                                                <td className="px-6 py-3 text-sm text-slate-500">{reg.observaciones || '-'}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

