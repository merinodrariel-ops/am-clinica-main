'use client';

import { Trophy, Medal, Star } from 'lucide-react';
import { GlassCard } from './GlassCard';

interface LeaderboardProps {
    entries: any[];
    currentUserId: string;
}

export function EmpireLeaderboard({ entries, currentUserId }: LeaderboardProps) {
    return (
        <GlassCard className="p-6">
            <div className="flex items-center gap-2 mb-6">
                <Trophy className="w-5 h-5 text-yellow-500" />
                <h3 className="font-black text-white uppercase tracking-wider">Top Productividad</h3>
            </div>

            <div className="space-y-4">
                {entries.slice(0, 5).map((entry, idx) => (
                    <div
                        key={entry.profileId}
                        className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${entry.profileId === currentUserId
                                ? 'bg-indigo-600/20 border-indigo-500/50 ring-1 ring-indigo-500/30'
                                : 'bg-white/5 border-white/5 hover:bg-white/10'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-xs ${idx === 0 ? 'bg-yellow-500 text-black' :
                                    idx === 1 ? 'bg-slate-300 text-black' :
                                        idx === 2 ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/50'
                                }`}>
                                {idx + 1}
                            </div>
                            <div>
                                <p className="text-sm font-bold text-white">{entry.name}</p>
                                <div className="flex gap-1 mt-1">
                                    {entry.badges.map((b: string) => (
                                        <div key={b} className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_8px_indigo]" title={b} />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-sm font-black text-indigo-400">{entry.points}</p>
                            <p className="text-[10px] text-white/30 uppercase font-bold">Puntos</p>
                        </div>
                    </div>
                ))}
            </div>
        </GlassCard>
    );
}
