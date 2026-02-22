import { getCurrentWorkerProfile, getWorkerMonthlyStats, getWorkerAchievements, getWorkerLogs, getWorkerLiquidations, getAllGoals, getGoalProgress, getUserAppProfile } from "@/app/actions/worker-portal";
import {
    Users,
    Calendar,
    TrendingUp,
    Award,
    Clock,
    DollarSign,
    Target,
    Zap,
    ArrowRight,
    Stethoscope,
    Wrench,
    Building2,
    FlaskConical,
    Sparkles,
    Settings,
} from 'lucide-react';
import Link from 'next/link';

// Role-based configuration
const ROLE_CONFIG: Record<string, { icon: any; accentColor: string; description: string }> = {
    dentist: { icon: Stethoscope, accentColor: 'indigo', description: 'Panel de Prestaciones Clínicas' },
    admin: { icon: Building2, accentColor: 'violet', description: 'Panel de Administración' },
    administración: { icon: Building2, accentColor: 'violet', description: 'Panel de Administración' },
    reception: { icon: Users, accentColor: 'cyan', description: 'Panel de Recepción' },
    recepción: { icon: Users, accentColor: 'cyan', description: 'Panel de Recepción' },
    lab: { icon: FlaskConical, accentColor: 'emerald', description: 'Panel de Laboratorio' },
    laboratorio: { icon: FlaskConical, accentColor: 'emerald', description: 'Panel de Laboratorio' },
    cleaning: { icon: Sparkles, accentColor: 'sky', description: 'Panel de Limpieza' },
    limpieza: { icon: Sparkles, accentColor: 'sky', description: 'Panel de Limpieza' },
    technician: { icon: Wrench, accentColor: 'amber', description: 'Panel de Técnico' },
};

function getRoleConfig(rol: string) {
    const key = rol?.toLowerCase() || '';
    for (const [roleKey, config] of Object.entries(ROLE_CONFIG)) {
        if (key.includes(roleKey)) return config;
    }
    return { icon: Users, accentColor: 'indigo', description: 'Panel de Personal' };
}

