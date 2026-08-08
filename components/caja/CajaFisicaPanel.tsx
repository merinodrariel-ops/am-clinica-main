'use client';

import { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarClock, CheckCircle2, Loader2, LockKeyhole, MinusCircle, Receipt } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import MoneyInput from '@/components/ui/MoneyInput';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import {
    abrirCajaFisica,
    canOpenCajaFisica,
    cerrarCajaFisica,
    getSaldoCajaFisica,
    type SaldoCajaFisica,
} from '@/lib/caja-fisica';
import NuevoGastoForm from '@/components/caja/NuevoGastoForm';
import TransferenciaAdmin from '@/components/caja/TransferenciaAdmin';

interface CajaFisicaPanelProps {
    sucursalId: string;
    tcBna?: number | null;
    compact?: boolean;
    onSaldoChange?: (saldo: SaldoCajaFisica) => void;
}

const formatArs = (value: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);

const formatUsd = (value: number) =>
    `USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(value)}`;

export default function CajaFisicaPanel({ sucursalId, tcBna, compact = false, onSaldoChange }: CajaFisicaPanelProps) {
    const { user, profile, categoria } = useAuth();
    const [saldo, setSaldo] = useState<SaldoCajaFisica | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showClose, setShowClose] = useState(false);
    const [contadoArs, setContadoArs] = useState(0);
    const [contadoUsd, setContadoUsd] = useState(0);
    const [observaciones, setObservaciones] = useState('');
    const [showExpense, setShowExpense] = useState(false);
    const [showWithdrawal, setShowWithdrawal] = useState(false);

    const usuario = useMemo(
        () => profile?.full_name || user?.email || 'Usuario de caja',
        [profile?.full_name, user?.email],
    );

    async function load() {
        setLoading(true);
        setError(null);
        try {
            const current = await getSaldoCajaFisica(sucursalId);
            setSaldo(current);
            onSaldoChange?.(current);
            setContadoArs(current.ars);
            setContadoUsd(current.usd);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo cargar la caja.');
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sucursalId]);

    async function handleOpen() {
        setSubmitting(true);
        setError(null);
        try {
            await abrirCajaFisica({ sucursalId, usuario, tcBna });
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo abrir la caja.');
        } finally {
            setSubmitting(false);
        }
    }

    async function handleClose() {
        setSubmitting(true);
        setError(null);
        try {
            await cerrarCajaFisica({
                sucursalId,
                usuario,
                contadoArs,
                contadoUsd,
                tcBna,
                observaciones,
                fecha: saldo?.arqueo_fecha || undefined,
            });
            setShowClose(false);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo cerrar la caja.');
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return (
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6 flex items-center gap-3 text-slate-300">
                <Loader2 className="animate-spin" size={20} />
                Cargando caja física…
            </div>
        );
    }

    if (error && !saldo) {
        return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">{error}</div>;
    }

    if (!saldo) return null;

    const waitingActivation = !saldo.activa;
    const isOpen = saldo.estado === 'abierto';
    const hasStaleOpen = saldo.estado === 'abierto_anterior';
    const canClose = isOpen || hasStaleOpen;
    const canOperate = categoria === 'owner'
        || categoria === 'admin'
        || categoria === 'reception'
        || categoria === 'developer';
    const canOpen = canOpenCajaFisica(saldo, categoria);

    return (
        <section className="rounded-2xl border border-emerald-500/20 bg-slate-950 text-white shadow-xl overflow-hidden">
            <div className={compact ? 'p-4' : 'p-6'}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-emerald-500/15 p-3">
                            <Banknote className="text-emerald-400" />
                        </div>
                        <div>
                            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-400">Caja física única · Madero</p>
                            <h2 className="text-xl font-bold">
                                {waitingActivation
                                    ? `Se activa el ${saldo.fecha_activacion ? new Date(`${saldo.fecha_activacion}T12:00:00`).toLocaleDateString('es-AR') : 'día configurado'}`
                                    : isOpen
                                        ? 'Caja abierta'
                                        : hasStaleOpen
                                            ? `Caja del ${new Date(`${saldo.arqueo_fecha}T12:00:00`).toLocaleDateString('es-AR')} pendiente de cierre`
                                        : saldo.estado === 'cerrado'
                                            ? 'Caja cerrada'
                                            : 'Caja pendiente de apertura'}
                            </h2>
                        </div>
                    </div>

                    {!waitingActivation && canOperate && (
                        <div className="flex gap-2">
                            {canClose ? (
                                <Button variant="outline" onClick={() => setShowClose((value) => !value)} disabled={submitting}>
                                    <LockKeyhole size={17} className="mr-2" />
                                    {hasStaleOpen ? 'Cerrar caja anterior' : 'Cerrar caja'}
                                </Button>
                            ) : canOpen ? (
                                <Button onClick={handleOpen} disabled={submitting}>
                                    {submitting ? <Loader2 size={17} className="mr-2 animate-spin" /> : <CheckCircle2 size={17} className="mr-2" />}
                                    {saldo.estado === 'cerrado' ? 'Reabrir caja' : 'Abrir caja'}
                                </Button>
                            ) : null}
                        </div>
                    )}
                </div>

                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-[1.35fr_1fr]">
                    <div className="relative overflow-hidden rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/20 via-emerald-500/10 to-transparent p-5 sm:p-6">
                        <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-emerald-400/10 blur-2xl" />
                        <p className="relative text-xs font-black uppercase tracking-[0.2em] text-emerald-300">Dólares en caja</p>
                        <p className="relative mt-2 break-words font-mono text-4xl font-black tracking-tight text-white sm:text-5xl">
                            {formatUsd(saldo.usd)}
                        </p>
                        <p className="relative mt-2 text-xs text-emerald-100/70">Billetes físicos disponibles</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 sm:p-6">
                        <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Pesos en caja · ARS</p>
                        <p className="mt-2 break-words font-mono text-2xl font-bold text-slate-100 sm:text-3xl">{formatArs(saldo.ars)}</p>
                        <p className="mt-2 text-xs text-slate-500">Billetes físicos disponibles</p>
                    </div>
                </div>

                {!waitingActivation && isOpen && canOperate && (
                    <div className="mt-4 flex flex-wrap gap-2">
                        <Button variant="outline" onClick={() => setShowExpense(true)}>
                            <Receipt size={17} className="mr-2" />
                            Registrar gasto en efectivo
                        </Button>
                        <Button variant="outline" onClick={() => setShowWithdrawal(true)}>
                            <MinusCircle size={17} className="mr-2" />
                            Retirar efectivo
                        </Button>
                    </div>
                )}

                {hasStaleOpen && (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                        <CalendarClock size={19} className="mt-0.5 shrink-0" />
                        <div>
                            <p className="font-semibold">La caja abierta corresponde a un día anterior.</p>
                            <p className="mt-1 text-amber-100/80">Cerrala con el conteo físico real. Después podrás abrir la caja de hoy y registrar movimientos.</p>
                        </div>
                    </div>
                )}

                {waitingActivation && (
                    <div className="mt-4 flex items-start gap-3 rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-blue-100">
                        <CalendarClock size={19} className="mt-0.5 shrink-0" />
                        Hasta el corte se conservan los arqueos actuales. En la primera apertura se sumarán, por moneda, los últimos cierres físicos de Recepción y Administración.
                    </div>
                )}

                {error && <p className="mt-4 text-sm text-red-300">{error}</p>}

                {showClose && canClose && (
                    <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4 space-y-4">
                        <div>
                            <h3 className="font-semibold">{hasStaleOpen ? 'Cierre pendiente del día anterior' : 'Conteo físico final'}</h3>
                            <p className="text-sm text-slate-400">Ingresá los billetes realmente contados en la única caja.</p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="space-y-1 text-sm text-slate-300">
                                <span>ARS contados</span>
                                <MoneyInput value={contadoArs} onChange={setContadoArs} currency="ARS" />
                            </label>
                            <label className="space-y-1 text-sm text-slate-300">
                                <span>USD contados</span>
                                <MoneyInput value={contadoUsd} onChange={setContadoUsd} currency="USD" />
                            </label>
                        </div>
                        <Textarea
                            value={observaciones}
                            onChange={(event) => setObservaciones(event.target.value)}
                            placeholder="Observaciones del cierre (opcional)"
                        />
                        <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() => setShowClose(false)} disabled={submitting}>Cancelar</Button>
                            <Button onClick={handleClose} disabled={submitting}>
                                {submitting && <Loader2 size={17} className="mr-2 animate-spin" />}
                                Confirmar cierre
                            </Button>
                        </div>
                    </div>
                )}
            </div>
            <NuevoGastoForm
                isOpen={showExpense}
                onClose={() => setShowExpense(false)}
                onSuccess={() => void load()}
                bnaRate={tcBna || 0}
            />
            <TransferenciaAdmin
                isOpen={showWithdrawal}
                onClose={() => setShowWithdrawal(false)}
                onSuccess={() => void load()}
                bnaRate={tcBna || 0}
                defaultTipo="RETIRO_EFECTIVO"
            />
        </section>
    );
}
