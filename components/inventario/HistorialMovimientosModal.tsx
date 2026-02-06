'use client';

import { useState, useEffect } from 'react';
import { X, History, ArrowUpCircle, ArrowDownCircle, RefreshCw, Loader2, Calendar, User } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';

interface Movimiento {
    id: string;
    item_id: string;
    tipo_movimiento: 'ENTRADA' | 'SALIDA' | 'AJUSTE';
    cantidad: number;
    motivo: string;
    created_at: string;
    usuario: string;
    item?: { nombre: string; unidade_medida: string };
}

interface HistorialMovimientosModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function HistorialMovimientosModal({ isOpen, onClose }: HistorialMovimientosModalProps) {
    const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadHistory();
        }
    }, [isOpen]);

    async function loadHistory() {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('inventario_movimientos')
                .select('*, item:inventario_items(nombre, unidad_medida)')
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;
            setMovimientos(data as any || []);
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoading(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center">
                            <History size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Historial de Movimientos</h3>
                            <p className="text-xs text-gray-500 font-medium">Últimos 50 registros del inventario</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={loadHistory} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400">
                            <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors text-gray-400">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {loading && movimientos.length === 0 ? (
                        <div className="p-20 flex flex-col items-center justify-center text-gray-500">
                            <Loader2 className="animate-spin mb-2" size={32} />
                            <p>Cargando historial...</p>
                        </div>
                    ) : movimientos.length === 0 ? (
                        <div className="p-20 text-center text-gray-500">
                            <History className="mx-auto mb-4 text-gray-200" size={64} />
                            <p className="text-lg font-medium">No hay movimientos registrados</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {movimientos.map((mov) => (
                                <div key={mov.id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 flex items-center gap-4 transition-all hover:border-blue-100 dark:hover:border-blue-900/40">
                                    <div className={clsx(
                                        "h-12 w-12 rounded-2xl flex items-center justify-center shrink-0",
                                        mov.tipo_movimiento === 'ENTRADA' ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30" :
                                            mov.tipo_movimiento === 'SALIDA' ? "bg-red-100 text-red-600 dark:bg-red-900/30" :
                                                "bg-blue-100 text-blue-600 dark:bg-blue-900/30"
                                    )}>
                                        {mov.tipo_movimiento === 'ENTRADA' ? <ArrowUpCircle size={24} /> :
                                            mov.tipo_movimiento === 'SALIDA' ? <ArrowDownCircle size={24} /> :
                                                <RefreshCw size={24} />}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-1">
                                            <h4 className="font-bold text-gray-900 dark:text-white uppercase truncate">{mov.item?.nombre}</h4>
                                            <span className={clsx(
                                                "text-lg font-black shrink-0",
                                                mov.tipo_movimiento === 'ENTRADA' ? "text-emerald-600" :
                                                    mov.tipo_movimiento === 'SALIDA' ? "text-red-500" :
                                                        "text-blue-500"
                                            )}>
                                                {mov.tipo_movimiento === 'SALIDA' ? '-' : '+'}{mov.cantidad}
                                            </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                                <Calendar size={12} />
                                                {new Date(mov.created_at).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-gray-500 font-medium">
                                                <User size={12} />
                                                {mov.usuario}
                                            </div>
                                            <p className="text-xs text-gray-400 font-medium italic truncate">"{mov.motivo}"</p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-4 bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="w-full py-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-700 dark:text-gray-200 font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
