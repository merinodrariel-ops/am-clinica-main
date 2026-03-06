'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
    CreditCard,
    Landmark,
    TrendingUp,
    CalendarClock,
    FileText,
    Upload,
    ExternalLink,
    Trash2,
    Loader2,
    ChevronDown,
    ChevronUp,
    CheckCircle,
    AlertTriangle,
} from 'lucide-react';
import {
    getFinanciacionData,
    uploadContrato,
    getContratoSignedUrl,
    deleteContrato,
    type FinanciacionStats,
    type PlanFinanciacion,
} from '@/lib/financiacion';
import { createClient } from '@/utils/supabase/client';
import { syncFinanciacionIdentidadesAction } from '@/app/actions/financiacion-cuotas';

const supabase = createClient();

interface PendingPago {
    id: string;
    paciente_nombre: string;
    presupuesto_ref: string | null;
    cuota_nro: number | null;
    cuotas_total: number | null;
    monto_usd: number;
    monto_original: number;
    moneda: 'USD' | 'ARS' | 'USDT';
    motivo: string;
    error_message: string | null;
    created_at: string;
}

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getNextMonthName(): string {
    const next = (new Date().getMonth() + 1) % 12;
    return MONTH_NAMES[next];
}

function ProgressBar({ paid, total }: { paid: number; total: number }) {
    const pct = total > 0 ? (paid / total) * 100 : 0;
    const segments = Array.from({ length: total }, (_, i) => i < paid);

    // For small number of quotas, show individual segments
    if (total <= 12) {
        return (
            <div className="flex gap-0.5 w-full">
                {segments.map((filled, i) => (
                    <div
                        key={i}
                        className="h-2.5 rounded-sm flex-1 transition-all duration-500"
                        style={{
                            background: filled
                                ? 'linear-gradient(90deg, hsl(165 100% 42%), hsl(140 70% 45%))'
                                : 'hsla(230, 15%, 25%, 0.6)',
                        }}
                    />
                ))}
            </div>
        );
    }

    // For larger numbers, show continuous bar
    return (
        <div className="h-2.5 w-full rounded-full overflow-hidden" style={{ background: 'hsla(230, 15%, 25%, 0.6)' }}>
            <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                    width: `${pct}%`,
                    background: 'linear-gradient(90deg, hsl(165 100% 42%), hsl(140 70% 45%))',
                }}
            />
        </div>
    );
}

