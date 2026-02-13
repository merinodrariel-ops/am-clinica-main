'use client';

import { useState } from 'react';
import { X, ArrowUpCircle, ArrowDownCircle, Loader2, Save, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import { registrarMovimiento } from '@/app/actions/inventory';

interface Item {
    id: string;
    nombre: string;
    stock_actual: number;
    unidad_medida: string;
}

interface MovimientoStockFormProps {
    isOpen: boolean;
    item: Item | null;
    tipo: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    onClose: () => void;
    onSuccess: () => void;
}

export default function MovimientoStockForm({ isOpen, item, tipo, onClose, onSuccess }: MovimientoStockFormProps) {
    const { user } = useAuth();
    const [saving, setSaving] = useState(false);
    const [cantidad, setCantidad] = useState(0);
    const [motivo, setMotivo] = useState('');
    const [error, setError] = useState<string | null>(null); // Error state

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!item || cantidad <= 0) return;

        if (!user) {
            setError("No estás autenticado");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const result = await registrarMovimiento({
                item_id: item.id,
                tipo_movimiento: tipo,
                cantidad: cantidad,
                motivo: motivo || (tipo === 'ENTRADA' ? 'Carga de stock' : 'Consumo / Salida'),
                userId: user.id
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            onSuccess();
            onClose();
            setCantidad(0);
            setMotivo('');
        } catch (error: unknown) {
            console.error('Error saving movement:', error);
            const message = error instanceof Error ? error.message : 'Error al registrar el movimiento';
            setError(message);
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen || !item) return null;

    const isEntrada = tipo === 'ENTRADA';
    const isSalida = tipo === 'SALIDA';

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className={clsx(
                    "px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center",
                    isEntrada ? "bg-emerald-50/50 dark:bg-emerald-900/10" : isSalida ? "bg-red-50/50 dark:bg-red-900/10" : "bg-blue-50/50 dark:bg-blue-900/10"
                )}>
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "h-10 w-10 rounded-xl flex items-center justify-center",
                            isEntrada ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" : isSalida ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                        )}>
                            {isEntrada ? <ArrowUpCircle size={20} /> : isSalida ? <ArrowDownCircle size={20} /> : <Save size={20} />}
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">
                                {isEntrada ? 'Ingreso de Stock' : isSalida ? 'Salida / Consumo' : 'Ajuste de Stock'}
                            </h3>
                            <p className="text-xs text-gray-500 uppercase font-medium">{item.nombre}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {error && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl flex items-center gap-3 text-sm font-medium">
                            <span className="text-xl">⚠️</span> {error}
                        </div>
                    )}
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-700">
                        <p className="text-xs text-gray-500 font-bold uppercase mb-1">Stock Actual</p>
                        <p className="text-2xl font-black text-gray-900 dark:text-white">
                            {item.stock_actual} <span className="text-sm font-medium text-gray-500">{item.unidad_medida}</span>
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                            Cantidad a {isEntrada ? 'ingresar' : isSalida ? 'retirar' : 'ajustar'} ({item.unidad_medida}) *
                        </label>
                        <input
                            type="number"
                            className={clsx(
                                "w-full px-4 py-4 text-2xl font-black rounded-2xl outline-none transition-all border",
                                isEntrada ? "focus:ring-2 focus:ring-emerald-500 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" :
                                    isSalida ? "focus:ring-2 focus:ring-red-500 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" :
                                        "focus:ring-2 focus:ring-blue-500 border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900"
                            )}
                            value={cantidad || ''}
                            onChange={(e) => setCantidad(parseFloat(e.target.value) || 0)}
                            required
                            autoFocus
                            placeholder="0"
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Motivo / Nota</label>
                        <div className="relative">
                            <MessageSquare className="absolute left-3 top-3 text-gray-400" size={18} />
                            <textarea
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all resize-none h-20"
                                value={motivo}
                                onChange={(e) => setMotivo(e.target.value)}
                                placeholder="Ej: Compra mensual, Uso en cirugía, vencimiento..."
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3.5 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 font-bold hover:bg-gray-50 dark:hover:bg-gray-900 transition-all"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving || cantidad <= 0}
                            className={clsx(
                                "flex-3 py-3.5 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all",
                                isEntrada ? "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-100" :
                                    isSalida ? "bg-red-600 hover:bg-red-700 shadow-red-100" :
                                        "bg-blue-600 hover:bg-blue-700 shadow-blue-100"
                            )}
                        >
                            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            Confirmar
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
