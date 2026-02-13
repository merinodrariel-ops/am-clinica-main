'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import {
    Package,
    Plus,
    AlertTriangle,
    TrendingUp,
    Search,
    Loader2,
    ArrowUpRight,
    ArrowDownRight,
    History,
    ExternalLink,
    LayoutGrid,
    List as ListIcon,
    ArrowUp,
    ArrowDown,
    XCircle,
    Edit // Import Edit icon
} from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { useAuth } from '@/contexts/AuthContext';
import NuevoItemForm from '@/components/inventario/NuevoItemForm';
import EditarItemModal from '@/components/inventario/EditarItemModal'; // Import Modal
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
    const [editingItem, setEditingItem] = useState<Item | null>(null); // State for editing
    const [showMovimiento, setShowMovimiento] = useState({
        isOpen: false,
        item: null as Item | null,
        tipo: 'ENTRADA' as 'ENTRADA' | 'SALIDA' | 'AJUSTE'
    });

    // Smart Filter State (Dashboard Interaction)
    const [smartFilter, setSmartFilter] = useState<'ALL' | 'LOW_STOCK'>('ALL');

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

    // State for View Mode and Sort
    const [viewMode, setViewMode] = useState<'GRID' | 'LIST'>('GRID');
    const [sortBy, setSortBy] = useState<'NOMBRE' | 'STOCK' | 'CATEGORIA'>('NOMBRE');
    const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('ASC');

    const categories = ['Todos', ...Array.from(new Set(items.map(i => i.categoria))).filter(Boolean).sort()];

    // EXPANDED SEARCH LOGIC
    const filteredItems = items.filter(i => {
        const itemArea = i.area || 'CLINICA';
        const term = search.toLowerCase();

        const matchesSearch =
            i.nombre.toLowerCase().includes(term) ||
            i.categoria?.toLowerCase().includes(term) ||
            i.marca?.toLowerCase().includes(term) ||
            i.proveedor?.toLowerCase().includes(term) ||
            i.descripcion?.toLowerCase().includes(term);

        return itemArea === areaFilter &&
            matchesSearch &&
            (categoryFilter === 'Todos' || i.categoria === categoryFilter) &&
            (smartFilter === 'ALL' || (smartFilter === 'LOW_STOCK' && i.stock_actual <= i.stock_minimo));
    });

    // SORTING LOGIC
    const sortedItems = [...filteredItems].sort((a, b) => {
        let cmp = 0;
        if (sortBy === 'NOMBRE') {
            cmp = a.nombre.localeCompare(b.nombre);
        } else if (sortBy === 'STOCK') {
            cmp = a.stock_actual - b.stock_actual;
        } else if (sortBy === 'CATEGORIA') {
            cmp = (a.categoria || '').localeCompare(b.categoria || '');
        }
        return sortOrder === 'ASC' ? cmp : -cmp;
    });

    // DASHBOARD TOTALS
    const relevantItemsForStats = isLabUser ? items.filter(i => i.area === 'LABORATORIO') : items;
    const lowStockCount = relevantItemsForStats.filter(i => i.stock_actual <= i.stock_minimo).length;

    // Total counts by area
    const totalClinica = items.filter(i => (i.area || 'CLINICA') === 'CLINICA').length;
    const totalLaboratorio = items.filter(i => i.area === 'LABORATORIO').length;
    const totalRelevant = isLabUser ? totalLaboratorio : items.length;

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
                    <Link
                        href="/inventario/productos"
                        className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                    >
                        <Package size={20} />
                        <span className="hidden sm:inline">Inventario MVP</span>
                    </Link>
                    <Link
                        href="/inventario/escanear"
                        className="flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                    >
                        <Search size={20} />
                        <span className="hidden sm:inline">Escanear</span>
                    </Link>
                    <div className="flex bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-1">
                        <button
                            onClick={() => setViewMode('GRID')}
                            className={clsx(
                                "p-2 rounded-lg transition-all",
                                viewMode === 'GRID' ? "bg-gray-100 dark:bg-gray-700 text-blue-600" : "text-gray-400 hover:text-gray-600"
                            )}
                            title="Vista Cuadrícula"
                        >
                            <LayoutGrid size={20} />
                        </button>
                        <button
                            onClick={() => setViewMode('LIST')}
                            className={clsx(
                                "p-2 rounded-lg transition-all",
                                viewMode === 'LIST' ? "bg-gray-100 dark:bg-gray-700 text-blue-600" : "text-gray-400 hover:text-gray-600"
                            )}
                            title="Vista Lista"
                        >
                            <ListIcon size={20} />
                        </button>
                    </div>

                    <button
                        className="flex items-center justify-center gap-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                        onClick={() => setShowHistorial(true)}
                    >
                        <History size={20} />
                        <span className="hidden sm:inline">Historial</span>
                    </button>
                    <button
                        className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium transition-all shadow-sm"
                        onClick={() => setShowNuevoItem(true)}
                    >
                        <Plus size={20} />
                        <span className="hidden sm:inline">Nuevo Item</span>
                    </button>
                </div>
            </div>

            {/* Area Tabs */}
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

            {/* Dashboard Stats Grid (Interactive) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                    onClick={() => { setSmartFilter('ALL'); setSearch(''); setCategoryFilter('Todos'); }}
                    className={clsx(
                        "text-left p-5 rounded-2xl border shadow-sm transition-all group",
                        smartFilter === 'ALL'
                            ? "bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-2 ring-blue-500/20"
                            : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-blue-200 dark:hover:border-blue-700"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                            smartFilter === 'ALL' ? "bg-blue-500 text-white" : "bg-blue-100 dark:bg-blue-900/30 text-blue-600"
                        )}>
                            <Package size={20} />
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-gray-500 font-medium">Items Totales</p>
                            <div className="flex justify-between items-baseline">
                                <span className="text-xl font-bold text-gray-900 dark:text-white">{totalRelevant}</span>
                                {!isLabUser && <span className="text-xs text-gray-400">🏥 {totalClinica} | 🔬 {totalLaboratorio}</span>}
                            </div>
                        </div>
                    </div>
                </button>

                <button
                    onClick={() => setSmartFilter('LOW_STOCK')}
                    className={clsx(
                        "text-left p-5 rounded-2xl border shadow-sm transition-all group",
                        smartFilter === 'LOW_STOCK'
                            ? "bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800 ring-2 ring-red-500/20"
                            : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700 hover:border-red-200 dark:hover:border-red-700"
                    )}
                >
                    <div className="flex items-center gap-3">
                        <div className={clsx(
                            "h-10 w-10 rounded-lg flex items-center justify-center transition-colors",
                            smartFilter === 'LOW_STOCK' ? "bg-red-500 text-white" : (lowStockCount > 0 ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600")
                        )}>
                            <AlertTriangle size={20} />
                        </div>
                        <div>
                            <p className="text-sm text-gray-500 font-medium">{lowStockCount > 0 ? 'Stock Crítico' : 'Stock Saludable'}</p>
                            <p className={clsx("text-2xl font-bold", lowStockCount > 0 ? "text-red-600" : "text-emerald-600")}>
                                {lowStockCount}
                                {lowStockCount > 0 && <span className="text-sm font-normal text-gray-400 ml-2">items faltantes</span>}
                            </p>
                        </div>
                    </div>
                </button>

                <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm cursor-default">
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

            {/* Filters & Search & Sort */}
            <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, marca, proveedor..."
                        className="w-full pl-10 pr-10 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                            <XCircle size={16} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
                    <select
                        className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm outline-none"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'NOMBRE' | 'STOCK' | 'CATEGORIA')}
                    >
                        <option value="NOMBRE">Nombre</option>
                        <option value="STOCK">Stock</option>
                        <option value="CATEGORIA">Categoría</option>
                    </select>
                    <button
                        onClick={() => setSortOrder(prev => prev === 'ASC' ? 'DESC' : 'ASC')}
                        className="p-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-100"
                    >
                        {sortOrder === 'ASC' ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
                    </button>
                </div>
            </div>

            {/* Configurable Category Tags */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {categories.map(cat => (
                    <button
                        key={cat || 'unassigned'}
                        onClick={() => setCategoryFilter(cat)}
                        className={clsx(
                            "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all",
                            categoryFilter === cat
                                ? "bg-blue-600 text-white shadow-md shadow-blue-200 dark:shadow-none"
                                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-100 dark:border-gray-700"
                        )}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Content List / Grid */}
            {loading ? (
                <div className="flex justify-center py-20">
                    <Loader2 className="animate-spin text-blue-600" size={40} />
                </div>
            ) : sortedItems.length === 0 ? (
                <div className="col-span-full py-20 text-center text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <Package className="mx-auto mb-4 text-gray-200" size={64} strokeWidth={1} />
                    <p className="text-lg font-medium">No se encontraron productos</p>
                    <p className="text-sm">Intenta con otro término de búsqueda.</p>
                </div>
            ) : viewMode === 'GRID' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {sortedItems.map((item) => {
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
                                        {item.link && (
                                            <a href={item.link} target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg">
                                                <ExternalLink size={16} />
                                            </a>
                                        )}
                                    </div>
                                    {item.descripcion && <p className="text-xs text-gray-400 mb-4 line-clamp-2 italic">{item.descripcion}</p>}
                                </div>
                                <div>
                                    <div className="flex items-end justify-between mt-auto">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={clsx("text-3xl font-black", isLow ? "text-red-500" : "text-gray-900 dark:text-white")}>{item.stock_actual}</span>
                                                <span className="text-sm text-gray-500 font-medium self-end mb-1">{item.unidad_medida}</span>
                                            </div>
                                            <div className="text-xs text-gray-500">Min: {item.stock_minimo}</div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" onClick={() => setEditingItem(item)} title="Editar Detalles"><Edit size={18} /></button>
                                            <button className="p-2 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" onClick={() => setShowMovimiento({ isOpen: true, item, tipo: 'ENTRADA' })}><ArrowUpRight size={18} /></button>
                                            <button className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" onClick={() => setShowMovimiento({ isOpen: true, item, tipo: 'SALIDA' })}><ArrowDownRight size={18} /></button>
                                        </div>
                                    </div>
                                    {isLow && <div className="mt-3 text-xs font-bold text-red-600 bg-red-50 px-3 py-2 rounded-lg border border-red-100 flex items-center gap-2"><AlertTriangle size={14} /> REPOSICIÓN NECESARIA</div>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-6 py-3">Item</th>
                                    <th className="px-6 py-3">Categoría</th>
                                    <th className="px-6 py-3">Stock</th>
                                    <th className="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.map((item) => {
                                    const isLow = item.stock_actual <= item.stock_minimo;
                                    return (
                                        <tr key={item.id} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-900 dark:text-white uppercase">{item.nombre}</div>
                                                <div className="text-xs text-gray-500">{item.marca}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium">{item.categoria}</span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    <span className={clsx("font-bold text-lg", isLow ? "text-red-500" : "text-gray-900 dark:text-white")}>{item.stock_actual}</span>
                                                    <span className="text-xs text-gray-500">{item.unidad_medida}</span>
                                                    {isLow && <AlertTriangle size={14} className="text-red-500" />}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <button className="p-1.5 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600" title="Editar" onClick={() => setEditingItem(item)}><Edit size={16} /></button>
                                                    <button className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100" title="Entrada" onClick={() => setShowMovimiento({ isOpen: true, item, tipo: 'ENTRADA' })}><ArrowUpRight size={16} /></button>
                                                    <button className="p-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100" title="Salida" onClick={() => setShowMovimiento({ isOpen: true, item, tipo: 'SALIDA' })}><ArrowDownRight size={16} /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modals remain same ... */}
            <NuevoItemForm
                isOpen={showNuevoItem}
                onClose={() => setShowNuevoItem(false)}
                onSuccess={loadItems}
            />

            <EditarItemModal
                isOpen={!!editingItem}
                item={editingItem}
                onClose={() => setEditingItem(null)}
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

export default function InventarioPage() {
    return (
        <Suspense fallback={<div className="p-6">Cargando inventario...</div>}>
            <InventarioContent />
        </Suspense>
    );
}
