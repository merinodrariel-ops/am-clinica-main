'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
    ArrowLeft,
    Download,
    Filter,
    History,
    Loader2,
    Search,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import CategoriaGuard from '@/components/auth/CategoriaGuard';
import {
    listInventoryStockMovements,
    type StockMovementRecord,
} from '@/app/actions/inventory-stock';

type MovementTypeFilter = 'ALL' | 'ENTRADA' | 'SALIDA' | 'AJUSTE';

export default function InventoryMovementsPage() {
    return (
        <CategoriaGuard allowedCategorias={['owner', 'admin', 'reception', 'partner_viewer', 'developer', 'laboratorio']}>
            <InventoryMovementsScreen />
        </CategoriaGuard>
    );
}

function InventoryMovementsScreen() {
    const searchParams = useSearchParams();
    const initialProductId = searchParams.get('productId') || '';

    const [movements, setMovements] = useState<StockMovementRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState<MovementTypeFilter>('ALL');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [productId, setProductId] = useState(initialProductId);
    const [error, setError] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        const result = await listInventoryStockMovements({
            productId: productId || undefined,
            type: typeFilter,
            dateFrom: dateFrom || undefined,
            dateTo: dateTo || undefined,
            search,
            limit: 500,
        });

        if (!result.success) {
            setError(result.error || 'No se pudo cargar historial de movimientos');
            setMovements([]);
            setLoading(false);
            return;
        }

        setError(null);
        setMovements(result.movements);
        setLoading(false);
    }, [dateFrom, dateTo, productId, search, typeFilter]);

    useEffect(() => {
        const timeout = setTimeout(() => {
            void load();
        }, 180);

        return () => clearTimeout(timeout);
    }, [load]);

    const totals = useMemo(() => {
        return movements.reduce(
            (acc, movement) => {
                if (movement.tipo_movimiento === 'ENTRADA') acc.in += Number(movement.cantidad || 0);
                if (movement.tipo_movimiento === 'SALIDA') acc.out += Number(movement.cantidad || 0);
                if (movement.tipo_movimiento === 'AJUSTE') acc.adjust += Number(movement.cantidad || 0);
                return acc;
            },
            { in: 0, out: 0, adjust: 0 }
        );
    }, [movements]);

    function escapeCsvValue(value: unknown) {
        const asText = String(value ?? '');
        return `"${asText.replace(/"/g, '""')}"`;
    }

    function formatFilenameDate() {
        const date = new Date();
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const hh = String(date.getHours()).padStart(2, '0');
        const min = String(date.getMinutes()).padStart(2, '0');
        return `${yyyy}${mm}${dd}-${hh}${min}`;
    }

    function handleExportCsv() {
        if (movements.length === 0) {
            toast.info('No hay movimientos para exportar con los filtros actuales');
            return;
        }

        setExporting(true);

        const headers = [
            'created_at_iso',
            'product_id',
            'product_name',
            'product_category',
            'type',
            'qty',
            'unit',
            'created_by',
            'note',
            'device_source',
            'match_mode',
            'visual_score',
            'visual_confidence',
        ];

        const rows = movements.map(movement => {
            return [
                movement.created_at,
                movement.item_id,
                movement.item?.nombre || '',
                movement.item?.categoria || '',
                movement.tipo_movimiento,
                movement.cantidad,
                movement.item?.unidad_medida || '',
                movement.usuario,
                movement.motivo || '',
                '', '', '',
            ].map(escapeCsvValue).join(',');
        });

        const csvContent = `${headers.map(escapeCsvValue).join(',')}\n${rows.join('\n')}`;
        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `inventario-movimientos-${formatFilenameDate()}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);

        setExporting(false);
        toast.success(`CSV exportado (${movements.length} registros)`);
    }

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-xs uppercase tracking-wide text-indigo-600 font-semibold">PR3 - Trazabilidad</p>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <History className="text-indigo-600" />
                        Historial de movimientos
                    </h1>
                    <p className="text-sm text-gray-500">Vista auditable de ingresos y consumos de inventario.</p>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleExportCsv}
                        disabled={exporting || loading || movements.length === 0}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                        {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                        Exportar CSV
                    </button>

                    <Link href="/inventario/productos" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm inline-flex items-center gap-1.5">
                        <ArrowLeft size={14} /> Volver a productos
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <SummaryCard label="Registros" value={String(movements.length)} />
                <SummaryCard label="Ingresos" value={String(totals.in)} success />
                <SummaryCard label="Egresos" value={String(totals.out)} danger />
                <SummaryCard label="Ajustes" value={String(totals.adjust)} />
            </div>

            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
                    <div className="md:col-span-2 relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Buscar por producto, nota o usuario"
                            className="w-full pl-9 pr-2 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                        />
                    </div>

                    <select
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value as MovementTypeFilter)}
                        className="px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    >
                        <option value="ALL">Tipo: Todos</option>
                        <option value="ENTRADA">Solo IN</option>
                        <option value="SALIDA">Solo OUT</option>
                        <option value="AJUSTE">Solo ADJUST</option>
                    </select>

                    <input
                        value={productId}
                        onChange={(event) => setProductId(event.target.value)}
                        placeholder="Filtrar por product_id"
                        className="px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />

                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(event) => setDateFrom(event.target.value)}
                        className="px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />

                    <input
                        type="date"
                        value={dateTo}
                        onChange={(event) => setDateTo(event.target.value)}
                        className="px-2 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
                    />
                </div>

                <p className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <Filter size={12} />
                    Aplica filtros combinados. Si llegas desde detalle, `product_id` queda precargado.
                </p>
            </div>

            {error && (
                <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm px-3 py-2">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="py-16 flex justify-center">
                    <Loader2 className="animate-spin text-blue-600" size={30} />
                </div>
            ) : movements.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center text-sm text-gray-500">
                    Sin movimientos para esos filtros.
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-800/70 text-xs uppercase text-gray-500">
                                <tr>
                                    <th className="px-4 py-2 text-left">Fecha</th>
                                    <th className="px-4 py-2 text-left">Producto</th>
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
                                            {movement.item ? (
                                                <Link href={`/inventario/productos/${movement.item.id}`} className="font-semibold text-gray-900 dark:text-white hover:underline">
                                                    {movement.item.nombre}
                                                </Link>
                                            ) : (
                                                <span className="text-gray-500">Producto N/D</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2">
                                            <span className={clsx(
                                                'text-[11px] px-2 py-0.5 rounded-full font-semibold',
                                                movement.tipo_movimiento === 'ENTRADA' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                                                movement.tipo_movimiento === 'SALIDA' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                                                movement.tipo_movimiento === 'AJUSTE' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                                            )}>
                                                {movement.tipo_movimiento}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 font-semibold">{movement.cantidad}</td>
                                        <td className="px-4 py-2 text-xs text-gray-500">{movement.usuario}</td>
                                        <td className="px-4 py-2 text-xs text-gray-500 max-w-[280px] truncate">{movement.motivo || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}

function SummaryCard({
    label,
    value,
    success = false,
    danger = false,
}: {
    label: string;
    value: string;
    success?: boolean;
    danger?: boolean;
}) {
    return (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
            <p className={clsx(
                'text-xl font-bold mt-1',
                success ? 'text-emerald-600' : danger ? 'text-red-600' : 'text-gray-900 dark:text-white'
            )}>{value}</p>
        </div>
    );
}
