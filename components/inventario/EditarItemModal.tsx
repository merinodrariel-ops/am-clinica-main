'use client';

import { useState, useEffect } from 'react';
import { X, Package, Loader2, Save, Tag, BarChart3, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import MoneyInput from '@/components/ui/MoneyInput';
import { useAuth } from '@/contexts/AuthContext';
import { updateInventoryProduct } from '@/app/actions/inventory-products';

interface Item {
    id: string;
    nombre: string;
    categoria: string;
    stock_actual: number;
    unidad_medida: string;
    stock_minimo: number;
    area: 'CLINICA' | 'LABORATORIO';
    marca?: string;
    proveedor?: string;
    descripcion?: string;
    link?: string;
}

interface EditarItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    item: Item | null;
}

export default function EditarItemModal({ isOpen, onClose, onSuccess, item }: EditarItemModalProps) {
    const { role, user } = useAuth();
    const isLabUser = role === 'laboratorio';

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        nombre: '',
        categoria: '',
        stock_actual: 0,
        unidad_medida: '',
        stock_minimo: 0,
        area: 'CLINICA' as 'CLINICA' | 'LABORATORIO',
        marca: '',
        proveedor: '',
        descripcion: '',
        link: ''
    });

    useEffect(() => {
        if (item) {
            setFormData({
                nombre: item.nombre || '',
                categoria: item.categoria || '',
                stock_actual: item.stock_actual || 0,
                unidad_medida: item.unidad_medida || 'unidades',
                stock_minimo: item.stock_minimo || 0,
                area: item.area || 'CLINICA',
                marca: item.marca || '',
                proveedor: item.proveedor || '',
                descripcion: item.descripcion || '',
                link: item.link || ''
            });
        }
        setError(null);
    }, [item, isOpen]);

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
        if (!item) return;

        if (!user) {
            setError("No estás autenticado");
            return;
        }

        setSaving(true);
        setError(null);

        try {
            const result = await updateInventoryProduct({
                id: item.id,
                name: formData.nombre,
                category: formData.categoria,
                unit: formData.unidad_medida,
                thresholdMin: formData.stock_minimo,
                color: formData.area,
                brand: formData.marca,
                supplier: formData.proveedor,
                notes: formData.descripcion,
                link: formData.link
            });

            if (!result.success) {
                throw new Error(result.error);
            }

            onSuccess();
            onClose();
        } catch (err: unknown) {
            console.error('Error updating item:', err);
            const message = err instanceof Error ? err.message : 'Error al actualizar el item';
            setError(message);
        } finally {
            setSaving(false);
        }
    }

    if (!isOpen || !item) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
                <div className="px-6 py-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-blue-50/50 dark:bg-blue-900/10 sticky top-0 backdrop-blur-md">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-xl flex items-center justify-center">
                            <Package size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-gray-900 dark:text-white">Editar Artículo</h3>
                            <p className="text-xs text-gray-500">Modificar detalles del producto</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white dark:hover:bg-gray-700 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>

                {error && (
                    <div className="mx-6 mt-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 rounded-xl flex items-center gap-3">
                        <AlertCircle size={20} />
                        <p className="text-sm font-medium">{error}</p>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    {/* Basic Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="col-span-1 md:col-span-2 space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Nombre del Artículo</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all uppercase"
                                value={formData.nombre}
                                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Categoría</label>
                            <div className="relative">
                                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input
                                    type="text"
                                    list="edit-category-options"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                                    value={formData.categoria}
                                    onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                                />
                                <datalist id="edit-category-options">
                                    {CATEGORIAS.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Marca</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                                value={formData.marca}
                                onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                                placeholder="Ej: 3M, COLTENE"
                            />
                        </div>
                    </div>

                    {/* Classification & Measure */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Área / Destino</label>
                            <select
                                className={clsx(
                                    "w-full px-4 py-3 border rounded-xl appearance-none focus:ring-2 focus:ring-blue-500 outline-none font-bold",
                                    isLabUser
                                        ? "bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 cursor-not-allowed"
                                        : "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
                                )}
                                value={formData.area}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        area: e.target.value as 'CLINICA' | 'LABORATORIO',
                                    })
                                }
                                disabled={isLabUser}
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
                                onChange={(e) => setFormData({ ...formData, unidad_medida: e.target.value })}
                            >
                                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Stock Settings */}
                    <div className="p-5 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-100 dark:border-gray-700 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">
                                Stock Actual
                                <span className="ml-2 text-xs font-normal text-gray-500">(Corrección manual)</span>
                            </label>
                            <MoneyInput
                                value={formData.stock_actual}
                                onChange={(val) => setFormData({ ...formData, stock_actual: val })}
                                hideSymbol
                                className="w-full text-lg font-bold"
                            />
                            <p className="text-xs text-orange-500">
                                ⚠️ Para movimientos diarios usa los botones de Entrada/Salida en la lista.
                            </p>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-red-600 dark:text-red-400">Stock Mínimo (Alerta)</label>
                            <div className="relative">
                                <BarChart3 className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={18} />
                                <MoneyInput
                                    value={formData.stock_minimo}
                                    onChange={(val) => setFormData({ ...formData, stock_minimo: val })}
                                    hideSymbol
                                    className="w-full pl-10 text-lg font-bold border-red-200 dark:border-red-900/30 focus:ring-red-500"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Additional Details */}
                    <div className="grid grid-cols-1 gap-6">
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Proveedor</label>
                            <input
                                type="text"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none"
                                value={formData.proveedor}
                                onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                                placeholder="Nombre del proveedor habitual"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300">Descripción / Notas</label>
                            <textarea
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none min-h-[80px]"
                                value={formData.descripcion}
                                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                                placeholder="Detalles adicionales..."
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
                            disabled={saving}
                            className="flex-3 py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200 dark:shadow-none transition-all px-8"
                        >
                            {saving ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
