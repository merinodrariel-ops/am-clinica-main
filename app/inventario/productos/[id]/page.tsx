'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
    AlertTriangle,
    ArrowLeft,
    History,
    Loader2,
    Package,
    ScanLine,
} from 'lucide-react';
import clsx from 'clsx';
import RoleGuard from '@/components/auth/RoleGuard';
import {
    getInventoryProductDetail,
    type StockMovementRecord,
} from '@/app/actions/inventory-stock';
import type { ProductRecord } from '@/app/actions/inventory-products';

export default function InventoryProductDetailPage() {
    return (
        <RoleGuard allowedRoles={['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio']}>
            <ProductDetailScreen />
        </RoleGuard>
    );
}

function ProductDetailScreen() {
    const params = useParams<{ id: string }>();
    const productId = params?.id;

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [product, setProduct] = useState<ProductRecord | null>(null);
    const [movements, setMovements] = useState<StockMovementRecord[]>([]);

    const lowStock = useMemo(() => {
        if (!product || product.threshold_min === null) return false;
        return Number(product.stock_current) <= Number(product.threshold_min);
    }, [product]);

    const inLast = useMemo(() => {
        return movements
            .filter(movement => movement.type === 'IN')
            .reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
    }, [movements]);

    const outLast = useMemo(() => {
        return movements
            .filter(movement => movement.type === 'OUT')
            .reduce((sum, movement) => sum + Number(movement.qty || 0), 0);
    }, [movements]);

    const load = useCallback(async () => {
        if (!productId) return;
        setLoading(true);

        const result = await getInventoryProductDetail(productId);
        if (!result.success || !result.product) {
            setError(result.error || 'No se pudo cargar el producto');
            setProduct(null);
            setMovements([]);
            setLoading(false);
            return;
        }

        setError(null);
        setProduct(result.product);
        setMovements(result.movements || []);
        setLoading(false);
    }, [productId]);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void load();
        }, 0);

        return () => {
            window.clearTimeout(timer);
        };
    }, [load]);

    if (loading) {
        return (
            <div className="p-10 flex justify-center">
                <Loader2 className="animate-spin text-blue-600" size={30} />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="p-6 max-w-4xl mx-auto space-y-4">
                <Link href="/inventario/productos" className="text-sm inline-flex items-center gap-2 text-blue-600">
                    <ArrowLeft size={15} /> Volver a productos
                </Link>
                <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4 text-sm text-red-700 dark:text-red-300">
                    {error || 'Producto no encontrado'}
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <Link href="/inventario/productos" className="text-sm inline-flex items-center gap-2 text-blue-600 mb-2">
                        <ArrowLeft size={15} /> Volver a productos
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Package className="text-blue-600" />
                        {product.name}
                    </h1>
                    <p className="text-sm text-gray-500">Detalle de producto y trazabilidad de movimientos.</p>
                </div>

                <div className="flex gap-2">
                    <Link
                        href={`/inventario/movimientos?productId=${product.id}`}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm inline-flex items-center gap-1.5"
                    >
                        <History size={15} /> Historial completo
                    </Link>
                    <Link
                        href="/inventario/escanear"
                        className="px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm inline-flex items-center gap-1.5"
                    >
                        <ScanLine size={15} /> Escanear ingreso
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] gap-4">
                <section className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 space-y-3">
                    <div className="w-full h-56 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                        {product.image_full_url || product.image_thumb_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={product.image_full_url || product.image_thumb_url || ''} alt={product.name} className="w-full h-full object-cover" />
                        ) : (
                            <Package size={34} className="text-gray-400" />
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <DataCell label="Categoria" value={product.category} />
                        <DataCell label="Marca" value={product.brand || 'Sin marca'} />
                        <DataCell label="Unidad" value={product.unit} />
                        <DataCell label="Estado" value={product.is_active ? 'Activo' : 'Inactivo'} />
                        <DataCell label="Barcode" value={product.barcode || 'N/D'} />
                        <DataCell label="QR" value={product.qr_code || 'N/D'} />
                    </div>

                    {product.notes && (
                        <p className="text-xs text-gray-600 dark:text-gray-300 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2">
                            {product.notes}
                        </p>
                    )}
                </section>

                <section className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <MiniStat title="Stock actual" value={`${product.stock_current}`} subtitle={product.unit} danger={lowStock} />
                        <MiniStat title="Ingresos recientes" value={`${inLast}`} subtitle={product.unit} />
                        <MiniStat title="Egresos recientes" value={`${outLast}`} subtitle={product.unit} />
                    </div>

                    {lowStock && (
                        <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300 flex items-center gap-1.5">
                            <AlertTriangle size={14} />
                            Stock bajo. Minimo configurado: {product.threshold_min}
                        </div>
                    )}

                    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <h2 className="font-semibold text-gray-900 dark:text-white">Movimientos recientes</h2>
                            <span className="text-xs text-gray-500">{movements.length} registros</span>
                        </div>

                        {movements.length === 0 ? (
                            <div className="p-6 text-sm text-gray-500">Sin movimientos registrados para este producto.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-gray-50 dark:bg-gray-800/70 text-xs text-gray-500 uppercase">
                                        <tr>
                                            <th className="px-4 py-2 text-left">Fecha</th>
                                            <th className="px-4 py-2 text-left">Tipo</th>
                                            <th className="px-4 py-2 text-left">Cantidad</th>
                                            <th className="px-4 py-2 text-left">Usuario</th>
                                            <th className="px-4 py-2 text-left">Nota</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {movements.map(movement => (
                                            <tr key={movement.id} className="border-t border-gray-100 dark:border-gray-800">
                                                <td className="px-4 py-2 text-xs text-gray-500">
                                                    {new Date(movement.created_at).toLocaleString('es-AR', {
                                                        day: '2-digit',
                                                        month: '2-digit',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </td>
                                                <td className="px-4 py-2">
                                                    <span className={clsx(
                                                        'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                                                        movement.type === 'IN' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                                                        movement.type === 'OUT' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                                                        movement.type === 'ADJUST' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                                    )}>
                                                        {movement.type}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2 font-semibold">
                                                    {movement.qty} {product.unit}
                                                </td>
                                                <td className="px-4 py-2 text-xs text-gray-500">{movement.created_by_label}</td>
                                                <td className="px-4 py-2 text-xs text-gray-500">{movement.note || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}

function MiniStat({ title, value, subtitle, danger = false }: { title: string; value: string; subtitle: string; danger?: boolean }) {
    return (
        <div className={clsx(
            'rounded-xl border p-3 bg-white dark:bg-gray-900',
            danger ? 'border-red-300 dark:border-red-800' : 'border-gray-200 dark:border-gray-700'
        )}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
            <p className={clsx('text-xl font-bold mt-1', danger ? 'text-red-600' : 'text-gray-900 dark:text-white')}>{value}</p>
            <p className="text-[11px] text-gray-500">{subtitle}</p>
        </div>
    );
}

function DataCell({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-2 py-2">
            <p className="text-[10px] uppercase text-gray-500 tracking-wide">{label}</p>
            <p className="text-xs font-semibold text-gray-900 dark:text-white break-words">{value}</p>
        </div>
    );
}