function KpiMini({
    icon: Icon,
    label,
    value,
    gradient,
    iconBg,
    iconColor,
    subtitle,
}: {
    icon: React.ElementType;
    label: string;
    value: string;
    gradient: string;
    iconBg: string;
    iconColor: string;
    subtitle?: string;
}) {
    return (
        <div
            className="glass-card rounded-2xl p-5 transition-all duration-300"
            style={{ background: 'hsla(230, 15%, 12%, 0.6)' }}
        >
            <div className="flex items-center gap-3">
                <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: iconBg }}
                >
                    <Icon size={22} style={{ color: iconColor }} />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'hsl(230 10% 50%)' }}>
                        {label}
                    </p>
                    <p
                        className="text-xl font-bold tracking-tight"
                        style={{
                            background: gradient,
                            WebkitBackgroundClip: 'text',
                            WebkitTextFillColor: 'transparent',
                            backgroundClip: 'text',
                        }}
                    >
                        {value}
                    </p>
                    {subtitle && (
                        <p className="text-[10px] mt-0.5" style={{ color: 'hsl(230 10% 40%)' }}>
                            {subtitle}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function PlanRow({
    plan,
    onUpload,
    onDelete,
    onView,
}: {
    plan: PlanFinanciacion;
    onUpload: (planId: string, file: File) => Promise<void>;
    onDelete: (planId: string, filePath: string) => Promise<void>;
    onView: (filePath: string) => void;
}) {
    const [expanded, setExpanded] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const pct = plan.cuotas_total > 0
        ? Math.round((plan.cuotas_pagadas / plan.cuotas_total) * 100)
        : 0;

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            await onUpload(plan.id, file);
        } finally {
            setUploading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    return (
        <div
            className="glass-card rounded-xl overflow-hidden transition-all duration-300 hover:ring-1 hover:ring-white/10"
            style={{ background: 'hsla(230, 15%, 12%, 0.5)' }}
        >
            {/* Main row */}
            <div
                className="p-4 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                        <div
                            className="h-9 w-9 rounded-lg flex items-center justify-center"
                            style={{ background: 'hsla(270, 67%, 55%, 0.15)' }}
                        >
                            <CreditCard size={18} style={{ color: 'hsl(270 67% 65%)' }} />
                        </div>
                        <div>
                            <p className="font-semibold text-sm" style={{ color: 'hsl(210 20% 90%)' }}>
                                {plan.paciente_nombre}
                            </p>
                            <p className="text-xs" style={{ color: 'hsl(230 10% 45%)' }}>
                                {plan.tratamiento}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="text-right">
                            <p className="text-sm font-bold" style={{ color: 'hsl(35 95% 60%)' }}>
                                ${Number(plan.saldo_restante_usd).toLocaleString()} USD
                            </p>
                            <p className="text-[10px]" style={{ color: 'hsl(230 10% 40%)' }}>
                                deuda pendiente
                            </p>
                        </div>
                        {expanded ? (
                            <ChevronUp size={16} style={{ color: 'hsl(230 10% 40%)' }} />
                        ) : (
                            <ChevronDown size={16} style={{ color: 'hsl(230 10% 40%)' }} />
                        )}
                    </div>
                </div>

                {/* Progress bar */}
                <ProgressBar paid={plan.cuotas_pagadas} total={plan.cuotas_total} />
                <div className="flex justify-between mt-1.5">
                    <span className="text-[11px] font-medium" style={{ color: 'hsl(165 85% 50%)' }}>
                        {plan.cuotas_pagadas}/{plan.cuotas_total} cuotas ({pct}%)
                    </span>
                    <span className="text-[11px]" style={{ color: 'hsl(230 10% 45%)' }}>
                        ${Number(plan.monto_cuota_usd).toLocaleString()}/mes
                    </span>
                </div>
            </div>

            {/* Expanded details */}
            {expanded && (
                <div
                    className="px-4 pb-4 pt-2 space-y-3"
                    style={{ borderTop: '1px solid hsla(230, 15%, 20%, 0.8)' }}
                >
                    <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                            <span style={{ color: 'hsl(230 10% 45%)' }}>Monto total:</span>{' '}
                            <span className="font-medium" style={{ color: 'hsl(210 20% 85%)' }}>
                                ${Number(plan.monto_total_usd).toLocaleString()} USD
                            </span>
                        </div>
                        <div>
                            <span style={{ color: 'hsl(230 10% 45%)' }}>Inicio:</span>{' '}
                            <span className="font-medium" style={{ color: 'hsl(210 20% 85%)' }}>
                                {plan.fecha_inicio ? new Date(plan.fecha_inicio + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                        </div>
                        {plan.condicion && (
                            <div className="col-span-2">
                                <span style={{ color: 'hsl(230 10% 45%)' }}>Condición:</span>{' '}
                                <span className="font-medium" style={{ color: 'hsl(210 20% 85%)' }}>
                                    {plan.condicion}
                                </span>
                            </div>
                        )}
                        {plan.notas && (
                            <div className="col-span-2">
                                <span style={{ color: 'hsl(230 10% 45%)' }}>Notas:</span>{' '}
                                <span style={{ color: 'hsl(210 20% 80%)' }}>{plan.notas}</span>
                            </div>
                        )}
                    </div>

                    {/* Contract section */}
                    <div
                        className="rounded-lg p-3"
                        style={{ background: 'hsla(230, 15%, 8%, 0.6)' }}
                    >
                        <p className="text-xs font-medium mb-2" style={{ color: 'hsl(230 10% 55%)' }}>
                            📄 Contrato firmado
                        </p>
                        {plan.contrato_url ? (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={(e) => { e.stopPropagation(); onView(plan.contrato_url!); }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105"
                                    style={{
                                        background: 'hsla(165, 100%, 42%, 0.12)',
                                        color: 'hsl(165, 85%, 50%)',
                                        border: '1px solid hsla(165, 100%, 42%, 0.2)',
                                    }}
                                >
                                    <ExternalLink size={12} />
                                    Ver contrato
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDelete(plan.id, plan.contrato_url!); }}
                                    className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs transition-all hover:scale-105"
                                    style={{
                                        background: 'hsla(0, 70%, 50%, 0.1)',
                                        color: 'hsl(0, 70%, 60%)',
                                        border: '1px solid hsla(0, 70%, 50%, 0.15)',
                                    }}
                                >
                                    <Trash2 size={11} />
                                </button>
                                <CheckCircle size={14} style={{ color: 'hsl(165 85% 50%)' }} />
                                <span className="text-[10px]" style={{ color: 'hsl(165 85% 50%)' }}>Cargado</span>
                            </div>
                        ) : (
                            <div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={handleFileChange}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        fileRef.current?.click();
                                    }}
                                    disabled={uploading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 disabled:opacity-50"
                                    style={{
                                        background: 'hsla(270, 67%, 55%, 0.12)',
                                        color: 'hsl(270, 67%, 65%)',
                                        border: '1px solid hsla(270, 67%, 55%, 0.2)',
                                    }}
                                >
                                    {uploading ? (
                                        <Loader2 size={12} className="animate-spin" />
                                    ) : (
                                        <Upload size={12} />
                                    )}
                                    {uploading ? 'Subiendo...' : 'Subir contrato PDF'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default function FinanciacionTab() {
    const [stats, setStats] = useState<FinanciacionStats | null>(null);
    const [pendingPagos, setPendingPagos] = useState<PendingPago[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingIdentidades, setSyncingIdentidades] = useState(false);

    const nextMonth = getNextMonthName();

    const load = useCallback(async () => {
        setLoading(true);
        const [statsData, pendingResult] = await Promise.all([
            getFinanciacionData(),
            supabase
                .from('financiacion_pagos_pendientes')
                .select('id, paciente_nombre, presupuesto_ref, cuota_nro, cuotas_total, monto_usd, monto_original, moneda, motivo, error_message, created_at')
                .eq('estado', 'pendiente')
                .order('created_at', { ascending: false })
                .limit(50),
        ]);

        setStats(statsData);
        if (!pendingResult.error) {
            setPendingPagos((pendingResult.data || []) as PendingPago[]);
        } else {
            setPendingPagos([]);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            void load();
        }, 0);

        return () => window.clearTimeout(timer);
    }, [load]);

    const handleUpload = async (planId: string, file: File) => {
        await uploadContrato(planId, file);
        await load(); // Refresh
    };

    const handleDelete = async (planId: string, filePath: string) => {
        if (!confirm('¿Eliminar el contrato? Esta acción no se puede deshacer.')) return;
        await deleteContrato(planId, filePath);
        await load();
    };

    const handleView = async (filePath: string) => {
        const url = await getContratoSignedUrl(filePath);
        if (url) {
            window.open(url, '_blank');
        } else {
            alert('Error al obtener el contrato. Intentá de nuevo.');
        }
    };

    const handleSyncIdentidades = async () => {
        setSyncingIdentidades(true);
        try {
            const result = await syncFinanciacionIdentidadesAction();

            if (!result.success) {
                alert(result.error || 'No se pudo sincronizar identidades.');
                return;
            }

            await load();

            const unresolvedPreview = (result.unresolvedExamples || []).slice(0, 4);
            const unresolvedText = unresolvedPreview.length > 0
                ? `\nNo vinculados (ejemplos): ${unresolvedPreview.join(', ')}`
                : '';

            alert(
                `Sincronización completada.\n` +
                `Planes revisados: ${result.scanned}\n` +
                `Vinculados ahora: ${result.linked}\n` +
                `Ya vinculados: ${result.alreadyLinked}\n` +
                `Sin resolver: ${result.unresolved}` +
                unresolvedText
            );
        } finally {
            setSyncingIdentidades(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 size={32} className="animate-spin" style={{ color: 'hsl(270 67% 55%)' }} />
            </div>
        );
    }

    if (!stats) return null;

    const activos = stats.planes.filter(p => p.estado === 'En curso');
    const completados = stats.planes.filter(p => p.estado !== 'En curso');

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-end">
                <button
                    type="button"
                    onClick={handleSyncIdentidades}
                    disabled={syncingIdentidades}
                    className="px-4 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-60"
                    style={{
                        background: 'hsla(217, 91%, 60%, 0.18)',
                        color: 'hsl(217 91% 72%)',
                        border: '1px solid hsla(217, 91%, 60%, 0.3)',
                    }}
                >
                    {syncingIdentidades ? 'Sincronizando identidades...' : 'Sincronizar identidades'}
                </button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiMini
                    icon={CreditCard}
                    label="Financiaciones Activas"
                    value={`${stats.planesActivos}`}
                    gradient="linear-gradient(135deg, hsl(270 67% 55%), hsl(285 65% 50%))"
                    iconBg="hsla(270, 67%, 55%, 0.15)"
                    iconColor="hsl(270 67% 65%)"
                    subtitle="Con cuotas pendientes"
                />
                <KpiMini
                    icon={Landmark}
                    label="Deuda Global"
                    value={`$${stats.deudaGlobal.toLocaleString()}`}
                    gradient="linear-gradient(135deg, hsl(35 95% 55%), hsl(25 90% 48%))"
                    iconBg="hsla(35, 95%, 55%, 0.15)"
                    iconColor="hsl(35 95% 60%)"
                    subtitle="Saldo total pendiente USD"
                />
                <KpiMini
                    icon={CalendarClock}
                    label={`Cobro Esperado ${nextMonth}`}
                    value={`$${stats.cobroEsperadoProxMes.toLocaleString()}`}
                    gradient="linear-gradient(135deg, hsl(165 100% 42%), hsl(140 70% 35%))"
                    iconBg="hsla(165, 100%, 42%, 0.15)"
                    iconColor="hsl(165 85% 50%)"
                    subtitle="Suma de cuotas mensuales"
                />
                <KpiMini
                    icon={TrendingUp}
                    label="Total Recaudado"
                    value={`$${stats.totalRecaudado.toLocaleString()}`}
                    gradient="linear-gradient(135deg, hsl(217 91% 60%), hsl(224 76% 48%))"
                    iconBg="hsla(217, 91%, 60%, 0.15)"
                    iconColor="hsl(217 91% 65%)"
                    subtitle="Ya cobrado en cuotas"
                />
            </div>

            {/* Active Plans */}
            <div>
                <h3
                    className="text-sm font-bold mb-3 flex items-center gap-2"
                    style={{ color: 'hsl(210 20% 85%)' }}
                >
                    <CreditCard size={16} style={{ color: 'hsl(270 67% 65%)' }} />
                    Financiaciones en curso ({activos.length})
                </h3>
                <div className="space-y-3">
                    {activos.map(plan => (
                        <PlanRow
                            key={plan.id}
                            plan={plan}
                            onUpload={handleUpload}
                            onDelete={handleDelete}
                            onView={handleView}
                        />
                    ))}
                    {activos.length === 0 && (
                        <p className="text-center py-8 text-sm" style={{ color: 'hsl(230 10% 40%)' }}>
                            No hay financiaciones activas
                        </p>
                    )}
                </div>
            </div>

            {/* Pending payment assignment */}
            <div>
                <h3
                    className="text-sm font-bold mb-3 flex items-center gap-2"
                    style={{ color: 'hsl(210 20% 85%)' }}
                >
                    <AlertTriangle size={16} style={{ color: 'hsl(25 95% 60%)' }} />
                    Pagos Pendientes de Asignar ({pendingPagos.length})
                </h3>
                <div className="space-y-3">
                    {pendingPagos.map((pago) => (
                        <div
                            key={pago.id}
                            className="glass-card rounded-xl p-4"
                            style={{ background: 'hsla(25, 80%, 10%, 0.25)', border: '1px solid hsla(25, 95%, 60%, 0.2)' }}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-sm font-semibold" style={{ color: 'hsl(35 95% 75%)' }}>
                                        {pago.paciente_nombre}
                                    </p>
                                    <p className="text-xs" style={{ color: 'hsl(30 80% 70%)' }}>
                                        {new Date(pago.created_at).toLocaleString('es-AR')}
                                    </p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-bold" style={{ color: 'hsl(35 95% 75%)' }}>
                                        {pago.moneda} {Number(pago.monto_original).toLocaleString()}
                                    </p>
                                    <p className="text-xs" style={{ color: 'hsl(230 10% 60%)' }}>
                                        ≈ USD {Number(pago.monto_usd).toLocaleString()}
                                    </p>
                                </div>
                            </div>

                            <div className="mt-2 text-xs space-y-1" style={{ color: 'hsl(30 70% 75%)' }}>
                                <p>Motivo: <span className="font-medium">{pago.motivo}</span></p>
                                {(pago.cuota_nro && pago.cuotas_total) && (
                                    <p>Cuota informada: <span className="font-medium">{pago.cuota_nro}/{pago.cuotas_total}</span></p>
                                )}
                                {pago.presupuesto_ref && (
                                    <p>Referencia presupuesto: <span className="font-medium">{pago.presupuesto_ref}</span></p>
                                )}
                                {pago.error_message && (
                                    <p className="break-words">Error: <span className="font-medium">{pago.error_message}</span></p>
                                )}
                            </div>
                        </div>
                    ))}
                    {pendingPagos.length === 0 && (
                        <p className="text-center py-6 text-sm" style={{ color: 'hsl(230 10% 40%)' }}>
                            Sin pagos pendientes de asignacion
                        </p>
                    )}
                </div>
            </div>

            {/* Completed Plans */}
            {completados.length > 0 && (
                <div>
                    <h3
                        className="text-sm font-bold mb-3 flex items-center gap-2"
                        style={{ color: 'hsl(210 20% 70%)' }}
                    >
                        <FileText size={16} style={{ color: 'hsl(230 10% 45%)' }} />
                        Finalizados ({completados.length})
                    </h3>
                    <div className="space-y-3 opacity-60">
                        {completados.map(plan => (
                            <PlanRow
                                key={plan.id}
                                plan={plan}
                                onUpload={handleUpload}
                                onDelete={handleDelete}
                                onView={handleView}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
