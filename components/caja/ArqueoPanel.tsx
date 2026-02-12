'use client';

import { useState, useEffect } from 'react';
import { Loader2, DollarSign, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { supabase, CajaArqueo } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';
import { getUltimoCierre, cerrarCajaDelDia } from '@/lib/caja-recepcion';
import { formatDateForLocale, getLocalISODate } from '@/lib/local-date';

interface ArqueoPanelProps {
    bnaRate: number;
    onArqueoChange?: () => void;
}

export default function ArqueoPanel({ bnaRate, onArqueoChange }: ArqueoPanelProps) {
    const [cierreHoy, setCierreHoy] = useState<CajaArqueo | null>(null);
    const [ultimoCierre, setUltimoCierre] = useState<CajaArqueo | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCerrarModal, setShowCerrarModal] = useState(false);

    // Expected balances for comparison
    const [saldosEsperados, setSaldosEsperados] = useState<{ ars: number, usd: number }>({ ars: 0, usd: 0 });

    // Form state for closing
    const [saldoFinalUsd, setSaldoFinalUsd] = useState(0);
    const [saldoFinalArs, setSaldoFinalArs] = useState(0);
    const [observaciones, setObservaciones] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        checkEstadoCaja();
    }, []);

    async function checkEstadoCaja() {
        setLoading(true);
        try {
            const today = getLocalISODate();

            // 1. Check if today is closed
            const { data: hoy } = await supabase
                .from('caja_recepcion_arqueos')
                .select('*')
                .eq('fecha', today)
                .eq('estado', 'cerrado')
                .maybeSingle();

            if (hoy) {
                setCierreHoy(hoy);
                setUltimoCierre(null);
            } else {
                setCierreHoy(null);
                // 2. Get last closure (for start balance info) only if today is open
                const ultimo = await getUltimoCierre(today);
                setUltimoCierre(ultimo);

                // Fetch expected balances logic
                // Importing logic from lib would be better but for speed we'll do basic fetch here or use a helper
                // actually we have a helper in lib/caja-recepcion.ts "getCurrentBalanceRecepcion"
            }

        } catch (error) {
            console.error('Error checking caja:', error);
        } finally {
            setLoading(false);
        }
    }

    // Fetch expected balances when modal opens
    useEffect(() => {
        if (showCerrarModal) {
            import('@/lib/caja-recepcion').then(m => {
                m.getCurrentBalanceRecepcion().then(res => {
                    setSaldosEsperados({ ars: res.saldoArs, usd: res.saldoUsd });
                    // Auto-fill with expected to make it easier (Admin style)
                    setSaldoFinalArs(res.saldoArs);
                    setSaldoFinalUsd(res.saldoUsd);
                });
            });
        }
    }, [showCerrarModal]);

    async function handleCerrarCaja() {
        setSaving(true);
        try {
            const today = getLocalISODate();
            // TODO: Get real user from auth context if available

            await cerrarCajaDelDia(
                today,
                'Recepción',
                saldoFinalUsd,
                saldoFinalArs,
                bnaRate,
                {}, // Snapshot
                observaciones
            );

            setShowCerrarModal(false);
            setSaldoFinalUsd(0);
            setSaldoFinalArs(0);
            setObservaciones('');
            await checkEstadoCaja();
            onArqueoChange?.();
        } catch (error: unknown) {
            console.error('Error cerrando caja:', error);
            const message = error instanceof Error ? error.message : 'Error desconocido';
            alert('Error al cerrar caja: ' + message);
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-gray-700 flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-400" size={24} />
            </div>
        );
    }

    const saldoInicialEq = ultimoCierre ? ultimoCierre.saldo_final_usd_equivalente : 0;

    return (
        <>
            <div className={clsx(
                "rounded-xl p-4 shadow-sm border transition-colors",
                cierreHoy
                    ? "bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700"
                    : "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800"
            )}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {cierreHoy ? (
                            <CheckCircle className="text-gray-500" size={24} />
                        ) : (
                            <AlertTriangle className="text-blue-600 dark:text-blue-400" size={24} />
                        )}
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {cierreHoy ? 'Caja Cerrada' : 'Caja Activa - Cierre Pendiente'}
                            </p>
                            <p className="text-xs text-gray-500">
                                {cierreHoy
                                    ? `Cerrado el ${formatDateForLocale(cierreHoy.fecha)} por ${cierreHoy.usuario}`
                                    : ultimoCierre
                                        ? `Último cierre: ${formatDateForLocale(ultimoCierre.fecha)} • Saldo Inicial: ${formatCurrency(saldoInicialEq || 0, 'USD')}`
                                        : 'Sin cierres previos (Saldo inicial: $0)'}
                            </p>
                        </div>
                    </div>

                    {!cierreHoy && (
                        <button
                            onClick={() => setShowCerrarModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                        >
                            <Lock size={18} />
                            Cerrar Caja del Día
                        </button>
                    )}
                </div>

                {cierreHoy && (
                    <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center gap-2 mb-3">
                            <span className="text-sm font-medium text-gray-400 uppercase tracking-wider text-[10px]">Saldos de Cierre Confirmados</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="flex justify-between items-center bg-white dark:bg-black/20 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Efectivo ARS</span>
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                                    {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(cierreHoy.saldo_final_ars_billete || 0)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center bg-white dark:bg-black/20 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Efectivo USD</span>
                                </div>
                                <span className="text-sm font-bold text-gray-900 dark:text-white font-mono">
                                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cierreHoy.saldo_final_usd_billete || 0)}
                                </span>
                            </div>
                        </div>
                        {cierreHoy.saldo_final_usd_equivalente !== null && (
                            <div className="mt-3 text-right">
                                <span className="text-[10px] text-gray-400 font-medium uppercase tracking-tight">
                                    Total Equivalente: {formatCurrency(cierreHoy.saldo_final_usd_equivalente, 'USD')}
                                </span>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal Cerrar Caja */}
            {showCerrarModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl animate-in fade-in zoom-in duration-200">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <Lock size={20} className="text-blue-500" />
                                Cierre Diario Obligatorio
                            </h3>
                            <p className="text-sm text-gray-500 mt-1">
                                Verifique los efectivos en caja. Esta acción no se puede deshacer.
                            </p>
                        </div>
                        <div className="p-5 space-y-5">
                            <div className="p-4 bg-gray-50 dark:bg-gray-900/50 rounded-xl text-sm border border-gray-100 dark:border-gray-800">
                                <div className="flex justify-between mb-2">
                                    <span className="text-gray-500">Saldo Inicial (ayer):</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {formatCurrency(saldoInicialEq || 0, 'USD')}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">TC BNA del día:</span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        ${bnaRate?.toLocaleString('es-AR')}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <div className="flex justify-between items-end mb-1.5">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                            Efectivo USD
                                        </label>
                                        <span className="text-[10px] text-gray-400 font-medium">SISTEMA: {formatCurrency(saldosEsperados.usd, 'USD')}</span>
                                    </div>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="number"
                                            value={saldoFinalUsd || ''}
                                            onChange={(e) => setSaldoFinalUsd(parseFloat(e.target.value) || 0)}
                                            className={clsx(
                                                "w-full pl-10 pr-4 py-3 border rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 outline-none transition-all text-lg font-bold",
                                                (saldoFinalUsd === saldosEsperados.usd) ? "border-gray-200 dark:border-gray-700" : "border-amber-200 dark:border-amber-800 ring-amber-500/10"
                                            )}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    {saldoFinalUsd !== saldosEsperados.usd && (
                                        <p className={clsx("text-[10px] mt-1 font-bold text-right", saldoFinalUsd > saldosEsperados.usd ? "text-green-600" : "text-red-600")}>
                                            Diferencia: {formatCurrency(saldoFinalUsd - saldosEsperados.usd, 'USD')}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <div className="flex justify-between items-end mb-1.5">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                            Efectivo ARS
                                        </label>
                                        <span className="text-[10px] text-gray-400 font-medium">SISTEMA: {formatCurrency(saldosEsperados.ars, 'ARS')}</span>
                                    </div>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">$</span>
                                        <input
                                            type="number"
                                            value={saldoFinalArs || ''}
                                            onChange={(e) => setSaldoFinalArs(parseFloat(e.target.value) || 0)}
                                            className={clsx(
                                                "w-full pl-10 pr-4 py-3 border rounded-xl bg-gray-50 dark:bg-gray-900 focus:ring-2 outline-none transition-all text-lg font-bold",
                                                (saldoFinalArs === saldosEsperados.ars) ? "border-gray-200 dark:border-gray-700" : "border-amber-200 dark:border-amber-800 ring-amber-500/10"
                                            )}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    {saldoFinalArs !== saldosEsperados.ars && (
                                        <p className={clsx("text-[10px] mt-1 font-bold text-right", saldoFinalArs > saldosEsperados.ars ? "text-green-600" : "text-red-600")}>
                                            Diferencia: {formatCurrency(saldoFinalArs - saldosEsperados.ars, 'ARS')}
                                        </p>
                                    )}
                                </div>

                                <div className="pt-2">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Observaciones
                                    </label>
                                    <textarea
                                        value={observaciones}
                                        onChange={(e) => setObservaciones(e.target.value)}
                                        className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 resize-none focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                        rows={2}
                                        placeholder="Ej: Diferencia por billetes chicos, etc..."
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 dark:border-gray-700 flex gap-3 bg-gray-50/50 dark:bg-gray-800/50 rounded-b-2xl">
                            <button
                                onClick={() => setShowCerrarModal(false)}
                                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-white dark:hover:bg-gray-700 transition-colors bg-white dark:bg-gray-800"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCerrarCaja}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                                Confirmar Cierre
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
