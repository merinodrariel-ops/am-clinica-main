import { Card } from "@/components/ui/Card";
import { getCurrentWorkerProfile, getWorkerMonthlyStats, getWorkerAchievements } from "@/app/actions/worker-portal";
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

    // Fallback if no worker profile found (e.g. admin viewing without a worker profile)
    // In real app, we might redirect to onboarding
    if (!worker) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <h2 className="text-2xl font-bold text-slate-100">Welcome to AM Portal</h2>
                <p className="text-slate-400 mt-2">No worker profile found for your account.</p>
                <Link href="/portal/profile" className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-md">
                    Create Profile
                </Link>
            </div>
        );
    }

    const today = new Date();
    const stats = await getWorkerMonthlyStats(worker.id, today.getMonth() + 1, today.getFullYear());
    const badges = await getWorkerAchievements(worker.id);

    return (
        <div className="space-y-8">
            {/* Greeting */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        Hello, {worker.full_name.split(' ')[0]}
                    </h1>
                    <p className="text-slate-400 mt-1">Here is your performance for {today.toLocaleString('default', { month: 'long' })}.</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-indigo-400 uppercase tracking-wider">
                        {worker.role}
                    </span>
                    <span className={`px-3 py-1 rounded-full border text-xs font-mono uppercase tracking-wider ${worker.status === 'active' ? 'bg-emerald-950/30 border-emerald-800 text-emerald-400' : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}>
                        {worker.status}
                    </span>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatsCard
                    title="Estimated Earnings"
                    value={`$${stats.total_earnings.toLocaleString()}`}
                    subtitle="This Month"
                    icon={<DollarSign className="text-emerald-400" size={24} />}
                    trend="+12% from last month"
                />
                <StatsCard
                    title="Hours Logged"
                    value={`${stats.hours_worked}h`}
                    subtitle="Billable Time"
                    icon={<Clock className="text-blue-400" size={24} />}
                />
                <StatsCard
                    title="Completed Tasks"
                    value={stats.tasks_completed.toString()}
                    subtitle="Procedures & Shifts"
                    icon={<TrendingUp className="text-violet-400" size={24} />}
                />
            </div>

            {/* Main Content Split */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Recent Activity & Charts */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
                        <h3 className="text-lg font-semibold text-slate-200 mb-4">Performance Trend</h3>
                        <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/30">
                            <p className="text-slate-500 text-sm">Chart Placeholder (Recharts)</p>
                        </div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
                        <h3 className="text-lg font-semibold text-slate-200 mb-4">Recent Logs</h3>
                        <div className="space-y-3">
                            {/* Placeholder items */}
                            {[1, 2, 3].map((_, i) => (
                                <div key={i} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-800/50 transition-colors border border-transparent hover:border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                                            <Calendar size={18} />
                                        </div>
                                        <div>
                                            <p className="text-slate-200 font-medium">Shift - Morning</p>
                                            <p className="text-xs text-slate-500">Today, 09:00 - 13:00</p>
                                        </div>
                                    </div>
                                    <span className="text-slate-400 text-sm font-mono">4h</span>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
                            <Link href="/portal/earnings" className="text-sm text-indigo-400 hover:text-indigo-300">View All History</Link>
                        </div>
                    </div>
                </div>

                {/* Right Column: Badges & Next Steps */}
                <div className="space-y-6">
                    {/* Badges */}
                    <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 bg-indigo-500/10 rounded-full blur-2xl group-hover:bg-indigo-500/20 transition-all"></div>

                        <div className="flex items-center justify-between mb-4 relative z-10">
                            <h3 className="text-lg font-semibold text-slate-200">Achievements</h3>
                            <Award className="text-amber-400" size={20} />
                        </div>

                        <div className="grid grid-cols-3 gap-2 relative z-10">
                            {badges.length > 0 ? badges.map(b => (
                                <div key={b.id} className="aspect-square rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col items-center justify-center p-2 text-center hover:scale-105 transition-transform cursor-pointer" title={b.achievement?.name}>
                                    <span className="text-2xl">🏆</span>
                                    <span className="text-[10px] text-slate-400 mt-1 line-clamp-1">{b.achievement?.name}</span>
                                </div>
                            )) : (
                                <div className="col-span-3 py-4 text-center text-sm text-slate-500 bg-slate-900/50 rounded-lg">
                                    No badges yet. Keep working!
                                </div>
                            )}
                            {/* Empty Slots */}
                            {Array.from({ length: Math.max(0, 6 - badges.length) }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square rounded-xl bg-slate-900/30 border border-slate-800/50 flex items-center justify-center">
                                    <div className="w-8 h-8 rounded-full bg-slate-800/50"></div>
                                </div>
                            ))}
                        </div>
                        <button className="mt-4 w-full py-2 text-xs font-medium text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-800 rounded-lg transition-colors relative z-10">
                            View Collection
                        </button>
                    </div>

                    {/* Quick Actions */}
                    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
                        <h3 className="text-lg font-semibold text-slate-200 mb-4">Quick Actions</h3>
                        <div className="space-y-2">
                            <button className="w-full text-left px-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 font-medium">
                                Start Shift
                            </button>
                            <button className="w-full text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all font-medium border border-slate-700">
                                Log Procedure
                            </button>
                            <Link href="/portal/profile" className="block w-full text-left px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-all font-medium border border-slate-700">
                                Edit Profile
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
