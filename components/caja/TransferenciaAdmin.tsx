'use client';

import { useState } from 'react';
import { ArrowRightLeft, DollarSign, Loader2, X, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';

interface TransferenciaAdminProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    bnaRate: number;
}

const MOTIVOS = [
    'Depósito bancario',
    'Pago a proveedores',
    'Gastos operativos',
    'Cierre de caja',
    'Otro',
];

export default function TransferenciaAdmin({ isOpen, onClose, onSuccess, bnaRate }: TransferenciaAdminProps) {
    const [monto, setMonto] = useState(0);
    const [moneda, setMoneda] = useState<'USD' | 'ARS'>('ARS');
    const [motivo, setMotivo] = useState('Depósito bancario');
    const [observaciones, setObservaciones] = useState('');
    const [saving, setSaving] = useState(false);

    async function handleSubmit() {
        if (monto <= 0) {
            alert('El monto debe ser mayor a 0');
            return;
        }

        setSaving(true);
        try {
            const usdEquivalente = moneda === 'USD'
                ? monto
                : (bnaRate > 0 ? Math.round((monto / bnaRate) * 100) / 100 : monto);

            const { error } = await supabase
                .from('transferencias_caja')
                .insert({
                    moneda,
                    monto,
                    tc_bna_venta: moneda === 'ARS' ? bnaRate : null,
                    usd_equivalente: usdEquivalente,
                    motivo,
                    observaciones: observaciones || null,
                    usuario: 'Recepción', // TODO: Get from auth
                    estado: 'confirmada',
                });

            if (error) throw error;

            onSuccess();
            handleClose();
        } catch (error) {
            console.error('Error creating transfer:', error);
            alert('Error al registrar transferencia');
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setMonto(0);
        setMoneda('ARS');
        setMotivo('Depósito bancario');
        setObservaciones('');
        onClose();
    }

    function calculateUsdEquivalent(): number {
        if (moneda === 'USD') return monto;
        if (bnaRate > 0) return Math.round((monto / bnaRate) * 100) / 100;
        return 0;
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            <ArrowRightLeft size={20} className="text-orange-600 dark:text-orange-400" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">Transferencia a Caja Admin</h3>
                            <p className="text-xs text-gray-500">Registrar entrega de efectivo</p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <X size={18} className="text-gray-500" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Monto a transferir *
                        </label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="number"
                                    value={monto || ''}
                                    onChange={(e) => setMonto(parseFloat(e.target.value) || 0)}
                                    className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    placeholder="0.00"
                                />
                            </div>
                            <select
                                value={moneda}
                                onChange={(e) => setMoneda(e.target.value as 'USD' | 'ARS')}
                                className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                            >
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        {moneda === 'ARS' && bnaRate > 0 && monto > 0 && (
                            <p className="text-sm text-gray-500 mt-2">
                                ≈ {formatCurrency(calculateUsdEquivalent(), 'USD')} (TC: ${bnaRate.toLocaleString('es-AR')})
                            </p>
                        )}
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Motivo *
                        </label>
                        <select
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                        >
                            {MOTIVOS.map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Observaciones
                        </label>
                        <textarea
                            value={observaciones}
                            onChange={(e) => setObservaciones(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 resize-none"
                            rows={2}
                            placeholder="Detalles adicionales..."
                        />
                    </div>

                    {/* Summary */}
                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Se registrará:</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(monto, moneda)}
                            {moneda === 'ARS' && bnaRate > 0 && (
                                <span className="text-sm font-normal text-gray-500 ml-2">
                                    ({formatCurrency(calculateUsdEquivalent(), 'USD')})
                                </span>
                            )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            Motivo: {motivo}
                        </p>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <button
                        onClick={handleClose}
                        className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={saving || monto <= 0}
                        className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                    >
                        {saving ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
    );
}
