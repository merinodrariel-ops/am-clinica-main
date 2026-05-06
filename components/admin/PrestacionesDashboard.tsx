'use client';

import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Activity, ChevronLeft, ChevronRight, RefreshCw, Download, Printer } from 'lucide-react';
import { getResumenPrestacionesMes, ResumenPrestacionesMes } from '@/app/actions/registro-horas';

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

function currentMes() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function PrestacionesDashboard() {
    const [mes, setMes] = useState(currentMes());
    const [resumen, setResumen] = useState<ResumenPrestacionesMes | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        getResumenPrestacionesMes(mes)
            .then(setResumen)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [mes]);

    function exportExcel() {
        if (!resumen) return;
        const data = resumen.prestadores.map(p => ({
            Prestador: p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre,
            Área: p.area,
            'Prestaciones': p.cantidad,
            'Honorarios (USD)': p.total_honorarios_usd,
        }));
        data.push({
            Prestador: 'TOTAL',
            Área: '',
            'Prestaciones': resumen.total_prestaciones,
            'Honorarios (USD)': resumen.total_honorarios_usd,
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, mesLabel(mes));
        XLSX.writeFile(wb, `prestaciones_${mes}.xlsx`);
    }

    function exportPdf() {
        if (!resumen) return;
        const mesL = mesLabel(mes);
        const rows = resumen.prestadores.map(p => `<tr>
            <td>${p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre}</td>
            <td>${p.area || '—'}</td>
            <td style="text-align:center">${p.cantidad}</td>
            <td style="text-align:right"><strong>USD ${p.total_honorarios_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong></td>
        </tr>`).join('');
        const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Prestaciones ${mesL}</title>
        <style>
            body{font-family:system-ui,sans-serif;font-size:12px;color:#1e293b;margin:24px}
            h1{font-size:18px;margin:0 0 4px}p.sub{color:#64748b;font-size:11px;margin:0 0 16px}
            table{width:100%;border-collapse:collapse}
            th{background:#1e293b;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
            th:nth-child(3){text-align:center}th:last-child{text-align:right}
            td{padding:5px 8px;border-bottom:1px solid #e2e8f0}
            tr:hover td{background:#f8fafc}
            tfoot td{font-weight:700;background:#f1f5f9;border-top:2px solid #334155}
            @media print{body{margin:0}}
        </style></head><body>
        <h1>Informe de Prestaciones — ${mesL}</h1>
        <p class="sub">Generado el ${new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
        <table>
            <thead><tr>
                <th>Prestador</th><th>Área</th>
                <th style="text-align:center">Prestaciones</th>
                <th style="text-align:right">Honorarios (USD)</th>
            </tr></thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>
                <td colspan="2">TOTAL</td>
                <td style="text-align:center">${resumen.total_prestaciones}</td>
                <td style="text-align:right">USD ${resumen.total_honorarios_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr></tfoot>
        </table>
        </body></html>`;
        const w = window.open('', '_blank', 'width=900,height=600');
        if (!w) return;
        w.document.write(html);
        w.document.close();
        w.print();
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-violet-500/10 rounded-xl border border-violet-500/20">
                        <Activity size={18} className="text-violet-400" />
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-white">Prestaciones por Prestador</h2>
                        <p className="text-xs text-slate-400">Honorarios y cantidad de prestaciones realizadas</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {resumen && resumen.prestadores.length > 0 && (
                        <>
                            <button
                                onClick={exportExcel}
                                title="Exportar Excel"
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-xl hover:bg-emerald-600/20 hover:border-emerald-500/50 hover:text-emerald-300 transition-colors"
                            >
                                <Download size={13} /> Excel
                            </button>
                            <button
                                onClick={exportPdf}
                                title="Exportar PDF"
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 border border-slate-700 rounded-xl hover:bg-red-600/20 hover:border-red-500/50 hover:text-red-300 transition-colors"
                            >
                                <Printer size={13} /> PDF
                            </button>
                        </>
                    )}
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2">
                        <button onClick={() => setMes(prevMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                            <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-medium text-white min-w-[80px] text-center">{mesLabel(mes)}</span>
                        <button onClick={() => setMes(nextMes(mes))} className="text-slate-400 hover:text-white transition-colors">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-500">
                    <RefreshCw size={20} className="animate-spin mr-2" /> Cargando...
                </div>
            ) : !resumen || resumen.prestadores.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    <Activity size={32} className="text-slate-700 mb-3" />
                    <p>No hay prestaciones registradas para {mesLabel(mes)}</p>
                </div>
            ) : (
                <>
                    {/* KPIs */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <p className="text-xs text-slate-400 mb-1">Total prestaciones</p>
                            <p className="text-xl font-bold text-white">{resumen.total_prestaciones}</p>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <p className="text-xs text-slate-400 mb-1">Prestadores activos</p>
                            <p className="text-xl font-bold text-white">{resumen.prestadores.length}</p>
                        </div>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <p className="text-xs text-slate-400 mb-1">Total honorarios</p>
                            <p className="text-xl font-bold text-emerald-400">
                                USD {resumen.total_honorarios_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </p>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-slate-800 text-slate-400">
                                        <th className="px-4 py-2.5 text-left font-medium">Prestador</th>
                                        <th className="px-3 py-2.5 text-left font-medium">Área</th>
                                        <th className="px-3 py-2.5 text-center font-medium">Prestaciones</th>
                                        <th className="px-3 py-2.5 text-right font-medium">Honorarios (USD)</th>
                                        <th className="px-3 py-2.5 text-right font-medium">Prom. por prestación</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {resumen.prestadores.map(p => {
                                        const prom = p.cantidad > 0
                                            ? Math.round(p.total_honorarios_usd / p.cantidad * 100) / 100
                                            : 0;
                                        return (
                                            <tr key={p.personal_id} className="hover:bg-slate-800/30 transition-colors">
                                                <td className="px-4 py-2.5 text-white font-medium">
                                                    {p.apellido ? `${p.apellido}, ${p.nombre}` : p.nombre}
                                                </td>
                                                <td className="px-3 py-2.5 text-slate-400">{p.area || '—'}</td>
                                                <td className="px-3 py-2.5 text-center text-slate-300">{p.cantidad}</td>
                                                <td className="px-3 py-2.5 text-right text-emerald-400 font-semibold">
                                                    USD {p.total_honorarios_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </td>
                                                <td className="px-3 py-2.5 text-right text-slate-400">
                                                    USD {prom.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr className="border-t-2 border-slate-700 bg-slate-800/40 font-semibold">
                                        <td className="px-4 py-2.5 text-white">TOTAL</td>
                                        <td />
                                        <td className="px-3 py-2.5 text-center text-slate-300">{resumen.total_prestaciones}</td>
                                        <td className="px-3 py-2.5 text-right text-emerald-300">
                                            USD {resumen.total_honorarios_usd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
