import { Card } from "@/components/ui/Card";
import { getCurrentWorkerProfile, getWorkerMonthlyStats, getWorkerAchievements, getWorkerLogs } from "@/app/actions/worker-portal";
import {
    Users,
    Calendar,
    TrendingUp,
    Award,
    Clock,
    DollarSign
} from 'lucide-react';
import Link from 'next/link';

export default async function WorkerDashboard() {
    const worker = await getCurrentWorkerProfile();

    if (!worker) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mb-6 border border-slate-700">
                    <Users className="text-slate-500" size={32} />
                </div>
                <h2 className="text-2xl font-bold text-slate-100">Welcome to AM Portal</h2>
                <p className="text-slate-400 mt-2 max-w-sm">
                    No worker profile found for your account. Please contact administration to link your user ID.
                </p>
                <Link href="/portal/profile" className="mt-8 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-medium">
                    View Profile
                </Link>
            </div>
        );
    }

    const today = new Date();
    const stats = await getWorkerMonthlyStats(worker.id, today.getMonth() + 1, today.getFullYear());
    const achievements = await getWorkerAchievements(worker.id);
    const logs = await getWorkerLogs(worker.id);

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Greeting */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">
                        Hello, {worker.nombre}
                    </h1>
                    <p className="text-slate-400 mt-1">Here is your performance for {today.toLocaleString('default', { month: 'long' })} {today.getFullYear()}.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex flex-col items-end">
                        <span className="px-3 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-[10px] font-mono text-indigo-400 uppercase tracking-widest">
                            {worker.rol}
                        </span>
                        {worker.especialidad && (
                            <span className="text-xs text-slate-500 mt-1">{worker.especialidad}</span>
                        )}
                    </div>
                    <div className={`w-3 h-3 rounded-full ${worker.status === 'active' || !worker.status ? 'bg-emerald-500' : 'bg-slate-600'} shadow-[0_0_8px_rgba(16,185,129,0.5)]`}></div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard
                    title="Estimated Earnings"
                    value={stats.total_earnings > 0 ? `$${stats.total_earnings.toLocaleString()}` : '---'}
                    subtitle="Pending Liquidation"
                    icon={<DollarSign className="text-emerald-400" size={24} />}
                    trend="+12% from last month"
                />
                <StatsCard
                    title="Hours Logged"
                    value={`${stats.hours_worked}h`}
                    subtitle="This Month"
                    icon={<Clock className="text-blue-400" size={24} />}
                />
                <StatsCard
                    title="Completed Tasks"
                    value={stats.tasks_completed.toString()}
                    subtitle="Confirmed Shifts"
                    icon={<TrendingUp className="text-violet-400" size={24} />}
                />
            </div>

            {/* Main Content Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Recent Activity & Charts */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-8">
                            <h3 className="text-lg font-semibold text-slate-200">Activity Overview</h3>
                            <button className="text-xs text-slate-500 hover:text-indigo-400 transition-colors">Last 7 Days</button>
                        </div>
                        <div className="h-64 flex items-center justify-center border border-slate-800/50 rounded-2xl bg-slate-950/20">
                            <p className="text-slate-600 text-sm font-medium">Visualization coming soon</p>
                        </div>
                    </div>

                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg font-semibold text-slate-200">Recent Logs</h3>
                            <Link href="/portal/liquidation" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">View All</Link>
                        </div>
                        <div className="space-y-4">
                            {logs.slice(0, 3).map((log, i) => (
                                <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-950/30 border border-slate-800/50 hover:border-slate-700 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center text-slate-400 group-hover:bg-indigo-950/30 group-hover:text-indigo-400 transition-colors">
                                            <Calendar size={20} />
                                        </div>
                                        <div>
                                            <p className="text-slate-200 font-semibold">{log.type || 'Standard Shift'}</p>
                                            <p className="text-xs text-slate-500 font-medium">{new Date(log.fecha).toLocaleDateString()}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-slate-200 font-mono font-bold">{log.horas}h</p>
                                        <p className="text-[10px] text-emerald-500 font-bold uppercase">{log.estado}</p>
                                    </div>
                                </div>
                            ))}
                            {logs.length === 0 && (
                                <p className="text-center text-slate-600 py-8 italic">No recent logs found.</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Badges & Next Steps */}
                <div className="space-y-6">
                    {/* Level Progress */}
                    <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900 border border-indigo-500/20 rounded-3xl p-8 backdrop-blur-xl">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="text-slate-200 font-bold">Level 4</h3>
                                <p className="text-indigo-400 text-xs font-bold uppercase tracking-wider">Professional</p>
                            </div>
                            <div className="w-12 h-12 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20">
                                <TrendingUp size={20} className="text-indigo-400" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between text-xs font-bold">
                                <span className="text-slate-400">XP Progress</span>
                                <span className="text-indigo-400">75%</span>
                            </div>
                            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 w-[75%] shadow-[0_0_12px_rgba(99,102,241,0.5)]"></div>
                            </div>
                            <p className="text-[10px] text-slate-500 text-center mt-2 italic">250 XP to Next Level</p>
                        </div>
                    </div>

                    {/* Badges */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mr-8 -mt-8 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl group-hover:bg-indigo-500/10 transition-all"></div>

                        <div className="flex items-center justify-between mb-6 relative z-10">
                            <h3 className="text-lg font-semibold text-slate-200">Medals</h3>
                            <Award className="text-amber-400" size={24} />
                        </div>

                        <div className="grid grid-cols-3 gap-3 relative z-10">
                            {achievements.length > 0 ? achievements.map(wa => (
                                <div key={wa.id} className="aspect-square rounded-2xl bg-slate-950/50 border border-slate-800 flex flex-col items-center justify-center p-2 text-center hover:scale-105 transition-transform cursor-pointer group/badge" title={wa.achievement?.description}>
                                    <span className="text-3xl mb-1 filter drop-shadow-lg">✨</span>
                                    <span className="text-[10px] text-slate-500 font-bold uppercase truncate w-full">{wa.achievement?.name}</span>
                                </div>
                            )) : (
                                <>
                                    <div className="aspect-square rounded-2xl bg-slate-950/20 border border-slate-800/30 flex items-center justify-center grayscale opacity-30">
                                        <Award size={24} className="text-slate-600" />
                                    </div>
                                    <div className="aspect-square rounded-2xl bg-slate-950/20 border border-slate-800/30 flex items-center justify-center grayscale opacity-30">
                                        <Award size={24} className="text-slate-600" />
                                    </div>
                                    <div className="aspect-square rounded-2xl bg-slate-950/20 border border-slate-800/30 flex items-center justify-center grayscale opacity-30">
                                        <Award size={24} className="text-slate-600" />
                                    </div>
                                </>
                            )}
                        </div>
                        <Link href="/portal/medals" className="mt-6 w-full py-3 text-xs font-bold text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800/50 rounded-xl transition-all relative z-10 flex items-center justify-center">
                            View Showcase
                        </Link>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-8 backdrop-blur-xl">
                        <h3 className="text-lg font-semibold text-slate-200 mb-6">Operations</h3>
                        <div className="space-y-3">
                            <button className="w-full flex items-center justify-between px-5 py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl transition-all shadow-xl shadow-indigo-500/20 group">
                                <span className="font-bold">Log Hours</span>
                                <Clock size={18} className="group-hover:rotate-12 transition-transform" />
                            </button>
                            <Link href="/portal/profile" className="w-full flex items-center justify-between px-5 py-4 bg-slate-800/50 hover:bg-slate-700/50 text-slate-200 rounded-2xl transition-all border border-slate-700/50 group">
                                <span className="font-bold">My Case Documents</span>
                                <Calendar size={18} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function StatsCard({ title, value, subtitle, icon, trend }: { title: string, value: string, subtitle: string, icon: React.ReactNode, trend?: string }) {
    return (
        <div className="bg-slate-900/80 border border-slate-800 p-6 rounded-2xl backdrop-blur-sm hover:border-slate-700 transition-colors group">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-slate-400 text-sm font-medium">{title}</h3>
                    <div className="mt-2 text-3xl font-bold text-white tracking-tight">{value}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl group-hover:scale-110 transition-transform duration-300 border border-slate-800/50">
                    {icon}
                </div>
            </div>
            <div className="mt-4 flex items-center justify-between">
                <p className="text-slate-500 text-xs">{subtitle}</p>
                {trend && <span className="text-emerald-400 text-xs font-medium bg-emerald-950/30 px-2 py-0.5 rounded-full border border-emerald-900/50">{trend}</span>}
            </div>
        </div>
    );
}
