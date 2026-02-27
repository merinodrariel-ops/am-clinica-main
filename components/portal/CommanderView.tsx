import { getLiquidacionesAdmin } from '@/app/actions/liquidaciones';
import MonthlyLeaderboard from './MonthlyLeaderboard';
import {
    Trophy, Wallet, AlertTriangle, ArrowRight, TrendingUp,
    FileVideo, Clock, CheckCircle2, Banknote, Users,
} from 'lucide-react';
import Link from 'next/link';

function formatARS(n: number) {
    return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

const ESTADO_CONFIG: Record<string, { icon: React.ReactNode; cls: string; label: string }> = {
    pending:  { label: 'Pendiente', icon: <Clock size={10} />, cls: 'bg-amber-500/10 text-amber-400' },
    approved: { label: 'Aprobada',  icon: <CheckCircle2 size={10} />, cls: 'bg-emerald-500/10 text-emerald-400' },
    paid:     { label: 'Pagada',    icon: <Banknote size={10} />, cls: 'bg-blue-500/10 text-blue-400' },
    rejected: { label: 'Rechazada', icon: null, cls: 'bg-red-500/10 text-red-400' },
};

export default async function CommanderView() {
    const now = new Date();
    const mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const mesLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    const rows = await getLiquidacionesAdmin(mes);

    const totalArs = rows.reduce((s, r) => s + Number(r.liquidacion?.total_ars || 0), 0);
    const pendientes = rows.filter(r => r.liquidacion?.estado === 'pending').length;
    const pagadas = rows.filter(r => r.liquidacion?.estado === 'paid').length;
    const sinGenerar = rows.filter(r => !r.liquidacion).length;
    const conSlidesPendientes = rows.filter(r => r.tiene_pendientes);
    const sinHorasAprobadas = rows.filter(r =>
        r.tipo !== 'profesional' && !r.liquidacion
    );

    const tcBna = rows.find(r => r.liquidacion?.tc_bna_venta)?.liquidacion?.tc_bna_venta;

    return (
        <div className="space-y-6 animate-in fade-in duration-700">

            {/* Commander Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-white tracking-tight">
                        Vista Comandante
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                        {mesLabel} · Panorama del equipo
                    </p>
                </div>
                <div className="px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-xs font-bold text-violet-300 uppercase tracking-wider">
                    Owner
                </div>
            </div>

            {/* Billetera del equipo */}
            <div className="bg-gradient-to-br from-violet-900/20 to-slate-900/60 border border-violet-500/20 rounded-3xl p-6 backdrop-blur-xl">
                <div className="flex items-center gap-2 mb-4">
                    <Wallet size={18} className="text-violet-400" />
                    <h2 className="font-bold text-white">Billetera del Equipo</h2>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Nómina proyectada</p>
                        <p className="text-2xl font-black text-white">{formatARS(totalArs)}</p>
                        {tcBna && (
                            <p className="text-xs text-slate-400 mt-0.5">TC BNA: ${Number(tcBna).toLocaleString('es-AR')}</p>
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Pendientes</p>
                        <p className="text-2xl font-black text-amber-400">{pendientes}</p>
                        <p className="text-xs text-slate-400 mt-0.5">de {rows.length} prestadores</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Pagadas</p>
                        <p className="text-2xl font-black text-emerald-400">{pagadas}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Sin liquidar</p>
                        <p className="text-2xl font-black text-slate-400">{sinGenerar}</p>
                    </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-violet-500 to-emerald-500 rounded-full"
                            style={{ width: `${rows.length > 0 ? (pagadas / rows.length) * 100 : 0}%` }}
                        />
                    </div>
                    <span className="ml-3 text-xs text-slate-400 flex-shrink-0">
                        {rows.length > 0 ? Math.round((pagadas / rows.length) * 100) : 0}% pagado
                    </span>
                </div>

                <Link
                    href="/admin/liquidaciones"
                    className="mt-4 flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors w-fit"
                >
                    Gestionar liquidaciones <ArrowRight size={12} />
                </Link>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                {/* Leaderboard */}
                <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl">
                    <div className="flex items-center gap-2 mb-4">
                        <Trophy size={18} className="text-amber-400" />
                        <h2 className="font-bold text-white">Leaderboard del Mes</h2>
                    </div>
                    <MonthlyLeaderboard limit={5} />
                </div>

                {/* Alertas de gestión */}
                <div className="space-y-4">

                    {/* Doctores sin Slides */}
                    {conSlidesPendientes.length > 0 && (
                        <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <FileVideo size={16} className="text-amber-400" />
                                <h3 className="text-sm font-bold text-amber-300">
                                    {conSlidesPendientes.length} doctor{conSlidesPendientes.length > 1 ? 'es' : ''} con prestaciones sin Slides
                                </h3>
                            </div>
                            <div className="space-y-2">
                                {conSlidesPendientes.slice(0, 4).map(r => (
                                    <div key={r.personal_id} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-300">{r.nombre} {r.apellido}</span>
                                        <span className="text-amber-400 font-medium">
                                            {r.liquidacion?.prestaciones_pendientes} sin slides
                                        </span>
                                    </div>
                                ))}
                                {conSlidesPendientes.length > 4 && (
                                    <p className="text-xs text-slate-500">+ {conSlidesPendientes.length - 4} más</p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Staff sin liquidación */}
                    {sinHorasAprobadas.length > 0 && (
                        <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Clock size={16} className="text-slate-400" />
                                <h3 className="text-sm font-bold text-slate-300">
                                    {sinHorasAprobadas.length} prestador{sinHorasAprobadas.length > 1 ? 'es' : ''} sin liquidar
                                </h3>
                            </div>
                            <div className="space-y-2">
                                {sinHorasAprobadas.slice(0, 4).map(r => (
                                    <div key={r.personal_id} className="flex items-center justify-between text-xs">
                                        <span className="text-slate-300">{r.nombre} {r.apellido}</span>
                                        <span className="text-slate-500">{r.area || 'sin área'}</span>
                                    </div>
                                ))}
                            </div>
                            <Link
                                href="/admin/liquidaciones"
                                className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                            >
                                Generar liquidaciones <ArrowRight size={10} />
                            </Link>
                        </div>
                    )}

                    {/* Situación OK */}
                    {conSlidesPendientes.length === 0 && sinHorasAprobadas.length === 0 && (
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 flex items-center gap-3">
                            <CheckCircle2 size={20} className="text-emerald-400 flex-shrink-0" />
                            <div>
                                <p className="text-sm font-bold text-emerald-300">Sin alertas pendientes</p>
                                <p className="text-xs text-slate-400">Todas las liquidaciones y documentaciones están en orden.</p>
                            </div>
                        </div>
                    )}

                    {/* Quick stats */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-900/40 border border-slate-800/40 rounded-2xl p-4 text-center">
                            <Users size={18} className="text-blue-400 mx-auto mb-1" />
                            <p className="text-xl font-bold text-white">{rows.length}</p>
                            <p className="text-xs text-slate-500">Total equipo</p>
                        </div>
                        <div className="bg-slate-900/40 border border-slate-800/40 rounded-2xl p-4 text-center">
                            <TrendingUp size={18} className="text-violet-400 mx-auto mb-1" />
                            <p className="text-xl font-bold text-white">
                                {rows.filter(r => r.tipo === 'profesional').length}
                            </p>
                            <p className="text-xs text-slate-500">Doctores activos</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
