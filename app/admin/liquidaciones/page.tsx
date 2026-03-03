'use client';

import { Fragment, useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import {
    Wallet, RefreshCw, ChevronLeft, ChevronRight,
    CheckCircle2, Clock, Banknote, AlertTriangle, XCircle, Play,
    DollarSign, TrendingUp, Users, FileVideo, FileSpreadsheet, ListChecks,
    Search, PencilLine, ChevronDown, ChevronUp, Download, Printer, CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getLiquidacionesAdmin,
    generateLiquidacion,
    generateLiquidacionesEmpresa,
    approveLiquidacion,
    markLiquidacionPaid,
    markLiquidacionesEmpresaPaid,
    rejectLiquidacion,
    updateLiquidacionManual,
    LiquidacionAdminRow,
    LiquidacionResult,
    UpdateLiquidacionManualInput,
} from '@/app/actions/liquidaciones';
import { getTarifarioCompleto, TarifarioItem, updateTarifarioItem } from '@/app/actions/prestaciones';
import { getRegistrosHorasMes, RegistroHoras } from '@/app/actions/registro-horas';

const ProsoftImporter = dynamic(() => import('@/components/portal/ProsoftImporter'), { ssr: false });
const RegistroHorasDashboard = dynamic(() => import('@/components/admin/RegistroHorasDashboard'), { ssr: false });

// ─── helpers ─────────────────────────────────────────────────────────────────

function mesLabel(ym: string) {
    const [y, m] = ym.split('-');
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${meses[parseInt(m) - 1]} ${y}`;
}

function prevMes(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMes(ym: string) {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatARS(n: number) {
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

function formatUSD(n: number) {
    return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

function safeFileName(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .toLowerCase();
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function roleLabel(role?: string) {
    const labels: Record<string, string> = {
        owner: 'Owner',
        admin: 'Administrador',
        reception: 'Recepción',
        recaptacion: 'Recaptación',
        asistente: 'Asistente',
        odontologo: 'Odontólogo',
        laboratorio: 'Laboratorio',
        developer: 'Developer',
        pricing_manager: 'Pricing Manager',
        partner_viewer: 'Partner Viewer',
    };
    if (!role) return '';
    return labels[role] || role;
}

function dedupeByKey<T>(items: T[], keyOf: (item: T) => string): T[] {
    const seen = new Set<string>();
    const unique: T[] = [];
    for (const item of items) {
        const key = keyOf(item);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(item);
    }
    return unique;
}

type CompanySummary = {
    empresaId: string;
    empresaNombre: string;
    members: LiquidacionAdminRow[];
    generated: number;
    without: number;
    pending: number;
    approved: number;
    paid: number;
    totalArs: number;
    totalUsd: number;
    hasAlerts: boolean;
};

const ESTADO_CONFIG: Record<string, { label: string; icon: React.ReactNode; cls: string }> = {
    pending: { label: 'Pendiente', icon: <Clock size={12} />, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
    approved: { label: 'Aprobada', icon: <CheckCircle2 size={12} />, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
    paid: { label: 'Pagada', icon: <Banknote size={12} />, cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
    rejected: { label: 'Rechazada', icon: <XCircle size={12} />, cls: 'bg-red-500/10 text-red-400 border-red-500/30' },
};

// ─── PayDateModal ─────────────────────────────────────────────────────────────

function PayDateModal({ onConfirm, onClose }: { onConfirm: (d: string) => void; onClose: () => void }) {
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 w-80 shadow-2xl">
                <h3 className="text-white font-semibold mb-3">Fecha de pago</h3>
                <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm mb-4"
                />
                <div className="flex gap-2 justify-end">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirm(date)}
                        className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors"
                    >
                        Confirmar pago
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── EditLiquidacionModal ─────────────────────────────────────────────────────

function EditLiquidacionModal({
    row,
    liq,
    onClose,
    onSave,
    saving,
}: {
    row: LiquidacionAdminRow;
    liq: LiquidacionResult;
    onClose: () => void;
    onSave: (input: UpdateLiquidacionManualInput) => Promise<void>;
    saving: boolean;
}) {
    const breakdown = (liq.breakdown || {}) as Record<string, unknown>;
    const manualOverride =
        breakdown.manual_override && typeof breakdown.manual_override === 'object'
            ? breakdown.manual_override as Record<string, unknown>
            : null;

    const initialMoneda =
        manualOverride?.moneda === 'USD'
            ? 'USD'
            : manualOverride?.moneda === 'ARS'
                ? 'ARS'
                : liq.modelo_pago === 'prestacion_usd'
                    ? 'USD'
                    : 'ARS';

    const montoActual = initialMoneda === 'USD'
        ? Number(liq.total_usd || 0)
        : Number(liq.total_ars || 0);

    const [modeloPago, setModeloPago] = useState<'hora_ars' | 'prestacion_usd'>(liq.modelo_pago || row.modelo_pago);
    const [moneda, setMoneda] = useState<'ARS' | 'USD'>(initialMoneda);
    const [precio, setPrecio] = useState(
        String(Number(manualOverride?.precio_unitario ?? liq.valor_hora_snapshot ?? montoActual ?? 0))
    );
    const [cantidad, setCantidad] = useState(
        String(Number(manualOverride?.cantidad ?? liq.total_horas ?? 1))
    );
    const [tc, setTc] = useState(String(Number(liq.tc_liquidacion || liq.tc_bna_venta || 1)));
    const [observaciones, setObservaciones] = useState(liq.observaciones || '');

    const precioN = Number(precio.replace(',', '.'));
    const cantidadN = Number(cantidad.replace(',', '.'));
    const tcN = Number(tc.replace(',', '.'));

    const montoBase = Number.isFinite(precioN * cantidadN) ? Math.max(0, precioN * cantidadN) : 0;
    const totalArs = moneda === 'USD' ? montoBase * (Number.isFinite(tcN) ? tcN : 0) : montoBase;
    const totalUsd = moneda === 'USD'
        ? montoBase
        : (Number.isFinite(tcN) && tcN > 0 ? montoBase / tcN : 0);

    const invalid =
        !Number.isFinite(precioN) ||
        precioN < 0 ||
        !Number.isFinite(cantidadN) ||
        cantidadN <= 0 ||
        !Number.isFinite(tcN) ||
        tcN <= 0;

    async function submit() {
        if (invalid) return;
        await onSave({
            id: liq.id,
            modelo_pago: modeloPago,
            moneda,
            precio_unitario: precioN,
            cantidad: cantidadN,
            tc_liquidacion: tcN,
            observaciones,
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
            <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                    <div>
                        <h3 className="text-white font-semibold">Editar liquidación</h3>
                        <p className="text-xs text-slate-400 mt-0.5">{row.nombre} {row.apellido} · {mesLabel(liq.mes.slice(0, 7))}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-sm transition-colors"
                    >
                        Cerrar
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-4">
                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Tipo de liquidación</label>
                        <select
                            value={modeloPago}
                            onChange={e => setModeloPago(e.target.value as 'hora_ars' | 'prestacion_usd')}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                        >
                            <option value="hora_ars">ARS por hora</option>
                            <option value="prestacion_usd">USD por prestación</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Moneda base</label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['ARS', 'USD'] as const).map(opt => (
                                <button
                                    key={opt}
                                    onClick={() => setMoneda(opt)}
                                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${moneda === opt
                                        ? 'border-violet-500 bg-violet-500/20 text-violet-300'
                                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-white'
                                        }`}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Precio unitario ({moneda})</label>
                        <input
                            value={precio}
                            onChange={e => setPrecio(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                            inputMode="decimal"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Cantidad</label>
                        <input
                            value={cantidad}
                            onChange={e => setCantidad(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                            inputMode="decimal"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">TC liquidación</label>
                        <input
                            value={tc}
                            onChange={e => setTc(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                            inputMode="decimal"
                        />
                    </div>

                    <div>
                        <label className="block text-xs text-slate-400 mb-1">Estado actual</label>
                        <div className="h-[38px] rounded-lg border border-slate-700 bg-slate-800 px-3 flex items-center text-sm text-slate-300">
                            {ESTADO_CONFIG[liq.estado]?.label || 'Pendiente'}
                        </div>
                    </div>

                    <div className="md:col-span-2">
                        <label className="block text-xs text-slate-400 mb-1">Observaciones</label>
                        <textarea
                            value={observaciones}
                            onChange={e => setObservaciones(e.target.value)}
                            rows={3}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                            placeholder="Nota interna de ajuste (opcional)"
                        />
                    </div>
                </div>

                <div className="mx-5 mb-4 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-widest text-violet-300/80 font-semibold mb-2">Preview</p>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                        <span className="text-slate-300">Base: {moneda} {montoBase.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-emerald-300">ARS {totalArs.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                        <span className="text-slate-500">|</span>
                        <span className="text-blue-300">USD {totalUsd.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-4">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-60 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={submit}
                        disabled={saving || invalid}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white transition-colors"
                    >
                        {saving ? <RefreshCw size={13} className="animate-spin" /> : <PencilLine size={13} />}
                        Guardar cambios
                    </button>
                </div>
            </div>
        </div>
    );
}

function HorasDetalleModal({
    worker,
    mes,
    rows,
    loading,
    onClose,
}: {
    worker: LiquidacionAdminRow;
    mes: string;
    rows: RegistroHoras[];
    loading: boolean;
    onClose: () => void;
}) {
    const [year, month] = mes.split('-').map(Number);
    const monthStart = `${mes}-01`;
    const monthEnd = `${mes}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

    const [fromDate, setFromDate] = useState(monthStart);
    const [toDate, setToDate] = useState(monthEnd);
    const [dayMode, setDayMode] = useState<'all' | 'weekdays' | 'weekends'>('all');
    const [activePreset, setActivePreset] = useState<'month' | 'thisWeek' | 'last7' | 'weekends' | 'custom'>('month');

    useEffect(() => {
        setFromDate(monthStart);
        setToDate(monthEnd);
        setDayMode('all');
        setActivePreset('month');
    }, [monthStart, monthEnd]);

    function formatIsoDate(date: Date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function clampToMonth(dateIso: string) {
        if (dateIso < monthStart) return monthStart;
        if (dateIso > monthEnd) return monthEnd;
        return dateIso;
    }

    function applyPresetThisWeek() {
        const now = new Date();
        const dayIndex = (now.getDay() + 6) % 7;
        const start = new Date(now);
        start.setDate(now.getDate() - dayIndex);
        const end = new Date(start);
        end.setDate(start.getDate() + 6);

        setFromDate(clampToMonth(formatIsoDate(start)));
        setToDate(clampToMonth(formatIsoDate(end)));
        setDayMode('all');
        setActivePreset('thisWeek');
    }

    function applyPresetLast7Days() {
        const today = clampToMonth(formatIsoDate(new Date()));
        const endDate = new Date(`${today}T12:00:00`);
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 6);

        setFromDate(clampToMonth(formatIsoDate(startDate)));
        setToDate(today);
        setDayMode('all');
        setActivePreset('last7');
    }

    function applyPresetFullMonth() {
        setFromDate(monthStart);
        setToDate(monthEnd);
        setDayMode('all');
        setActivePreset('month');
    }

    function applyPresetWeekends() {
        applyPresetFullMonth();
        setDayMode('weekends');
        setActivePreset('weekends');
    }

    const activePresetLabel: Record<typeof activePreset, string> = {
        month: 'Mes completo',
        thisWeek: 'Esta semana',
        last7: 'Últimos 7 días',
        weekends: 'Solo fin de semana',
        custom: 'Personalizado',
    };

    const sortedRows = dedupeByKey(rows, (reg) => reg.id).sort((a, b) => {
        if (a.fecha !== b.fecha) return a.fecha.localeCompare(b.fecha);
        return (a.hora_ingreso || '').localeCompare(b.hora_ingreso || '');
    });

    const rangeFrom = fromDate <= toDate ? fromDate : toDate;
    const rangeTo = fromDate <= toDate ? toDate : fromDate;

    const filteredRows = sortedRows.filter(reg => {
        if (reg.fecha < rangeFrom || reg.fecha > rangeTo) return false;
        const day = new Date(`${reg.fecha}T12:00:00`).getDay();
        if (dayMode === 'weekdays') return day >= 1 && day <= 5;
        if (dayMode === 'weekends') return day === 0 || day === 6;
        return true;
    });

    const totalHoras = filteredRows.reduce((sum, r) => sum + Number(r.horas || 0), 0);
    const totalDias = new Set(filteredRows.map(r => r.fecha)).size;

    const weekMap = new Map<string, {
        start: Date;
        end: Date;
        totalHoras: number;
        registros: number;
        horasPorDia: number[];
    }>();

    for (const reg of filteredRows) {
        const date = new Date(`${reg.fecha}T12:00:00`);
        const dayIndex = (date.getDay() + 6) % 7; // Lun=0 ... Dom=6

        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - dayIndex);
        weekStart.setHours(0, 0, 0, 0);

        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const key = weekStart.toISOString().slice(0, 10);
        if (!weekMap.has(key)) {
            weekMap.set(key, {
                start: weekStart,
                end: weekEnd,
                totalHoras: 0,
                registros: 0,
                horasPorDia: [0, 0, 0, 0, 0, 0, 0],
            });
        }

        const bucket = weekMap.get(key)!;
        const horas = Number(reg.horas || 0);
        bucket.totalHoras += horas;
        bucket.registros += 1;
        bucket.horasPorDia[dayIndex] += horas;
    }

    const weeklyRows = Array.from(weekMap.entries())
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => a.key.localeCompare(b.key));

    function formatFecha(fechaISO: string) {
        return new Date(`${fechaISO}T12:00:00`).toLocaleDateString('es-AR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }

    function safeFileName(text: string) {
        return text
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, '_')
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .toLowerCase();
    }

    async function exportExcel() {
        if (filteredRows.length === 0) return;
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            const detalle = filteredRows.map(reg => {
                const fecha = new Date(`${reg.fecha}T12:00:00`);
                return {
                    Fecha: fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                    Dia: fecha.toLocaleDateString('es-AR', { weekday: 'long' }),
                    Ingreso: reg.hora_ingreso || '',
                    Egreso: reg.hora_egreso || '',
                    Horas: Number(reg.horas || 0),
                    Estado: reg.estado,
                    Observaciones: reg.observaciones || '',
                };
            });

            const resumen = weeklyRows.map((w, idx) => ({
                Semana: idx + 1,
                Desde: w.start.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                Hasta: w.end.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
                Lunes: Number(w.horasPorDia[0].toFixed(2)),
                Martes: Number(w.horasPorDia[1].toFixed(2)),
                Miercoles: Number(w.horasPorDia[2].toFixed(2)),
                Jueves: Number(w.horasPorDia[3].toFixed(2)),
                Viernes: Number(w.horasPorDia[4].toFixed(2)),
                Sabado: Number(w.horasPorDia[5].toFixed(2)),
                Domingo: Number(w.horasPorDia[6].toFixed(2)),
                TotalSemana: Number(w.totalHoras.toFixed(2)),
                Registros: w.registros,
            }));

            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle diario');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen semanal');

            const file = `horarios_${safeFileName(`${worker.nombre}_${worker.apellido || ''}`)}_${mes}.xlsx`;
            XLSX.writeFile(wb, file);
            toast.success('Excel exportado');
        } catch {
            toast.error('No se pudo exportar a Excel');
        }
    }

    function exportPdf() {
        if (filteredRows.length === 0) return;

        const escapeHtml = (value: string) =>
            value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

        const weeklyHtml = weeklyRows
            .map((w, idx) => `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${w.start.toLocaleDateString('es-AR')}</td>
                    <td>${w.end.toLocaleDateString('es-AR')}</td>
                    <td>${w.horasPorDia[0].toFixed(2)}</td>
                    <td>${w.horasPorDia[1].toFixed(2)}</td>
                    <td>${w.horasPorDia[2].toFixed(2)}</td>
                    <td>${w.horasPorDia[3].toFixed(2)}</td>
                    <td>${w.horasPorDia[4].toFixed(2)}</td>
                    <td>${w.horasPorDia[5].toFixed(2)}</td>
                    <td>${w.horasPorDia[6].toFixed(2)}</td>
                    <td><strong>${w.totalHoras.toFixed(2)}</strong></td>
                </tr>
            `)
            .join('');

        const detalleHtml = filteredRows
            .map(reg => {
                const date = new Date(`${reg.fecha}T12:00:00`);
                const dia = date.toLocaleDateString('es-AR', { weekday: 'long' });
                return `
                    <tr>
                        <td>${date.toLocaleDateString('es-AR')}</td>
                        <td style="text-transform: capitalize;">${dia}</td>
                        <td>${reg.hora_ingreso || '--:--'}</td>
                        <td>${reg.hora_egreso || '--:--'}</td>
                        <td><strong>${Number(reg.horas || 0).toFixed(2)}</strong></td>
                        <td>${escapeHtml(reg.estado || '')}</td>
                        <td>${escapeHtml(reg.observaciones || '')}</td>
                    </tr>
                `;
            })
            .join('');

        const popup = window.open('', '_blank');
        if (!popup) {
            toast.error('El navegador bloqueó la ventana de impresión');
            return;
        }

        popup.document.write(`
            <html>
                <head>
                    <title>Detalle de horarios - ${worker.nombre} ${worker.apellido || ''}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
                        h1 { margin: 0 0 6px 0; font-size: 20px; }
                        .meta { margin: 0 0 18px 0; color: #555; font-size: 12px; }
                        .stats { margin: 10px 0 18px 0; font-size: 12px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
                        th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; text-align: left; }
                        th { background: #f5f5f5; font-weight: 600; }
                        .section { margin-top: 14px; margin-bottom: 6px; font-size: 14px; font-weight: 700; }
                    </style>
                </head>
                <body>
                    <h1>Detalle de horarios</h1>
                    <p class="meta">${escapeHtml(worker.nombre)} ${escapeHtml(worker.apellido || '')} · ${escapeHtml(mesLabel(mes))}</p>
                    <p class="stats">Registros: ${filteredRows.length} | Días: ${totalDias} | Horas totales: ${totalHoras.toFixed(2)}</p>

                    <div class="section">Resumen semanal</div>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th><th>Desde</th><th>Hasta</th>
                                <th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th><th>Dom</th>
                                <th>Total</th>
                            </tr>
                        </thead>
                        <tbody>${weeklyHtml}</tbody>
                    </table>

                    <div class="section">Detalle diario</div>
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th><th>Día</th><th>Ingreso</th><th>Egreso</th><th>Horas</th><th>Estado</th><th>Observaciones</th>
                            </tr>
                        </thead>
                        <tbody>${detalleHtml}</tbody>
                    </table>
                </body>
            </html>
        `);

        popup.document.close();
        popup.focus();
        setTimeout(() => popup.print(), 200);
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/70 p-4 md:p-8 overflow-y-auto">
            <div className="max-w-4xl mx-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <div>
                        <h3 className="text-white font-semibold">Detalle de horas</h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                            {worker.nombre} {worker.apellido} · {mesLabel(mes)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={exportExcel}
                            disabled={loading || filteredRows.length === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:text-white disabled:opacity-50"
                        >
                            <Download size={12} /> Excel
                        </button>
                        <button
                            onClick={exportPdf}
                            disabled={loading || filteredRows.length === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-slate-700 text-slate-300 hover:text-white disabled:opacity-50"
                        >
                            <Printer size={12} /> PDF
                        </button>
                        <button onClick={onClose} className="text-slate-400 hover:text-white text-sm ml-1">
                            Cerrar
                        </button>
                    </div>
                </div>

                <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="px-2.5 py-1 rounded-full border border-slate-700 text-slate-300">{filteredRows.length} registros</span>
                        <span className="px-2.5 py-1 rounded-full border border-slate-700 text-slate-300">{totalDias} días</span>
                        <span className="px-2.5 py-1 rounded-full border border-violet-500/30 text-violet-300 font-medium">
                            {totalHoras.toLocaleString('es-AR', { maximumFractionDigits: 2 })} h totales
                        </span>
                        <span className="px-2.5 py-1 rounded-full border border-slate-700 text-slate-300 inline-flex items-center gap-1">
                            <CalendarDays size={12} /> {weeklyRows.length} semanas
                        </span>
                    </div>
                </div>

                <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/20">
                    <div className="flex flex-wrap items-end gap-2">
                        <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Desde</label>
                            <input
                                type="date"
                                value={fromDate}
                                min={monthStart}
                                max={monthEnd}
                                onChange={e => {
                                    setFromDate(e.target.value);
                                    setActivePreset('custom');
                                }}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Hasta</label>
                            <input
                                type="date"
                                value={toDate}
                                min={monthStart}
                                max={monthEnd}
                                onChange={e => {
                                    setToDate(e.target.value);
                                    setActivePreset('custom');
                                }}
                                className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                            />
                        </div>

                        <div className="flex items-center gap-1 border border-slate-700 rounded-lg p-1">
                            <button
                                onClick={() => {
                                    setDayMode('all');
                                    setActivePreset('custom');
                                }}
                                className={`px-2 py-1 text-xs rounded-md ${dayMode === 'all' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'}`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => {
                                    setDayMode('weekdays');
                                    setActivePreset('custom');
                                }}
                                className={`px-2 py-1 text-xs rounded-md ${dayMode === 'weekdays' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'}`}
                            >
                                Lun-Vie
                            </button>
                            <button
                                onClick={() => {
                                    setDayMode('weekends');
                                    setActivePreset('custom');
                                }}
                                className={`px-2 py-1 text-xs rounded-md ${dayMode === 'weekends' ? 'bg-violet-600 text-white' : 'text-slate-300 hover:text-white'}`}
                            >
                                Sáb-Dom
                            </button>
                        </div>

                        <button
                            onClick={applyPresetFullMonth}
                            className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 border border-slate-700 rounded-lg"
                        >
                            Mes completo
                        </button>
                        <button
                            onClick={applyPresetThisWeek}
                            className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 border border-slate-700 rounded-lg"
                        >
                            Esta semana
                        </button>
                        <button
                            onClick={applyPresetLast7Days}
                            className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 border border-slate-700 rounded-lg"
                        >
                            Últimos 7 días
                        </button>
                        <button
                            onClick={applyPresetWeekends}
                            className="text-xs text-slate-300 hover:text-white px-2.5 py-1.5 border border-slate-700 rounded-lg"
                        >
                            Solo fin de semana
                        </button>

                        <button
                            onClick={applyPresetFullMonth}
                            className="text-xs text-slate-400 hover:text-white px-2.5 py-1.5 border border-slate-700 rounded-lg"
                        >
                            Restablecer
                        </button>

                        <span className="ml-auto text-xs text-slate-400 px-2.5 py-1.5 border border-slate-700 rounded-lg">
                            Preset activo: <span className="text-violet-300 font-medium">{activePresetLabel[activePreset]}</span>
                        </span>
                    </div>
                </div>

                <div className="p-5">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-500">
                            <RefreshCw size={18} className="animate-spin mr-2" />
                            Cargando detalle...
                        </div>
                    ) : filteredRows.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                            No hay registros para los filtros seleccionados.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-slate-800 bg-slate-950/20 overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-900/80 border-b border-slate-800">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-slate-400 font-medium">Semana</th>
                                            <th className="text-left px-3 py-2 text-slate-400 font-medium">Rango</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Lun</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Mar</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Mié</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Jue</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Vie</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Sáb</th>
                                            <th className="text-right px-3 py-2 text-slate-400 font-medium">Dom</th>
                                            <th className="text-right px-3 py-2 text-slate-300 font-semibold">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/70">
                                        {weeklyRows.map((week, idx) => (
                                            <tr key={week.key} className="hover:bg-slate-900/50">
                                                <td className="px-3 py-2 text-slate-200">Semana {idx + 1}</td>
                                                <td className="px-3 py-2 text-slate-400">
                                                    {week.start.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                    {' - '}
                                                    {week.end.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}
                                                </td>
                                                {week.horasPorDia.map((h, i) => (
                                                    <td key={i} className="px-3 py-2 text-right text-slate-300">
                                                        {h > 0 ? h.toLocaleString('es-AR', { maximumFractionDigits: 2 }) : '—'}
                                                    </td>
                                                ))}
                                                <td className="px-3 py-2 text-right text-violet-300 font-semibold">
                                                    {week.totalHoras.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <div className="space-y-2">
                                {filteredRows.map(reg => {
                                    const fecha = new Date(`${reg.fecha}T12:00:00`);
                                    const dia = fecha.toLocaleDateString('es-AR', { weekday: 'long' });
                                    const fechaLabel = formatFecha(reg.fecha);

                                    return (
                                        <div key={reg.id} className="rounded-xl border border-slate-800 bg-slate-950/30 p-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div>
                                                    <p className="text-sm text-white font-medium capitalize">{dia} · {fechaLabel}</p>
                                                    <p className="text-xs text-slate-500 mt-0.5">Estado: {reg.estado}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-violet-300 font-semibold">
                                                        {Number(reg.horas || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })} h
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {reg.hora_ingreso || '--:--'} → {reg.hora_egreso || '--:--'}
                                                    </p>
                                                </div>
                                            </div>
                                            {reg.observaciones && (
                                                <p className="text-xs text-amber-300/90 mt-2">{reg.observaciones}</p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── TarifarioView ────────────────────────────────────────────────────────────

function TarifarioView({ items }: { items: TarifarioItem[] }) {
    const [localItems, setLocalItems] = useState<TarifarioItem[]>(items);
    const [query, setQuery] = useState('');
    const [monedaFilter, setMonedaFilter] = useState<'all' | 'ARS' | 'USD'>('all');
    const [areaFilter, setAreaFilter] = useState<string>('all');
    const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>({});
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [draft, setDraft] = useState({
        nombre: '',
        precio_base: '',
        moneda: 'ARS' as 'ARS' | 'USD',
        terminos: '',
    });

    useEffect(() => {
        setLocalItems(items);
        const nextExpanded: Record<string, boolean> = {};
        for (const item of items) {
            nextExpanded[item.area_nombre] = true;
        }
        setExpandedAreas(nextExpanded);
    }, [items]);

    const areas = Array.from(new Set(localItems.map(i => i.area_nombre))).sort((a, b) => a.localeCompare(b));
    const totalUsd = localItems.filter(i => i.moneda === 'USD').length;
    const totalArs = localItems.filter(i => i.moneda === 'ARS').length;

    const queryText = query.trim().toLowerCase();
    const filtered = localItems.filter(item => {
        if (monedaFilter !== 'all' && item.moneda !== monedaFilter) return false;
        if (areaFilter !== 'all' && item.area_nombre !== areaFilter) return false;
        if (!queryText) return true;
        const haystack = `${item.nombre} ${item.area_nombre} ${item.terminos || ''}`.toLowerCase();
        return haystack.includes(queryText);
    });

    const byArea: Record<string, TarifarioItem[]> = {};
    for (const item of filtered) {
        if (!byArea[item.area_nombre]) byArea[item.area_nombre] = [];
        byArea[item.area_nombre].push(item);
    }

    function startEditing(item: TarifarioItem) {
        setEditingId(item.id);
        setDraft({
            nombre: item.nombre,
            precio_base: String(Number(item.precio_base || 0)),
            moneda: item.moneda,
            terminos: item.terminos || '',
        });
    }

    function stopEditing() {
        setEditingId(null);
        setSavingId(null);
    }

    async function saveItem(itemId: string) {
        const precio = Number(draft.precio_base.replace(',', '.'));
        if (!Number.isFinite(precio) || precio < 0) {
            toast.error('Ingresá un precio válido');
            return;
        }

        setSavingId(itemId);
        try {
            const updated = await updateTarifarioItem({
                id: itemId,
                nombre: draft.nombre,
                precio_base: precio,
                moneda: draft.moneda,
                terminos: draft.terminos,
            });
            setLocalItems(prev => prev.map(item => (item.id === itemId ? updated : item)));
            toast.success('Prestación actualizada');
            setEditingId(null);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar el cambio');
        } finally {
            setSavingId(null);
        }
    }

    function adjustPrice(percentage: number) {
        const current = Number(draft.precio_base.replace(',', '.'));
        if (!Number.isFinite(current)) return;
        const next = current * (1 + percentage / 100);
        setDraft(prev => ({ ...prev, precio_base: String(Math.round((next + Number.EPSILON) * 100) / 100) }));
    }

    if (items.length === 0) {
        return (
            <div className="flex items-center justify-center py-20 text-slate-500">
                <ListChecks size={32} className="mr-3 text-slate-700" />
                Cargando prestaciones...
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 flex items-center gap-2">
                    <ListChecks size={14} className="text-indigo-400" />
                    <span className="text-sm text-slate-300 font-medium">{localItems.length} prestaciones</span>
                </div>
                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-2.5 text-sm text-emerald-400 font-medium">
                    {totalUsd} en USD
                </div>
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-xl px-4 py-2.5 text-sm text-blue-400 font-medium">
                    {totalArs} en ARS
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-400">
                    {areas.length} áreas
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Buscar prestación, área o términos..."
                            className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500"
                        />
                    </div>
                    {(['all', 'ARS', 'USD'] as const).map(opt => (
                        <button
                            key={opt}
                            onClick={() => setMonedaFilter(opt)}
                            className={`px-3 py-2 rounded-lg text-xs border transition-colors ${monedaFilter === opt
                                ? 'bg-violet-600 border-violet-500 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                                }`}
                        >
                            {opt === 'all' ? 'Todas monedas' : opt}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setAreaFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${areaFilter === 'all'
                            ? 'bg-violet-600 border-violet-500 text-white'
                            : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                            }`}
                    >
                        Todas las áreas
                    </button>
                    {areas.map(area => (
                        <button
                            key={area}
                            onClick={() => setAreaFilter(area)}
                            className={`px-3 py-1.5 rounded-lg text-xs border transition-colors ${areaFilter === area
                                ? 'bg-violet-600 border-violet-500 text-white'
                                : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                                }`}
                        >
                            {area}
                        </button>
                    ))}
                    <span className="ml-auto text-xs text-slate-500 self-center">{filtered.length} resultados</span>
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="text-center py-14 text-sm text-slate-500 border border-dashed border-slate-800 rounded-2xl">
                    No hay prestaciones para ese filtro.
                </div>
            ) : (
                Object.entries(byArea).map(([area, areaItems]) => (
                    <div key={area} className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                        <button
                            onClick={() => setExpandedAreas(prev => ({ ...prev, [area]: !prev[area] }))}
                            className="w-full flex items-center justify-between px-5 py-3 bg-slate-950/30 border-b border-slate-800 hover:bg-slate-950/50 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <h3 className="font-bold text-white text-sm">{area}</h3>
                                <span className="text-xs text-slate-500">{areaItems.length}</span>
                            </div>
                            {expandedAreas[area] ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                        </button>

                        {expandedAreas[area] && (
                            <div className="divide-y divide-slate-800/60">
                                {areaItems
                                    .sort((a, b) => a.nombre.localeCompare(b.nombre))
                                    .map(item => {
                                        const isEditing = editingId === item.id;
                                        const isSaving = savingId === item.id;

                                        return (
                                            <div key={item.id} className="px-5 py-3 hover:bg-slate-800/30 transition-colors">
                                                {!isEditing ? (
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <p className="text-sm text-slate-100 font-medium">{item.nombre}</p>
                                                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${item.moneda === 'USD' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' : 'text-blue-300 bg-blue-500/10 border-blue-500/20'}`}>
                                                                    {item.moneda}
                                                                </span>
                                                            </div>
                                                            {item.terminos && (
                                                                <p className="text-xs text-slate-500 mt-1">{item.terminos}</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right flex-shrink-0">
                                                            <p className={`font-mono font-bold text-sm ${item.moneda === 'USD' ? 'text-emerald-400' : 'text-blue-400'}`}>
                                                                {item.moneda === 'USD' ? 'USD ' : '$'}{Number(item.precio_base || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                                                            </p>
                                                            <button
                                                                onClick={() => startEditing(item)}
                                                                className="mt-1 inline-flex items-center gap-1 text-xs text-violet-300 hover:text-violet-200 transition-colors"
                                                            >
                                                                <PencilLine size={11} /> Editar
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                                            <input
                                                                value={draft.nombre}
                                                                onChange={e => setDraft(prev => ({ ...prev, nombre: e.target.value }))}
                                                                className="md:col-span-2 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                                                placeholder="Nombre"
                                                            />
                                                            <select
                                                                value={draft.moneda}
                                                                onChange={e => setDraft(prev => ({ ...prev, moneda: e.target.value as 'ARS' | 'USD' }))}
                                                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                                            >
                                                                <option value="ARS">ARS</option>
                                                                <option value="USD">USD</option>
                                                            </select>
                                                            <input
                                                                value={draft.precio_base}
                                                                onChange={e => setDraft(prev => ({ ...prev, precio_base: e.target.value }))}
                                                                className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                                                inputMode="decimal"
                                                                placeholder="Precio"
                                                            />
                                                        </div>

                                                        <textarea
                                                            value={draft.terminos}
                                                            onChange={e => setDraft(prev => ({ ...prev, terminos: e.target.value }))}
                                                            rows={2}
                                                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                                                            placeholder="Términos / nota opcional"
                                                        />

                                                        <div className="flex items-center justify-between gap-2 flex-wrap">
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => adjustPrice(-10)}
                                                                    className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-400 hover:text-white"
                                                                >
                                                                    -10%
                                                                </button>
                                                                <button
                                                                    onClick={() => adjustPrice(10)}
                                                                    className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-400 hover:text-white"
                                                                >
                                                                    +10%
                                                                </button>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={stopEditing}
                                                                    disabled={isSaving}
                                                                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                                                                >
                                                                    Cancelar
                                                                </button>
                                                                <button
                                                                    onClick={() => saveItem(item.id)}
                                                                    disabled={isSaving}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-xs text-white"
                                                                >
                                                                    {isSaving ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                                                    Guardar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LiquidacionesPage() {
    const now = new Date();
    const defaultMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [tab, setTab] = useState<'liquidaciones' | 'prosoft' | 'prestaciones' | 'horas'>('liquidaciones');
    const [prestacionesCatalogo, setPrestacionesCatalogo] = useState<TarifarioItem[]>([]);
    const [mes, setMes] = useState(defaultMes);
    const [rows, setRows] = useState<LiquidacionAdminRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState<string | null>(null);
    const [payModal, setPayModal] = useState<string | null>(null); // liq id
    const [editing, setEditing] = useState<{ row: LiquidacionAdminRow; liq: LiquidacionResult } | null>(null);
    const [savingEdit, setSavingEdit] = useState(false);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [detalleHorasTarget, setDetalleHorasTarget] = useState<LiquidacionAdminRow | null>(null);
    const [detalleHorasRows, setDetalleHorasRows] = useState<RegistroHoras[]>([]);
    const [detalleHorasLoading, setDetalleHorasLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'paid' | 'sin_generar'>('all');
    const [viewMode, setViewMode] = useState<'individual' | 'empresa'>('individual');
    const [generatingCompany, setGeneratingCompany] = useState<string | null>(null);
    const [quickActionBusy, setQuickActionBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await getLiquidacionesAdmin(mes);
            setRows(dedupeByKey(data, (row) => row.personal_id));
        } catch {
            toast.error('Error al cargar liquidaciones');
        } finally {
            setLoading(false);
        }
    }, [mes]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (tab === 'prestaciones' && prestacionesCatalogo.length === 0) {
            getTarifarioCompleto().then(setPrestacionesCatalogo);
        }
    }, [tab, prestacionesCatalogo.length]);

    // ── Stats ────────────────────────────────────────────────────────────────
    const totalArs = rows.reduce((s, r) => s + Number(r.liquidacion?.total_ars || 0), 0);
    const conLiq = rows.filter(r => r.liquidacion).length;
    const sinLiq = rows.filter(r => !r.liquidacion).length;
    const pendientes = rows.filter(r => r.liquidacion?.estado === 'pending').length;
    const withPendSlides = rows.filter(r => r.tiene_pendientes).length;

    // Sample TC from first liquidacion that has it
    const tcBna = rows.find(r => r.liquidacion?.tc_bna_venta)?.liquidacion?.tc_bna_venta;

    // ── Filter ───────────────────────────────────────────────────────────────
    const searchQuery = search.trim().toLowerCase();
    const filteredRows = rows.filter(r => {
        if (filter !== 'all' && filter === 'sin_generar' && r.liquidacion) return false;
        if (filter !== 'all' && filter !== 'sin_generar' && r.liquidacion?.estado !== filter) return false;
        if (!searchQuery) return true;
        const fullName = `${r.nombre} ${r.apellido || ''}`.toLowerCase();
        const area = (r.area || '').toLowerCase();
        const company = (r.empresa_prestadora_nombre || '').toLowerCase();
        return fullName.includes(searchQuery) || area.includes(searchQuery) || company.includes(searchQuery);
    });

    const companyGroups = rows
        .reduce((acc, row) => {
            const key = row.empresa_prestadora_id || '__sin_empresa__';
            const companyName = row.empresa_prestadora_nombre || 'Sin empresa asignada';
            if (!acc[key]) {
                acc[key] = {
                    empresaId: key,
                    empresaNombre: companyName,
                    members: [] as LiquidacionAdminRow[],
                };
            }
            acc[key].members.push(row);
            return acc;
        }, {} as Record<string, { empresaId: string; empresaNombre: string; members: LiquidacionAdminRow[] }>);

    const companySummaries: CompanySummary[] = Object.values(companyGroups).map((group) => {
        const generated = group.members.filter((m) => Boolean(m.liquidacion)).length;
        const without = group.members.length - generated;
        const pending = group.members.filter((m) => m.liquidacion?.estado === 'pending').length;
        const approved = group.members.filter((m) => m.liquidacion?.estado === 'approved').length;
        const paid = group.members.filter((m) => m.liquidacion?.estado === 'paid').length;

        return {
            ...group,
            generated,
            without,
            pending,
            approved,
            paid,
            totalArs: group.members.reduce((sum, member) => sum + Number(member.liquidacion?.total_ars || 0), 0),
            totalUsd: group.members.reduce((sum, member) => sum + Number(member.liquidacion?.total_usd || 0), 0),
            hasAlerts: group.members.some((m) => m.tiene_pendientes),
        };
    });

    const filteredCompanySummaries = companySummaries.filter((group) => {
        const companyName = group.empresaNombre.toLowerCase();
        const membersText = group.members.map((m) => `${m.nombre} ${m.apellido || ''}`).join(' ').toLowerCase();

        if (filter === 'sin_generar' && group.without === 0) return false;
        if (filter === 'pending' && group.pending === 0) return false;
        if (filter === 'approved' && group.approved === 0) return false;
        if (filter === 'paid' && group.paid !== group.members.length) return false;

        if (!searchQuery) return true;
        return companyName.includes(searchQuery) || membersText.includes(searchQuery);
    });

    const quickTargetsGenerate = filteredRows.filter((row) => !row.liquidacion);
    const quickTargetsApprove = filteredRows.filter((row) => row.liquidacion?.estado === 'pending');
    const quickTargetsApproveClean = filteredRows.filter((row) => row.liquidacion?.estado === 'pending' && !row.tiene_pendientes);
    const quickTargetsPay = filteredRows.filter((row) => row.liquidacion?.estado === 'approved');

    const pipelineCounts = {
        sinGenerar: filteredRows.filter((row) => !row.liquidacion).length,
        pendiente: filteredRows.filter((row) => row.liquidacion?.estado === 'pending').length,
        aprobada: filteredRows.filter((row) => row.liquidacion?.estado === 'approved').length,
        pagada: filteredRows.filter((row) => row.liquidacion?.estado === 'paid').length,
    };

    // ── Actions ──────────────────────────────────────────────────────────────
    async function handleGenerate(personalId: string) {
        setGenerating(personalId);
        try {
            await generateLiquidacion(personalId, mes);
            toast.success('Liquidación generada');
            load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al generar');
        } finally {
            setGenerating(null);
        }
    }

    async function handleGenerateCompany(empresaId: string) {
        setGeneratingCompany(empresaId);
        try {
            const result = await generateLiquidacionesEmpresa(empresaId, mes);
            toast.success(`Liquidación agrupada actualizada: ${result.generated} generadas${result.skipped ? `, ${result.skipped} con error` : ''}`);
            load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al generar liquidaciones de la empresa');
        } finally {
            setGeneratingCompany(null);
        }
    }

    async function handleMarkCompanyPaid(empresaId: string) {
        const defaultDate = new Date().toISOString().split('T')[0];
        const selectedDate = window.prompt('Fecha de pago (YYYY-MM-DD)', defaultDate);
        if (!selectedDate) return;

        try {
            const result = await markLiquidacionesEmpresaPaid(empresaId, mes, selectedDate);
            toast.success(`Pagos registrados para empresa: ${result.updated} actualizadas${result.skipped ? `, ${result.skipped} ya pagadas` : ''}`);
            load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al marcar pagos de empresa');
        }
    }

    async function handleQuickGenerateVisible() {
        if (quickTargetsGenerate.length === 0) {
            toast.info('No hay liquidaciones pendientes de generar en la vista actual.');
            return;
        }

        setQuickActionBusy('generate');
        let ok = 0;
        let fail = 0;

        for (const row of quickTargetsGenerate) {
            try {
                await generateLiquidacion(row.personal_id, mes);
                ok += 1;
            } catch {
                fail += 1;
            }
        }

        setQuickActionBusy(null);
        await load();
        toast.success(`Generación masiva finalizada: ${ok} ok${fail ? `, ${fail} con error` : ''}.`);
    }

    async function handleQuickApproveVisible() {
        if (quickTargetsApprove.length === 0) {
            toast.info('No hay liquidaciones pendientes para aprobar en la vista actual.');
            return;
        }

        setQuickActionBusy('approve');
        let ok = 0;
        let fail = 0;

        for (const row of quickTargetsApprove) {
            if (!row.liquidacion) continue;
            try {
                await approveLiquidacion(row.liquidacion.id);
                ok += 1;
            } catch {
                fail += 1;
            }
        }

        setQuickActionBusy(null);
        await load();
        toast.success(`Aprobación masiva finalizada: ${ok} ok${fail ? `, ${fail} con error` : ''}.`);
    }

    async function handleQuickPayVisible() {
        if (quickTargetsPay.length === 0) {
            toast.info('No hay liquidaciones aprobadas para pagar en la vista actual.');
            return;
        }

        const defaultDate = new Date().toISOString().split('T')[0];
        const fechaPago = window.prompt('Fecha de pago para todas (YYYY-MM-DD)', defaultDate);
        if (!fechaPago) return;

        setQuickActionBusy('pay');
        let ok = 0;
        let fail = 0;

        for (const row of quickTargetsPay) {
            if (!row.liquidacion) continue;
            try {
                await markLiquidacionPaid(row.liquidacion.id, fechaPago);
                ok += 1;
            } catch {
                fail += 1;
            }
        }

        setQuickActionBusy(null);
        await load();
        toast.success(`Pago masivo finalizado: ${ok} ok${fail ? `, ${fail} con error` : ''}.`);
    }

    async function handleCloseMonthAssisted() {
        if (quickActionBusy) return;

        const confirmStart = window.confirm(
            `Cierre asistido para ${mesLabel(mes)}:\n` +
            `1) Generar sin liquidación\n` +
            `2) Aprobar pendientes sin alertas\n` +
            `3) Opcionalmente marcar pagadas\n\n` +
            `¿Continuar?`
        );
        if (!confirmStart) return;

        setQuickActionBusy('close');

        let generatedOk = 0;
        let generatedFail = 0;
        let approvedOk = 0;
        let approvedFail = 0;
        let paidOk = 0;
        let paidFail = 0;

        // Step 1: generate missing
        for (const row of quickTargetsGenerate) {
            try {
                await generateLiquidacion(row.personal_id, mes);
                generatedOk += 1;
            } catch {
                generatedFail += 1;
            }
        }

        // Re-fetch after generation
        let latestRows = rows;
        try {
            latestRows = await getLiquidacionesAdmin(mes);
            latestRows = dedupeByKey(latestRows, (row) => row.personal_id);
            setRows(latestRows);
        } catch {
            // continue with current rows
        }

        // Step 2: approve only clean pending (no alertas)
        const approveCandidates = latestRows.filter((row) => row.liquidacion?.estado === 'pending' && !row.tiene_pendientes);
        for (const row of approveCandidates) {
            if (!row.liquidacion) continue;
            try {
                await approveLiquidacion(row.liquidacion.id);
                approvedOk += 1;
            } catch {
                approvedFail += 1;
            }
        }

        // Re-fetch after approvals
        try {
            latestRows = await getLiquidacionesAdmin(mes);
            latestRows = dedupeByKey(latestRows, (row) => row.personal_id);
            setRows(latestRows);
        } catch {
            // continue
        }

        // Step 3: optional pay all approved
        const approvedCandidates = latestRows.filter((row) => row.liquidacion?.estado === 'approved');
        if (approvedCandidates.length > 0) {
            const shouldPay = window.confirm(`Hay ${approvedCandidates.length} liquidaciones aprobadas. ¿Querés marcarlas pagadas ahora?`);
            if (shouldPay) {
                const defaultDate = new Date().toISOString().split('T')[0];
                const fechaPago = window.prompt('Fecha de pago para todas (YYYY-MM-DD)', defaultDate);
                if (fechaPago) {
                    for (const row of approvedCandidates) {
                        if (!row.liquidacion) continue;
                        try {
                            await markLiquidacionPaid(row.liquidacion.id, fechaPago);
                            paidOk += 1;
                        } catch {
                            paidFail += 1;
                        }
                    }
                }
            }
        }

        setQuickActionBusy(null);
        await load();

        toast.success(
            `Cierre asistido listo · Gen ${generatedOk}/${generatedOk + generatedFail}, ` +
            `Apr ${approvedOk}/${approvedOk + approvedFail}, ` +
            `Pag ${paidOk}/${paidOk + paidFail}`
        );
    }

    function getEstadoEmpresaMember(member: LiquidacionAdminRow): string {
        if (!member.liquidacion) return 'Sin generar';
        const estado = member.liquidacion.estado;
        if (estado === 'pending') return 'Pendiente';
        if (estado === 'approved') return 'Aprobada';
        if (estado === 'paid') return 'Pagada';
        if (estado === 'rejected') return 'Rechazada';
        return estado;
    }

    async function handleExportCompanyExcel(group: CompanySummary) {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            const resumen = [{
                Empresa: group.empresaNombre,
                Mes: mesLabel(mes),
                Miembros: group.members.length,
                Generadas: group.generated,
                SinGenerar: group.without,
                Pendientes: group.pending,
                Aprobadas: group.approved,
                Pagadas: group.paid,
                TotalARS: Number(group.totalArs.toFixed(2)),
                TotalUSD: Number(group.totalUsd.toFixed(2)),
            }];

            const detalle = group.members.map((member) => ({
                Prestador: `${member.nombre} ${member.apellido || ''}`.trim(),
                Area: member.area || '',
                RolApp: roleLabel(member.app_role),
                Estado: getEstadoEmpresaMember(member),
                Modelo: member.liquidacion?.modelo_pago || member.modelo_pago,
                TotalARS: Number(member.liquidacion?.total_ars || 0),
                TotalUSD: Number(member.liquidacion?.total_usd || 0),
                PendSlides: member.liquidacion?.prestaciones_pendientes || 0,
            }));

            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(resumen), 'Resumen empresa');
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detalle), 'Detalle miembros');

            XLSX.writeFile(wb, `liquidacion_empresa_${safeFileName(group.empresaNombre)}_${mes}.xlsx`);
            toast.success('Excel de empresa exportado');
        } catch {
            toast.error('No se pudo exportar el Excel de empresa');
        }
    }

    function handleExportCompanyPdf(group: CompanySummary) {
        const popup = window.open('', '_blank');
        if (!popup) {
            toast.error('El navegador bloqueó la ventana de impresión');
            return;
        }

        const rowsHtml = group.members.map((member) => {
            const totalArsMember = Number(member.liquidacion?.total_ars || 0).toFixed(2);
            const totalUsdMember = Number(member.liquidacion?.total_usd || 0).toFixed(2);
            return `
                <tr>
                    <td>${escapeHtml(`${member.nombre} ${member.apellido || ''}`.trim())}</td>
                    <td>${escapeHtml(member.area || '')}</td>
                    <td>${escapeHtml(roleLabel(member.app_role))}</td>
                    <td>${escapeHtml(getEstadoEmpresaMember(member))}</td>
                    <td style="text-align:right;">${totalArsMember}</td>
                    <td style="text-align:right;">${totalUsdMember}</td>
                </tr>
            `;
        }).join('');

        popup.document.write(`
            <html>
                <head>
                    <title>Liquidación empresa - ${escapeHtml(group.empresaNombre)}</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
                        h1 { margin: 0 0 6px 0; font-size: 20px; }
                        .meta { margin: 0 0 14px 0; color: #555; font-size: 12px; }
                        .kpi { margin: 0 0 16px 0; font-size: 12px; }
                        table { width: 100%; border-collapse: collapse; }
                        th, td { border: 1px solid #ddd; padding: 6px; font-size: 11px; text-align: left; }
                        th { background: #f5f5f5; }
                    </style>
                </head>
                <body>
                    <h1>Liquidación agrupada por empresa</h1>
                    <p class="meta">Empresa: ${escapeHtml(group.empresaNombre)} · Período: ${escapeHtml(mesLabel(mes))}</p>
                    <p class="kpi">Miembros: ${group.members.length} · Total ARS: ${group.totalArs.toLocaleString('es-AR', { maximumFractionDigits: 2 })} · Total USD: ${group.totalUsd.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Prestador</th>
                                <th>Área</th>
                                <th>Rol app</th>
                                <th>Estado</th>
                                <th>Total ARS</th>
                                <th>Total USD</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </body>
            </html>
        `);

        popup.document.close();
        popup.focus();
        setTimeout(() => popup.print(), 200);
    }

    async function handleApprove(liqId: string) {
        try {
            await approveLiquidacion(liqId);
            toast.success('Liquidación aprobada');
            load();
        } catch {
            toast.error('Error al aprobar');
        }
    }

    async function handlePay(liqId: string, date: string) {
        try {
            await markLiquidacionPaid(liqId, date);
            toast.success('Liquidación marcada como pagada');
            setPayModal(null);
            load();
        } catch {
            toast.error('Error al registrar pago');
        }
    }

    async function handleReject(liqId: string) {
        const motivo = window.prompt('Motivo del rechazo (opcional):') ?? undefined;
        try {
            await rejectLiquidacion(liqId, motivo);
            toast.success('Liquidación rechazada');
            load();
        } catch {
            toast.error('Error al rechazar');
        }
    }

    async function handleManualEdit(input: UpdateLiquidacionManualInput) {
        setSavingEdit(true);
        try {
            await updateLiquidacionManual(input);
            toast.success('Liquidación actualizada');
            setEditing(null);
            load();
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'No se pudo guardar la edición');
        } finally {
            setSavingEdit(false);
        }
    }

    async function openDetalleHoras(row: LiquidacionAdminRow) {
        setDetalleHorasTarget(row);
        setDetalleHorasRows([]);
        setDetalleHorasLoading(true);
        try {
            const registros = await getRegistrosHorasMes(mes, row.personal_id);
            setDetalleHorasRows(registros);
        } catch {
            toast.error('No se pudo cargar el detalle de horas');
        } finally {
            setDetalleHorasLoading(false);
        }
    }

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-slate-950 text-white p-6">
            {payModal && (
                <PayDateModal
                    onConfirm={(d) => handlePay(payModal, d)}
                    onClose={() => setPayModal(null)}
                />
            )}

            {editing && (
                <EditLiquidacionModal
                    row={editing.row}
                    liq={editing.liq}
                    onClose={() => setEditing(null)}
                    onSave={handleManualEdit}
                    saving={savingEdit}
                />
            )}

            {detalleHorasTarget && (
                <HorasDetalleModal
                    worker={detalleHorasTarget}
                    mes={mes}
                    rows={detalleHorasRows}
                    loading={detalleHorasLoading}
                    onClose={() => setDetalleHorasTarget(null)}
                />
            )}

            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/20">
                        <Wallet size={22} className="text-violet-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold text-white">Liquidaciones</h1>
                        <p className="text-xs text-slate-400">Gestión de pagos al equipo</p>
                    </div>
                </div>

                {tab === 'liquidaciones' && (
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                        <button onClick={() => setMes(prevMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-medium text-white min-w-[80px] text-center">{mesLabel(mes)}</span>
                        <button onClick={() => setMes(nextMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-5">
                <button
                    onClick={() => setTab('liquidaciones')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === 'liquidaciones' ? 'bg-violet-600 border-violet-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <Wallet size={14} />
                    Liquidaciones
                </button>
                <button
                    onClick={() => setTab('prosoft')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === 'prosoft' ? 'bg-teal-600 border-teal-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <FileSpreadsheet size={14} />
                    Importar Prosoft
                </button>
                <button
                    onClick={() => setTab('prestaciones')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === 'prestaciones' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <ListChecks size={14} />
                    Prestaciones
                </button>
                <button
                    onClick={() => setTab('horas')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${tab === 'horas' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'}`}
                >
                    <Clock size={14} />
                    Horas (No profesionales)
                </button>
            </div>

            {tab === 'prosoft' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <ProsoftImporter />
                </div>
            )}

            {tab === 'prestaciones' && (
                <TarifarioView items={prestacionesCatalogo} />
            )}

            {tab === 'horas' && (
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                    <RegistroHorasDashboard />
                </div>
            )}

            {tab === 'liquidaciones' && <>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <TrendingUp size={14} className="text-violet-400" />
                            <span className="text-xs text-slate-400">Total nómina</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold text-white truncate" title={formatARS(totalArs)}>{formatARS(totalArs)}</p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <DollarSign size={14} className="text-emerald-400" />
                            <span className="text-xs text-slate-400">TC BNA Venta</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold text-white truncate">
                            {tcBna ? `$${Number(tcBna).toLocaleString('es-AR')}` : '—'}
                        </p>
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <Users size={14} className="text-blue-400" />
                            <span className="text-xs text-slate-400">Generadas / Total</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold text-white truncate">{conLiq} / {rows.length}</p>
                        {sinLiq > 0 && (
                            <p className="text-xs text-amber-400 mt-0.5">{sinLiq} sin generar</p>
                        )}
                    </div>

                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-1">
                            <AlertTriangle size={14} className="text-amber-400" />
                            <span className="text-xs text-slate-400">Con alertas</span>
                        </div>
                        <p className="text-xl sm:text-2xl font-bold text-white truncate">{withPendSlides}</p>
                        {pendientes > 0 && (
                            <p className="text-xs text-amber-400 mt-0.5">{pendientes} pendientes de aprobación</p>
                        )}
                    </div>
                </div>

                {/* Search + Filter tabs */}
                <div className="mb-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1 max-w-md">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar por nombre o área..."
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500"
                            />
                        </div>
                        <button
                            onClick={load}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
                        >
                            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                            Actualizar
                        </button>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        {([
                            ['all', 'Todos', rows.length],
                            ['sin_generar', 'Sin generar', sinLiq],
                            ['pending', 'Pendiente', pendientes],
                            ['approved', 'Aprobada', rows.filter(r => r.liquidacion?.estado === 'approved').length],
                            ['paid', 'Pagada', rows.filter(r => r.liquidacion?.estado === 'paid').length],
                        ] as const).map(([val, label, count]) => (
                            <button
                                key={val}
                                onClick={() => setFilter(val as typeof filter)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${filter === val
                                    ? 'bg-violet-600 border-violet-500 text-white'
                                    : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                    }`}
                            >
                                {label} ({count})
                            </button>
                        ))}
                        <span className="ml-auto text-xs text-slate-500 self-center">
                            {viewMode === 'empresa' ? filteredCompanySummaries.length : filteredRows.length} resultados
                        </span>
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode('individual')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${viewMode === 'individual'
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                }`}
                        >
                            Vista individual
                        </button>
                        <button
                            onClick={() => setViewMode('empresa')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${viewMode === 'empresa'
                                ? 'bg-indigo-600 border-indigo-500 text-white'
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                                }`}
                        >
                            Vista por empresa
                        </button>
                    </div>

                    {viewMode === 'individual' && (
                        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="text-xs text-slate-400">
                                    Acciones rápidas (vista actual):
                                    <span className="ml-2 text-slate-300">{quickTargetsGenerate.length} sin generar</span>
                                    <span className="ml-2 text-amber-300">{quickTargetsApprove.length} pendientes</span>
                                    <span className="ml-2 text-emerald-300">{quickTargetsPay.length} aprobadas</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        onClick={handleQuickGenerateVisible}
                                        disabled={Boolean(quickActionBusy) || quickTargetsGenerate.length === 0}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs"
                                    >
                                        {quickActionBusy === 'generate' ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                                        Generar visibles
                                    </button>
                                    <button
                                        onClick={handleQuickApproveVisible}
                                        disabled={Boolean(quickActionBusy) || quickTargetsApprove.length === 0}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-xs"
                                    >
                                        {quickActionBusy === 'approve' ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                        Aprobar visibles
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (quickTargetsApproveClean.length === 0) {
                                                toast.info('No hay pendientes limpias para aprobar en la vista actual.');
                                                return;
                                            }

                                            setQuickActionBusy('approve-clean');
                                            let ok = 0;
                                            let fail = 0;

                                            for (const row of quickTargetsApproveClean) {
                                                if (!row.liquidacion) continue;
                                                try {
                                                    await approveLiquidacion(row.liquidacion.id);
                                                    ok += 1;
                                                } catch {
                                                    fail += 1;
                                                }
                                            }

                                            setQuickActionBusy(null);
                                            await load();
                                            toast.success(`Aprobación limpia finalizada: ${ok} ok${fail ? `, ${fail} con error` : ''}.`);
                                        }}
                                        disabled={Boolean(quickActionBusy) || quickTargetsApproveClean.length === 0}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-emerald-100 text-xs"
                                    >
                                        {quickActionBusy === 'approve-clean' ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                                        Aprobar limpias
                                    </button>
                                    <button
                                        onClick={handleQuickPayVisible}
                                        disabled={Boolean(quickActionBusy) || quickTargetsPay.length === 0}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs"
                                    >
                                        {quickActionBusy === 'pay' ? <RefreshCw size={11} className="animate-spin" /> : <Banknote size={11} />}
                                        Pagar visibles
                                    </button>
                                    <a
                                        href="/caja-admin?tab=personal&subtab=profesionales"
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:text-white text-xs"
                                    >
                                        <FileSpreadsheet size={11} />
                                        Cargar prestación
                                    </a>
                                    <button
                                        onClick={handleCloseMonthAssisted}
                                        disabled={Boolean(quickActionBusy)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium"
                                    >
                                        {quickActionBusy === 'close' ? <RefreshCw size={11} className="animate-spin" /> : <Wallet size={11} />}
                                        Cierre asistido
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                                <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-2">
                                    <p className="text-[11px] text-slate-400">Sin generar</p>
                                    <p className="text-sm font-semibold text-white">{pipelineCounts.sinGenerar}</p>
                                </div>
                                <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-2">
                                    <p className="text-[11px] text-amber-300/80">Pendiente</p>
                                    <p className="text-sm font-semibold text-amber-300">{pipelineCounts.pendiente}</p>
                                </div>
                                <div className="rounded-lg border border-emerald-800/50 bg-emerald-950/20 p-2">
                                    <p className="text-[11px] text-emerald-300/80">Aprobada</p>
                                    <p className="text-sm font-semibold text-emerald-300">{pipelineCounts.aprobada}</p>
                                </div>
                                <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-2">
                                    <p className="text-[11px] text-blue-300/80">Pagada</p>
                                    <p className="text-sm font-semibold text-blue-300">{pipelineCounts.pagada}</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Table */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-slate-500">
                            <RefreshCw size={20} className="animate-spin mr-2" />
                            Cargando...
                        </div>
                    ) : viewMode === 'empresa' ? (
                        filteredCompanySummaries.length === 0 ? (
                            <div className="text-center py-16 text-slate-500 text-sm">
                                No hay empresas prestadoras que coincidan con el filtro.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-800">
                                            <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Empresa</th>
                                            <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Miembros</th>
                                            <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Total</th>
                                            <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Estado</th>
                                            <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {filteredCompanySummaries.map((group) => {
                                            const allPaid = group.paid === group.members.length && group.members.length > 0;
                                            const allGenerated = group.generated === group.members.length && group.members.length > 0;
                                            const companyGenerating = generatingCompany === group.empresaId;
                                            const isUnassignedGroup = group.empresaId === '__sin_empresa__';

                                            return (
                                                <tr key={group.empresaId} className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-4 py-3">
                                                        <p className="font-medium text-white text-xs">{group.empresaNombre}</p>
                                                        <p className="text-xs text-slate-500 mt-1">{group.members.length} personas vinculadas</p>
                                                        {isUnassignedGroup && (
                                                            <p className="text-[11px] text-amber-400 mt-1">
                                                                Tip: asignales empresa desde Staff para liquidación agrupada real.
                                                            </p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <p className="text-xs text-slate-300">
                                                            {group.members.map((m) => `${m.nombre} ${m.apellido || ''}`.trim()).join(', ')}
                                                        </p>
                                                    </td>
                                                    <td className="px-4 py-3 text-right">
                                                        <p className="font-semibold text-white">{formatARS(group.totalArs)}</p>
                                                        {group.totalUsd > 0 && (
                                                            <p className="text-xs text-slate-400">{formatUSD(group.totalUsd)}</p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        {allPaid ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-blue-500/10 text-blue-400 border-blue-500/30">
                                                                <Banknote size={12} /> Pagada
                                                            </span>
                                                        ) : allGenerated ? (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                                <CheckCircle2 size={12} /> Generada
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-amber-500/10 text-amber-400 border-amber-500/30">
                                                                <Clock size={12} /> Pendiente
                                                            </span>
                                                        )}
                                                        {group.without > 0 && (
                                                            <p className="text-[11px] text-amber-400 mt-1">{group.without} sin generar</p>
                                                        )}
                                                        {group.hasAlerts && (
                                                            <p className="text-[11px] text-amber-400 mt-1">Con alertas de slides</p>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-center gap-2 flex-wrap">
                                                            <button
                                                                onClick={() => handleGenerateCompany(group.empresaId)}
                                                                disabled={companyGenerating || isUnassignedGroup}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
                                                            >
                                                                {companyGenerating ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                                                                Generar grupo
                                                            </button>
                                                            {allGenerated && !allPaid && !isUnassignedGroup && (
                                                                <button
                                                                    onClick={() => handleMarkCompanyPaid(group.empresaId)}
                                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition-colors"
                                                                >
                                                                    <Banknote size={11} />
                                                                    Marcar pagada
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => handleExportCompanyExcel(group)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition-colors"
                                                            >
                                                                <Download size={11} />
                                                                Excel
                                                            </button>
                                                            <button
                                                                onClick={() => handleExportCompanyPdf(group)}
                                                                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-xs transition-colors"
                                                            >
                                                                <Printer size={11} />
                                                                PDF
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )
                    ) : filteredRows.length === 0 ? (
                        <div className="text-center py-16 text-slate-500 text-sm">
                            No hay liquidaciones que coincidan con el filtro.
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-slate-800">
                                        <th className="w-10 px-2 py-3" />
                                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Prestador</th>
                                        <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Modelo</th>
                                        <th className="text-right px-4 py-3 text-xs text-slate-400 font-medium">Monto</th>
                                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Estado</th>
                                        <th className="text-center px-4 py-3 text-xs text-slate-400 font-medium">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {filteredRows.map(row => {
                                        const liq = row.liquidacion;
                                        const estadoCfg = liq ? ESTADO_CONFIG[liq.estado] : null;
                                        const isGenerating = generating === row.personal_id;
                                        const isExpanded = expandedRow === row.personal_id;
                                        const modeloPagoActual = liq?.modelo_pago || row.modelo_pago;
                                        const breakdown = (liq?.breakdown || {}) as Record<string, unknown>;
                                        const manualOverride =
                                            breakdown.manual_override && typeof breakdown.manual_override === 'object'
                                                ? breakdown.manual_override as Record<string, unknown>
                                                : null;

                                        return (
                                            <Fragment key={row.personal_id}>
                                                <tr className="hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-2 py-3 text-center">
                                                        {liq ? (
                                                            <button
                                                                onClick={() => setExpandedRow(isExpanded ? null : row.personal_id)}
                                                                className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-slate-700 text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
                                                                title={isExpanded ? 'Ocultar detalle' : 'Ver detalle'}
                                                            >
                                                                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                            </button>
                                                        ) : (
                                                            <span className="text-slate-700">•</span>
                                                        )}
                                                    </td>

                                                    {/* Prestador */}
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-3">
                                                            {row.foto_url ? (
                                                                // eslint-disable-next-line @next/next/no-img-element
                                                                <img src={row.foto_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                                            ) : (
                                                                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                                                    {row.nombre[0]}{row.apellido?.[0] || ''}
                                                                </div>
                                                            )}
                                                            <div>
                                                                <p className="font-medium text-white text-xs">
                                                                    {row.nombre} {row.apellido}
                                                                </p>
                                                                <p className="text-xs text-slate-500">
                                                                    {row.app_role ? roleLabel(row.app_role) : (row.area || '—')}
                                                                    {row.app_role && row.area ? ` · ${row.area}` : ''}
                                                                </p>
                                                                {row.empresa_prestadora_nombre && (
                                                                    <p className="text-[11px] text-amber-400">
                                                                        Empresa: {row.empresa_prestadora_nombre}
                                                                    </p>
                                                                )}
                                                                <button
                                                                    onClick={() => openDetalleHoras(row)}
                                                                    className="text-[11px] text-violet-300 hover:text-violet-200 mt-0.5 transition-colors"
                                                                >
                                                                    Ver horarios del mes
                                                                </button>
                                                            </div>
                                                            {row.tiene_pendientes && (
                                                                <div title="Prestaciones sin Slides" className="ml-1">
                                                                    <FileVideo size={14} className="text-amber-400" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>

                                                    {/* Modelo */}
                                                    <td className="px-4 py-3">
                                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${modeloPagoActual === 'prestacion_usd'
                                                            ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                                                            : 'bg-teal-500/10 text-teal-300 border-teal-500/20'
                                                            }`}>
                                                            {modeloPagoActual === 'prestacion_usd' ? '$ USD/prestación' : '⏱ ARS/hora'}
                                                        </span>
                                                    </td>

                                                    {/* Monto */}
                                                    <td className="px-4 py-3 text-right">
                                                        {liq ? (
                                                            <div>
                                                                <p className="font-semibold text-white">{formatARS(Number(liq.total_ars || 0))}</p>
                                                                {liq.total_usd && (
                                                                    <p className="text-xs text-slate-400">{formatUSD(Number(liq.total_usd))}</p>
                                                                )}
                                                                {manualOverride && (
                                                                    <p className="text-[10px] text-violet-300">ajuste manual</p>
                                                                )}
                                                                {liq.prestaciones_pendientes > 0 && (
                                                                    <p className="text-xs text-amber-400">
                                                                        +{liq.prestaciones_pendientes} sin slides
                                                                    </p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-600 text-xs">—</span>
                                                        )}
                                                    </td>

                                                    {/* Estado */}
                                                    <td className="px-4 py-3 text-center">
                                                        {estadoCfg ? (
                                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border ${estadoCfg.cls}`}>
                                                                {estadoCfg.icon}
                                                                {estadoCfg.label}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600 text-xs">Sin liquidar</span>
                                                        )}
                                                    </td>

                                                    {/* Acciones */}
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                                                            {!liq && (
                                                                <button
                                                                    onClick={() => handleGenerate(row.personal_id)}
                                                                    disabled={isGenerating}
                                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white rounded-lg text-xs transition-colors"
                                                                >
                                                                    {isGenerating
                                                                        ? <RefreshCw size={11} className="animate-spin" />
                                                                        : <Play size={11} />
                                                                    }
                                                                    Generar
                                                                </button>
                                                            )}

                                                            {liq?.estado === 'pending' && (
                                                                <>
                                                                    <button
                                                                        onClick={() => handleGenerate(row.personal_id)}
                                                                        disabled={isGenerating}
                                                                        className="flex items-center gap-1 px-2 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 rounded-lg text-xs transition-colors"
                                                                        title="Recalcular"
                                                                    >
                                                                        <RefreshCw size={11} className={isGenerating ? 'animate-spin' : ''} />
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleApprove(liq.id)}
                                                                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs transition-colors"
                                                                    >
                                                                        <CheckCircle2 size={11} />
                                                                        Aprobar
                                                                    </button>
                                                                    <button
                                                                        onClick={() => handleReject(liq.id)}
                                                                        className="px-2 py-1.5 text-red-400 hover:text-red-300 text-xs transition-colors"
                                                                        title="Rechazar"
                                                                    >
                                                                        <XCircle size={14} />
                                                                    </button>
                                                                </>
                                                            )}

                                                            {liq?.estado === 'approved' && (
                                                                <button
                                                                    onClick={() => setPayModal(liq.id)}
                                                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs transition-colors"
                                                                >
                                                                    <Banknote size={11} />
                                                                    Marcar pagada
                                                                </button>
                                                            )}

                                                            {liq && (
                                                                <button
                                                                    onClick={() => setEditing({ row, liq })}
                                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-violet-700/70 hover:bg-violet-700 text-white rounded-lg text-xs transition-colors"
                                                                >
                                                                    <PencilLine size={11} />
                                                                    Editar
                                                                </button>
                                                            )}

                                                            {liq?.estado === 'paid' && (
                                                                <span className="text-xs text-slate-500">
                                                                    {liq.fecha_pago
                                                                        ? new Date(liq.fecha_pago).toLocaleDateString('es-AR')
                                                                        : 'Pagada'}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>

                                                {liq && isExpanded && (
                                                    <tr className="bg-slate-950/60">
                                                        <td colSpan={6} className="px-4 py-3">
                                                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                                                                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">TC</p>
                                                                    <p className="text-sm text-white font-semibold">{Number(liq.tc_liquidacion || 0).toLocaleString('es-AR')}</p>
                                                                </div>
                                                                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Precio</p>
                                                                    <p className="text-sm text-white font-semibold">
                                                                        {manualOverride?.moneda === 'USD' ? 'USD' : 'ARS'} {Number(manualOverride?.precio_unitario || liq.valor_hora_snapshot || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                                                                    </p>
                                                                </div>
                                                                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Cantidad</p>
                                                                    <p className="text-sm text-white font-semibold">{Number(manualOverride?.cantidad || liq.total_horas || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</p>
                                                                </div>
                                                                <div className="rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2">
                                                                    <p className="text-[10px] uppercase tracking-widest text-slate-500">Observaciones</p>
                                                                    <p className="text-sm text-slate-200 truncate">{liq.observaciones || 'Sin notas'}</p>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* Legend */}
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                        <FileVideo size={12} className="text-amber-400" />
                        Prestaciones sin link de Google Slides (no se incluyen en el cálculo)
                    </span>
                </div>

            </>}
        </div>
    );
}
