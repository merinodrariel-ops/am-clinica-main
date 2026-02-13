'use client';

import { useState } from 'react';
import { X, CheckCircle2, Clock, Ban, FlaskConical, Calendar, User, Stethoscope, Landmark, DollarSign } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';

interface Trabajo {
    id: string;
    paciente_id: string;
    tipo_trabajo: string;
    laboratorio_nombre: string;
    fecha_envio: string;
    fecha_entrega_estimada: string;
    estado: 'Enviado' | 'Recibido' | 'Colocado' | 'Anulado';
    costo_usd: number;
    observaciones: string;
    paciente: { nombre: string; apellido: string };
    profesional: { nombre: string };
}

interface DetalleTrabajoModalProps {
    isOpen: boolean;
    trabajo: Trabajo | null;
    onClose: () => void;
    onSuccess: () => void;
}

export default function DetalleTrabajoModal({ isOpen, trabajo, onClose, onSuccess }: DetalleTrabajoModalProps) {
    const [updating, setUpdating] = useState(false);

    async function updateStatus(newStatus: Trabajo['estado']) {
        if (!trabajo) return;
        setUpdating(true);
        try {
            const { error } = await supabase
                .from('laboratorio_trabajos')
                .update({
                    estado: newStatus,
                    fecha_entrega_real: newStatus === 'Recibido' ? new Date().toISOString() : undefined
                })
                .eq('id', trabajo.id);

            if (error) throw error;
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Error updating status:', error);
            alert('Error al actualizar estado');
        } finally {
            setUpdating(false);
        }
    }

    if (!isOpen || !trabajo) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-gray-50/50 dark:bg-gray-900/10">
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "h-10 w-10 rounded-xl flex items-center justify-center",
                            trabajo.estado === 'Enviado' ? "bg-amber-100 text-amber-600" :
                                trabajo.estado === 'Recibido' ? "bg-blue-100 text-blue-600" :
                                    trabajo.estado === 'Colocado' ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                        )}>
                            <FlaskConical size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Detalle de Trabajo</h3>
                            <p className="text-xs text-indigo-600 font-bold uppercase">{trabajo.tipo_trabajo}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Info Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paciente</p>
                            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold">
                                <User size={16} className="text-gray-400" />
                                {trabajo.paciente.nombre} {trabajo.paciente.apellido}
                            </div>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Profesional</p>
                            <div className="flex items-center justify-end gap-2 text-gray-900 dark:text-white font-bold">
                                Dr. {trabajo.profesional.nombre}
                                <Stethoscope size={16} className="text-gray-400" />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Laboratorio</p>
                            <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                                <Landmark size={16} className="text-gray-400" />
                                {trabajo.laboratorio_nombre || 'No especificado'}
                            </div>
                        </div>
                        <div className="space-y-1 text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Costo</p>
                            <div className="flex items-center justify-end gap-1 text-gray-900 dark:text-white font-black text-lg">
                                <DollarSign size={16} className="text-emerald-500" />
                                {trabajo.costo_usd}
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800/50">
                        <div className="flex items-start gap-3">
                            <Calendar size={18} className="text-indigo-600 mt-1" />
                            <div>
                                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300">Fecha de Entrega Estimada</p>
                                <p className="text-lg font-black text-indigo-600">
                                    {new Date(trabajo.fecha_entrega_estimada).toLocaleDateString('es-AR', { dateStyle: 'long' })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {trabajo.observaciones && (
                        <div className="space-y-1">
                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Observaciones</p>
                            <p className="p-4 bg-gray-50 dark:bg-gray-900 rounded-xl text-sm text-gray-600 dark:text-gray-400 italic">
                                {trabajo.observaciones}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="space-y-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Actualizar Estado</p>
                        <div className="grid grid-cols-2 gap-3">
                            {trabajo.estado === 'Enviado' && (
                                <button
                                    onClick={() => updateStatus('Recibido')}
                                    className="col-span-2 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-blue-100 dark:shadow-none transition-all"
                                    disabled={updating}
                                >
                                    <CheckCircle2 size={20} />
                                    MARCAR COMO RECIBIDO
                                </button>
                            )}
                            {trabajo.estado === 'Recibido' && (
                                <button
                                    onClick={() => updateStatus('Colocado')}
                                    className="col-span-2 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black flex items-center justify-center gap-2 shadow-xl shadow-emerald-100 dark:shadow-none transition-all"
                                    disabled={updating}
                                >
                                    <CheckCircle2 size={20} />
                                    TRABAJO COLOCADO / FINALIZADO
                                </button>
                            )}
                            {trabajo.estado !== 'Anulado' && trabajo.estado !== 'Colocado' && (
                                <button
                                    onClick={() => updateStatus('Anulado')}
                                    className="py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                                    disabled={updating}
                                >
                                    <Ban size={18} />
                                    Anular
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                className="py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-2xl font-bold transition-all"
                                disabled={updating}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
