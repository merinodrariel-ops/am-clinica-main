'use client';

import { useState } from 'react';
import { X, DollarSign, Check, Loader2 } from 'lucide-react';
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

import { supabase } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';
import { getLocalISODate } from '@/lib/local-date';
// import { useAuth } from '@/contexts/AuthContext';

interface NuevoGastoFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    bnaRate: number;
}

interface ExpenseData {
    concepto: string;
    monto: number;
    moneda: 'USD' | 'ARS';
    metodo_pago: 'Efectivo'; // Gastos de caja chica suelen ser efectivo
    observaciones: string;
}

export default function NuevoGastoForm({ isOpen, onClose, onSuccess, bnaRate }: NuevoGastoFormProps) {
    const [saving, setSaving] = useState(false);

    // Form data
    const [formData, setFormData] = useState<ExpenseData>({
        concepto: '',
        monto: 0,
        moneda: 'ARS',
        metodo_pago: 'Efectivo',
        observaciones: ''
    });

    async function handleSubmit() {
        if (!formData.concepto || formData.monto <= 0) {
            alert('Complete el concepto y un monto válido');
            return;
        }

        setSaving(true);
        try {
            // Expenses are negative
            const finalMonto = -Math.abs(formData.monto);

            // Calculate USD equivalent (negative)
            let usdEquivalente = 0;
            if (formData.moneda === 'USD') {
                usdEquivalente = finalMonto;
            } else if (formData.moneda === 'ARS' && bnaRate > 0) {
                usdEquivalente = Math.round((finalMonto / bnaRate) * 100) / 100;
            }

            const { error } = await supabase
                .from('caja_recepcion_movimientos')
                .insert({
                    concepto_nombre: formData.concepto,
                    categoria: 'Egreso', // Tag for filtering
                    monto: finalMonto,
                    moneda: formData.moneda,
                    metodo_pago: formData.metodo_pago,
                    estado: 'pagado', // Expenses are immediate
                    observaciones: formData.observaciones,
                    tc_bna_venta: formData.moneda === 'ARS' ? bnaRate : null,
                    tc_fuente: formData.moneda === 'ARS' ? 'BNA_AUTO' : 'N/A',
                    tc_fecha_hora: formData.moneda === 'ARS' ? new Date().toISOString() : null,
                    usd_equivalente: usdEquivalente,
                    usuario: 'Recepción',
                    fecha_movimiento: getLocalISODate(),
                    origen: 'manual',
                    // Nullable fields (hopefully)
                    paciente_id: null,
                });

            if (error) throw error;

            onSuccess();
            handleClose();
        } catch (error) {
            console.error('Error saving expense:', error);
            alert('Error al guardar el gasto. Verifique que todos los campos estén correctos.');
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setFormData({
            concepto: '',
            monto: 0,
            moneda: 'ARS',
            metodo_pago: 'Efectivo',
            observaciones: ''
        });
        onClose();
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                {/* Header */}
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-red-50 dark:bg-red-900/10 rounded-t-2xl">
                    <div>
                        <h2 className="text-xl font-semibold text-red-700 dark:text-red-400">Registrar Gasto</h2>
                        <p className="text-xs text-red-600/70 dark:text-red-400/70">Salida de caja chica (Efectivo)</p>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg text-red-500 h-auto w-auto"
                    >
                        <X size={20} />
                    </Button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-5">

                    {/* Concept */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Concepto *
                        </label>
                        <Input
                            type="text"
                            value={formData.concepto}
                            onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                            placeholder="Ej. Delivery, Taxi, Art. Limpieza..."
                            className="w-full px-4 py-3 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 focus-visible:ring-red-500 h-auto"
                            autoFocus
                        />
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Monto de Salida *
                        </label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                                <Input
                                    type="number"
                                    value={formData.monto || ''}
                                    onChange={(e) => setFormData({ ...formData, monto: parseFloat(e.target.value) || 0 })}
                                    className="w-full pl-10 pr-4 py-3 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 focus-visible:ring-red-500 h-auto"
                                    placeholder="0.00"
                                />
                            </div>
                            <select
                                value={formData.moneda}
                                onChange={(e) => setFormData({ ...formData, moneda: e.target.value as ExpenseData['moneda'] })}
                                className="px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 outline-none focus:ring-2 focus:ring-red-500"
                            >
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        {formData.moneda === 'ARS' && bnaRate > 0 && (
                            <p className="mt-2 text-xs text-gray-500">
                                ≈ {formatCurrency(formData.monto / bnaRate, 'USD')} (Egreso equivalente)
                            </p>
                        )}
                    </div>

                    {/* Observations */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Observaciones
                        </label>
                        <Textarea
                            value={formData.observaciones}
                            onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                            className="w-full p-3 border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-900 resize-none focus-visible:ring-red-500 min-h-[80px]"
                            rows={3}
                            placeholder="Detalles adicionales..."
                        />
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={saving}
                        className="w-full py-3 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 h-auto"
                    >
                        {saving ? (
                            <>
                                <Loader2 size={20} className="animate-spin" />
                                Registrando Salida...
                            </>
                        ) : (
                            <>
                                <Check size={20} />
                                Confirmar Egreso
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div >
    );
}
