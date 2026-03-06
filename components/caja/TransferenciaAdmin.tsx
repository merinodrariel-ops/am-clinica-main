'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft, Loader2, X, Send, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import MoneyInput from '@/components/ui/MoneyInput';
import { Textarea } from '@/components/ui/Textarea';
import { createClient } from '@/utils/supabase/client';

const supabase = createClient();
import { formatCurrency } from '@/lib/bna';
import { ComprobanteUpload } from '@/components/caja/ComprobanteUpload';

type TransferenciaTipo = 'TRASPASO_INTERNO' | 'RETIRO_EFECTIVO';
type CajaNodo = 'RECEPCION' | 'ADMIN';

interface TransferenciaAdminProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    bnaRate: number;
    defaultTipo?: TransferenciaTipo;
}

const MOTIVOS: Record<TransferenciaTipo, string[]> = {
    TRASPASO_INTERNO: [
        'Traspaso entre cajas',
        'Reposicion de caja',
        'Ajuste interno de efectivo',
        'Otro',
    ],
    RETIRO_EFECTIVO: [
        'Retiro del dueno',
        'Retiro de encargado',
        'Reserva de seguridad',
        'Otro',
    ],
};

function cajaLabel(value: CajaNodo) {
    return value === 'RECEPCION' ? 'Caja Recepcion' : 'Caja Administracion';
}

