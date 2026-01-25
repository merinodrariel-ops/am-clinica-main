'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    LockOpen,
    Lock,
    AlertTriangle,
    DollarSign
} from 'lucide-react';
import {
    type Sucursal,
    type CajaAdminArqueo,
    type CuentaFinanciera,
    getArqueoAbierto,
    getCuentas,
    abrirArqueo,
    cerrarArqueo
} from '@/lib/caja-admin';

interface Props {
    sucursal: Sucursal;
    tcBna: number | null;
}

export default function ArqueoTab({ sucursal, tcBna }: Props) {
    const [arqueo, setArqueo] = useState<CajaAdminArqueo | null>(null);
    const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
    const [loading, setLoading] = useState(true);
    const [saldos, setSaldos] = useState<Record<string, number>>({});
    const [observaciones, setObservaciones] = useState('');
    const [submitting, setSubmitting] = useState(false);

    async function loadData() {
        setLoading(true);
        const [arqueoData, cuentasData] = await Promise.all([
            getArqueoAbierto(sucursal.id),
            getCuentas(sucursal.id),
        ]);
        setArqueo(arqueoData);
        setCuentas(cuentasData);

        // Initialize saldos
        const initial: Record<string, number> = {};
        cuentasData.forEach(c => {
            if (c.tipo_cuenta === 'EFECTIVO') {
                initial[c.id] = arqueoData?.saldos_iniciales?.[c.id] || 0;
            }
        });
        setSaldos(initial);

        setLoading(false);
    }

    useEffect(() => {
        loadData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sucursal.id]);

    async function handleAbrir() {
        setSubmitting(true);
        await abrirArqueo(sucursal.id, saldos, tcBna || undefined, 'Admin');
        await loadData();
        setSubmitting(false);
    }

    async function handleCerrar() {
        if (!arqueo) return;

        setSubmitting(true);

        // Calculate difference (simplified)
        const totalInicial = Object.values(arqueo.saldos_iniciales || {}).reduce((a, b) => a + b, 0);
        const totalFinal = Object.values(saldos).reduce((a, b) => a + b, 0);
        const diferencia = totalFinal - totalInicial;
        const diferenciaUsd = tcBna ? diferencia / tcBna : diferencia;

        await cerrarArqueo(arqueo.id, saldos, diferenciaUsd, observaciones);
        await loadData();
        setSubmitting(false);
        setObservaciones('');
    }

    const efectivoCuentas = cuentas.filter(c => c.tipo_cuenta === 'EFECTIVO');

    if (loading) {
        return (
            <div className="p-12 text-center text-slate-400">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full mx-auto mb-4" />
                Cargando estado...
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Status Card */}
            <div className={`p-6 rounded-2xl ${arqueo
                ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800'
                : 'bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-200 dark:border-amber-800'
                }`}>
                <div className="flex items-center gap-4">
                    {arqueo ? (
                        <>
                            <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                                <LockOpen className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-green-800 dark:text-green-300">
                                    Caja Abierta
                                </h3>
                                <p className="text-sm text-green-600 dark:text-green-400">
                                    Abierta: {new Date(arqueo.hora_inicio).toLocaleString('es-AR')}
                                    {tcBna && ` • TC BNA: $${tcBna.toLocaleString('es-AR')}`}
                                </p>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                                <Lock className="w-6 h-6 text-amber-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-amber-800 dark:text-amber-300">
                                    Caja Cerrada
                                </h3>
                                <p className="text-sm text-amber-600 dark:text-amber-400">
                                    Debe abrir caja para registrar movimientos
                                </p>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Conteo de Efectivo */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-6">
                <h3 className="text-lg font-semibold mb-6 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-indigo-500" />
                    {arqueo ? 'Conteo de Cierre' : 'Conteo de Apertura'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {efectivoCuentas.map(cuenta => (
                        <div key={cuenta.id} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl">
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                                {cuenta.nombre_cuenta}
                            </label>
                            <div className="flex items-center gap-2">
                                <span className="text-slate-500">{cuenta.moneda}</span>
                                <input
                                    type="number"
                                    value={saldos[cuenta.id] || 0}
                                    onChange={(e) => setSaldos({
                                        ...saldos,
                                        [cuenta.id]: parseFloat(e.target.value) || 0
                                    })}
                                    className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                                />
                            </div>
                            {arqueo && arqueo.saldos_iniciales?.[cuenta.id] !== undefined && (
                                <p className="text-xs text-slate-400 mt-1">
                                    Inicio: {cuenta.moneda} {arqueo.saldos_iniciales[cuenta.id]?.toLocaleString('es-AR')}
                                </p>
                            )}
                        </div>
                    ))}
                </div>

                {arqueo && (
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">
                            Observaciones de cierre
                        </label>
                        <textarea
                            value={observaciones}
                            onChange={(e) => setObservaciones(e.target.value)}
                            rows={3}
                            placeholder="Comentarios sobre diferencias, notas, etc."
                            className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                        />
                    </div>
                )}

                {/* Difference Warning */}
                {arqueo && (() => {
                    const totalInicial = Object.entries(arqueo.saldos_iniciales || {})
                        .reduce((sum, [id, val]) => sum + (val || 0), 0);
                    const totalFinal = Object.values(saldos).reduce((a, b) => a + b, 0);
                    const diff = totalFinal - totalInicial;
                    if (Math.abs(diff) > 0.01) {
                        return (
                            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl mb-6">
                                <AlertTriangle className="w-5 h-5 text-amber-600" />
                                <span className="text-sm text-amber-700 dark:text-amber-400">
                                    Diferencia detectada: {diff > 0 ? '+' : ''}{diff.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                    {observaciones.trim() === '' && ' - Requiere comentario'}
                                </span>
                            </div>
                        );
                    }
                    return null;
                })()}

                <div className="flex justify-end">
                    {arqueo ? (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleCerrar}
                            disabled={submitting}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-600 text-white rounded-xl font-medium shadow-lg disabled:opacity-50"
                        >
                            <Lock className="w-5 h-5" />
                            {submitting ? 'Cerrando...' : 'Cerrar Caja'}
                        </motion.button>
                    ) : (
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleAbrir}
                            disabled={submitting}
                            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-xl font-medium shadow-lg disabled:opacity-50"
                        >
                            <LockOpen className="w-5 h-5" />
                            {submitting ? 'Abriendo...' : 'Abrir Caja'}
                        </motion.button>
                    )}
                </div>
            </div>
        </div>
    );
}
