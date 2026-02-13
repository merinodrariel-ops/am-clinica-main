'use client';

import { useState, useEffect } from 'react';
import { X, Search, User, Loader2, Calendar, FlaskConical, Stethoscope, Landmark, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';


interface Paciente {
    id_paciente: string;
    nombre: string;
    apellido: string;
}

interface Profesional {
    id: string;
    nombre: string;
}

interface NuevoTrabajoFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NuevoTrabajoForm({ isOpen, onClose, onSuccess }: NuevoTrabajoFormProps) {
    const [saving, setSaving] = useState(false);

    // Search states
    const [searchQuery, setSearchQuery] = useState('');
    const [patients, setPatients] = useState<Paciente[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);

    const [profesionales, setProfesionales] = useState<Profesional[]>([]);

    // Form data
    const [formData, setFormData] = useState({
        paciente_id: '',
        paciente_nombre: '',
        profesional_id: '',
        tipo_trabajo: '',
        laboratorio_nombre: '',
        fecha_envio: new Date().toISOString().split('T')[0],
        fecha_entrega_estimada: '',
        costo_usd: 0,
        observaciones: ''
    });

    useEffect(() => {
        if (isOpen) {
            loadProfesionales();
        }
    }, [isOpen]);

    async function loadProfesionales() {
        const { data } = await supabase.from('profesionales').select('id, nombre').eq('activo', true);
        setProfesionales(data || []);
    }

    // Patient search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (searchQuery.length >= 2) {
                searchPatients(searchQuery);
            } else {
                setPatients([]);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    async function searchPatients(query: string) {
        setSearchLoading(true);
        const { data } = await supabase
            .from('pacientes')
            .select('id_paciente, nombre, apellido')
            .or(`nombre.ilike.%${query}%,apellido.ilike.%${query}%`)
            .limit(5);
        setPatients(data || []);
        setSearchLoading(false);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.paciente_id || !formData.tipo_trabajo) {
            alert('Por favor completá Paciente y Tipo de Trabajo');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('laboratorio_trabajos')
                .insert({
                    paciente_id: formData.paciente_id,
                    profesional_id: formData.profesional_id || null,
                    tipo_trabajo: formData.tipo_trabajo,
                    laboratorio_nombre: formData.laboratorio_nombre,
                    fecha_envio: formData.fecha_envio,
                    fecha_entrega_estimada: formData.fecha_entrega_estimada || null,
                    costo_usd: formData.costo_usd,
                    observaciones: formData.observaciones,
                    estado: 'Enviado'
                });

            if (error) throw error;
            onSuccess();
            onClose();
            // Reset form
            setFormData({
                paciente_id: '',
                paciente_nombre: '',
                profesional_id: '',
                tipo_trabajo: '',
                laboratorio_nombre: '',
                fecha_envio: new Date().toISOString().split('T')[0],
                fecha_entrega_estimada: '',
                costo_usd: 0,
                observaciones: ''
            });
            setSearchQuery('');
        } catch (error) {
            console.error('Error saving lab work:', error);
            alert('Error al guardar el trabajo');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-900/10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-xl flex items-center justify-center">
                            <FlaskConical size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Nuevo Trabajo de Laboratorio</h3>
                            <p className="text-xs text-gray-500">Registrar envío de orden</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Patient Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Paciente *</label>
                            {formData.paciente_id ? (
                                <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                                    <div className="flex items-center gap-2">
                                        <User size={18} className="text-indigo-600" />
                                        <span className="font-semibold text-gray-900 dark:text-white">{formData.paciente_nombre}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFormData(prev => ({ ...prev, paciente_id: '', paciente_nombre: '' }));
                                            setSearchQuery('');
                                        }}
                                        className="text-gray-400 hover:text-red-500"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o apellido..."
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                    {searchLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-indigo-600" size={18} />}

                                    {patients.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-xl z-10 overflow-hidden">
                                            {patients.map(p => (
                                                <button
                                                    key={p.id_paciente}
                                                    type="button"
                                                    className="w-full px-4 py-3 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-between transition-colors"
                                                    onClick={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            paciente_id: p.id_paciente,
                                                            paciente_nombre: `${p.nombre} ${p.apellido}`
                                                        }));
                                                        setPatients([]);
                                                    }}
                                                >
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white">{p.nombre} {p.apellido}</span>
                                                    <Plus size={16} className="text-indigo-600" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Professional Selection */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Profesional Solicitante</label>
                            <div className="relative">
                                <Stethoscope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <select
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all appearance-none"
                                    value={formData.profesional_id}
                                    onChange={(e) => setFormData(prev => ({ ...prev, profesional_id: e.target.value }))}
                                >
                                    <option value="">Seleccionar profesional...</option>
                                    {profesionales.map(p => (
                                        <option key={p.id} value={p.id}>{p.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Work Type */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Tipo de Trabajo *</label>
                            <input
                                type="text"
                                placeholder="Ej: Corona Zirconio, Perno, etc."
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                value={formData.tipo_trabajo}
                                onChange={(e) => setFormData(prev => ({ ...prev, tipo_trabajo: e.target.value }))}
                                required
                            />
                        </div>

                        {/* Lab Name */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Laboratorio</label>
                            <div className="relative">
                                <Landmark className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Nombre del laboratorio..."
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={formData.laboratorio_nombre}
                                    onChange={(e) => setFormData(prev => ({ ...prev, laboratorio_nombre: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Dates */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 text-amber-600">Fecha de Entrega Estimada</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={formData.fecha_entrega_estimada}
                                    onChange={(e) => setFormData(prev => ({ ...prev, fecha_entrega_estimada: e.target.value }))}
                                />
                            </div>
                        </div>

                        {/* Cost */}
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Costo Estimado (USD)</label>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">USD</div>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    className="w-full pl-14 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all text-gray-900 dark:text-white font-bold"
                                    value={formData.costo_usd || ''}
                                    onChange={(e) => setFormData(prev => ({ ...prev, costo_usd: parseFloat(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Observations */}
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Observaciones / Detalles Técnicos</label>
                        <textarea
                            placeholder="Color, materiales, especificaciones..."
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all resize-none h-24"
                            value={formData.observaciones}
                            onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                        />
                    </div>

                    {/* Footer */}
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
                            disabled={saving}
                            className="flex-3 py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 dark:shadow-none transition-all"
                        >
                            {saving ? (
                                <Loader2 size={20} className="animate-spin" />
                            ) : (
                                <FlaskConical size={20} />
                            )}
                            Registrar Envío
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
