'use client';

import { useState } from 'react';
import { X, Package, Loader2, Save, Tag, BarChart3 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface NuevoItemFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export default function NuevoItemForm({ isOpen, onClose, onSuccess }: NuevoItemFormProps) {
    const [saving, setSaving] = useState(false);
    const [formData, setFormData] = useState({
        nombre: '',
        categoria: 'Insumos Clínicos',
        stock_actual: 0,
        unidad_medida: 'unidades',
        stock_minimo: 5,
        area: 'CLINICA' as 'CLINICA' | 'LABORATORIO'
    });

    const CATEGORIAS = [
        'Insumos Clínicos',
        'Materiales Quirúrgicos',
        'Prótesis / Laboratorio',
        'Limpieza / Descartables',
        'Oficina',
        'Otro'
    ];

    const UNIDADES = [
        'unidades',
        'cajas',
        'paquetes',
        'gr',
        'ml',
        'kits'
    ];

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!formData.nombre) return;

        setSaving(true);
        try {
            const { error: itemError, data: itemData } = await supabase
                .from('inventario_items')
                .insert({
                    nombre: formData.nombre,
                    categoria: formData.categoria,
                    stock_actual: formData.stock_actual,
                    unidad_medida: formData.unidad_medida,
                    stock_minimo: formData.stock_minimo,
                    area: formData.area
                })
                .select()
                .single();

            if (itemError) throw itemError;

            // Optional: Register the initial stock as an 'AJUSTE' movement
            if (formData.stock_actual > 0) {
                await supabase.from('inventario_movimientos').insert({
                    item_id: itemData.id,
                    tipo_movimiento: 'AJUSTE',
                    cantidad: formData.stock_actual,
                    motivo: 'Carga inicial de stock',
                    usuario: 'Sistema'
                });
            }

            onSuccess();
            onClose();
            setFormData({
                nombre: '',
                categoria: 'Insumos Clínicos',
                stock_actual: 0,
                unidad_medida: 'unidades',
                stock_minimo: 5,
                area: 'CLINICA'
            });
        } catch (error) {
            console.error('Error saving item:', error);
            alert('Error al guardar el item');
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center">
                            <Package size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Nuevo Artículo</h3>
                            <p className="text-xs text-gray-500">Agregar producto al inventario</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    <div className="space-y-2">
                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Nombre del Artículo *</label>
                        <input
                            type="text"
                            placeholder="Ej: Anestesia Tubul, Resina A2, etc."
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase"
                            value={formData.nombre}
                            onChange={(e) => setFormData(prev => ({ ...prev, nombre: e.target.value }))}
                            required
                            autoFocus
                        />
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Categoría</label>
                            <div className="relative">
                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <select
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.categoria}
                                    onChange={(e) => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                                >
                                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Área / Destino *</label>
                                <select
                                    className="w-full px-4 py-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 outline-none font-bold text-indigo-700 dark:text-indigo-300"
                                    value={formData.area}
                                    onChange={(e) => setFormData(prev => ({ ...prev, area: e.target.value as any }))}
                                >
                                    <option value="CLINICA">🏥 CLÍNICA GENERAL</option>
                                    <option value="LABORATORIO">🔬 LABORATORIO PROPIO</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Unidad de Medida</label>
                                <select
                                    className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 outline-none"
                                    value={formData.unidad_medida}
                                    onChange={(e) => setFormData(prev => ({ ...prev, unidad_medida: e.target.value }))}
                                >
                                    {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Stock Inicial</label>
                            <input
                                type="number"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.stock_actual}
                                onChange={(e) => setFormData(prev => ({ ...prev, stock_actual: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-red-600 dark:text-red-400">Stock Mínimo (Alerta)</label>
                            <div className="relative">
                                <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={18} />
                                <input
                                    type="number"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-red-200 dark:border-red-900/30 rounded-xl focus:ring-2 focus:ring-red-500 outline-none"
                                    value={formData.stock_minimo}
                                    onChange={(e) => setFormData(prev => ({ ...prev, stock_minimo: parseFloat(e.target.value) || 0 }))}
                                />
                            </div>
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
                            disabled={saving}
                            className="flex-3 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 dark:shadow-none transition-all"
                        >
                            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            Guardar Artículo
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
