'use client';

import { useState, useEffect } from 'react';
import { DollarSign, Loader2, PlayCircle, StopCircle, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { supabase, CajaArqueo } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';

interface ArqueoPanelProps {
    bnaRate: number;
    onArqueoChange?: () => void;
}

export default function ArqueoPanel({ bnaRate, onArqueoChange }: ArqueoPanelProps) {
    const [arqueoActivo, setArqueoActivo] = useState<CajaArqueo | null>(null);
    const [loading, setLoading] = useState(true);
    const [showIniciarModal, setShowIniciarModal] = useState(false);
    const [showCerrarModal, setShowCerrarModal] = useState(false);

    // Form state for opening
    const [saldoInicialUsd, setSaldoInicialUsd] = useState(0);
    const [saldoInicialArs, setSaldoInicialArs] = useState(0);

    // Form state for closing
    const [saldoFinalUsd, setSaldoFinalUsd] = useState(0);
    const [saldoFinalArs, setSaldoFinalArs] = useState(0);
    const [observaciones, setObservaciones] = useState('');

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        checkArqueoActivo();
    }, []);

    async function checkArqueoActivo() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('caja_recepcion_arqueos')
                .select('*')
                .eq('estado', 'abierto')
                .order('created_at', { ascending: false })
                .limit(1);

            if (error) throw error;
            setArqueoActivo(data && data.length > 0 ? data[0] : null);
        } catch (error) {
            console.error('Error checking arqueo:', error);
        } finally {
            setLoading(false);
        }
    }

    async function iniciarArqueo() {
        if (saldoInicialUsd < 0 || saldoInicialArs < 0) {
            alert('Los saldos no pueden ser negativos');
            return;
        }

        setSaving(true);
        try {
            const saldoInicialUsdEquivalente = saldoInicialUsd + (bnaRate > 0 ? saldoInicialArs / bnaRate : 0);

            const { error } = await supabase
                .from('caja_recepcion_arqueos')
                .insert({
                    fecha: new Date().toISOString().split('T')[0],
                    usuario: 'Recepción', // TODO: Get from auth
                    hora_inicio: new Date().toISOString(),
                    saldo_inicial_usd_billete: saldoInicialUsd,
                    saldo_inicial_ars_billete: saldoInicialArs,
                    saldo_inicial_usd_equivalente: Math.round(saldoInicialUsdEquivalente * 100) / 100,
                    tc_bna_venta_dia: bnaRate,
                    estado: 'abierto',
                });

            if (error) throw error;

            setShowIniciarModal(false);
            setSaldoInicialUsd(0);
            setSaldoInicialArs(0);
            await checkArqueoActivo();
            onArqueoChange?.();
        } catch (error) {
            console.error('Error iniciando arqueo:', error);
            alert('Error al iniciar arqueo');
        } finally {
            setSaving(false);
        }
    }

    async function cerrarArqueo() {
        if (!arqueoActivo) return;

        setSaving(true);
        try {
            // Get total income for the day
            const { data: movimientos } = await supabase
                .from('caja_recepcion_movimientos')
                .select('usd_equivalente')
                .gte('fecha_hora', `${arqueoActivo.fecha}T00:00:00`)
                .lt('fecha_hora', `${arqueoActivo.fecha}T23:59:59`)
                .neq('estado', 'anulado');

            const totalIngresosUsd = movimientos?.reduce((sum, m) => sum + (m.usd_equivalente || 0), 0) || 0;

            // Get total transfers
            const { data: transferencias } = await supabase
                .from('transferencias_caja')
                .select('usd_equivalente')
                .gte('fecha_hora', `${arqueoActivo.fecha}T00:00:00`)
                .lt('fecha_hora', `${arqueoActivo.fecha}T23:59:59`)
                .eq('estado', 'confirmada');

            const totalTransferenciasUsd = transferencias?.reduce((sum, t) => sum + (t.usd_equivalente || 0), 0) || 0;

            // Calculate difference
            const tcBna = arqueoActivo.tc_bna_venta_dia || bnaRate || 1;
            const saldoFinalUsdEquivalente = saldoFinalUsd + (tcBna > 0 ? saldoFinalArs / tcBna : 0);
            const esperado = arqueoActivo.saldo_inicial_usd_equivalente + totalIngresosUsd - totalTransferenciasUsd;
            const diferencia = Math.round((saldoFinalUsdEquivalente - esperado) * 100) / 100;

            const { error } = await supabase
                .from('caja_recepcion_arqueos')
                .update({
                    hora_cierre: new Date().toISOString(),
                    saldo_final_usd_billete: saldoFinalUsd,
                    saldo_final_ars_billete: saldoFinalArs,
                    total_ingresos_dia_usd: Math.round(totalIngresosUsd * 100) / 100,
                    total_transferencias_admin_usd: Math.round(totalTransferenciasUsd * 100) / 100,
                    diferencia_usd: diferencia,
                    observaciones,
                    estado: 'cerrado',
                })
                .eq('id', arqueoActivo.id);

            if (error) throw error;

            setShowCerrarModal(false);
            setSaldoFinalUsd(0);
            setSaldoFinalArs(0);
            setObservaciones('');
            await checkArqueoActivo();
            onArqueoChange?.();
        } catch (error) {
            console.error('Error cerrando arqueo:', error);
            alert('Error al cerrar arqueo');
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

    return (
        <>
            <div className={clsx(
                "rounded-xl p-4 shadow-sm border",
                arqueoActivo
                    ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
                    : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
            )}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {arqueoActivo ? (
                            <PlayCircle className="text-green-600 dark:text-green-400" size={24} />
                        ) : (
                            <AlertCircle className="text-yellow-600 dark:text-yellow-400" size={24} />
                        )}
                        <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                                {arqueoActivo ? 'Caja Abierta' : 'Caja Cerrada'}
                            </p>
                            {arqueoActivo && (
                                <p className="text-xs text-gray-500">
                                    Apertura: {new Date(arqueoActivo.hora_inicio).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                    {' • '}
                                    Saldo inicial: {formatCurrency(arqueoActivo.saldo_inicial_usd_equivalente, 'USD')}
                                </p>
                            )}
                            {!arqueoActivo && (
                                <p className="text-xs text-gray-500">
                                    Debe abrir la caja para registrar ingresos
                                </p>
                            )}
                        </div>
                    </div>

                    {arqueoActivo ? (
                        <button
                            onClick={() => setShowCerrarModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <StopCircle size={18} />
                            Cerrar Caja
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowIniciarModal(true)}
                            className="flex items-center gap-2 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            <PlayCircle size={18} />
                            Iniciar Caja
                        </button>
                    )}
                </div>
            </div>

            {/* Modal Iniciar Caja */}
            {showIniciarModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Apertura de Caja</h3>
                            <p className="text-sm text-gray-500">Ingrese el saldo inicial en caja</p>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Billetes USD
                                </label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="number"
                                        value={saldoInicialUsd || ''}
                                        onChange={(e) => setSaldoInicialUsd(parseFloat(e.target.value) || 0)}
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Billetes ARS
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                                    <input
                                        type="number"
                                        value={saldoInicialArs || ''}
                                        onChange={(e) => setSaldoInicialArs(parseFloat(e.target.value) || 0)}
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="0.00"
                                    />
                                </div>
                                {bnaRate > 0 && saldoInicialArs > 0 && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        ≈ {formatCurrency(saldoInicialArs / bnaRate, 'USD')}
                                    </p>
                                )}
                            </div>
                            <div className="pt-2 text-center">
                                <p className="text-sm text-gray-500">Total equivalente:</p>
                                <p className="text-xl font-bold text-gray-900 dark:text-white">
                                    {formatCurrency(saldoInicialUsd + (bnaRate > 0 ? saldoInicialArs / bnaRate : 0), 'USD')}
                                </p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button
                                onClick={() => setShowIniciarModal(false)}
                                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={iniciarArqueo}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <PlayCircle size={18} />}
                                Iniciar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Cerrar Caja */}
            {showCerrarModal && arqueoActivo && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Cierre de Caja</h3>
                            <p className="text-sm text-gray-500">Ingrese el saldo final en caja</p>
                        </div>
                        <div className="p-5 space-y-4">
                            <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded-lg text-sm">
                                <div className="flex justify-between mb-1">
                                    <span className="text-gray-500">Saldo inicial:</span>
                                    <span className="font-medium">{formatCurrency(arqueoActivo.saldo_inicial_usd_equivalente, 'USD')}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">TC BNA del día:</span>
                                    <span className="font-medium">${arqueoActivo.tc_bna_venta_dia?.toLocaleString('es-AR')}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Billetes USD final
                                </label>
                                <input
                                    type="number"
                                    value={saldoFinalUsd || ''}
                                    onChange={(e) => setSaldoFinalUsd(parseFloat(e.target.value) || 0)}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Billetes ARS final
                                </label>
                                <input
                                    type="number"
                                    value={saldoFinalArs || ''}
                                    onChange={(e) => setSaldoFinalArs(parseFloat(e.target.value) || 0)}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Observaciones
                                </label>
                                <textarea
                                    value={observaciones}
                                    onChange={(e) => setObservaciones(e.target.value)}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 resize-none"
                                    rows={2}
                                    placeholder="Notas del cierre..."
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button
                                onClick={() => setShowCerrarModal(false)}
                                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={cerrarArqueo}
                                disabled={saving}
                                className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <StopCircle size={18} />}
                                Cerrar Caja
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
