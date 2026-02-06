'use client';

import { useState, useEffect, useCallback } from 'react';
import {
    Package,
    Plus,
    AlertTriangle,
    TrendingUp,
    TrendingDown,
    Search,
    Filter,
    MoreVertical,
    Loader2,
    ArrowUpRight,
    ArrowDownRight,
    History
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import clsx from 'clsx';
import NuevoItemForm from '@/components/inventario/NuevoItemForm';
import MovimientoStockForm from '@/components/inventario/MovimientoStockForm';
import HistorialMovimientosModal from '@/components/inventario/HistorialMovimientosModal';

interface Item {
    id: string;
    nombre: string;
    categoria: string;
    stock_actual: number;
    unidad_medida: string;
    stock_minimo: number;
}

export default function InventarioPage() {
    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Todos');
    const [showNuevoItem, setShowNuevoItem] = useState(false);
    const [showHistorial, setShowHistorial] = useState(false);
    const [showMovimiento, setShowMovimiento] = useState({
        isOpen: false,
        item: null as Item | null,
        tipo: 'ENTRADA' as 'ENTRADA' | 'SALIDA' | 'AJUSTE'
    });

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('inventario_items')
                .select('*')
                .order('nombre', { ascending: true });

            if (error) throw error;
            setItems(data || []);
        } catch (error) {
            console.error('Error loading inventory:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const categories = ['Todos', ...new Set(items.map(i => i.categoria))];

    const filteredItems = items.filter(i =>
        (i.nombre.toLowerCase().includes(search.toLowerCase()) ||
            i.categoria?.toLowerCase().includes(search.toLowerCase())) &&
        (categoryFilter === 'Todos' || i.categoria === categoryFilter)
    );

    const lowStockCount = items.filter(i => i.stock_actual <= i.stock_minimo).length;

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Package className="text-blue-600" />
                        Gestión de Inventario
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400">Control de stock de insumos y materiales</p>
                </div>
                <div className="flex gap-2">
                    <button
                        className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                        onClick={() => setShowHistorial(true)}
                    >
                        <History size={20} />
                        Historial
                    </button>
                    <button
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                        onClick={() => setShowNuevoItem(true)}
                    >
                        <Plus size={20} />
                        Nuevo Item
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center">
                            <Package size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Items Totales</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{items.length}</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "h-10 w-10 rounded-lg flex items-center justify-center",
                            lowStockCount > 0 ? "bg-red-100 text-red-600 dark:bg-red-900/30" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30"
                        )}>
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Stock Crítico</p>
                            <p className={clsx(
                                "text-2xl font-bold",
                                lowStockCount > 0 ? "text-red-600" : "text-emerald-600"
                            )}>
                                {lowStockCount}
                            </p>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 rounded-lg flex items-center justify-center">
                            <TrendingUp size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">Categorías</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{categories.length - 1}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar item o categoría..."
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0 scrollbar-hide">
                    {categories.map(cat => (
                        <button
                            key={cat || 'unassigned'}
                            onClick={() => setCategoryFilter(cat)}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                                categoryFilter === cat
                                    ? "bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none"
                                    : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-100 dark:border-gray-700"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {loading ? (
                    Array(6).fill(0).map((_, i) => (
                        <div key={i} className="animate-pulse bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 h-40"></div>
                    ))
                ) : filteredItems.length === 0 ? (
                    <div className="col-span-full py-20 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <Package className="mx-auto mb-4 text-gray-200" size={64} strokeWidth={1} />
                        <p className="text-lg font-medium">No hay productos en inventario</p>
                        <p className="text-sm">Agregá tu primer item para empezar el control.</p>
                    </div>
                ) : (
                    filteredItems.map((item) => {
                        const isLow = item.stock_actual <= item.stock_minimo;
                        return (
                            <div key={item.id} className="group bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-900 transition-all">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-1">{item.categoria}</p>
                                        <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors uppercase">{item.nombre}</h3>
                                    </div>
                                    <button className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
                                        <MoreVertical size={18} />
                                    </button>
                                </div>

                                <div className="flex items-end justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={clsx(
                                                "text-3xl font-black",
                                                isLow ? "text-red-500" : "text-gray-900 dark:text-white"
                                            )}>
                                                {item.stock_actual}
                                            </span>
                                            <span className="text-sm text-gray-500 font-medium">
                                                {item.unidad_medida}
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-500">Mínimo sugerido: {item.stock_minimo} {item.unidad_medida}</p>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button
                                            className="p-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-lg transition-colors border border-emerald-100"
                                            title="Entrada"
                                            onClick={() => setShowMovimiento({ isOpen: true, item, tipo: 'ENTRADA' })}
                                        >
                                            <ArrowUpRight size={18} />
                                        </button>
                                        <button
                                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg transition-colors border border-red-100"
                                            title="Salida"
                                            onClick={() => setShowMovimiento({ isOpen: true, item, tipo: 'SALIDA' })}
                                        >
                                            <ArrowDownRight size={18} />
                                        </button>
                                    </div>
                                </div>

                                {isLow && (
                                    <div className="mt-4 flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/40">
                                        <AlertTriangle size={14} />
                                        REPOSICIÓN NECESARIA
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modals */}
            <NuevoItemForm
                isOpen={showNuevoItem}
                onClose={() => setShowNuevoItem(false)}
                onSuccess={loadItems}
            />

            <MovimientoStockForm
                isOpen={showMovimiento.isOpen}
                item={showMovimiento.item}
                tipo={showMovimiento.tipo}
                onClose={() => setShowMovimiento(prev => ({ ...prev, isOpen: false }))}
                onSuccess={loadItems}
            />

            <HistorialMovimientosModal
                isOpen={showHistorial}
                onClose={() => setShowHistorial(false)}
            />
        </div>
    );
}
