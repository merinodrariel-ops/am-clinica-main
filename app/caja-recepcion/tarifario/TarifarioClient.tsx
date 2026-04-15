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
    Check,
} from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import type { TarifarioItem, TarifarioVersion } from '@/lib/supabase';

const supabase = createClient();
import { formatCurrency } from '@/lib/bna';

// Categorías de fallback — se reemplazan por las categorías reales del tarifario en DB
const CATEGORIAS_FALLBACK = [
    'Consultas', 'Ortodoncia', 'Implantes', 'Estética', 'Endodoncia',
    'Cirugía', 'Periodoncia', 'Odontopediatría', 'Prótesis', 'General',
];

function formatPrecio(item: TarifarioItem): string {
    if (item.moneda === 'ARS') {
        return item.precio_base_ars != null && item.precio_base_ars > 0
            ? `$${item.precio_base_ars.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
            : 'Variable';
    }
    return item.precio_base_usd > 0 ? formatCurrency(item.precio_base_usd, 'USD') : 'Variable';
}

type NewItemState = {
    categoria: string;
    concepto_nombre: string;
    moneda: 'USD' | 'ARS';
    precio_base_usd: number;
    precio_base_ars: number;
    notas: string;
};

type EditFormState = {
    concepto_nombre: string;
    moneda: 'USD' | 'ARS';
    precio_base_usd: number;
    precio_base_ars: number;
    notas: string;
};

export default function TarifarioPage() {
    const [version, setVersion] = useState<TarifarioVersion | null>(null);
    const [items, setItems] = useState<TarifarioItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [itemsByCategoria, setItemsByCategoria] = useState<Record<string, TarifarioItem[]>>({});
    const [categorias, setCategorias] = useState<string[]>(CATEGORIAS_FALLBACK);
    const [categoriaPersonalizada, setCategoriaPersonalizada] = useState('');

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm, setEditForm] = useState<EditFormState>({
        concepto_nombre: '', moneda: 'USD', precio_base_usd: 0, precio_base_ars: 0, notas: '',
    });

    const [showNewItem, setShowNewItem] = useState(false);
    const [newItem, setNewItem] = useState<NewItemState>({
        categoria: 'General', concepto_nombre: '', moneda: 'USD', precio_base_usd: 0, precio_base_ars: 0, notas: '',
    });

    useEffect(() => { loadTarifario(); }, []);

    async function loadTarifario() {
        setLoading(true);
        try {
            const { data: versionData, error: versionError } = await supabase
                .from('tarifario_versiones')
                .select('*')
                .eq('estado', 'vigente')
                .single();

            if (versionError && versionError.code !== 'PGRST116') {
                console.error('Error loading version:', versionError);
            }
            setVersion(versionData);

            if (versionData) {
                const { data: itemsData, error: itemsError } = await supabase
                    .from('tarifario_items')
                    .select('*')
                    .eq('tarifario_version_id', versionData.id)
                    .eq('activo', true)
                    .order('categoria')
                    .order('concepto_nombre');

                if (itemsError) throw itemsError;
                const rows = (itemsData || []) as TarifarioItem[];
                setItems(rows);

                const grouped = rows.reduce((acc: Record<string, TarifarioItem[]>, item: TarifarioItem) => {
                    if (!acc[item.categoria]) acc[item.categoria] = [];
                    acc[item.categoria].push(item);
                    return acc;
                }, {});
                setItemsByCategoria(grouped);

                // Categorías reales de la BD + las del fallback que no estén ya
                const realCats = Object.keys(grouped);
                const merged = [...new Set([...realCats, ...CATEGORIAS_FALLBACK])].sort();
                setCategorias(merged);
                // Inicializar el selector de nuevo ítem con la primera categoría real
                if (realCats.length > 0) {
                    setNewItem(prev => ({ ...prev, categoria: realCats[0] }));
                }
            }
        } catch (error) {
            console.error('Error loading tarifario:', error);
        } finally {
            setLoading(false);
        }
    }

    function startEdit(item: TarifarioItem) {
        setEditingId(item.id);
        setEditForm({
            concepto_nombre: item.concepto_nombre,
            moneda: item.moneda ?? 'USD',
            precio_base_usd: item.precio_base_usd,
            precio_base_ars: item.precio_base_ars ?? 0,
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
                    moneda: editForm.moneda,
                    precio_base_usd: editForm.moneda === 'USD' ? editForm.precio_base_usd : 0,
                    precio_base_ars: editForm.moneda === 'ARS' ? editForm.precio_base_ars : null,
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
        const categoriaFinal = newItem.categoria === '__nueva__'
            ? categoriaPersonalizada.trim()
            : newItem.categoria;

        if (!version || !newItem.concepto_nombre || !categoriaFinal) {
            alert('Complete todos los campos obligatorios');
            return;
        }
        if (newItem.moneda === 'USD' && newItem.precio_base_usd < 0) return;
        if (newItem.moneda === 'ARS' && newItem.precio_base_ars < 0) return;

        setSaving(true);
        try {
            const { error } = await supabase
                .from('tarifario_items')
                .insert({
                    tarifario_version_id: version.id,
                    categoria: categoriaFinal,
                    concepto_nombre: newItem.concepto_nombre,
                    moneda: newItem.moneda,
                    precio_base_usd: newItem.moneda === 'USD' ? newItem.precio_base_usd : 0,
                    precio_base_ars: newItem.moneda === 'ARS' ? newItem.precio_base_ars : null,
                    notas: newItem.notas || null,
                    activo: true,
                });

            if (error) throw error;

            setShowNewItem(false);
            setNewItem({ categoria: 'General', concepto_nombre: '', moneda: 'USD', precio_base_usd: 0, precio_base_ars: 0, notas: '' });
            setCategoriaPersonalizada('');
            await loadTarifario();
        } catch (error) {
            const msg = error instanceof Error ? error.message : JSON.stringify(error);
            console.error('Error adding:', msg);
            alert(`Error al agregar: ${msg}`);
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
                                        <th className="px-4 py-3 text-center w-20">Moneda</th>
                                        <th className="px-4 py-3 text-right w-36">Precio</th>
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
                                                        <select
                                                            value={editForm.moneda}
                                                            onChange={(e) => setEditForm({ ...editForm, moneda: e.target.value as 'USD' | 'ARS' })}
                                                            className="w-full px-2 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-sm"
                                                        >
                                                            <option value="USD">USD</option>
                                                            <option value="ARS">ARS</option>
                                                        </select>
                                                    </td>
                                                    <td className="px-4 py-2">
                                                        {editForm.moneda === 'ARS' ? (
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">$</span>
                                                                <input
                                                                    type="number"
                                                                    value={editForm.precio_base_ars || ''}
                                                                    onChange={(e) => setEditForm({ ...editForm, precio_base_ars: parseFloat(e.target.value) || 0 })}
                                                                    className="w-full pl-7 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-right"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="relative">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">U$D</span>
                                                                <input
                                                                    type="number"
                                                                    value={editForm.precio_base_usd || ''}
                                                                    onChange={(e) => setEditForm({ ...editForm, precio_base_usd: parseFloat(e.target.value) || 0 })}
                                                                    className="w-full pl-10 pr-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 text-right"
                                                                />
                                                            </div>
                                                        )}
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
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide
                                                            ${(item.moneda ?? 'USD') === 'ARS'
                                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'}`}>
                                                            {item.moneda ?? 'USD'}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-medium">
                                                        {formatPrecio(item)}
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
                    <button onClick={() => setShowNewItem(true)} className="mt-4 text-blue-600 hover:underline">
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
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría *</label>
                                <select
                                    value={newItem.categoria === '__nueva__' ? '__nueva__' : newItem.categoria}
                                    onChange={(e) => {
                                        if (e.target.value === '__nueva__') {
                                            setNewItem({ ...newItem, categoria: '__nueva__' });
                                        } else {
                                            setNewItem({ ...newItem, categoria: e.target.value });
                                            setCategoriaPersonalizada('');
                                        }
                                    }}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                >
                                    {categorias.map((cat) => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="__nueva__">+ Nueva categoría...</option>
                                </select>
                                {newItem.categoria === '__nueva__' && (
                                    <input
                                        type="text"
                                        value={categoriaPersonalizada}
                                        onChange={(e) => setCategoriaPersonalizada(e.target.value)}
                                        placeholder="Nombre de la nueva categoría"
                                        className="w-full mt-2 px-4 py-2.5 border border-blue-300 dark:border-blue-600 rounded-lg bg-gray-50 dark:bg-gray-900 focus:ring-2 focus:ring-blue-500/20"
                                        autoFocus
                                    />
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nombre del concepto *</label>
                                <input
                                    type="text"
                                    value={newItem.concepto_nombre}
                                    onChange={(e) => setNewItem({ ...newItem, concepto_nombre: e.target.value })}
                                    className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                    placeholder="Ej: Consulta inicial"
                                />
                            </div>
                            {/* Moneda toggle */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Moneda *</label>
                                <div className="flex gap-2">
                                    {(['USD', 'ARS'] as const).map((m) => (
                                        <button
                                            key={m}
                                            type="button"
                                            onClick={() => setNewItem({ ...newItem, moneda: m })}
                                            className={`flex-1 py-2.5 text-sm font-semibold rounded-lg border-2 transition-all
                                                ${newItem.moneda === m
                                                    ? m === 'USD'
                                                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300'
                                                        : 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                                    : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-gray-300'}`}
                                        >
                                            {m === 'USD' ? '🇺🇸 Dólares (USD)' : '🇦🇷 Pesos (ARS)'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Precio según moneda */}
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Precio base {newItem.moneda} *
                                </label>
                                <div className="relative">
                                    {newItem.moneda === 'ARS' ? (
                                        <>
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                                            <input
                                                type="number"
                                                value={newItem.precio_base_ars || ''}
                                                onChange={(e) => setNewItem({ ...newItem, precio_base_ars: parseFloat(e.target.value) || 0 })}
                                                className="w-full pl-8 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                                placeholder="0"
                                            />
                                        </>
                                    ) : (
                                        <>
                                            <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="number"
                                                value={newItem.precio_base_usd || ''}
                                                onChange={(e) => setNewItem({ ...newItem, precio_base_usd: parseFloat(e.target.value) || 0 })}
                                                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                                placeholder="0.00"
                                            />
                                        </>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Ingrese 0 para precio variable</p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notas (opcional)</label>
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
