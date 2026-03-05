'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    AlertTriangle,
    ArrowLeft,
    History,
    ImageUp,
    Loader2,
    Package,
    Plus,
    ScanLine,
    Search,
    Smartphone,
} from 'lucide-react';
import CategoriaGuard from '@/components/auth/CategoriaGuard';
import {
    listInventoryProducts,
    type ProductRecord,
    updateInventoryProductImage,
} from '@/app/actions/inventory-products';
import { useAuth } from '@/contexts/AuthContext';
import ProductEditorModal from '@/components/inventario-products/ProductEditorModal';
import clsx from 'clsx';
import { buildInventoryImagePayload } from '@/lib/inventory-image-pipeline';
import { toast } from 'sonner';

function normalizeText(value?: string | null) {
    return (value || '').toLowerCase().trim();
}

function includesAny(text: string, needles: string[]) {
    return needles.some(needle => text.includes(needle));
}

export default function InventoryProductsPage() {
    return (
        <CategoriaGuard allowedCategorias={['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio']}>
            <ProductsScreen />
        </CategoriaGuard>
    );
}

function ProductsScreen() {
    const { categoria: role } = useAuth();
    const isAdmin = role === 'owner' || role === 'admin';

    const [products, setProducts] = useState<ProductRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('Todos');
    const [colorFilter, setColorFilter] = useState('Todos');
    const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; product?: ProductRecord | null } | null>(null);
    const [quickUploadTarget, setQuickUploadTarget] = useState<ProductRecord | null>(null);
    const [quickUploadingId, setQuickUploadingId] = useState<string | null>(null);
    const quickInputRef = useRef<HTMLInputElement>(null);

    const loadProducts = useCallback(async (currentSearch: string, currentCategory: string, currentColor: string) => {
        setLoading(true);
        const result = await listInventoryProducts({
            search: currentSearch,
            category: currentCategory,
            color: currentColor,
            activeOnly: true,
        });

        if (result.success) {
            setProducts(result.products);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timeout = setTimeout(() => {
            void loadProducts(search, categoryFilter, colorFilter);
        }, 220);
        return () => clearTimeout(timeout);
    }, [search, categoryFilter, colorFilter, loadProducts]);

    const categories = useMemo(() => {
        return ['Todos', ...Array.from(new Set(products.map(item => item.category))).sort()];
    }, [products]);

    const colors = useMemo(() => {
        return ['Todos', ...Array.from(new Set(products.map(item => item.color).filter(Boolean) as string[])).sort()];
    }, [products]);

    const lowStock = useMemo(() => {
        return products.filter(item => item.threshold_min !== null && item.stock_current <= item.threshold_min).length;
    }, [products]);

    const keyKpis = useMemo(() => {
        const totals = {
            compositeJeringas: 0,
            implantes: 0,
            bloquesFresar: 0,
            discosZirconio: 0,
        };

        products.forEach(product => {
            const text = [
                normalizeText(product.name),
                normalizeText(product.category),
                normalizeText(product.brand),
                normalizeText(product.notes),
                normalizeText(product.unit),
            ].join(' ');

            const qty = Number(product.stock_current || 0);
            if (!Number.isFinite(qty) || qty <= 0) return;

            const isComposite = text.includes('composite');
            const isJeringaLike = includesAny(text, ['jeringa', 'syringe']);
            if (isComposite && (isJeringaLike || !text.includes('compula'))) {
                totals.compositeJeringas += qty;
            }

            if (includesAny(text, ['implante', 'implant'])) {
                totals.implantes += qty;
            }

            const isBloque = text.includes('bloque');
            const isFresar = includesAny(text, ['fresar', 'fresado', 'cad cam', 'cadcam']);
            if (isBloque && isFresar) {
                totals.bloquesFresar += qty;
            }

            const isDisco = text.includes('disco');
            const isZirconio = includesAny(text, ['zirconio', 'zirconia']);
            if (isDisco && isZirconio) {
                totals.discosZirconio += qty;
            }
        });

        return totals;
    }, [products]);

    async function handleQuickImageUpload(file?: File | null) {
        if (!file || !quickUploadTarget) return;

        setQuickUploadingId(quickUploadTarget.id);
        try {
            const payload = await buildInventoryImagePayload(file, {
                removeBackground: true,
                thumbSize: 320,
                fullMaxWidth: 1080,
                thumbMaxKB: 45,
                fullMaxKB: 220,
            });

            const serverImagePayload = {
                thumbBase64: payload.thumbBase64,
                fullBase64: payload.fullBase64,
                thumbMimeType: payload.thumbMimeType,
                fullMimeType: payload.fullMimeType,
            };

            const result = await updateInventoryProductImage({
                id: quickUploadTarget.id,
                imagePayload: serverImagePayload,
            });

            if (!result.success) {
                throw new Error(result.error || 'No se pudo subir imagen');
            }

            if (!payload.backgroundRemoved) {
                toast.info('Foto subida sin quitar fondo (API IA no disponible o sin credito).');
            }

            toast.success(`Imagen actualizada: ${quickUploadTarget.name}`);
            await loadProducts(search, categoryFilter, colorFilter);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'No se pudo cargar imagen rapida');
        } finally {
            setQuickUploadingId(null);
            setQuickUploadTarget(null);
            if (quickInputRef.current) {
                quickInputRef.current.value = '';
            }
        }
    }

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
                        <Link
                            href="/inventario/productos/rapido"
                            className="px-3 py-2 rounded-lg border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-sm inline-flex items-center gap-1.5"
                        >
                            <Smartphone size={15} />
                            Alta rapida
                        </Link>
                    )}
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
                <StatCard label="Categorias / colores" value={`${categories.length - 1} / ${Math.max(colors.length - 1, 0)}`} hint="clasificacion util" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                    label="Jeringas de composite"
                    value={String(keyKpis.compositeJeringas)}
                    hint="stock total detectado"
                />
                <StatCard
                    label="Implantes dentales"
                    value={String(keyKpis.implantes)}
                    hint="stock total detectado"
                />
                <StatCard
                    label="Bloques para fresar"
                    value={String(keyKpis.bloquesFresar)}
                    hint="inventario laboratorio"
                />
                <StatCard
                    label="Discos de zirconio"
                    value={String(keyKpis.discosZirconio)}
                    hint="inventario laboratorio"
                />
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col md:flex-row gap-3 md:items-center">
                <div className="relative flex-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por nombre, marca, categoria, color o codigo"
                        className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                    />
                </div>

                <div className="flex gap-2 overflow-x-auto md:max-w-[48%]">
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

                <div className="flex gap-2 overflow-x-auto md:max-w-[36%]">
                    {colors.map(color => (
                        <button
                            key={color}
                            onClick={() => setColorFilter(color)}
                            className={clsx(
                                'px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border',
                                colorFilter === color
                                    ? 'bg-violet-600 text-white border-violet-600'
                                    : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                            )}
                        >
                            {color === 'Todos' ? 'Color: Todos' : color}
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
                                        <p className="text-xs text-gray-500 truncate">
                                            {product.brand || 'Sin marca'}
                                            {product.color ? ` - ${product.color}` : ''}
                                        </p>
                                        <div className="mt-2 text-xs text-gray-500 space-y-0.5">
                                            <p>Barcode: {product.notes || 'N/D'}</p>
                                            <p>QR: {product.link || 'N/D'}</p>
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
                                                onClick={() => {
                                                    setQuickUploadTarget(product);
                                                    quickInputRef.current?.click();
                                                }}
                                                disabled={quickUploadingId === product.id}
                                                className="px-3 py-1.5 rounded-lg border border-violet-300 dark:border-violet-700 text-xs font-semibold inline-flex items-center gap-1.5 text-violet-700 dark:text-violet-300 disabled:opacity-60"
                                                title="Subir foto rapida con compresion y IA"
                                            >
                                                {quickUploadingId === product.id ? (
                                                    <Loader2 size={13} className="animate-spin" />
                                                ) : (
                                                    <ImageUp size={13} />
                                                )}
                                                Foto
                                            </button>
                                        )}
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
                    void loadProducts(search, categoryFilter, colorFilter);
                }}
            />

            <input
                ref={quickInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                    void handleQuickImageUpload(event.target.files?.[0]);
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
