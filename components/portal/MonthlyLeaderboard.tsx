import { getMonthlyLeaderboard, LeaderboardEntry } from '@/app/actions/liquidaciones';
import { Trophy, Medal, Star } from 'lucide-react';
import Link from 'next/link';

const RANK_STYLE: Record<number, { bg: string; border: string; icon: React.ReactNode; label: string }> = {
    1: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: <Trophy size={16} className="text-amber-400" />, label: '🥇' },
    2: { bg: 'bg-slate-700/30', border: 'border-slate-600/30', icon: <Medal size={16} className="text-slate-300" />, label: '🥈' },
    3: { bg: 'bg-orange-800/10', border: 'border-orange-700/20', icon: <Star size={16} className="text-orange-400" />, label: '🥉' },
};

function defaultStyle() {
    return { bg: 'bg-slate-900/40', border: 'border-slate-800/40', icon: null, label: '' };
}

interface Props {
    limit?: number;
    compact?: boolean;
}

export default async function MonthlyLeaderboard({ limit = 5, compact = false }: Props) {
    const entries = await getMonthlyLeaderboard(limit);

    if (entries.length === 0) {
        return (
            <div className="text-center text-slate-500 text-sm py-6">
                No hay datos de XP para este mes aún.
            </div>
        );
    }

    const now = new Date();
    const mesLabel = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

    return (
        <div className="space-y-3">
            {!compact && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">
                        Ranking · {mesLabel}
                    </p>
                    <Link href="/admin/liquidaciones" className="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                        Ver liquidaciones →
                    </Link>
                </div>
            )}

            {entries.map((entry) => {
                const style = RANK_STYLE[entry.ranking] ?? defaultStyle();
                const initials = `${entry.nombre[0]}${entry.apellido?.[0] || ''}`.toUpperCase();

                return (
                    <div
                        key={entry.personal_id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${style.bg} ${style.border} transition-all`}
                    >
                        {/* Rank */}
                        <div className="w-6 text-center text-xs font-bold text-slate-400">
                            {style.label || `#${entry.ranking}`}
                        </div>

                        {/* Avatar */}
                        {entry.foto_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={entry.foto_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300 flex-shrink-0">
                                {initials}
                            </div>
                        )}

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">
                                {entry.nombre} {entry.apellido}
                            </p>
                            <p className="text-xs text-slate-500">{entry.rol || entry.area}</p>
                        </div>

                        {/* XP */}
                        <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-violet-300">{entry.xp_total.toLocaleString()} XP</p>
                            <p className="text-xs text-slate-500">{entry.badges_count} medallas</p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
