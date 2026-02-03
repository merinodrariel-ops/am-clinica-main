'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Plus,
    Search,
    Filter,
    Calendar,
    Paperclip,
    AlertCircle,
    Check,
    X,
    ChevronDown,
    FileText,
    Receipt
} from 'lucide-react';
import {
    type Sucursal,
    type CajaAdminMovimiento,
    type CuentaFinanciera,
    type MovimientoLinea,
    getMovimientos,
    getCuentas,
    createMovimiento,
    SUBTIPOS_MOVIMIENTO,
    SUBTIPOS_ADJUNTO_OBLIGATORIO
} from '@/lib/caja-admin';
import { useUserRole } from '@/hooks/useUserRole';

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
}

const TIPOS_MOVIMIENTO = [
    { value: 'EGRESO', label: 'Egreso' },
    { value: 'INGRESO_ADMIN', label: 'Ingreso Administrativo' },
    { value: 'INGRESO_PACIENTE', label: 'Ingreso Paciente', onlyUnificada: true },
    { value: 'CAMBIO_MONEDA', label: 'Cambio de Moneda' },
    { value: 'RETIRO', label: 'Retiro' },
    { value: 'TRANSFERENCIA', label: 'Transferencia' },
    { value: 'AJUSTE_CAJA', label: 'Ajuste de Caja' },
];

