'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, CheckCircle2, Circle, Clock, AlertTriangle, X } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import clsx from 'clsx';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

interface Todo {
    id: string;
    title: string;
    description: string | null;
    status: string;
    priority: string;
    created_by_name: string | null;
    due_date: string | null;
    created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
    urgent: 'text-red-400',
    high: 'text-orange-400',
    medium: 'text-yellow-400',
    low: 'text-white/40',
};

const PRIORITY_LABEL: Record<string, string> = {
    urgent: 'Urgente',
    high: 'Alta',
    medium: 'Media',
    low: 'Baja',
};

const LAST_SEEN_KEY = 'todos_bell_last_seen';

export default function NotificationBell({ userId }: { userId: string }) {
    const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );

    const [open, setOpen] = useState(false);
    const [todos, setTodos] = useState<Todo[]>([]);
    const [unread, setUnread] = useState(0);
    const panelRef = useRef<HTMLDivElement>(null);

    const { permission, subscription, loading: pushLoading, subscribe, unsubscribe } = usePushNotifications(userId);

    // ── Load assigned todos ────────────────────────────────────────────────────
    const load = async () => {
        const { data } = await supabase
            .from('todos')
            .select('id, title, description, status, priority, created_by_name, due_date, created_at')
            .eq('assigned_to_id', userId)
            .neq('status', 'completed')
            .order('created_at', { ascending: false })
            .limit(20);
        if (data) setTodos(data as Todo[]);
    };

    useEffect(() => { load(); }, [userId]);

    // ── Realtime subscription ──────────────────────────────────────────────────
    useEffect(() => {
        const channel = supabase
            .channel(`bell-todos-${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'todos',
                    filter: `assigned_to_id=eq.${userId}`,
                },
                () => { load(); }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [userId]);

    // ── Compute unread count ───────────────────────────────────────────────────
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const lastSeen = localStorage.getItem(LAST_SEEN_KEY) || '1970-01-01';
        const count = todos.filter(t => t.created_at > lastSeen).length;
        setUnread(count);
    }, [todos]);

    // ── Mark as seen when opening panel ───────────────────────────────────────
    const handleOpen = () => {
        setOpen(v => !v);
        if (!open && typeof window !== 'undefined') {
            localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
            setUnread(0);
        }
    };

    // ── Close on outside click ─────────────────────────────────────────────────
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div className="relative" ref={panelRef}>
            {/* Bell button */}
            <button
                onClick={handleOpen}
                className={clsx(
                    'relative p-2 rounded-xl transition-colors',
                    open ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                )}
                title="Mis tareas asignadas"
            >
                <Bell size={18} />
                {unread > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center"
                    >
                        {unread > 9 ? '9+' : unread}
                    </motion.span>
                )}
            </button>

            {/* Panel */}
            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -8 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -8 }}
                        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute left-0 top-full mt-2 w-80 rounded-2xl bg-[#1A1A24] border border-white/10 shadow-2xl shadow-black/60 overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
                            <div>
                                <p className="text-white text-sm font-semibold">Mis tareas</p>
                                <p className="text-white/40 text-xs">{todos.length} pendiente{todos.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/60 transition-colors">
                                <X size={15} />
                            </button>
                        </div>

                        {/* Todo list */}
                        <div className="max-h-72 overflow-y-auto divide-y divide-white/5">
                            {todos.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 gap-2">
                                    <CheckCircle2 size={28} className="text-white/10" />
                                    <p className="text-white/30 text-sm">Sin tareas pendientes</p>
                                </div>
                            )}
                            {todos.map(todo => (
                                <div key={todo.id} className="px-4 py-3 hover:bg-white/5 transition-colors">
                                    <div className="flex items-start gap-3">
                                        <div className="mt-0.5 flex-shrink-0">
                                            {todo.status === 'in_progress'
                                                ? <Clock size={14} className="text-blue-400" />
                                                : <Circle size={14} className="text-white/20" />
                                            }
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white/90 text-sm font-medium truncate">{todo.title}</p>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                <span className={clsx('text-[10px] font-semibold', PRIORITY_COLOR[todo.priority])}>
                                                    {PRIORITY_LABEL[todo.priority]}
                                                </span>
                                                {todo.created_by_name && (
                                                    <span className="text-white/30 text-[10px]">· de {todo.created_by_name}</span>
                                                )}
                                            </div>
                                            {todo.due_date && (
                                                <p className="text-white/30 text-[10px] mt-0.5 flex items-center gap-1">
                                                    <AlertTriangle size={9} className="text-orange-400" />
                                                    Vence {format(parseISO(todo.due_date), "d MMM", { locale: es })}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Push notification toggle */}
                        <div className="border-t border-white/5 px-4 py-3">
                            {permission === 'unsupported' ? (
                                <p className="text-white/30 text-xs text-center">Push no disponible en este navegador</p>
                            ) : permission === 'denied' ? (
                                <p className="text-white/30 text-xs text-center">Notificaciones bloqueadas por el navegador</p>
                            ) : (
                                <button
                                    onClick={subscription ? unsubscribe : subscribe}
                                    disabled={pushLoading}
                                    className={clsx(
                                        'w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-medium transition-colors',
                                        subscription
                                            ? 'bg-white/5 text-white/50 hover:bg-white/10'
                                            : 'bg-[#C9A96E]/10 text-[#C9A96E] border border-[#C9A96E]/20 hover:bg-[#C9A96E]/20'
                                    )}
                                >
                                    {subscription ? <BellOff size={13} /> : <Bell size={13} />}
                                    {pushLoading
                                        ? 'Procesando...'
                                        : subscription
                                            ? 'Desactivar notificaciones push'
                                            : 'Activar notificaciones push'}
                                </button>
                            )}
                        </div>

                        {/* Link to full todos page */}
                        <a
                            href="/todos"
                            onClick={() => setOpen(false)}
                            className="block text-center py-2.5 text-[#C9A96E] text-xs font-medium bg-[#C9A96E]/5 hover:bg-[#C9A96E]/10 transition-colors"
                        >
                            Ver todas las tareas →
                        </a>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
