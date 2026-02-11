'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
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
    History,
    ExternalLink
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useSearchParams } from 'next/navigation';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
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
    area: 'CLINICA' | 'LABORATORIO';
    marca?: string;
    proveedor?: string;
    link?: string;
    costo_unitario?: number;
    descripcion?: string;
    imagen_url?: string;
}

function InventarioContent() {
    const searchParams = useSearchParams();
    const initialArea = searchParams.get('area') === 'LABORATORIO' ? 'LABORATORIO' : 'CLINICA';

    const [items, setItems] = useState<Item[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Todos');
    const [areaFilter, setAreaFilter] = useState<'CLINICA' | 'LABORATORIO'>(initialArea);
    const [showNuevoItem, setShowNuevoItem] = useState(false);
    const [showHistorial, setShowHistorial] = useState(false);
    const [showMovimiento, setShowMovimiento] = useState({
        isOpen: false,
        item: null as Item | null,
        tipo: 'ENTRADA' as 'ENTRADA' | 'SALIDA' | 'AJUSTE'
    });

    // Add useAuth
    const { loading: authLoading, role } = useAuth();
    const isLabUser = role === 'laboratorio';

    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const loadItems = useCallback(async () => {
        if (authLoading) return; // Wait for auth

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('inventario_items')
                .select('*')
                .order('nombre', { ascending: true });

            if (error) throw error;
            console.log('Inventory Loaded:', data?.length, 'items');
            setItems(data as Item[] || []);
        } catch (error) {
            console.error('Error loading inventory:', error);
        } finally {
            setLoading(false);
        }
    }, [authLoading, supabase]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    // Update area filter if URL changes (respecting role)
    useEffect(() => {
        if (isLabUser) {
            setAreaFilter('LABORATORIO');
            return;
        }

        const areaParam = searchParams.get('area');
        if (areaParam === 'LABORATORIO') {
            setAreaFilter('LABORATORIO');
        } else if (areaParam === 'CLINICA') {
            setAreaFilter('CLINICA');
        }
    }, [searchParams, isLabUser]);

    const categories = ['Todos', ...new Set(items.map(i => i.categoria))];

    const filteredItems = items.filter(i => {
        const itemArea = i.area || 'CLINICA';
        return itemArea === areaFilter &&
            (i.nombre.toLowerCase().includes(search.toLowerCase()) ||
                i.categoria?.toLowerCase().includes(search.toLowerCase())) &&
            (categoryFilter === 'Todos' || i.categoria === categoryFilter);
    });

    const lowStockCount = items.filter(i => i.stock_actual <= i.stock_minimo).length;

    // DASHBOARD TOTALS
    const totalClinica = items.filter(i => (i.area || 'CLINICA') === 'CLINICA').length;
    const totalLaboratorio = items.filter(i => i.area === 'LABORATORIO').length;

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

            {/* Area Tabs - Hidden for Lab User */}
            {!isLabUser && (
                <div className="flex p-1 bg-gray-100 dark:bg-gray-800/50 rounded-2xl w-full md:w-fit">
                    <button
                        onClick={() => { setAreaFilter('CLINICA'); setCategoryFilter('Todos'); }}
                        className={clsx(
                            "flex-1 md:px-8 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                            areaFilter === 'CLINICA'
                                ? "bg-white dark:bg-gray-700 text-blue-600 shadow-sm"
                                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        🏥 CLÍNICA
                    </button>
                    <button
                        onClick={() => { setAreaFilter('LABORATORIO'); setCategoryFilter('Todos'); }}
                        className={clsx(
                            "flex-1 md:px-8 py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2",
                            areaFilter === 'LABORATORIO'
                                ? "bg-white dark:bg-gray-700 text-indigo-600 shadow-sm"
                                : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                        )}
                    >
                        🔬 LABORATORIO
                    </button>
                </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center">
                            <Package size={20} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-500 font-medium">Items Totales</p>
                            <div className="flex justify-between items-baseline">
                                <div>
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{isLabUser ? totalLaboratorio : totalClinica + totalLaboratorio}</span>
                                </div>
                                {!isLabUser && (
                                    <div className="text-xs text-gray-400 flex gap-2">
                                        <span>🏥 {totalClinica}</span>
                                        <span>🔬 {totalLaboratorio}</span>
                                    </div>
                                )}
                            </div>
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
                            <div key={item.id} className="group flex flex-col justify-between bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-xl hover:border-blue-200 dark:hover:border-blue-900 transition-all h-full">
                                <div>
                                    {item.imagen_url && (
                                        <div className="mb-4 w-full h-32 bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden flex items-center justify-center border border-gray-100 dark:border-gray-800 p-2">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={item.imagen_url}
                                                alt={item.nombre}
                                                className="h-full w-full object-contain"
                                                loading="lazy"
                                            />
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2 mb-1">
                                                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{item.categoria}</p>
                                                {item.marca && (
                                                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-[10px] font-semibold uppercase">
                                                        {item.marca}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className="font-bold text-gray-900 dark:text-white group-hover:text-blue-600 transition-colors uppercase leading-snug">
                                                {item.nombre}
                                            </h3>
                                            {item.proveedor && (
                                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                                    <span className="text-gray-400">Prov:</span> {item.proveedor}
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex flex-col gap-1 items-end">
                                            <button className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400">
                                                <MoreVertical size={16} />
                                            </button>
                                            {item.link && (
                                                <a
                                                    href={item.link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                    title="Ver producto original"
                                                >
                                                    <ExternalLink size={16} />
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {item.descripcion && (
                                        <p className="text-xs text-gray-400 mb-4 line-clamp-2 italic">
                                            {item.descripcion}
                                        </p>
                                    )}
                                </div>

                                <div>
                                    <div className="flex items-end justify-between mt-auto">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={clsx(
                                                    "text-3xl font-black",
                                                    isLow ? "text-red-500" : "text-gray-900 dark:text-white"
                                                )}>
                                                    {item.stock_actual}
                                                </span>
                                                <span className="text-sm text-gray-500 font-medium self-end mb-1">
                                                    {item.unidad_medida}
                                                </span>
                                            </div>
                                            <div className="flex justify-between items-center gap-4 text-xs text-gray-500">
                                                <span>Min: {item.stock_minimo}</span>
                                                {item.costo_unitario && item.costo_unitario > 0 && (
                                                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                                                        ${item.costo_unitario} /u
                                                    </span>
                                                )}
                                            </div>
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
                                        <div className="mt-3 flex items-center gap-2 text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/40">
                                            <AlertTriangle size={14} />
                                            REPOSICIÓN NECESARIA
                                        </div>
                                    )}
                                </div>
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
        </div >
    );
}

export default function InventarioPage() {
    return (
        <Suspense fallback={<div className="p-6">Cargando inventario...</div>}>
            <InventarioContent />
        </Suspense>
    );
}
