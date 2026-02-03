'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    Plus,
    Edit2,
    Trash2,
    X,
    ArrowLeft,
    Loader2,
    Package,
    DollarSign,
    Check
} from 'lucide-react';
import { supabase, TarifarioItem, TarifarioVersion } from '@/lib/supabase';
import { formatCurrency } from '@/lib/bna';

const CATEGORIAS = [
    'Consultas',
    'Ortodoncia',
    'Implantes',
    'Estética',
    'Endodoncia',
    'Cirugía',
    'Periodoncia',
    'Odontopediatría',
    'Prótesis',
    'General',
];

export default function TarifarioPage() {
    const [version, setVersion] = useState<TarifarioVersion | null>(null);
    const [items, setItems] = useState<TarifarioItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Groupings
    const [itemsByCategoria, setItemsByCategoria] = useState<Record<string, TarifarioItem[]>>({});

    // Edit mode
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState({ concepto_nombre: '', precio_base_usd: 0, notas: '' });

    // New item mode
    const [showNewItem, setShowNewItem] = useState(false);
    const [newItem, setNewItem] = useState({ categoria: 'General', concepto_nombre: '', precio_base_usd: 0, notas: '' });

    useEffect(() => {
        loadTarifario();
    }, []);

    async function loadTarifario() {
        setLoading(true);
        try {
            // Get the active version
            const { data: versionData, error: versionError } = await supabase
                .from('tarifario_versiones')
                .select('*')
                .eq('estado', 'vigente')
                .single();

            if (versionError && versionError.code !== 'PGRST116') {
                console.error('Error loading version:', versionError);
            }
            setVersion(versionData);

            // Get items
            if (versionData) {
                const { data: itemsData, error: itemsError } = await supabase
                    .from('tarifario_items')
                    .select('*')
                    .eq('tarifario_version_id', versionData.id)
                    .eq('activo', true)
                    .order('categoria')
                    .order('concepto_nombre');

                if (itemsError) throw itemsError;
                setItems(itemsData || []);

                // Group by category
                const grouped = (itemsData || []).reduce((acc: Record<string, TarifarioItem[]>, item: TarifarioItem) => {
                    if (!acc[item.categoria]) acc[item.categoria] = [];
                    acc[item.categoria].push(item);
                    return acc;
                }, {} as Record<string, TarifarioItem[]>);
                setItemsByCategoria(grouped);
            }
        } catch (error) {
            console.error('Error loading tarifario:', error);
        } finally {
            setLoading(false);
        }
    }

    async function startEdit(item: TarifarioItem) {
        setEditingId(item.id);
        setEditForm({
            concepto_nombre: item.concepto_nombre,
            precio_base_usd: item.precio_base_usd,
            notas: item.notas || '',
        });
    }

    async function saveEdit() {
        if (!editingId) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('tarifario_items')
                .update({
                    concepto_nombre: editForm.concepto_nombre,
                    precio_base_usd: editForm.precio_base_usd,
                    notas: editForm.notas || null,
                })
                .eq('id', editingId);

            if (error) throw error;

            setEditingId(null);
            await loadTarifario();
        } catch (error) {
            console.error('Error saving:', error);
            alert('Error al guardar');
        } finally {
            setSaving(false);
        }
    }

    async function deleteItem(id: string) {
        if (!confirm('¿Desactivar este item del tarifario?')) return;

        try {
            const { error } = await supabase
                .from('tarifario_items')
                .update({ activo: false })
                .eq('id', id);

            if (error) throw error;
            await loadTarifario();
        } catch (error) {
            console.error('Error deleting:', error);
            alert('Error al eliminar');
        }
    }

    async function addNewItem() {
        if (!version || !newItem.concepto_nombre || newItem.precio_base_usd < 0) {
            alert('Complete todos los campos');
            return;
        }

        setSaving(true);
        try {
            const { error } = await supabase
                .from('tarifario_items')
                .insert({
                    tarifario_version_id: version.id,
                    categoria: newItem.categoria,
                    concepto_nombre: newItem.concepto_nombre,
                    precio_base_usd: newItem.precio_base_usd,
                    notas: newItem.notas || null,
                    activo: true,
                });

            if (error) throw error;

            setShowNewItem(false);
            setNewItem({ categoria: 'General', concepto_nombre: '', precio_base_usd: 0, notas: '' });
            await loadTarifario();
        } catch (error) {
            console.error('Error adding:', error);
            alert('Error al agregar');
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div className="p-8 flex items-center justify-center">
                <Loader2 className="animate-spin text-gray-400" size={32} />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="mb-8">
                <Link href="/caja-recepcion" className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-4">
                    <ArrowLeft size={16} />
                    Volver a Caja Recepción
                </Link>
                <div className="flex justify-between items-start">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
                            Tarifario
                        </h1>
                        <p className="text-gray-500 mt-1">
                            {version ? `Versión: ${version.nombre_version}` : 'Sin versión activa'}
                        </p>
                    </div>
                    <button
                        onClick={() => setShowNewItem(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                    >
                        <Plus size={20} />
                        Nuevo Item
                    </button>
                </div>
            </div>

            {/* Categories and Items */}
            <div className="space-y-8">
                {Object.entries(itemsByCategoria).map(([categoria, catItems]) => (
                    <div key={categoria}>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <Package size={20} className="text-gray-400" />
                            {categoria}
                            <span className="text-sm font-normal text-gray-400">({catItems.length})</span>
                        </h2>

                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                            <table className="w-full">
                                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Concepto</th>
                                        <th className="px-4 py-3 text-right w-32">Precio USD</th>
                                        <th className="px-4 py-3 text-left w-48">Notas</th>
                                        <th className="px-4 py-3 text-center w-24">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {catItems.map((item) => (
                                        <tr key={item.id} className="border-t border-gray-100 dark:border-gray-700">
                                            {editingId === item.id ? (
                                                <>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={editForm.concepto_nombre}
                                                            onChange={(e) => setEditForm({ ...editForm, concepto_nombre: e.target.value })}
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="number"
                                                            value={editForm.precio_base_usd || ''}
                                                            onChange={(e) => setEditForm({ ...editForm, precio_base_usd: parseFloat(e.target.value) || 0 })}
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-right"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        <input
                                                            type="text"
                                                            value={editForm.notas}
                                                            onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })}
                                                            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                                            placeholder="Opcional"
                                                        />
                                                    </td>
                                                    <td className="px-4 py-2 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={saveEdit}
                                                                disabled={saving}
                                                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                                            >
                                                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                                            </button>
                                                            <button
                                                                onClick={() => setEditingId(null)}
                                                                className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                                            >
                                                                <X size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                                                        {item.concepto_nombre}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-medium">
                                                        {item.precio_base_usd > 0 ? formatCurrency(item.precio_base_usd, 'USD') : 'Variable'}
                                                    </td>
                                                    <td className="px-4 py-3 text-sm text-gray-500 truncate">
                                                        {item.notas || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                onClick={() => startEdit(item)}
                                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                                            >
                                                                <Edit2 size={16} />
                                                            </button>
                                                            <button
                                                                onClick={() => deleteItem(item.id)}
                                                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ))}
            </div>

            {items.length === 0 && (
                <div className="text-center py-16 text-gray-500">
                    <Package size={48} className="mx-auto mb-4 text-gray-300" />
                    <p>No hay items en el tarifario.</p>
                    <button
                        onClick={() => setShowNewItem(true)}
                        className="mt-4 text-blue-600 hover:underline"
                    >
                        Agregar primer item
                    </button>
                </div>
            )}

            {/* New Item Modal */}
            {showNewItem && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                            <h3 className="font-semibold text-gray-900 dark:text-white">Nuevo Item</h3>
                            <button
                                onClick={() => setShowNewItem(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <X size={18} className="text-gray-500" />
                            </button>
                        </div>
                        <div className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Categoría *
                                </label>
                                <select
                                    value={newItem.categoria}
                                    onChange={(e) => setNewItem({ ...newItem, categoria: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                >
                                    {CATEGORIAS.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Nombre del concepto *
                                </label>
                                <input
                                    type="text"
                                    value={newItem.concepto_nombre}
                                    onChange={(e) => setNewItem({ ...newItem, concepto_nombre: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    placeholder="Ej: Consulta inicial"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Precio base USD *
                                </label>
                                <div className="relative">
                                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                    <input
                                        type="number"
                                        value={newItem.precio_base_usd || ''}
                                        onChange={(e) => setNewItem({ ...newItem, precio_base_usd: parseFloat(e.target.value) || 0 })}
                                        className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                        placeholder="0.00"
                                    />
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Ingrese 0 para precio variable</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Notas (opcional)
                                </label>
                                <input
                                    type="text"
                                    value={newItem.notas}
                                    onChange={(e) => setNewItem({ ...newItem, notas: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    placeholder="Información adicional..."
                                />
                            </div>
                        </div>
                        <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                            <button
                                onClick={() => setShowNewItem(false)}
                                className="flex-1 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-900"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={addNewItem}
                                disabled={saving || !newItem.concepto_nombre}
                                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center justify-center gap-2"
                            >
                                {saving ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                                Agregar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
