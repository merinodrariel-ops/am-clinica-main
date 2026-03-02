'use client';

import clsx from 'clsx';
import { Receipt, ExternalLink } from 'lucide-react';
import { ComprobanteLink } from '@/components/caja/ComprobanteLink';

export interface PatientPaymentItem {
    id: string;
    fecha_hora: string;
    fecha_movimiento?: string;
    concepto_nombre: string;
    monto: number;
    moneda: string;
    estado: string;
    metodo_pago?: string | null;
    observaciones?: string | null;
    cuota_nro?: number | null;
    cuotas_total?: number | null;
    comprobante_url?: string | null;
    usd_equivalente?: number | null;
}

interface PatientPaymentHistoryProps {
    payments: PatientPaymentItem[];
    variant: 'internal' | 'portal';
    onReceiptView?: (url: string) => void;
}

function normalizeStatus(status: string) {
    const normalized = (status || '').toLowerCase();
    if (normalized.includes('anulado')) return 'anulado';
    if (normalized.includes('pendiente')) return 'pendiente';
    if (normalized.includes('parcial')) return 'parcial';
    if (normalized.includes('confirmado') || normalized.includes('pagado')) return 'pagado';
    return normalized || 'sin_estado';
}

function formatStatus(status: string) {
    const key = normalizeStatus(status);
    if (key === 'pagado') return 'Pagado';
    if (key === 'pendiente') return 'Pendiente';
    if (key === 'parcial') return 'Parcial';
    if (key === 'anulado') return 'Anulado';
    return status || 'Sin estado';
}

function statusClasses(variant: 'internal' | 'portal', status: string) {
    const key = normalizeStatus(status);
    if (variant === 'portal') {
        if (key === 'pagado') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20';
        if (key === 'pendiente') return 'bg-amber-500/15 text-amber-300 border-amber-500/20';
        if (key === 'parcial') return 'bg-blue-500/15 text-blue-300 border-blue-500/20';
        if (key === 'anulado') return 'bg-rose-500/15 text-rose-300 border-rose-500/20';
        return 'bg-white/10 text-white/70 border-white/20';
    }

    if (key === 'pagado') return 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800';
    if (key === 'pendiente') return 'bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800';
    if (key === 'parcial') return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800';
    if (key === 'anulado') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800';
    return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900/20 dark:text-gray-300 dark:border-gray-700';
}

function formatAmount(value: number, currency: string) {
    const locale = currency === 'ARS' ? 'es-AR' : 'en-US';
    return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: currency || 'USD',
        maximumFractionDigits: currency === 'ARS' ? 0 : 2,
    }).format(value);
}

function formatDate(dateValue?: string) {
    if (!dateValue) return '-';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    });
}

