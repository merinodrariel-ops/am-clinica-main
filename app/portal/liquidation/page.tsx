import { getCurrentWorkerProfile, getWorkerLiquidations } from '@/app/actions/worker-portal';
import { getMisPrestaciones, type PrestacionRealizada } from '@/app/actions/prestaciones';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Calendar, CheckCircle2, Clock, DollarSign, FileText, Stethoscope } from 'lucide-react';
import { getLocalYearMonth } from '@/lib/local-date';

const STATUS_CONFIG = {
    paid: { label: 'Pagado', color: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', icon: CheckCircle2 },
    approved: { label: 'Aprobado', color: 'text-blue-300 bg-blue-500/10 border-blue-500/20', icon: CheckCircle2 },
    pending: { label: 'Pendiente', color: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: Clock },
    rejected: { label: 'Rechazado', color: 'text-red-300 bg-red-500/10 border-red-500/20', icon: Clock },
};

function formatMoney(value?: number | null, currency: 'ARS' | 'USD' = 'ARS') {
    if (!value) return currency === 'USD' ? 'USD 0' : '$0';
    if (currency === 'USD') return `USD ${value.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`;
    return `$${value.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function monthLabel(mes: string) {
    const normalized = mes.length === 7 ? `${mes}-02` : mes;
    return new Date(normalized + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function shiftMonth(mes: string, delta: number) {
    const [year, month] = mes.split('-').map(Number);
    const date = new Date(year, month - 1 + delta, 1);
    return getLocalYearMonth(date);
}

function countByPrestacion(items: PrestacionRealizada[]) {
    const map = new Map<string, { name: string; count: number; ars: number; usd: number }>();

    for (const item of items) {
        const name = item.prestacion_nombre || 'Prestación sin nombre';
        const current = map.get(name) || { name, count: 0, ars: 0, usd: 0 };
        current.count += 1;
        if (item.moneda_cobro === 'USD') current.usd += Number(item.monto_honorarios || 0);
        else current.ars += Number(item.monto_honorarios || 0);
        map.set(name, current);
    }

    return Array.from(map.values()).sort((a, b) => b.count - a.count || b.ars + b.usd - (a.ars + a.usd));
}

function Variation({ current, previous }: { current: number; previous: number }) {
    const delta = current - previous;
    const Icon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : ArrowRight;
    const color = delta > 0 ? 'text-emerald-300' : delta < 0 ? 'text-amber-300' : 'text-slate-400';

    return (
        <span className={`inline-flex items-center gap-1 text-xs font-bold ${color}`}>
            <Icon size={14} />
            {delta === 0 ? 'Sin cambio' : `${delta > 0 ? '+' : ''}${delta} vs mes anterior`}
        </span>
    );
}

export default async function LiquidationPage() {
    const worker = await getCurrentWorkerProfile();
    if (!worker) return <div className="p-12 text-center text-slate-500">Perfil no encontrado.</div>;

    const currentMonth = getLocalYearMonth();
    const previousMonth = shiftMonth(currentMonth, -1);

    const [liquidations, currentPrestaciones, previousPrestaciones] = await Promise.all([
        getWorkerLiquidations(worker.id),
        getMisPrestaciones(worker.id, currentMonth),
        getMisPrestaciones(worker.id, previousMonth),
    ]);

    const paidTotal = liquidations.filter(l => l.estado === 'paid').reduce((s, l) => s + (l.total_ars || 0), 0);
    const pendingTotal = liquidations.filter(l => l.estado !== 'paid' && l.estado !== 'rejected').reduce((s, l) => s + (l.total_ars || 0), 0);
    const latestLiquidation = liquidations[0];
    const prestacionesRanking = countByPrestacion(currentPrestaciones.prestaciones);
    const topPrestacion = prestacionesRanking[0];

    return (
        <div className="mx-auto max-w-5xl space-y-6 pb-16">
            <div className="space-y-2 border-b border-slate-800/50 pb-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-300">Liquidaciones</p>
                <h1 className="text-2xl font-black tracking-tight text-white sm:text-3xl">Pagos y prestaciones</h1>
                <p className="max-w-2xl text-sm font-medium text-slate-400">
                    Resumen mensual para corroborar lo cargado, lo pendiente y lo pagado por administración.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">Total cobrado</p>
                    <p className="mt-2 text-2xl font-black text-white">{formatMoney(paidTotal)}</p>
                    <p className="mt-1 text-xs text-emerald-200/70">{liquidations.filter(l => l.estado === 'paid').length} liquidaciones pagas</p>
                </div>
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-amber-300">A corroborar</p>
                    <p className="mt-2 text-2xl font-black text-white">{formatMoney(pendingTotal)}</p>
                    <p className="mt-1 text-xs text-amber-200/70">Aprobado o pendiente de pago</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Último período</p>
                    <p className="mt-2 text-xl font-black capitalize text-white">
                        {latestLiquidation ? monthLabel(latestLiquidation.mes) : monthLabel(currentMonth)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                        {latestLiquidation ? formatMoney(latestLiquidation.total_ars) : 'Sin liquidación emitida'}
                    </p>
                </div>
            </div>

            <section className="rounded-2xl border border-slate-800/70 bg-slate-900/40 p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                        <h2 className="flex items-center gap-2 text-lg font-bold text-white">
                            <Stethoscope size={18} className="text-indigo-300" />
                            Prestaciones de {monthLabel(currentMonth)}
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                            Base operativa para revisar la liquidación del mes.
                        </p>
                    </div>
                    <Variation current={currentPrestaciones.prestaciones.length} previous={previousPrestaciones.prestaciones.length} />
                </div>

                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Cantidad</p>
                        <p className="mt-1 text-2xl font-black text-white">{currentPrestaciones.prestaciones.length}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total ARS</p>
                        <p className="mt-1 text-xl font-black text-white">{formatMoney(currentPrestaciones.total_ars)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Total USD</p>
                        <p className="mt-1 text-xl font-black text-white">{formatMoney(currentPrestaciones.total_usd, 'USD')}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Principal</p>
                        <p className="mt-1 truncate text-base font-black text-white">{topPrestacion?.name || '-'}</p>
                    </div>
                </div>

                <div className="mt-5 space-y-2">
                    {prestacionesRanking.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-800 p-8 text-center">
                            <FileText size={30} className="mx-auto mb-3 text-slate-700" />
                            <p className="text-sm font-medium text-slate-500">No hay prestaciones cargadas este mes.</p>
                        </div>
                    ) : (
                        prestacionesRanking.slice(0, 8).map((item) => (
                            <div key={item.name} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/30 px-3 py-3">
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-bold text-white">{item.name}</p>
                                    <p className="text-xs text-slate-500">{item.count} prestación{item.count === 1 ? '' : 'es'}</p>
                                </div>
                                <div className="shrink-0 text-right text-sm font-black text-slate-200">
                                    {item.ars > 0 && <p>{formatMoney(item.ars)}</p>}
                                    {item.usd > 0 && <p className="text-emerald-300">{formatMoney(item.usd, 'USD')}</p>}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            <section className="space-y-3">
                <h2 className="text-lg font-bold text-white">Historial de liquidaciones</h2>

                {liquidations.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-800 px-4 py-16 text-center">
                        <DollarSign size={40} className="mx-auto mb-4 text-slate-700" />
                        <p className="text-slate-500">No hay liquidaciones registradas todavía.</p>
                        <p className="mt-1 text-sm text-slate-600">Administración las emite al cierre de cada mes.</p>
                    </div>
                ) : (
                    liquidations.map((liq, idx) => {
                        const status = STATUS_CONFIG[liq.estado as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending;
                        const StatusIcon = status.icon;
                        const tc = liq.tc_liquidacion || 1;

                        return (
                            <article
                                key={liq.id}
                                className={`overflow-hidden rounded-2xl border bg-slate-900/40 ${idx === 0 ? 'border-indigo-500/30' : 'border-slate-800/60'}`}
                            >
                                <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${idx === 0 ? 'border-indigo-500/20 bg-indigo-500/10' : 'border-slate-800 bg-slate-950'}`}>
                                            <Calendar className={idx === 0 ? 'text-indigo-300' : 'text-slate-500'} size={19} />
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="truncate font-bold capitalize text-white">{monthLabel(liq.mes)}</h3>
                                            {idx === 0 && <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Más reciente</p>}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                                        <div className="text-left sm:text-right">
                                            <p className="text-2xl font-black text-white">{formatMoney(liq.total_ars)}</p>
                                            {liq.total_usd ? <p className="text-xs text-slate-400">USD {liq.total_usd.toFixed(2)} @ {tc}</p> : null}
                                        </div>
                                        <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold uppercase ${status.color}`}>
                                            <StatusIcon size={13} />
                                            {status.label}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 border-t border-slate-800/50 bg-slate-950/20 px-4 py-4 sm:grid-cols-4 sm:px-5">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Horas</p>
                                        <p className="mt-1 text-sm font-bold text-slate-300">{liq.total_horas || 0}h</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Valor/hora</p>
                                        <p className="mt-1 text-sm font-bold text-slate-300">{formatMoney(liq.valor_hora_snapshot)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">TC</p>
                                        <p className="mt-1 text-sm font-bold text-slate-300">{tc}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Pago</p>
                                        <p className="mt-1 text-sm font-bold text-slate-300">
                                            {liq.fecha_pago
                                                ? new Date(liq.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR')
                                                : '-'}
                                        </p>
                                    </div>
                                </div>

                                {liq.observaciones && (
                                    <div className="border-t border-amber-500/10 bg-amber-500/5 px-4 py-3 sm:px-5">
                                        <p className="text-xs font-medium text-amber-300/80">{liq.observaciones}</p>
                                    </div>
                                )}
                            </article>
                        );
                    })
                )}
            </section>
        </div>
    );
}
