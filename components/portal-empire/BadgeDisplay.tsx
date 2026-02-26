'use client';

import { ShieldCheck, Zap, Target, Award } from 'lucide-react';

const BADGE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
    'Master of Evidence': {
        icon: ShieldCheck,
        color: 'from-emerald-400 to-teal-600',
        label: 'Master of Evidence'
    },
    'Swiss Clock': {
        icon: Zap,
        color: 'from-amber-400 to-orange-600',
        label: 'Swiss Clock'
    },
    'Reception Ninja': {
        icon: Target,
        color: 'from-indigo-400 to-purple-600',
        label: 'Reception Ninja'
    },
    'Default': {
        icon: Award,
        color: 'from-slate-400 to-slate-600',
        label: 'Empirer'
    }
};

export function BadgeDisplay({ badgeName }: { badgeName: string }) {
    const config = BADGE_CONFIG[badgeName] || BADGE_CONFIG['Default'];
    const Icon = config.icon;

    return (
        <div className="flex flex-col items-center gap-1 group">
            <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center
                bg-gradient-to-br ${config.color}
                shadow-lg shadow-black/20
                ring-1 ring-white/20
                transition-transform group-hover:scale-110
            `}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <span className="text-[8px] font-black text-white/50 uppercase tracking-tighter text-center max-w-[50px] leading-tight">
                {config.label}
            </span>
        </div>
    );
}
