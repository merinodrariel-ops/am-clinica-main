import { getCurrentWorkerProfile, getAllGoals, getGoalProgress, getWorkerXP } from '@/app/actions/worker-portal';
import { Target, CheckCircle2, Lock, Zap, ShieldCheck, CalendarDays, TrendingUp, Heart } from 'lucide-react';

const categoryMeta: Record<string, { label: string; icon: any; color: string }> = {
    compliance: { label: 'Cumplimiento', icon: ShieldCheck, color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
    attendance: { label: 'Asistencia', icon: CalendarDays, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    performance: { label: 'Rendimiento', icon: TrendingUp, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
    growth: { label: 'Crecimiento', icon: Heart, color: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
    financial: { label: 'Financiero', icon: TrendingUp, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
    loyalty: { label: 'Lealtad', icon: Heart, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
    general: { label: 'General', icon: Target, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

export default async function GoalsPage() {
    const worker = await getCurrentWorkerProfile();
    if (!worker) return <div className="p-12 text-center text-slate-500">Perfil no encontrado.</div>;

    const [goals, progressList, totalXP] = await Promise.all([
        getAllGoals(worker.categoria),
        getGoalProgress(worker.id),
        getWorkerXP(worker.id),
    ]);

    const progressMap = new Map(progressList.map(p => [p.goal_id, p]));

    const completedGoals = progressList.filter(p => p.completed).length;
    const totalGoals = goals.length;

    // Group goals by category
    const grouped = goals.reduce<Record<string, typeof goals>>((acc, goal) => {
        const cat = goal.category || 'general';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(goal);
        return acc;
    }, {});

    return (
        <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-16">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800/50 pb-8">
                <div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">Objetivos</h1>
                    <p className="text-slate-400 mt-2 font-medium">Tus metas profesionales y de cumplimiento en la clínica.</p>
                </div>
                <div className="flex items-center gap-4 bg-slate-900/50 px-6 py-3 rounded-2xl border border-slate-800">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">XP Total</p>
                        <p className="text-2xl font-black text-white">{totalXP.toLocaleString()}</p>
                    </div>
                    <div className="w-10 h-10 bg-indigo-500/10 rounded-full flex items-center justify-center border border-indigo-500/20">
                        <Zap className="text-indigo-400" size={20} />
                    </div>
                </div>
            </div>

            {/* Global Progress */}
            <div className="bg-slate-900/40 border border-slate-800/60 rounded-3xl p-6 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-slate-300">Progreso Global</span>
                    <span className="text-sm font-mono text-indigo-400 font-bold">
                        {completedGoals} / {totalGoals} completados
                    </span>
                </div>
                <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-indigo-500 to-cyan-500 rounded-full transition-all duration-1000"
                        style={{ width: `${totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0}%` }}
                    />
                </div>
                <p className="text-[10px] text-slate-500 mt-2 text-right font-medium">
                    {totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0}% completado
                </p>
            </div>

            {/* Goals by Category */}
            {Object.entries(grouped).map(([category, catGoals]) => {
                const meta = categoryMeta[category] || categoryMeta.general;
                const Icon = meta.icon;

                return (
                    <div key={category}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-wider ${meta.color}`}>
                                <Icon size={14} />
                                {meta.label}
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {catGoals.map(goal => {
                                const progress = progressMap.get(goal.id);
                                const currentVal = progress?.current_value ?? 0;
                                const isCompleted = progress?.completed ?? false;
                                const pct = Math.min(100, (currentVal / goal.target_value) * 100);

                                return (
                                    <div
                                        key={goal.id}
                                        className={`relative rounded-2xl border p-6 transition-all ${isCompleted
                                            ? 'bg-emerald-500/5 border-emerald-500/20'
                                            : 'bg-slate-900/40 border-slate-800/60 hover:border-slate-700'
                                            }`}
                                    >
                                        {isCompleted && (
                                            <div className="absolute top-4 right-4">
                                                <CheckCircle2 size={20} className="text-emerald-500" />
                                            </div>
                                        )}

                                        <div className="flex items-start gap-4">
                                            <div className="text-3xl flex-shrink-0">{goal.icon}</div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className={`font-bold text-base ${isCompleted ? 'text-emerald-300' : 'text-white'}`}>
                                                    {goal.title}
                                                </h3>
                                                <p className="text-slate-500 text-sm mt-0.5">{goal.description}</p>

                                                <div className="mt-4 space-y-2">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500 font-medium">
                                                            {currentVal.toLocaleString()} / {goal.target_value.toLocaleString()} {goal.unit}
                                                        </span>
                                                        <span className="text-indigo-400 font-bold">+{goal.xp_reward} XP</span>
                                                    </div>
                                                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-700 ${isCompleted
                                                                ? 'bg-emerald-500'
                                                                : 'bg-indigo-500'
                                                                }`}
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </div>

                                                {isCompleted && progress?.completed_at && (
                                                    <p className="text-[10px] text-emerald-500/70 mt-2 font-medium">
                                                        Completado: {new Date(progress.completed_at).toLocaleDateString('es-AR')}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}

            {goals.length === 0 && (
                <div className="text-center py-24 border border-dashed border-slate-800 rounded-3xl">
                    <Target size={40} className="mx-auto text-slate-700 mb-4" />
                    <p className="text-slate-500 font-medium">No hay objetivos disponibles para tu rol.</p>
                </div>
            )}
        </div>
    );
}