function ReceiptCell({
    payment,
    variant,
    onReceiptView,
}: {
    payment: PatientPaymentItem;
    variant: 'internal' | 'portal';
    onReceiptView?: (url: string) => void;
}) {
    const receiptUrl = payment.comprobante_url;
    if (!receiptUrl) {
        return <span className={variant === 'portal' ? 'text-white/35 text-xs' : 'text-gray-400 text-xs'}>Sin comprobante</span>;
    }

    if (variant === 'internal') {
        return (
            <ComprobanteLink
                storedValue={receiptUrl}
                area="caja-recepcion"
                showLabel
                label="Ver"
                className="text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300 text-xs font-semibold"
            />
        );
    }

    if (onReceiptView) {
        return (
            <button
                type="button"
                onClick={() => onReceiptView(receiptUrl)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C9A96E]/30 bg-[#C9A96E]/10 text-[#E8D5A3] text-xs font-semibold hover:bg-[#C9A96E]/20 transition-colors"
            >
                <Receipt size={12} />
                Ver comprobante
            </button>
        );
    }

    return (
        <a
            href={receiptUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C9A96E]/30 bg-[#C9A96E]/10 text-[#E8D5A3] text-xs font-semibold hover:bg-[#C9A96E]/20 transition-colors"
        >
            <ExternalLink size={12} />
            Abrir comprobante
        </a>
    );
}

export default function PatientPaymentHistory({ payments, variant, onReceiptView }: PatientPaymentHistoryProps) {
    if (payments.length === 0) {
        return (
            <div className={clsx(
                'rounded-2xl border p-6 text-center',
                variant === 'portal'
                    ? 'bg-white/[0.02] border-white/5 text-white/40'
                    : 'bg-gray-50 dark:bg-gray-900/30 border-gray-100 dark:border-gray-800 text-gray-500',
            )}>
                No hay pagos registrados.
            </div>
        );
    }

    if (variant === 'portal') {
        return (
            <div className="space-y-3">
                {payments.map((payment) => {
                    const displayDate = payment.fecha_movimiento || payment.fecha_hora;
                    return (
                        <div key={payment.id} className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-white/90 text-sm font-semibold">{payment.concepto_nombre}</p>
                                    <p className="text-white/40 text-xs mt-1">{formatDate(displayDate)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[#E8D5A3] text-sm font-bold">{formatAmount(payment.monto, payment.moneda)}</p>
                                    {payment.cuota_nro ? (
                                        <p className="text-white/40 text-[11px] mt-1">Cuota {payment.cuota_nro}/{payment.cuotas_total || '?'}</p>
                                    ) : null}
                                </div>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span className={clsx('px-2 py-1 rounded-full border text-[11px] font-semibold', statusClasses('portal', payment.estado))}>
                                    {formatStatus(payment.estado)}
                                </span>
                                {payment.metodo_pago ? (
                                    <span className="px-2 py-1 rounded-full border border-white/10 text-[11px] text-white/60">
                                        {payment.metodo_pago}
                                    </span>
                                ) : null}
                                <div className="ml-auto">
                                    <ReceiptCell payment={payment} variant="portal" onReceiptView={onReceiptView} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 uppercase bg-gray-50 dark:bg-gray-800">
                    <tr>
                        <th className="px-6 py-3 text-left">Fecha</th>
                        <th className="px-6 py-3 text-left">Concepto</th>
                        <th className="px-6 py-3 text-left">Método</th>
                        <th className="px-6 py-3 text-left">Estado</th>
                        <th className="px-6 py-3 text-left">Cuota</th>
                        <th className="px-6 py-3 text-right">Monto</th>
                        <th className="px-6 py-3 text-right">USD</th>
                        <th className="px-6 py-3 text-center">Comprobante</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {payments.map((payment) => {
                        const displayDate = payment.fecha_movimiento || payment.fecha_hora;
                        const isVoided = normalizeStatus(payment.estado) === 'anulado';
                        return (
                            <tr key={payment.id} className={clsx('hover:bg-gray-50 dark:hover:bg-gray-800/50', isVoided && 'opacity-50')}>
                                <td className="px-6 py-4 whitespace-nowrap">{formatDate(displayDate)}</td>
                                <td className="px-6 py-4">
                                    <p className="font-medium text-gray-900 dark:text-gray-100">{payment.concepto_nombre}</p>
                                    {payment.observaciones ? <p className="text-xs text-gray-500 mt-1">{payment.observaciones}</p> : null}
                                </td>
                                <td className="px-6 py-4 text-gray-500">{payment.metodo_pago || '-'}</td>
                                <td className="px-6 py-4">
                                    <span className={clsx('px-2 py-1 rounded-full border text-xs font-semibold', statusClasses('internal', payment.estado))}>
                                        {formatStatus(payment.estado)}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-gray-500">
                                    {payment.cuota_nro ? `${payment.cuota_nro}/${payment.cuotas_total || '?'}` : '-'}
                                </td>
                                <td className="px-6 py-4 text-right font-medium">{formatAmount(payment.monto, payment.moneda)}</td>
                                <td className="px-6 py-4 text-right text-gray-600 dark:text-gray-300">
                                    {typeof payment.usd_equivalente === 'number' ? formatAmount(payment.usd_equivalente, 'USD') : '-'}
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <ReceiptCell payment={payment} variant="internal" />
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