export default async function WorkerDashboard() {
    const worker = await getCurrentWorkerProfile();

    if (!worker) {
        const userProfile = await getUserAppProfile();
        const isAdmin = ['admin', 'owner'].includes(userProfile?.role || '');

        return (
            <div className="flex flex-col items-center justify-center p-12 text-center h-[70vh]">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-700">
                    <Users className="text-slate-500" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-100">Sin Perfil Vinculado</h2>
                <p className="text-slate-400 mt-2 max-w-sm">
                    Tu cuenta no está vinculada a un perfil de personal. Contactá a Administración.
                </p>
                {isAdmin && (
                    <Link
                        href="/admin/staff"
                        className="mt-8 flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-sm font-bold transition-all shadow-lg shadow-indigo-500/20"
                    >
                        <Settings size={18} />
                        Gestionar Personal y Vincular
                    </Link>
                )}
            </div>
        );
    }

    const today = new Date();
    const roleConfig = getRoleConfig(worker.rol);
    const RoleIcon = roleConfig.icon;

    const [stats, achievements, logs, liquidations, goals, progressList] = await Promise.all([
        getWorkerMonthlyStats(worker.id, today.getMonth() + 1, today.getFullYear()),
        getWorkerAchievements(worker.id),
        getWorkerLogs(worker.id),
        getWorkerLiquidations(worker.id),
        getAllGoals(worker.rol),
        getGoalProgress(worker.id),
    ]);

    const progressMap = new Map(progressList.map(p => [p.goal_id, p]));
    const activeGoals = goals.filter(g => !progressMap.get(g.id)?.completed).slice(0, 3);
    const lastLiquidation = liquidations[0];

    const xpLevel = Math.floor(stats.total_xp / 500) + 1;
    const xpInLevel = stats.total_xp % 500;
    const xpPct = (xpInLevel / 500) * 100;

    return (
        <div className="space-y-8 animate-in fade-in duration-700">

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-12 h-12 md:w-14 md:h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                        <RoleIcon size={24} className="md:text-indigo-400" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                            Hola, {worker.nombre} 👋
                        </h1>
                        <p className="text-slate-400 mt-0.5 text-xs md:text-sm font-medium">
                            {roleConfig.description} · {today.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 self-start md:self-center">
                    <div className="px-3 py-1.5 rounded-full bg-slate-800/50 border border-slate-700/50 text-[10px] md:text-[11px] font-bold text-indigo-400 uppercase tracking-widest">
                        {worker.rol}
                    </div>
                    <div className={`w-2 h-2 md:w-2.5 md:h-2.5 rounded-full ${worker.activo !== false ? 'bg-emerald-500' : 'bg-slate-600'} shadow-[0_0_8px_rgba(16,185,129,0.5)]`} />
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    title="Horas Este Mes"
                    value={`${stats.hours_worked}h`}
                    subtitle="Registradas"
                    icon={<Clock className="text-blue-400" size={22} />}
                    colorClass="border-blue-500/20"
                />
                <StatCard
                    title="Turnos"
                    value={stats.tasks_completed.toString()}
                    subtitle="Este mes"
                    icon={<Calendar className="text-violet-400" size={22} />}
                    colorClass="border-violet-500/20"
                />
                <StatCard
                    title="Medallas"
                    value={stats.badges_earned.toString()}
                    subtitle="Ganadas"
                    icon={<Award className="text-amber-400" size={22} />}
                    colorClass="border-amber-500/20"
                />
                <StatCard
                    title="XP Total"
                    value={stats.total_xp.toLocaleString()}
                    subtitle={`Nivel ${xpLevel}`}
                    icon={<Zap className="text-indigo-400" size={22} />}
                    colorClass="border-indigo-500/20"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Left: Recent Logs */}
                <div className="lg:col-span-2 space-y-6">

                    {/* Liquidation Summary */}
                    <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900/60 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-white">
                                {lastLiquidation ? 'Última Liquidación' : 'Liquidaciones'}
                            </h3>
                            <Link href="/portal/liquidation" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                                Ver historial <ArrowRight size={12} />
                            </Link>
                        </div>

                        {lastLiquidation ? (
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                <div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Período</p>
                                    <p className="text-lg font-bold text-white">
                                        {new Date(lastLiquidation.mes + 'T12:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Total ARS</p>
                                    <p className="text-lg font-bold text-white">${lastLiquidation.total_ars?.toLocaleString() || '---'}</p>
                                </div>
                                <div>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1">Estado</p>
                                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold uppercase px-2.5 py-1 rounded-full ${lastLiquidation.estado === 'paid'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                        }`}>
                                        <span className={`w-1.5 h-1.5 rounded-full ${lastLiquidation.estado === 'paid' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        {lastLiquidation.estado}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <p className="text-slate-500 text-sm">Aún no hay liquidaciones registradas.</p>
                        )}
                    </div>

                    {/* Recent Logs */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-5">
                            <h3 className="font-bold text-white">Últimos Registros</h3>
                            <span className="text-xs text-slate-500">{logs.length} total</span>
                        </div>
                        <div className="space-y-3">
                            {logs.slice(0, 4).map(log => (
                                <div key={log.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-950/40 border border-slate-800/50 hover:border-slate-700 transition-all group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-slate-400 group-hover:bg-indigo-950/30 group-hover:text-indigo-400 transition-colors">
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <p className="text-slate-200 font-semibold text-sm">{log.type || 'Turno Registrado'}</p>
                                            <p className="text-xs text-slate-500">{new Date(log.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-slate-200 font-mono font-bold text-sm">{log.horas}h</p>
                                        <p className="text-[10px] text-emerald-500 font-bold uppercase">{log.estado}</p>
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <p className="text-center text-slate-600 py-6 italic text-sm">Sin registros recientes.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column */}
                <div className="space-y-6">

                    {/* XP Level Card */}
                    <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-4">
                            <div>
                                <p className="text-indigo-400 text-xs font-black uppercase tracking-wider">Nivel {xpLevel}</p>
                                <h3 className="text-white font-bold text-lg mt-0.5">
                                    {xpLevel <= 2 ? 'Novato' : xpLevel <= 4 ? 'Profesional' : xpLevel <= 6 ? 'Experto' : 'Maestro'}
                                </h3>
                            </div>
                            <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center border border-indigo-500/20">
                                <Zap size={22} className="text-indigo-400" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-400">{xpInLevel} / 500 XP</span>
                                <span className="text-indigo-400">{Math.round(xpPct)}%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)] transition-all duration-1000"
                                    style={{ width: `${xpPct}%` }}
                                />
                            </div>
                            <p className="text-[10px] text-slate-500 text-right">{500 - xpInLevel} XP para Nivel {xpLevel + 1}</p>
                        </div>
                    </div>

                    {/* Active Goals */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold text-white">Objetivos Activos</h3>
                            <Link href="/portal/goals" className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                                Ver todos <ArrowRight size={12} />
                            </Link>
                        </div>
                        <div className="space-y-3">
                            {activeGoals.map(goal => {
                                const prog = progressMap.get(goal.id);
                                const pct = prog ? Math.min(100, (prog.current_value / goal.target_value) * 100) : 0;
                                return (
                                    <div key={goal.id} className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{goal.icon}</span>
                                                <span className="text-xs font-bold text-slate-300 truncate">{goal.title}</span>
                                            </div>
                                            <span className="text-[10px] text-indigo-400 font-bold">+{goal.xp_reward}xp</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                            {activeGoals.length === 0 && (
                                <p className="text-center text-slate-600 text-xs py-4"><TrendingUp size={24} className="mx-auto mb-2 opacity-30" />¡Todos los objetivos completados!</p>
                            )}
                        </div>
                    </div>

                    {/* Medals Preview */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl group-hover:bg-amber-500/10 transition-all" />
                        <div className="flex items-center justify-between mb-4 relative z-10">
                            <h3 className="font-bold text-white">Medallas</h3>
                            <Award className="text-amber-400" size={20} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 relative z-10">
                            {achievements.slice(0, 6).map(wa => (
                                <div key={wa.id} className="aspect-square rounded-xl bg-slate-950/50 border border-slate-800 flex flex-col items-center justify-center p-1.5 hover:scale-105 transition-transform cursor-pointer" title={(wa.achievement as any)?.name}>
                                    <span className="text-2xl">✨</span>
                                    <span className="text-[8px] text-slate-500 font-bold uppercase truncate w-full text-center mt-0.5">{(wa.achievement as any)?.name?.split(' ')[0]}</span>
                                </div>
                            ))}
                            {achievements.length === 0 && [1, 2, 3].map(i => (
                                <div key={i} className="aspect-square rounded-xl bg-slate-950/20 border border-slate-800/30 flex items-center justify-center grayscale opacity-30">
                                    <Award size={18} className="text-slate-600" />
                                </div>
                            ))}
                        </div>
                        <Link href="/portal/medals" className="mt-4 w-full py-2 text-xs font-bold text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl transition-all relative z-10 flex items-center justify-center gap-1">
                            Ver Showcase <ArrowRight size={12} />
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatCard({ title, value, subtitle, icon, colorClass }: {
    title: string; value: string; subtitle: string; icon: React.ReactNode; colorClass: string;
}) {
    return (
        <div className={`bg-slate-900/60 border ${colorClass} p-3.5 md:p-5 rounded-2xl backdrop-blur-sm hover:bg-slate-900/80 transition-colors group`}>
            <div className="flex items-center justify-between mb-2 md:mb-3">
                <div className="p-1.5 md:p-2 bg-slate-950 rounded-lg md:rounded-xl group-hover:scale-110 transition-transform duration-300 border border-slate-800/50">
                    {icon}
                </div>
            </div>
            <div className="text-xl md:text-2xl font-black text-white tracking-tight">{value}</div>
            <p className="text-slate-500 text-[10px] md:text-xs font-medium mt-1 uppercase tracking-wider">{title}</p>
            <p className="text-slate-600 text-[9px] md:text-[10px] mt-0.5">{subtitle}</p>
        </div>
    );
}
