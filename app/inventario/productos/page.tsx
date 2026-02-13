'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowLeft,
    History,
    Loader2,
    Package,
    Plus,
    ScanLine,
    Search,
} from 'lucide-react';
import RoleGuard from '@/components/auth/RoleGuard';
import { listInventoryProducts, type ProductRecord } from '@/app/actions/inventory-products';
import { useAuth } from '@/contexts/AuthContext';
import ProductEditorModal from '@/components/inventario-products/ProductEditorModal';
import clsx from 'clsx';

export default function InventoryProductsPage() {
    return (
        <RoleGuard allowedRoles={['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio']}>
            <ProductsScreen />
        </RoleGuard>
    );
}

function ProductsScreen() {
    const { role } = useAuth();
    const isAdmin = role === 'owner' || role === 'admin';

    const [products, setProducts] = useState<ProductRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Todos');
    const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; product?: ProductRecord | null } | null>(null);

    const loadProducts = useCallback(async (currentSearch: string, currentCategory: string) => {
        setLoading(true);
        const result = await listInventoryProducts({
            search: currentSearch,
            category: currentCategory,
            activeOnly: true,
        });

        if (result.success) {
            setProducts(result.products);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            void loadProducts(search, categoryFilter);
        }, 220);
        return () => clearTimeout(timeout);
    }, [search, categoryFilter, loadProducts]);

    const categories = useMemo(() => {
        return ['Todos', ...Array.from(new Set(products.map(item => item.category))).sort()];
    }, [products]);

    const lowStock = useMemo(() => {
        return products.filter(item => item.threshold_min !== null && item.stock_current <= item.threshold_min).length;
    }, [products]);

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wider text-blue-600 font-semibold">Inventario MVP</p>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Package className="text-blue-600" />
                        Productos e Insumos
                    </h1>
                    <p className="text-sm text-gray-500">Alta de producto con foto optimizada para operativa en clinica.</p>
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href="/inventario/escanear"
                        className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm inline-flex items-center gap-1.5"
                    >
                        <ScanLine size={15} />
                        Escanear ingreso
                    </Link>
                    <Link
                        href="/inventario"
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm inline-flex items-center gap-1.5"
                    >
                        <ArrowLeft size={16} />
                        Inventario legacy
                    </Link>
                    <Link
                        href="/inventario/movimientos"
                        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm inline-flex items-center gap-1.5"
                    >
                        <History size={15} />
                        Movimientos
                    </Link>
                    {isAdmin && (
                        <button
                            onClick={() => setEditor({ mode: 'create' })}
                            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium inline-flex items-center gap-2"
                        >
                            <Plus size={16} />
                            Nuevo producto
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <StatCard label="Productos activos" value={String(products.length)} hint="catalogo operativo" />
                <StatCard label="Stock bajo" value={String(lowStock)} hint="segun threshold_min" danger={lowStock > 0} />
                <StatCard label="Categorias" value={String(categories.length - 1)} hint="clasificacion util" />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por nombre, marca, categoria o codigo"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto">
                    {categories.map(category => (
                        <button
                            key={category}
                            onClick={() => setCategoryFilter(category)}
                            className={clsx(
                                'px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border',
                                categoryFilter === category
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                            )}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="py-16 flex justify-center">
                    <Loader2 className="animate-spin text-blue-600" size={30} />
                </div>
            ) : products.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-gray-500">
                    No hay productos para mostrar con ese filtro.
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {products.map(product => {
                        const isLow = product.threshold_min !== null && product.stock_current <= product.threshold_min;

                        return (
                            <article key={product.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-3">
                                <div className="flex gap-3">
                                    <div className="w-20 h-20 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                                        {product.image_thumb_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={product.image_thumb_url} alt={product.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <Package size={22} className="text-gray-400" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-blue-600 font-semibold uppercase tracking-wide">{product.category}</p>
                                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{product.name}</h3>
                                        <p className="text-xs text-gray-500 truncate">{product.brand || 'Sin marca'}</p>
                                        <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                                            <p>Barcode: {product.barcode || 'N/D'}</p>
                                            <p>QR: {product.qr_code || 'N/D'}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-end justify-between">
                                    <div>
                                        <p className="text-xs text-gray-500">Stock actual</p>
                                        <p className={clsx('text-xl font-bold', isLow ? 'text-red-600' : 'text-gray-900 dark:text-white')}>
                                            {product.stock_current}
                                            <span className="text-sm font-normal text-gray-500 ml-1">{product.unit}</span>
                                        </p>
                                        {product.threshold_min !== null && (
                                            <p className="text-[11px] text-gray-500">Min {product.threshold_min}</p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Link
                                            href={`/inventario/productos/${product.id}`}
                                            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-semibold"
                                        >
                                            Ver detalle
                                        </Link>
                                        {isAdmin && (
                                            <button
                                                onClick={() => setEditor({ mode: 'edit', product })}
                                                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 text-xs font-semibold"
                                            >
                                                Editar
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {isLow && (
                                    <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                                        <AlertTriangle size={13} />
                                        Stock bajo: requiere reposicion
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}

            <ProductEditorModal
                isOpen={Boolean(editor)}
                mode={editor?.mode || 'create'}
                product={editor?.product || null}
                onClose={() => setEditor(null)}
                onSaved={() => {
                    void loadProducts(search, categoryFilter);
                }}
            />
        </div>
    );
}

function StatCard({
    label,
    value,
    hint,
    danger = false,
}: {
    label: string;
    value: string;
    hint: string;
    danger?: boolean;
}) {
    return (
        <div className={clsx(
            'rounded-xl border p-4 bg-white dark:bg-gray-900',
            danger ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
        )}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={clsx('text-2xl font-bold mt-1', danger ? 'text-red-600' : 'text-gray-900 dark:text-white')}>{value}</p>
            <p className="text-[11px] text-gray-500 mt-1">{hint}</p>
        </div>
    );
}