export default function TransferenciaAdmin({
    isOpen,
    onClose,
    onSuccess,
    bnaRate,
    defaultTipo = 'TRASPASO_INTERNO',
}: TransferenciaAdminProps) {
    const [monto, setMonto] = useState(0);
    const [moneda, setMoneda] = useState<'USD' | 'ARS'>('ARS');
    const [tipoTransferencia, setTipoTransferencia] = useState<TransferenciaTipo>(defaultTipo);
    const [cajaOrigen, setCajaOrigen] = useState<CajaNodo>('RECEPCION');
    const [cajaDestino, setCajaDestino] = useState<CajaNodo>('ADMIN');
    const [motivo, setMotivo] = useState(MOTIVOS[defaultTipo][0]);
    const [observaciones, setObservaciones] = useState('');
    const [comprobanteUrl, setComprobanteUrl] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        setTipoTransferencia(defaultTipo);
        setMotivo(MOTIVOS[defaultTipo][0]);
        if (defaultTipo === 'RETIRO_EFECTIVO') {
            setCajaOrigen('RECEPCION');
            setCajaDestino('ADMIN');
        }
    }, [defaultTipo, isOpen]);

    useEffect(() => {
        if (tipoTransferencia === 'RETIRO_EFECTIVO') {
            setMotivo((prev) => (MOTIVOS.RETIRO_EFECTIVO.includes(prev) ? prev : MOTIVOS.RETIRO_EFECTIVO[0]));
            return;
        }

        setMotivo((prev) => (MOTIVOS.TRASPASO_INTERNO.includes(prev) ? prev : MOTIVOS.TRASPASO_INTERNO[0]));

        if (cajaOrigen === cajaDestino) {
            setCajaDestino(cajaOrigen === 'RECEPCION' ? 'ADMIN' : 'RECEPCION');
        }
    }, [tipoTransferencia, cajaDestino, cajaOrigen]);

    async function handleSubmit() {
        if (monto <= 0) {
            alert('El monto debe ser mayor a 0');
            return;
        }

        if (tipoTransferencia === 'TRASPASO_INTERNO' && cajaOrigen === cajaDestino) {
            alert('Origen y destino deben ser diferentes en un traspaso interno');
            return;
        }

        setSaving(true);
        try {
            // Regla de Oro: un traspaso en ARS no se convierte a USD.
            // usd_equivalente solo se calcula para movimientos en USD.
            const usdEquivalente = moneda === 'USD' ? monto : null;

            const opsTag = `[OPS:${tipoTransferencia}|${cajaOrigen}|${tipoTransferencia === 'RETIRO_EFECTIVO' ? 'EXT' : cajaDestino}]`;

            const insertPayload: Record<string, unknown> = {
                moneda,
                monto,
                tc_bna_venta: moneda === 'ARS' ? bnaRate : null,
                usd_equivalente: usdEquivalente,
                tipo_transferencia: tipoTransferencia,
                caja_origen: cajaOrigen,
                caja_destino: tipoTransferencia === 'RETIRO_EFECTIVO' ? null : cajaDestino,
                motivo,
                observaciones: observaciones || null,
                usuario: 'Recepcion',
                estado: 'confirmada',
                comprobante_url: comprobanteUrl
            };

            let { error } = await supabase
                .from('transferencias_caja')
                .insert(insertPayload);

            if (error && (error.message.includes('tipo_transferencia') || error.message.includes('caja_origen') || error.message.includes('caja_destino'))) {
                // Backward-compatible insert for environments that do not have the migration yet
                const fallbackPayload = {
                    moneda,
                    monto,
                    tc_bna_venta: moneda === 'ARS' ? bnaRate : null,
                    usd_equivalente: usdEquivalente,
                    motivo: `${opsTag} ${motivo}`,
                    observaciones: observaciones || null,
                    usuario: 'Recepcion',
                    estado: 'confirmada',
                };

                const fallbackResult = await supabase
                    .from('transferencias_caja')
                    .insert(fallbackPayload);

                error = fallbackResult.error;
            }

            if (error) throw error;

            onSuccess();
            handleClose();
        } catch (error) {
            console.error('Error creating transfer operation:', error);
            alert('Error al registrar el movimiento de efectivo');
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setMonto(0);
        setMoneda('ARS');
        setTipoTransferencia(defaultTipo);
        setCajaOrigen('RECEPCION');
        setCajaDestino('ADMIN');
        setMotivo(MOTIVOS[defaultTipo][0]);
        setObservaciones('');
        setComprobanteUrl(null);
        onClose();
    }

    function calculateUsdEquivalent(): number {
        if (moneda === 'USD') return monto;
        if (bnaRate > 0) return Math.round((monto / bnaRate) * 100) / 100;
        return 0;
    }

    const title = tipoTransferencia === 'RETIRO_EFECTIVO'
        ? 'Retiro de Efectivo'
        : 'Traspaso entre Cajas';

    const subtitle = tipoTransferencia === 'RETIRO_EFECTIVO'
        ? 'Salida no operativa de efectivo'
        : 'Movimiento interno entre cajas';

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-xl">
                <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                            {tipoTransferencia === 'RETIRO_EFECTIVO'
                                ? <Wallet size={20} className="text-orange-600 dark:text-orange-400" />
                                : <ArrowRightLeft size={20} className="text-orange-600 dark:text-orange-400" />}
                        </div>
                        <div>
                            <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
                            <p className="text-xs text-gray-500">{subtitle}</p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg h-auto w-auto"
                    >
                        <X size={18} className="text-gray-500" />
                    </Button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Tipo de movimiento
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setTipoTransferencia('TRASPASO_INTERNO')}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold border ${tipoTransferencia === 'TRASPASO_INTERNO'
                                    ? 'bg-indigo-600 text-white border-indigo-500'
                                    : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                                    }`}
                            >
                                Traspaso interno
                            </button>
                            <button
                                onClick={() => setTipoTransferencia('RETIRO_EFECTIVO')}
                                className={`px-3 py-2 rounded-lg text-xs font-semibold border ${tipoTransferencia === 'RETIRO_EFECTIVO'
                                    ? 'bg-orange-600 text-white border-orange-500'
                                    : 'bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                                    }`}
                            >
                                Retiro efectivo
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Caja origen
                            </label>
                            <select
                                value={cajaOrigen}
                                onChange={(e) => setCajaOrigen(e.target.value as CajaNodo)}
                                className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                            >
                                <option value="RECEPCION">Caja Recepcion</option>
                                <option value="ADMIN">Caja Administracion</option>
                            </select>
                        </div>

                        {tipoTransferencia === 'TRASPASO_INTERNO' && (
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Caja destino
                                </label>
                                <select
                                    value={cajaDestino}
                                    onChange={(e) => setCajaDestino(e.target.value as CajaNodo)}
                                    className="w-full px-3 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                                >
                                    <option value="RECEPCION">Caja Recepcion</option>
                                    <option value="ADMIN">Caja Administracion</option>
                                </select>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Monto *
                        </label>
                        <div className="flex gap-3">
                            <div className="relative flex-1">
                                <MoneyInput
                                    value={monto}
                                    onChange={(val) => setMonto(val)}
                                    className="w-full pl-10 pr-4 py-2.5 border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 h-auto"
                                    placeholder="0"
                                    currency={moneda}
                                />
                            </div>
                            <select
                                value={moneda}
                                onChange={(e) => setMoneda(e.target.value as 'USD' | 'ARS')}
                                className="px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                            >
                                <option value="ARS">ARS</option>
                                <option value="USD">USD</option>
                            </select>
                        </div>
                        {moneda === 'ARS' && bnaRate > 0 && monto > 0 && (
                            <p className="text-sm text-gray-500 mt-2">
                                ≈ {formatCurrency(calculateUsdEquivalent(), 'USD')} (TC: ${bnaRate.toLocaleString('es-AR')})
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Motivo *
                        </label>
                        <select
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900"
                        >
                            {MOTIVOS[tipoTransferencia].map((m) => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 font-semibold">
                            Comprobante (opcional)
                        </label>
                        <ComprobanteUpload
                            area="caja-recepcion"
                            onUploadComplete={(res) => setComprobanteUrl(res.url)}
                            className="w-full"
                        />
                        {comprobanteUrl && (
                            <div className="mt-2 flex items-center justify-between">
                                <p className="text-xs text-green-600 font-medium flex items-center gap-1">
                                    <span className="h-3 w-3 rounded-full bg-green-500 flex items-center justify-center text-white p-0.5">
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><path d="M20 6L9 17L4 12" /></svg>
                                    </span>
                                    Comprobante adjuntado
                                </p>
                                <button
                                    onClick={() => setComprobanteUrl(null)}
                                    className="text-xs text-red-600 hover:underline"
                                >
                                    Eliminar
                                </button>
                            </div>
                        )}
                    </div>

                    <div className="p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Se registrará:</p>
                        <p className="text-lg font-bold text-gray-900 dark:text-white">
                            {formatCurrency(monto, moneda)}
                            {moneda === 'ARS' && bnaRate > 0 && (
                                <span className="text-sm font-normal text-gray-500 ml-2">
                                    ({formatCurrency(calculateUsdEquivalent(), 'USD')})
                                </span>
                            )}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                            {tipoTransferencia === 'RETIRO_EFECTIVO'
                                ? `${cajaLabel(cajaOrigen)} -> Retiro externo`
                                : `${cajaLabel(cajaOrigen)} -> ${cajaLabel(cajaDestino)}`}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Motivo: {motivo}</p>
                    </div>
                </div>

                <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3">
                    <Button
                        variant="outline"
                        onClick={handleClose}
                        className="flex-1 py-2.5 border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-900 h-auto"
                    >
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={saving || monto <= 0}
                        className="flex-1 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center justify-center gap-2 h-auto"
                    >
                        {saving ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : (
                            <Send size={18} />
                        )}
                        Confirmar
                    </Button>
                </div>
            </div>
        </div>
    );
}
