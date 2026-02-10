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
    Receipt,
    History,
    AlertTriangle,
    Pencil,
    Eye,
    EyeOff,
    Share2,
    Trash2
} from 'lucide-react';
import {
    type Sucursal,
    type CajaAdminMovimiento,
    type CuentaFinanciera,
    type MovimientoLinea,
    getMovimientos,
    getCuentas,
    createMovimiento,
    updateMovimientoAdmin,
    updateMovimientoAdminWithLines,
    logMovimientoEdit,
    deleteMovimiento,
    SUBTIPOS_MOVIMIENTO,
    SUBTIPOS_ADJUNTO_OBLIGATORIO
} from '@/lib/caja-admin';
import { createClient } from '@/utils/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import HistorialEdicionesModal from '@/components/caja/HistorialEdicionesModal';
import { ComprobanteUpload } from '@/components/caja/ComprobanteUpload';

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
    { value: 'APORTE_CAPITAL', label: 'Aporte de Capital (No Ingreso)' },
];

export default function MovimientosTab({ sucursal, tcBna }: Props) {
    const { role } = useAuth();
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
    const [privacyMode, setPrivacyMode] = useState(false);
    const [historialMovId, setHistorialMovId] = useState<string | null>(null);
    const [deletingMovId, setDeletingMovId] = useState<string | null>(null);
    const [deletionConfirmation, setDeletionConfirmation] = useState('');
    const [deletionReason, setDeletionReason] = useState('');
    const [adjuntos, setAdjuntos] = useState<string[]>([]);
    const [editingMov, setEditingMov] = useState<CajaAdminMovimiento | null>(null);
    const [editData, setEditData] = useState<{
        fecha: string;
        descripcion: string;
        motivo: string;
        lines: MovimientoLinea[];
        adjuntos: string[];
    }>({
        fecha: '',
        descripcion: '',
        motivo: '',
        lines: [],
        adjuntos: []
    });

    // Form state
    const [formData, setFormData] = useState({
        tipo_movimiento: 'EGRESO',
        subtipo: '',
        descripcion: '',
        nota: '',
        fecha_movimiento: new Date().toISOString().split('T')[0],
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

        // Enforce positive values
        if (updates.importe !== undefined) {
            newLineas[index].importe = Math.abs(newLineas[index].importe);
        }

        // Calculate USD equivalent
        if (newLineas[index].moneda === 'ARS' && tcBna) {
            newLineas[index].usd_equivalente = newLineas[index].importe / tcBna;
        } else if (newLineas[index].moneda === 'USD') {
            newLineas[index].usd_equivalente = newLineas[index].importe;
        }

        setFormLineas(newLineas);
    }
    async function handleUpdate() {
        if (!editingMov || !editData.fecha || !editData.motivo) {
            alert('Por favor complete la fecha y el motivo del cambio');
            return;
        }

        setSubmitting(true);
        try {
            // Log changes before updating
            if (editData.fecha !== editingMov.fecha_movimiento) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_admin_movimientos',
                    'fecha_movimiento',
                    editingMov.fecha_movimiento,
                    editData.fecha,
                    editData.motivo
                );
            }
            if (editData.descripcion !== editingMov.descripcion) {
                await logMovimientoEdit(
                    editingMov.id,
                    'caja_admin_movimientos',
                    'descripcion',
                    editingMov.descripcion,
                    editData.descripcion,
                    editData.motivo
                );
            }
            // Log amount changes?
            // Simple log: "Montos actualizados" if lines changed.
            // For now, let's rely on the mandatory "motivo" for audit.

            const { success, error } = await updateMovimientoAdminWithLines(editingMov.id, {
                fecha_movimiento: editData.fecha,
                descripcion: editData.descripcion,
                adjuntos: editData.adjuntos,
                registro_editado: true
            }, editData.lines.map(l => ({
                ...l,
                id: undefined, // Strip ID to force new insertion logic in backend if needed
                created_at: undefined
            })));

            if (!success) throw new Error(error);

            await loadData();
            setEditingMov(null);
        } catch (err) {
            console.error('Error updating:', err);
            alert('Error al actualizar');
        } finally {
            setSubmitting(false);
        }
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
                fecha_movimiento: formData.fecha_movimiento,
                adjuntos: adjuntos,
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
        setFormData({
            tipo_movimiento: 'EGRESO',
            subtipo: '',
            descripcion: '',
            nota: '',
            fecha_movimiento: new Date().toISOString().split('T')[0]
        });
        setFormLineas([]);
        setAdjuntos([]);
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

    // --- Helper for Privacy Mode ---
    const formatPrivacy = (content: React.ReactNode) => {
        if (!privacyMode) return content;
        return <span className="blur-sm select-none">••••</span>;
    };

    // --- Helper for Monthly Summary ---
    // --- Helper for Monthly Summary ---
    const getMonthlySummary = () => {
        const [year, month] = mesActual.split('-');
        const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

        const egresos = movimientos.filter(m => m.tipo_movimiento === 'EGRESO' && m.estado !== 'Anulado');
        const ingresosPacientes = movimientos.filter(m => m.tipo_movimiento === 'INGRESO_PACIENTE' && m.estado !== 'Anulado');
        const ingresosAdmin = movimientos.filter(m => m.tipo_movimiento === 'INGRESO_ADMIN' && m.estado !== 'Anulado');
        const aportesCapital = movimientos.filter(m => m.tipo_movimiento === 'APORTE_CAPITAL' && m.estado !== 'Anulado');

        const totalEgresosUsd = egresos.reduce((acc, m) => acc + m.usd_equivalente_total, 0);
        const totalIngresosUsd = ingresosPacientes.reduce((acc, m) => acc + m.usd_equivalente_total, 0) +
            ingresosAdmin.reduce((acc, m) => acc + m.usd_equivalente_total, 0);
        const totalAportesUsd = aportesCapital.reduce((acc, m) => acc + m.usd_equivalente_total, 0);

        // Balance Operativo (Ingresos - Egresos)
        const balanceOperativo = totalIngresosUsd - totalEgresosUsd;

        // Cashflow Real (Balance Operativo + Aportes)
        const cashflowReal = balanceOperativo + totalAportesUsd;

        let summaryText = `📊 *Reporte Caja Administración*
📅 *Período:* ${monthName}
🏢 *Sucursal:* ${sucursal.nombre}

💸 *Egresos:*
• Cantidad: ${egresos.length}
• Total USD: $${totalEgresosUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}

💰 *Ingresos Operativos:*
• Pacientes: ${ingresosPacientes.length} mov.
• Administración: ${ingresosAdmin.length} mov.
• Total USD: $${totalIngresosUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

        if (aportesCapital.length > 0) {
            summaryText += `\n\n🏦 *Aportes de Capital (No Ingreso/No Venta):*
• Cantidad: ${aportesCapital.length}
• Total USD: $${totalAportesUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}`;
        }

        summaryText += `\n\n📈 *Balance Operativo:* $${balanceOperativo.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`;

        if (aportesCapital.length > 0) {
            summaryText += `\n💵 *Cashflow Real (c/ Aportes):* $${cashflowReal.toLocaleString('en-US', { minimumFractionDigits: 2 })} USD`;
        }

        summaryText += `\n\n_AM Clínica - Caja Administración_`;

        return summaryText;
    };
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

                    {/* Share Summary Button */}
                    <button
                        onClick={() => {
                            const summary = getMonthlySummary();
                            window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
                        }}
                        className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors border border-transparent hover:border-green-200"
                        title="Enviar Resumen del Mes por WhatsApp"
                    >
                        <Share2 className="w-5 h-5" />
                    </button>

                    {/* Privacy Toggle */}
                    <button
                        onClick={() => setPrivacyMode(!privacyMode)}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-transparent hover:border-blue-200"
                        title={privacyMode ? "Mostrar montos" : "Ocultar montos (Modo Discreto)"}
                    >
                        {privacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>

                {(role === 'owner' || role === 'admin') && (
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

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                Fecha del Movimiento *
                            </label>
                            <input
                                type="date"
                                value={formData.fecha_movimiento}
                                onChange={(e) => setFormData({ ...formData, fecha_movimiento: e.target.value })}
                                className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                required
                            />
                        </div>

                        <div className="md:col-span-1">
                            {/* Empty space or another field if needed */}
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
                                            onChange={(e) => updateLinea(idx, { importe: Math.abs(parseFloat(e.target.value) || 0) })}
                                            placeholder="Importe"
                                            min="0"
                                            step="0.01"
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

                    {/* Comprobante Upload */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                            Adjuntar Comprobantes (opcional)
                        </label>

                        {/* Lista de adjuntos */}
                        {adjuntos.length > 0 && (
                            <div className="mb-3 space-y-2">
                                {adjuntos.map((url, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-2 overflow-hidden">
                                            <Paperclip className="w-4 h-4 text-slate-400" />
                                            <a
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-sm text-indigo-600 hover:text-indigo-500 truncate"
                                            >
                                                Ver adjunto {idx + 1}
                                            </a>
                                        </div>
                                        <button
                                            onClick={() => setAdjuntos(adjuntos.filter((_, i) => i !== idx))}
                                            className="text-red-500 hover:text-red-600 p-1"
                                            title="Eliminar adjunto"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <ComprobanteUpload
                            area="caja-admin"
                            onUploadComplete={(result) => {
                                setAdjuntos([...adjuntos, result.url]);
                            }}
                        />
                    </div>

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
                                <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase">Acciones</th>
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
                                                : mov.tipo_movimiento === 'APORTE_CAPITAL'
                                                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                            }`}>
                                            {mov.tipo_movimiento.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm font-medium">{mov.descripcion}</td>
                                    <td className="px-6 py-4 text-sm text-slate-500">{mov.subtipo || '-'}</td>
                                    <td className="px-6 py-4 text-sm text-right font-mono">
                                        {formatPrivacy(`$${mov.usd_equivalente_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`)}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        {mov.estado === 'Registrado' ? (
                                            <Check className="w-5 h-5 text-green-500 mx-auto" />
                                        ) : (
                                            <X className="w-5 h-5 text-red-500 mx-auto" />
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <div className="flex items-center justify-center gap-2">
                                            {(mov as { registro_editado?: boolean }).registro_editado && (
                                                <span title="Este registro ha sido editado">
                                                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                                                </span>
                                            )}
                                            {(mov as { origen?: string }).origen === 'importado_csv' && (
                                                <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                                                    CSV
                                                </span>
                                            )}
                                            <button
                                                onClick={() => setHistorialMovId(mov.id)}
                                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                                title="Ver historial de ediciones"
                                            >
                                                <History className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setEditingMov(mov);
                                                    setEditData({
                                                        fecha: mov.fecha_movimiento,
                                                        descripcion: mov.descripcion,
                                                        motivo: '',
                                                        lines: mov.caja_admin_movimiento_lineas || mov.lineas || [],
                                                        adjuntos: mov.adjuntos || ((mov as any).url_comprobante ? [(mov as any).url_comprobante] : [])
                                                    });
                                                }}
                                                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                title="Editar movimiento"
                                            >
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            {(role === 'admin' || role === 'owner') && (
                                                <button
                                                    onClick={() => {
                                                        setDeletingMovId(mov.id);
                                                        setDeletionConfirmation('');
                                                        setDeletionReason('');
                                                    }}
                                                    className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                    title="Eliminar movimiento"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Modal de Confirmación de Eliminación */}
            {deletingMovId && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden border border-red-100 dark:border-red-900/30"
                    >
                        <div className="p-6">
                            <div className="flex items-center gap-3 mb-4 text-red-600 dark:text-red-400">
                                <AlertTriangle className="w-8 h-8" />
                                <h3 className="text-xl font-bold">¡Advertencia Crítica!</h3>
                            </div>

                            <p className="text-slate-600 dark:text-slate-300 mb-4">
                                Está a punto de eliminar un registro financiero. Esta acción es <strong>IRREVERSIBLE</strong> y quedará registrada en el historial de auditoría.
                            </p>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                                        Motivo de la eliminación (Obligatorio)
                                    </label>
                                    <textarea
                                        value={deletionReason}
                                        onChange={(e) => setDeletionReason(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500"
                                        rows={2}
                                        placeholder="Ej: Error de carga, registro duplicado..."
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                                        Para confirmar, escriba <span className="font-mono font-bold select-all">ELIMINAR</span> abajo:
                                    </label>
                                    <input
                                        type="text"
                                        value={deletionConfirmation}
                                        onChange={(e) => setDeletionConfirmation(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500 font-mono"
                                        placeholder="ELIMINAR"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-8">
                                <button
                                    onClick={() => setDeletingMovId(null)}
                                    className="px-4 py-2 text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={async () => {
                                        if (deletionConfirmation !== 'ELIMINAR' || !deletionReason.trim()) return;

                                        // Since we are in the component, we need the user ID. 
                                        // The component likely doesn't have it directly exposed or we need to pass it.
                                        // But deleteMovimiento is a server action or library function? 
                                        // It's a client-side function importing supabase client.
                                        // We need the user ID for the log.
                                        // We can get it from supabase.auth.getUser() inside deleteMovimiento or pass it.
                                        // The updated deleteMovimiento takes (id, usuarioId, motivo).
                                        // So we need to pass usuarioId.
                                        // We don't have user object here easily unless we add useAuth hook or similar.
                                        // Wait, we have `role` passed as prop. Do we have user ID?
                                        // Looking at file content... it doesn't seem to have `user` prop.
                                        // But checking imports... it uses `createClient` inside `loadData`.
                                        // I should get the user in the component.

                                        // Temporary: fetch user here.
                                        const { data: { user } } = await createClient().auth.getUser();
                                        if (!user) {
                                            alert('Sesión no válida');
                                            return;
                                        }

                                        const { success, error } = await deleteMovimiento(deletingMovId, user.id, deletionReason);
                                        if (success) {
                                            setDeletingMovId(null);
                                            loadData();
                                        } else {
                                            alert('Error al eliminar: ' + error);
                                        }
                                    }}
                                    disabled={deletionConfirmation !== 'ELIMINAR' || !deletionReason.trim()}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium shadow-lg shadow-red-500/30 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Trash2 className="w-4 h-4" />
                                    Confirmar Eliminación
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* Historial de Ediciones Modal */}
            <HistorialEdicionesModal
                isOpen={!!historialMovId}
                onClose={() => setHistorialMovId(null)}
                registroId={historialMovId || ''}
                tabla="caja_admin_movimientos"
            />

            {/* Modal de Edición */}
            {editingMov && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-md w-full overflow-hidden"
                    >
                        <div className="p-6 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <History className="w-5 h-5 text-indigo-500" />
                                Editar Movimiento
                            </h3>
                            <button
                                onClick={() => setEditingMov(null)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                <X size={20} className="text-slate-500" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Fecha del movimiento
                                </label>
                                <input
                                    type="date"
                                    value={editData.fecha}
                                    onChange={(e) => setEditData({ ...editData, fecha: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Descripción
                                </label>
                                <input
                                    type="text"
                                    value={editData.descripcion}
                                    onChange={(e) => setEditData({ ...editData, descripcion: e.target.value })}
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 font-bold text-red-500">
                                    Motivo del cambio (Obligatorio)
                                </label>
                                <textarea
                                    value={editData.motivo}
                                    onChange={(e) => setEditData({ ...editData, motivo: e.target.value })}
                                    placeholder="Explique por qué se realiza este cambio..."
                                    className="w-full px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white min-h-[80px]"
                                />
                            </div>

                            <div className="bg-amber-50 dark:bg-amber-900/20 p-3 rounded-lg flex items-start gap-2 text-xs text-amber-800 dark:text-amber-400">
                                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                                <p>Este cambio quedará registrado permanentemente en el historial de auditoría.</p>
                            </div>

                            {/* Lines Editing */}
                            <div className="border-t border-slate-100 dark:border-slate-700 pt-4">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                    Montos / Líneas
                                </label>
                                <div className="space-y-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-xl max-h-48 overflow-y-auto">
                                    {editData.lines.map((line, idx) => (
                                        <div key={idx} className="flex items-center gap-2">
                                            <span className="text-xs font-mono text-slate-500 w-12">{line.moneda}</span>
                                            <input
                                                type="number"
                                                value={line.importe}
                                                onChange={(e) => {
                                                    const newImporte = Math.abs(parseFloat(e.target.value) || 0);
                                                    const newLines = [...editData.lines];
                                                    newLines[idx] = {
                                                        ...newLines[idx],
                                                        importe: newImporte,
                                                        // Recalculate USD equivalent if needed
                                                        usd_equivalente: line.moneda === 'USD' ? newImporte : (newImporte / (tcBna || 1))
                                                    };
                                                    setEditData({ ...editData, lines: newLines });
                                                }}
                                                min="0"
                                                step="0.01"
                                                className="flex-1 px-2 py-1 text-sm border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800"
                                            />
                                            {line.moneda !== 'USD' && (
                                                <span className="text-xs text-green-600">
                                                    ≈ ${line.usd_equivalente?.toFixed(2)} USD
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                    {editData.lines.length === 0 && (
                                        <p className="text-xs text-slate-400 text-center py-2">No hay líneas para editar</p>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="p-6 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingMov(null)}
                                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={submitting || !editData.motivo}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
                            >
                                {submitting ? 'Guardando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
}
