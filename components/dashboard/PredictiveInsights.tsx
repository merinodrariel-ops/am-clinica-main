'use client';

import { useEffect, useState } from 'react';
import { Sparkles, TrendingUp, TrendingDown, Target, Lightbulb, Zap, Loader2 } from 'lucide-react';

interface Analysis {
    forecast: {
        nextMonthRevenue: number;
        confidence: number;
        trend: 'up' | 'down' | 'stable';
    };
    insights: string[];
    recommendations: string[];
}

export default function PredictiveInsights() {
    const [data, setData] = useState<Analysis | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchPulse() {
            try {
                const res = await fetch('/api/dashboard/predictive-pulse');
                const json = await res.json();
                if (json.analysis) {
                    setData(json.analysis);
                }
            } catch (err) {
                console.error('Pulse fetch error:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchPulse();
    }, []);

    if (loading) {
        return (
            <div className="glass-card rounded-2xl p-6 mb-6 animate-pulse" style={{ background: 'hsla(230, 15%, 12%, 0.6)' }}>
                <div className="flex items-center gap-3 mb-4">
                    <div className="h-10 w-10 rounded-xl bg-white/5" />
                    <div className="h-6 w-48 rounded-lg bg-white/5" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-3">
                        <div className="h-4 w-24 rounded bg-white/5" />
                        <div className="h-12 w-full rounded bg-white/5" />
                    </div>
                    <div className="space-y-3">
                        <div className="h-4 w-24 rounded bg-white/5" />
                        <div className="h-12 w-full rounded bg-white/5" />
                    </div>
                </div>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="glass-card rounded-2xl p-6 mb-6 relative overflow-hidden group border border-white/5 hover:border-white/10 transition-all duration-500"
            style={{ background: 'linear-gradient(135deg, hsla(230, 15%, 12%, 0.7), hsla(230, 15%, 15%, 0.4))' }}>

            {/* Background Accent */}
            <div className="absolute -top-24 -right-24 w-64 h-64 bg-indigo-500/10 blur-[100px] rounded-full group-hover:bg-indigo-500/15 transition-all duration-700" />

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                            style={{ background: 'linear-gradient(135deg, hsla(260, 100%, 70%, 0.2), hsla(220, 100%, 70%, 0.1))' }}>
                            <Sparkles size={20} className="text-indigo-400 animate-pulse" />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-white/90 tracking-tight">Predictive Pulse</h3>
                            <p className="text-xs text-white/40">Powered by Gemini AI — Clinical Intelligence</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/5">
                        <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                        <span className="text-[10px] uppercase tracking-wider font-bold text-white/60">Live Analysis</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                    {/* Forecast Section */}
                    <div className="md:col-span-4 bg-white/[0.03] rounded-2xl p-5 border border-white/5">
                        <div className="flex items-center gap-2 mb-4 text-white/50">
                            <Target size={14} />
                            <span className="text-xs font-medium uppercase tracking-widest">Forecast Próximo Mes</span>
                        </div>

                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-bold text-white tracking-tight">
                                ${data.forecast.nextMonthRevenue.toLocaleString()}
                            </span>
                            <span className="text-sm text-white/40 font-medium">USD</span>
                        </div>

                        <div className="mt-4 flex items-center gap-3">
                            <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(99,102,241,0.4)]"
                                    style={{ width: `${data.forecast.confidence}%` }} />
                            </div>
                            <span className="text-[10px] font-bold text-white/50">{data.forecast.confidence}% conf.</span>
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-xs font-medium">
                            {data.forecast.trend === 'up' ? (
                                <div className="flex items-center gap-1 text-green-400">
                                    <TrendingUp size={14} />
                                    <span>Tendencia alcista detectada</span>
                                </div>
                            ) : data.forecast.trend === 'down' ? (
                                <div className="flex items-center gap-1 text-red-400">
                                    <TrendingDown size={14} />
                                    <span>Alerta de desaceleración</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 text-blue-400">
                                    <Zap size={14} />
                                    <span>Crecimiento sostenido</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Insights & Recommendations */}
                    <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                        <div>
                            <div className="flex items-center gap-2 mb-3 text-white/50">
                                <Lightbulb size={14} className="text-amber-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Insights Clave</span>
                            </div>
                            <ul className="space-y-3">
                                {data.insights.map((insight, i) => (
                                    <li key={i} className="text-xs text-white/70 leading-relaxed flex gap-2">
                                        <div className="h-1 w-1 rounded-full bg-indigo-400 mt-1.5 flex-shrink-0" />
                                        {insight}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-3 text-white/50">
                                <Zap size={14} className="text-blue-400" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Recomendaciones</span>
                            </div>
                            <ul className="space-y-3">
                                {data.recommendations.map((rec, i) => (
                                    <li key={i} className="text-xs text-white/70 leading-relaxed flex gap-2">
                                        <div className="h-1 w-1 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                                        {rec}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