export default function MovimientosTab({ sucursal, tcBna }: Props) {
    const { role } = useUserRole();
    const [movimientos, setMovimientos] = useState<CajaAdminMovimiento[]>([]);
    const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [mesActual, setMesActual] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterTipo, setFilterTipo] = useState<string>('');

    // Form state
    const [formData, setFormData] = useState({
        tipo_movimiento: 'EGRESO',
        subtipo: '',
        descripcion: '',
        nota: '',
    });
    const [formLineas, setFormLineas] = useState<MovimientoLinea[]>([]);
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    async function loadData() {
        setLoading(true);
        const [movData, cuentasData] = await Promise.all([
            getMovimientos({ sucursalId: sucursal.id, mes: mesActual }),
            getCuentas(sucursal.id),
        ]);
        setMovimientos(movData);
        setCuentas(cuentasData);
        setLoading(false);
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sucursal.id, mesActual]);

    function addLinea() {
        if (cuentas.length === 0) return;
        setFormLineas([...formLineas, {
            cuenta_id: cuentas[0].id,
            importe: 0,
            moneda: cuentas[0].moneda,
        }]);
    }

    function removeLinea(index: number) {
        setFormLineas(formLineas.filter((_, i) => i !== index));
    }

    function updateLinea(index: number, updates: Partial<MovimientoLinea>) {
        const newLineas = [...formLineas];
        newLineas[index] = { ...newLineas[index], ...updates };

        // Update moneda based on cuenta
        if (updates.cuenta_id) {
            const cuenta = cuentas.find(c => c.id === updates.cuenta_id);
            if (cuenta) {
                newLineas[index].moneda = cuenta.moneda;
            }
        }

        // Calculate USD equivalent
        if (newLineas[index].moneda === 'ARS' && tcBna) {
            newLineas[index].usd_equivalente = newLineas[index].importe / tcBna;
        } else if (newLineas[index].moneda === 'USD') {
            newLineas[index].usd_equivalente = newLineas[index].importe;
        }

        setFormLineas(newLineas);
    }

    async function handleSubmit() {
        setFormError(null);

        // Validations
        if (!formData.descripcion.trim()) {
            setFormError('La descripción es requerida');
            return;
        }

        if (formLineas.length === 0) {
            setFormError('Debe agregar al menos una línea de movimiento');
            return;
        }

        // Check adjunto obligatorio
        if (SUBTIPOS_ADJUNTO_OBLIGATORIO.includes(formData.subtipo)) {
            // For now, just warn - in production would block
            console.warn('Adjunto obligatorio para este subtipo');
        }

        setSubmitting(true);

        const { error } = await createMovimiento(
            {
                sucursal_id: sucursal.id,
                tipo_movimiento: formData.tipo_movimiento as CajaAdminMovimiento['tipo_movimiento'],
                tc_bna_venta: tcBna || undefined,
                subtipo: formData.subtipo || undefined,
                descripcion: formData.descripcion,
                nota: formData.nota || undefined,

                tc_fuente: tcBna ? 'BNA_AUTO' : 'N/A',
                tc_fecha_hora: new Date().toISOString(),
            },
            formLineas
        );

        setSubmitting(false);

        if (error) {
            setFormError(error.message);
            return;
        }

        // Reset form and reload
        setShowForm(false);
        setFormData({ tipo_movimiento: 'EGRESO', subtipo: '', descripcion: '', nota: '' });
        setFormLineas([]);
        loadData();
    }

    const filteredMovimientos = movimientos.filter(m => {
        if (searchTerm && !m.descripcion.toLowerCase().includes(searchTerm.toLowerCase())) {
            return false;
        }
        if (filterTipo && m.tipo_movimiento !== filterTipo) {
            return false;
        }
        return true;
    });

    const tiposDisponibles = TIPOS_MOVIMIENTO.filter(t =>
        !t.onlyUnificada || sucursal.modo_caja === 'UNIFICADA'
    );

    return (
        <div className="space-y-6">
            {/* Header with Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {/* Month Selector */}
                    <div className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl px-4 py-2 shadow-sm border border-slate-200 dark:border-slate-700">
                        <Calendar className="w-5 h-5 text-indigo-500" />
                        <input
                            type="month"
                            value={mesActual}
                            onChange={(e) => setMesActual(e.target.value)}
                            className="bg-transparent border-none outline-none text-sm font-medium"
                        />
                    </div>

                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-10 pr-4 py-2 bg-white dark:bg-slate-800 rounded-xl text-sm border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>

                    {/* Filter */}
                    <div className="relative">
                        <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <select
                            value={filterTipo}
                            onChange={(e) => setFilterTipo(e.target.value)}
                            className="pl-10 pr-8 py-2 bg-white dark:bg-slate-800 rounded-xl text-sm border border-slate-200 dark:border-slate-700 appearance-none"
                        >
                            <option value="">Todos los tipos</option>
                            {tiposDisponibles.map(t => (
                                <option key={t.value} value={t.value}>{t.label}</option>
                            ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                </div>

                {role === 'owner' && (
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 transition-shadow"
                    >
                        <Plus className="w-5 h-5" />
                        Nuevo Movimiento
                    </motion.button>
                )}
            </div>

            {/* New Movement Form */}
            {showForm && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold">Nuevo Movimiento</h3>
                        <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Tipo de Movimiento *
                            </label>
                            <select
                                value={formData.tipo_movimiento}
                                onChange={(e) => setFormData({ ...formData, tipo_movimiento: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            >
                                {tiposDisponibles.map(t => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Subtipo / Categoría
                            </label>
                            <select
                                value={formData.subtipo}
                                onChange={(e) => setFormData({ ...formData, subtipo: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            >
                                <option value="">Seleccionar...</option>
                                {SUBTIPOS_MOVIMIENTO.map(s => (
                                    <option key={s} value={s}>
                                        {s} {SUBTIPOS_ADJUNTO_OBLIGATORIO.includes(s) ? '📎' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Descripción *
                            </label>
                            <input
                                type="text"
                                value={formData.descripcion}
                                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                placeholder="Descripción del movimiento..."
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Nota adicional
                            </label>
                            <textarea
                                value={formData.nota}
                                onChange={(e) => setFormData({ ...formData, nota: e.target.value })}
                                rows={2}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                            />
                        </div>
                    </div>

                    {/* Lines */}
                    <div className="mb-6">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                Líneas de Movimiento
                            </label>
                            <button
                                onClick={addLinea}
                                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                            >
                                + Agregar línea
                            </button>
                        </div>

                        {formLineas.length === 0 ? (
                            <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-900 rounded-xl">
                                <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No hay líneas. Agregue al menos una.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {formLineas.map((linea, idx) => (
                                    <div key={idx} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-xl">
                                        <select
                                            value={linea.cuenta_id}
                                            onChange={(e) => updateLinea(idx, { cuenta_id: e.target.value })}
                                            className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                        >
                                            {cuentas.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.nombre_cuenta} ({c.moneda})
                                                </option>
                                            ))}
                                        </select>
                                        <input
                                            type="number"
                                            value={linea.importe}
                                            onChange={(e) => updateLinea(idx, { importe: parseFloat(e.target.value) || 0 })}
                                            placeholder="Importe"
                                            className="w-32 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                                        />
                                        <span className="text-sm text-slate-500 w-12">{linea.moneda}</span>
                                        {linea.usd_equivalente !== undefined && linea.moneda !== 'USD' && (
                                            <span className="text-sm text-green-600">
                                                ≈ ${linea.usd_equivalente.toFixed(2)} USD
                                            </span>
                                        )}
                                        <button
                                            onClick={() => removeLinea(idx)}
                                            className="text-red-500 hover:text-red-600"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Adjunto warning */}
                    {SUBTIPOS_ADJUNTO_OBLIGATORIO.includes(formData.subtipo) && (
                        <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-4">
                            <Paperclip className="w-5 h-5 text-amber-600" />
                            <span className="text-sm text-amber-700 dark:text-amber-400">
                                Este subtipo requiere adjuntar comprobante
                            </span>
                        </div>
                    )}

                    {formError && (
                        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl mb-4">
                            <AlertCircle className="w-5 h-5 text-red-600" />
                            <span className="text-sm text-red-700 dark:text-red-400">{formError}</span>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setShowForm(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-medium disabled:opacity-50"
                        >
                            {submitting ? 'Guardando...' : 'Guardar Movimiento'}
                            <Check className="w-4 h-4" />
                        </button>
                    </div>
                </motion.div>
            )}

            {/* Movements Table */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center text-slate-400">
                        <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                        Cargando movimientos...
                    </div>
                ) : filteredMovimientos.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <Receipt className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No hay movimientos para este período</p>
                    </div>
                ) : (
                    <table className="w-full">
                        <thead className="bg-slate-50 dark:bg-slate-900">
                            <tr>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Fecha</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Tipo</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Descripción</th>
                                <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase">Subtipo</th>
                                <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase">USD Equiv.</th>
                                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {filteredMovimientos.map((mov) => (
                                <motion.tr
                                    key={mov.id}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors"
                                >
                                    <td className="px-6 py-4 text-sm">
                                        {new Date(mov.fecha_hora).toLocaleDateString('es-AR')}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${mov.tipo_movimiento === 'EGRESO'
                                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                            : mov.tipo_movimiento.includes('INGRESO')
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                            {mov.tipo_movimiento.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium">{mov.descripcion}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{mov.subtipo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-right font-mono">
                                        ${mov.usd_equivalente_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {mov.estado === 'Registrado' ? (
                                            <Check className="w-5 h-5 text-green-500 mx-auto" />
                                        ) : (
                                            <X className="w-5 h-5 text-red-500 mx-auto" />
                                        )}
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
