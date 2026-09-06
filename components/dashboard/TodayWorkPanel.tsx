'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { createClient } from '@/utils/supabase/client';
import { loadTodayWork, type TodayWorkCounts } from '@/lib/today-work';

export default function TodayWorkPanel() {
    const { moduleAccess, user } = useAuth();
    const todos = moduleAccess('todos') !== 'none';
    const recalls = moduleAccess('recalls') !== 'none';
    const workflows = moduleAccess('workflows') !== 'none';
    const emails = moduleAccess('email_templates') !== 'none';
    const [counts, setCounts] = useState<TodayWorkCounts | null>(null);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            setCounts(await loadTodayWork(createClient(), { todos, recalls }));
        } catch {
            setCounts({ todos: null, recalls: null });
        } finally {
            setLoading(false);
        }
    }, [todos, recalls]);

    useEffect(() => {
        void refresh();
        const onFocus = () => { void refresh(); };
        window.addEventListener('focus', onFocus);
        return () => window.removeEventListener('focus', onFocus);
    }, [refresh, user?.id]);

    if (!todos && !recalls) return null;
    const items = [
        ...(todos ? [{ key: 'todos' as const, label: 'Tareas del equipo', detail: 'Para hoy y vencidas', href: '/todos' }] : []),
        ...(recalls ? [{ key: 'recalls' as const, label: 'Seguimientos', detail: 'Contactos pendientes', href: '/recalls' }] : []),
    ];

    return (
        <section className="mb-6 rounded-xl border border-white/10 p-4" aria-labelledby="today-work-title">
            <div className="mb-3 flex items-center justify-between">
                <h2 id="today-work-title" className="font-semibold text-white">Pendientes de hoy</h2>
                <button type="button" onClick={refresh} disabled={loading} aria-label="Actualizar pendientes" className="rounded p-2 text-slate-400 hover:text-white disabled:opacity-50">
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                </button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2" aria-live="polite" aria-busy={loading}>
                {items.map(item => (
                    <Link key={item.key} href={item.href} className="flex items-center gap-3 rounded-lg bg-white/5 p-3 hover:bg-white/10">
                        <span className="min-w-8 text-xl font-semibold text-emerald-400">{counts?.[item.key] ?? '—'}</span>
                        <span className="flex-1 text-sm text-slate-200">{item.label}<span className="block text-xs text-slate-400">{counts && counts[item.key] === null ? 'No se pudo cargar. Reintentá.' : item.detail}</span></span>
                        <ArrowRight size={16} className="text-slate-400" />
                    </Link>
                ))}
            </div>
            {(workflows || emails) && <div className="mt-3 flex gap-4 text-xs text-slate-400">
                {workflows && <Link className="hover:text-white" href="/workflows">Ver workflows</Link>}
                {emails && <Link className="hover:text-white" href="/admin/emails">Plantillas de email</Link>}
            </div>}
        </section>
    );
}
