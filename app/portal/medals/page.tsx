import { getCurrentWorkerProfile, getWorkerAchievements } from '@/app/actions/worker-portal';
import { Award, Lock, CheckCircle2, Star, Zap, Trophy, ShieldCheck, Heart } from 'lucide-react';
import { createClient } from '@/utils/supabase/server';

export default async function MedalsPage() {
    const worker = await getCurrentWorkerProfile();
    if (!worker) return <div className="p-12 text-center text-slate-500">Profile not found.</div>;

    const workerAchievements = await getWorkerAchievements(worker.id);

    // Fetch all possible achievements to show locked ones
    const supabase = await createClient();
    const { data: allAchievements } = await supabase
        .from('achievements')
        .select('*')
        .order('category');

    const earnedIds = new Set(workerAchievements.map(wa => wa.achievement_id));

    const categoryIcons: any = {
        admin: <ShieldCheck className="text-blue-400" />,
        performance: <Zap className="text-amber-400" />,
        patient_satisfaction: <Heart className="text-rose-400" />,
        education: <Trophy className="text-purple-400" />,
    };

    return (
        <div className="max-w-6xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-24">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-slate-800/50 pb-8">
                <div>
                    <h1 className="text-4xl font-extrabold text-white tracking-tighter">Medals Showcase</h1>
                    <p className="text-slate-400 mt-2 font-medium">Your clinical milestones and professional recognition.</p>
                </div>
                <div className="bg-slate-900/50 px-6 py-3 rounded-2xl border border-slate-800 flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Unlocked</p>
                        <p className="text-xl font-black text-white">{earnedIds.size} / {allAchievements?.length || 0}</p>
                    </div>
                    <div className="w-10 h-10 bg-amber-500/10 rounded-full flex items-center justify-center border border-amber-500/20">
                        <Award className="text-amber-500" size={20} />
                    </div>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {allAchievements?.map((ach) => {
                    const isEarned = earnedIds.has(ach.id);
                    return (
                        <div
                            key={ach.id}
                            className={`group relative overflow-hidden rounded-[2.5rem] border transition-all duration-500 ${isEarned
                                ? 'bg-slate-900/40 border-slate-800 hover:border-indigo-500/40 hover:bg-slate-900/60'
                                : 'bg-slate-950/40 border-slate-900/50 opacity-60 grayscale'
                                }`}
                        >
                            {isEarned && (
                                <div className="absolute top-0 right-0 p-6 pointer-events-none">
                                    <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center border border-emerald-500/20">
                                        <CheckCircle2 size={16} className="text-emerald-500" />
                                    </div>
                                </div>
                            )}

                            <div className="p-10 flex flex-col items-center text-center">
                                <div className={`w-24 h-24 rounded-3xl flex items-center justify-center mb-8 border transition-transform duration-500 group-hover:scale-110 ${isEarned
                                    ? 'bg-slate-950 border-slate-800 shadow-2xl shadow-indigo-500/10'
                                    : 'bg-slate-900 border-slate-800/50'
                                    }`}>
                                    {isEarned ? (
                                        <div className="scale-[2]">
                                            {categoryIcons[ach.category] || <Award className="text-slate-400" />}
                                        </div>
                                    ) : (
                                        <Lock size={32} className="text-slate-700" />
                                    )}
                                </div>

                                <h3 className={`text-xl font-bold tracking-tight mb-2 ${isEarned ? 'text-white' : 'text-slate-500'}`}>
                                    {ach.name}
                                </h3>
                                <p className="text-slate-500 text-sm font-medium leading-relaxed px-4">
                                    {ach.description}
                                </p>

                                {isEarned && (
                                    <div className="mt-8 pt-6 border-t border-slate-800/50 w-full">
                                        <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                                            Earned on {workerAchievements.find(wa => wa.achievement_id === ach.id)?.awarded_at
                                                ? new Date(workerAchievements.find(wa => wa.achievement_id === ach.id)!.awarded_at).toLocaleDateString()
                                                : 'Verification Pending'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Next Milestone */}
            <div className="bg-slate-900/20 border border-slate-800/40 rounded-[3rem] p-12 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-[100px] -mr-48 -mt-48"></div>
                <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
                    <div className="w-32 h-32 rounded-full bg-slate-950 flex items-center justify-center border border-slate-800 shadow-2xl">
                        <Star className="text-amber-500 animate-pulse" size={48} fill="currentColor" />
                    </div>
                    <div className="text-center md:text-left">
                        <span className="text-indigo-400 text-xs font-black uppercase tracking-[0.2em]">Next Goal</span>
                        <h2 className="text-3xl font-black text-white tracking-tighter mt-2">Clinical Ambassador</h2>
                        <p className="text-slate-500 font-medium max-w-lg mt-2">
                            Refer 5 new colleagues to the portal or help 10 patients complete their full treatment plan to unlock this legendary status.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
