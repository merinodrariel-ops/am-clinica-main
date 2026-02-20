import { getCurrentWorkerProfile, getWorkerAchievements, getWorkerXP } from '@/app/actions/worker-portal';
import { Award, Lock, CheckCircle2, Zap, ShieldCheck, CalendarDays, TrendingUp, Heart, Star } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';
import { AchievementRarity } from '@/types/worker-portal';

const RARITY_CONFIG: Record<AchievementRarity, { label: string; gradient: string; glow: string; border: string; badge: string }> = {
    common: {
        label: 'Común',
        gradient: 'from-slate-700 to-slate-800',
        glow: '',
        border: 'border-slate-700',
        badge: 'bg-slate-700/50 text-slate-400',
    },
    rare: {
        label: 'Raro',
        gradient: 'from-blue-900/40 to-indigo-900/40',
        glow: 'shadow-[0_0_20px_rgba(99,102,241,0.15)]',
        border: 'border-indigo-500/30',
        badge: 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20',
    },
    epic: {
        label: 'Épico',
        gradient: 'from-violet-900/40 to-purple-900/40',
        glow: 'shadow-[0_0_25px_rgba(139,92,246,0.2)]',
        border: 'border-violet-500/40',
        badge: 'bg-violet-500/10 text-violet-400 border border-violet-500/20',
    },
    legendary: {
        label: 'Legendario',
        gradient: 'from-amber-900/30 to-orange-900/30',
        glow: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]',
        border: 'border-amber-500/40',
        badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    },
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    admin: <ShieldCheck size={28} className="text-blue-400" />,
    compliance: <ShieldCheck size={28} className="text-blue-400" />,
    performance: <TrendingUp size={28} className="text-amber-400" />,
    attendance: <CalendarDays size={28} className="text-emerald-400" />,
    growth: <Heart size={28} className="text-rose-400" />,
    loyalty: <Star size={28} className="text-amber-500" fill="currentColor" />,
    financial: <TrendingUp size={28} className="text-emerald-400" />,
};

export default async function MedalsPage() {
    const worker = await getCurrentWorkerProfile();
    if (!worker) return <div className="p-12 text-center text-slate-500">Perfil no encontrado.</div>;

    const supabase = await createClient();
    const [workerAchievements, totalXP, { data: allAchievements }] = await Promise.all([
        getWorkerAchievements(worker.id),
        getWorkerXP(worker.id),
        supabase.from('achievements').select('*').order('rarity, category'),
    ]);

    const earnedSet = new Set(workerAchievements.map(wa => wa.achievement_id));

    return (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800/50 pb-8">
                <div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">Showcase de Medallas</h1>
                    <p className="text-slate-400 mt-2 font-medium">Tus logros profesionales en AM Clínica.</p>
                </div>
                <div className="flex items-center gap-6 bg-slate-900/50 px-6 py-4 rounded-2xl border border-slate-800">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Desbloqueadas</p>
                        <p className="text-2xl font-black text-white">{earnedSet.size} / {allAchievements?.length || 0}</p>
                    </div>
                    <div className="w-px h-10 bg-slate-800" />
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">XP Total</p>
                        <p className="text-2xl font-black text-indigo-400">{totalXP.toLocaleString()}</p>
                    </div>
                    <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                        <Award className="text-amber-500" size={20} />
                    </div>
                </div>
            </div>

            {/* Rarity Legend */}
            <div className="flex flex-wrap gap-2">
                {(Object.keys(RARITY_CONFIG) as AchievementRarity[]).map(r => (
                    <div key={r} className={`px-3 py-1 rounded-full text-xs font-bold ${RARITY_CONFIG[r].badge}`}>
                        {RARITY_CONFIG[r].label}
                    </div>
                ))}
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {allAchievements?.map((ach) => {
                    const isEarned = earnedSet.has(ach.id);
                    const rarity = (ach.rarity || 'common') as AchievementRarity;
                    const rarityConf = RARITY_CONFIG[rarity];
                    const earnedWA = workerAchievements.find(wa => wa.achievement_id === ach.id);

                    return (
                        <div
                            key={ach.id}
                            className={`group relative overflow-hidden rounded-3xl border transition-all duration-500 ${isEarned
                                ? `bg-gradient-to-br ${rarityConf.gradient} ${rarityConf.border} ${rarityConf.glow}`
                                : 'bg-slate-950/40 border-slate-900/50 opacity-50 grayscale'
                                }`}
                        >
                            {/* Earned checkmark */}
                            {isEarned && (
                                <div className="absolute top-3 right-3">
                                    <CheckCircle2 size={18} className="text-emerald-500" />
                                </div>
                            )}

                            {/* Rarity badge */}
                            <div className="absolute top-3 left-3">
                                <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${rarityConf.badge}`}>
                                    {rarityConf.label}
                                </span>
                            </div>

                            <div className="p-6 pt-10 flex flex-col items-center text-center">
                                {/* Icon */}
                                <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-5 border transition-transform duration-500 group-hover:scale-110 ${isEarned
                                    ? 'bg-slate-950/50 border-white/10'
                                    : 'bg-slate-900 border-slate-800/50'
                                    }`}>
                                    {isEarned ? (
                                        CATEGORY_ICONS[ach.category] || <Award className="text-slate-400" size={28} />
                                    ) : (
                                        <Lock size={28} className="text-slate-700" />
                                    )}
                                </div>

                                <h3 className={`text-sm font-bold tracking-tight mb-1.5 ${isEarned ? 'text-white' : 'text-slate-500'}`}>
                                    {ach.name}
                                </h3>
                                <p className="text-slate-500 text-xs font-medium leading-relaxed">{ach.description}</p>

                                {/* XP reward */}
                                <div className="flex items-center gap-1.5 mt-4">
                                    <Zap size={12} className="text-indigo-400" />
                                    <span className="text-xs font-bold text-indigo-400">+{ach.xp_reward || 100} XP</span>
                                </div>

                                {isEarned && earnedWA?.awarded_at && (
                                    <p className="text-[10px] text-emerald-500/70 mt-2 font-medium">
                                        {new Date(earnedWA.awarded_at).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Next Goal Banner */}
            {earnedSet.size < (allAchievements?.length || 0) && (
                <div className="bg-slate-900/20 border border-slate-800/40 rounded-[3rem] p-10 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -mr-48 -mt-48" />
                    <div className="flex flex-col md:flex-row items-center gap-8 relative z-10">
                        <div className="w-24 h-24 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 flex-shrink-0">
                            <Star className="text-amber-500 animate-pulse" size={40} fill="currentColor" />
                        </div>
                        <div className="text-center md:text-left">
                            <span className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em]">Seguí Creciendo</span>
                            <h2 className="text-2xl font-black text-white tracking-tighter mt-1">
                                {(allAchievements?.length || 0) - earnedSet.size} medallas por desbloquear
                            </h2>
                            <p className="text-slate-500 font-medium mt-1.5 text-sm">
                                Completá tus objetivos y cumplí los hitos de la clínica para ganar todas las medallas.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
