'use client';

import { useState, useEffect } from 'react';
import { X, Clock, User, FileEdit, AlertCircle } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

interface HistorialItem {
    id: string;
    tabla_origen: string;
    id_registro: string;
    campo_modificado: string;
    valor_anterior: string | null;
    valor_nuevo: string | null;
    fecha_edicion: string;
    usuario_editor: string;
    usuario_email: string | null;
    motivo_edicion: string | null;
    profiles?: {
        full_name: string;
    };
}

interface HistorialEdicionesModalProps {
    isOpen: boolean;
    onClose: () => void;
    registroId: string;
    tabla: string;
}

export default function HistorialEdicionesModal({
    isOpen,
    onClose,
    registroId,
    tabla
}: HistorialEdicionesModalProps) {
    const [historial, setHistorial] = useState<HistorialItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && registroId) {
            fetchHistorial();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, registroId]);

    const fetchHistorial = async () => {
        setLoading(true);
        setError(null);

        const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

        const { data, error: fetchError } = await supabase
            .from('historial_ediciones')
            .select(`
                *,
                profiles:usuario_editor (full_name)
            `)
            .eq('id_registro', registroId)
            .eq('tabla_origen', tabla)
            .order('fecha_edicion', { ascending: false });

        if (fetchError) {
            setError('Error al cargar el historial de ediciones');
            console.error('Historial fetch error:', fetchError);
        } else {
            setHistorial(data || []);
        }

        setLoading(false);
    };

    if (!isOpen) return null;

    const formatValue = (value: string | null) => {
        if (value === null) return <span className="text-gray-400 italic">vacío</span>;
        if (value.length > 50) return value.substring(0, 50) + '...';
        return value;
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden m-4">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                            <FileEdit className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Historial de Ediciones
                            </h2>
                            <p className="text-sm text-gray-500">
                                Registro: {registroId.slice(0, 8)}...
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
                        </div>
                    ) : error ? (
                        <div className="flex items-center justify-center py-12 text-red-500">
                            <AlertCircle className="w-5 h-5 mr-2" />
                            {error}
                        </div>
                    ) : historial.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                            <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p>No hay ediciones registradas para este movimiento</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {historial.map((item) => (
                                <div
                                    key={item.id}
                                    className="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
                                >
                                    {/* Header row */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                            <User className="w-4 h-4" />
                                            <span className="font-medium">
                                                {item.profiles?.full_name || item.usuario_email || 'Usuario desconocido'}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <Clock className="w-4 h-4" />
                                            {formatDate(item.fecha_edicion)}
                                        </div>
                                    </div>

                                    {/* Field changed */}
                                    <div className="mb-3">
                                        <span className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                            Campo modificado
                                        </span>
                                        <p className="font-mono text-sm text-gray-900 dark:text-white">
                                            {item.campo_modificado}
                                        </p>
                                    </div>

                                    {/* Values */}
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                            <span className="text-xs uppercase tracking-wide text-red-600 dark:text-red-400">
                                                Valor anterior
                                            </span>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white break-words">
                                                {formatValue(item.valor_anterior)}
                                            </p>
                                        </div>
                                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                            <span className="text-xs uppercase tracking-wide text-green-600 dark:text-green-400">
                                                Valor nuevo
                                            </span>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white break-words">
                                                {formatValue(item.valor_nuevo)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Reason */}
                                    {item.motivo_edicion && (
                                        <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                                            <span className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
                                                Motivo de edición
                                            </span>
                                            <p className="mt-1 text-sm text-gray-900 dark:text-white">
                                                {item.motivo_edicion}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p className="text-xs text-gray-500 text-center">
                        Las ediciones son inmutables y no pueden ser eliminadas
                    </p>
                </div>
            </div>
        </div>
    );
}
