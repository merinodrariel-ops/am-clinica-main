'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    CheckSquare,
    Plus,
    Pin,
    AlertCircle,
    ArrowUp,
    Minus,
    ArrowDown,
    Calendar,
    User,
    Clock,
    Pencil,
    Trash2,
    RefreshCw,
    Search,
    CheckCircle2,
    Circle,
    Loader2,
    LayoutList,
    Columns3,
} from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { format, isAfter, parseISO, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';
import type { Todo, TodoPriority, TodoStatus } from '@/lib/supabase';
import NewTodoModal, { type ProfileOption } from '@/components/todos/NewTodoModal';
import TodoKanban from '@/components/todos/TodoKanban';
import { createClient } from '@/utils/supabase/client';
import { getAssignableTodoMembersAction } from '@/app/actions/todos';

// ─── Config ───────────────────────────────────────────────────────────────────

const supabase = createClient();

const PRIORITY_CONFIG: Record<TodoPriority, {
    label: string;
    color: string;
    badgeBg: string;
    dot: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
}> = {
    urgent: {
        label: 'Urgente',
        color: 'text-red-600 dark:text-red-400',
        badgeBg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
        dot: 'bg-red-500',
        icon: AlertCircle,
    },
    high: {
        label: 'Alta',
        color: 'text-orange-600 dark:text-orange-400',
        badgeBg: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
        dot: 'bg-orange-500',
        icon: ArrowUp,
    },
    medium: {
        label: 'Media',
        color: 'text-blue-600 dark:text-blue-400',
        badgeBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
        dot: 'bg-blue-500',
        icon: Minus,
    },
    low: {
        label: 'Baja',
        color: 'text-green-600 dark:text-green-400',
        badgeBg: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        dot: 'bg-green-500',
        icon: ArrowDown,
    },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string | null) {
    if (!dateStr) return null;
    const d = parseISO(dateStr);
    if (isToday(d)) return { label: 'Hoy', overdue: false, soon: true };
    if (isTomorrow(d)) return { label: 'Mañana', overdue: false, soon: true };
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (isAfter(now, d)) return { label: format(d, "d MMM", { locale: es }), overdue: true, soon: false };
    return { label: format(d, "d MMM", { locale: es }), overdue: false, soon: false };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusDot({ status }: { status: TodoStatus }) {
    if (status === 'completed') return <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />;
    if (status === 'in_progress') return (
        <div className="relative flex-shrink-0">
            <Circle size={18} className="text-blue-400" />
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            </div>
        </div>
    );
    return <Circle size={18} className="text-gray-300 dark:text-gray-600 flex-shrink-0" />;
}

function TodoCard({
    todo,
    onEdit,
    onDelete,
    onStatusChange,
    onTogglePin,
}: {
    todo: Todo;
    onEdit: (t: Todo) => void;
    onDelete: (id: string) => void;
    onStatusChange: (id: string, status: TodoStatus) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
}) {
    const pCfg = PRIORITY_CONFIG[todo.priority];
    const PIcon = pCfg.icon;
    const due = formatDueDate(todo.due_date);
    const isCompleted = todo.status === 'completed';

    // Cycle status: pending → in_progress → completed → pending
    function cycleStatus() {
        const cycle: Record<TodoStatus, TodoStatus> = {
            pending: 'in_progress',
            in_progress: 'completed',
            completed: 'pending',
        };
        onStatusChange(todo.id, cycle[todo.status]);
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className={clsx(
                'group relative rounded-2xl border bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-all duration-200',
                todo.is_pinned
                    ? 'border-amber-300 dark:border-amber-700 ring-1 ring-amber-200 dark:ring-amber-800/50'
                    : 'border-gray-200 dark:border-gray-700/60',
                isCompleted && 'opacity-70'
            )}
        >
            {/* Pinned ribbon */}
            {todo.is_pinned && (
                <div className="absolute -top-1.5 -right-1.5 z-10">
                    <div className="bg-amber-400 rounded-full p-1">
                        <Pin size={9} className="text-white fill-white" />
                    </div>
                </div>
            )}

            <div className="p-4">
                <div className="flex items-start gap-3">
                    {/* Status toggle */}
                    <button
                        onClick={cycleStatus}
                        className="mt-0.5 hover:scale-110 transition-transform"
                        title="Cambiar estado"
                    >
                        <StatusDot status={todo.status} />
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <p className={clsx(
                            'text-sm font-semibold text-gray-900 dark:text-white leading-snug',
                            isCompleted && 'line-through text-gray-400 dark:text-gray-500'
                        )}>
                            {todo.title}
                        </p>

                        {todo.description && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                {todo.description}
                            </p>
                        )}

                        {/* Meta row */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            {/* Priority badge */}
                            <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium', pCfg.badgeBg)}>
                                <PIcon size={10} />
                                {pCfg.label}
                            </span>

                            {/* Due date */}
                            {due && (
                                <span className={clsx(
                                    'inline-flex items-center gap-1 text-[11px] font-medium',
                                    due.overdue ? 'text-red-500 dark:text-red-400' : due.soon ? 'text-orange-500 dark:text-orange-400' : 'text-gray-500 dark:text-gray-400'
                                )}>
                                    <Calendar size={10} />
                                    {due.overdue && '⚠ '}{due.label}
                                </span>
                            )}

                            {/* Assignee */}
                            {todo.assigned_to_name && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                                    <User size={10} />
                                    {todo.assigned_to_name}
                                </span>
                            )}

                            {/* Created by */}
                            {todo.created_by_name && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-gray-400 dark:text-gray-500 ml-auto">
                                    <Clock size={10} />
                                    {todo.created_by_name}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions (hidden, appear on hover) */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button
                            onClick={() => onTogglePin(todo.id, !todo.is_pinned)}
                            className={clsx(
                                'p-1.5 rounded-lg transition-colors',
                                todo.is_pinned
                                    ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                                    : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            )}
                            title={todo.is_pinned ? 'Desfijar' : 'Fijar arriba'}
                        >
                            <Pin size={14} className={todo.is_pinned ? 'fill-amber-400' : ''} />
                        </button>
                        <button
                            onClick={() => onEdit(todo)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Editar"
                        >
                            <Pencil size={14} />
                        </button>
                        <button
                            onClick={() => onDelete(todo.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Eliminar"
                        >
                            <Trash2 size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type FilterStatus = 'all' | TodoStatus;
type ViewMode = 'list' | 'kanban';

export default function TodosPage() {
    const { profile, user } = useAuth();
    const [todos, setTodos] = useState<Todo[]>([]);
    const [profiles, setProfiles] = useState<ProfileOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
    const [filterPriority, setFilterPriority] = useState<TodoPriority | 'all'>('all');
    const [search, setSearch] = useState('');
    const [viewMode, setViewMode] = useState<ViewMode>('list');

    // ── Load ──
    const loadTodos = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        else setRefreshing(true);
        try {
            const { data, error } = await supabase
                .from('todos')
                .select('*')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });
            if (error) throw error;
            setTodos(data || []);
        } catch (err: unknown) {
            console.error('[Todos] load error:', err);
            const msg = err instanceof Error ? err.message : String(err);
            toast.error(`Error al cargar: ${msg}`);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { loadTodos(); }, [loadTodos]);

    // ── Load team profiles ──
    useEffect(() => {
        let cancelled = false;

        async function loadAssignableProfiles() {
            const result = await getAssignableTodoMembersAction();

            if (!cancelled) {
                if (result.success) {
                    setProfiles(result.data as ProfileOption[]);
                } else {
                    console.error('[Todos] Error loading assignable profiles:', result.error);
                    setProfiles([]);
                }
            }
        }

        loadAssignableProfiles();

        return () => {
            cancelled = true;
        };
    }, []);

    // ── Realtime: notify me when a task is assigned to me ──
    useEffect(() => {
        if (!user?.id) return;
        const channel = supabase
            .channel(`todos-assigned-${user.id}`)
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'todos', filter: `assigned_to_id=eq.${user.id}` },
                (payload) => {
                    const t = payload.new as Todo;
                    const by = t.created_by_name ? ` — de ${t.created_by_name}` : '';
                    toast(`📌 Nueva tarea asignada a vos${by}`, {
                        description: t.title,
                        duration: 6000,
                        action: { label: 'Ver', onClick: () => setFilterStatus('all') },
                    });
                    loadTodos(true);
                }
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // ── CRUD ──
    async function handleSave(data: Omit<Todo, 'id' | 'created_at' | 'updated_at' | 'created_by'>) {
        const authorName = profile?.full_name || user?.email?.split('@')[0] || 'Usuario';

        if (editingTodo) {
            const { error } = await supabase
                .from('todos')
                .update({ ...data, updated_at: new Date().toISOString() })
                .eq('id', editingTodo.id);
            if (error) {
                console.error('[Todos] update error:', error);
                toast.error(`Error al guardar: ${error.message}`);
                throw error;
            }
            toast.success('Tarea actualizada');
        } else {
            const { error } = await supabase
                .from('todos')
                .insert({
                    ...data,
                    created_by: user?.id,
                    created_by_name: authorName,
                });
            if (error) {
                console.error('[Todos] insert error:', error);
                toast.error(`Error al crear: ${error.message}`);
                throw error;
            }
            toast.success('¡Tarea creada!');

            // Send push notification to assigned user (if different from creator)
            if (data.assigned_to_id && data.assigned_to_id !== user?.id) {
                fetch('/api/push/notify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        userId: data.assigned_to_id,
                        title: '📌 Nueva tarea asignada',
                        body: data.title,
                        url: '/todos',
                        tag: 'am-tarea-nueva',
                    }),
                }).catch(console.error);
            }
        }
        setEditingTodo(null);
        await loadTodos(true);
    }

    async function handleDelete(id: string) {
        if (!confirm('¿Eliminar esta tarea?')) return;
        const { error } = await supabase.from('todos').delete().eq('id', id);
        if (error) { toast.error('Error al eliminar'); return; }
        toast.success('Tarea eliminada');
        setTodos(prev => prev.filter(t => t.id !== id));
    }

    async function handleStatusChange(id: string, status: TodoStatus) {
        const { error } = await supabase
            .from('todos')
            .update({ status, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) { toast.error('Error al actualizar estado'); return; }
        setTodos(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    }

    async function handleTogglePin(id: string, pinned: boolean) {
        const { error } = await supabase
            .from('todos')
            .update({ is_pinned: pinned, updated_at: new Date().toISOString() })
            .eq('id', id);
        if (error) { toast.error('Error al fijar'); return; }
        setTodos(prev => prev.map(t => t.id === id ? { ...t, is_pinned: pinned } : t));
        toast.success(pinned ? 'Tarea fijada' : 'Tarea desfijada');
    }

    function openEdit(todo: Todo) {
        setEditingTodo(todo);
        setShowModal(true);
    }

    function closeModal() {
        setShowModal(false);
        setEditingTodo(null);
    }

    // ── Filter ──
    const filtered = useMemo(() => {
        return todos.filter(t => {
            if (filterStatus !== 'all' && t.status !== filterStatus) return false;
            if (filterPriority !== 'all' && t.priority !== filterPriority) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!t.title.toLowerCase().includes(q) && !(t.description || '').toLowerCase().includes(q)) return false;
            }
            return true;
        });
    }, [todos, filterStatus, filterPriority, search]);

    // ── Stats ──
    const stats = useMemo(() => ({
        total: todos.length,
        pending: todos.filter(t => t.status === 'pending').length,
        in_progress: todos.filter(t => t.status === 'in_progress').length,
        completed: todos.filter(t => t.status === 'completed').length,
        urgent: todos.filter(t => t.priority === 'urgent' && t.status !== 'completed').length,
    }), [todos]);

    const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;

    // ─── Render ───────────────────────────────────────────────────────────────

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
            {/* ── Hero Header ── */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 px-6 py-10">
                {/* Decorative blobs */}
                <div className="absolute -top-10 -right-10 h-64 w-64 rounded-full bg-white/5 blur-3xl" />
                <div className="absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-white/5 blur-3xl" />

                <div className="relative max-w-5xl mx-auto">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
                        <div className="flex items-center gap-4">
                            <div className="h-14 w-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center shadow-xl border border-white/20">
                                <CheckSquare size={28} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-extrabold text-white tracking-tight">Tareas del Equipo</h1>
                                <p className="text-blue-100 text-sm mt-0.5">Lista de tareas compartida · AM Clínica</p>
                            </div>
                        </div>

                        <button
                            onClick={() => { setEditingTodo(null); setShowModal(true); }}
                            className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white text-blue-600 font-semibold text-sm shadow-lg hover:shadow-xl hover:bg-blue-50 transition-all active:scale-95"
                        >
                            <Plus size={18} />
                            Nueva tarea
                        </button>
                    </div>

                    {/* Stats row */}
                    <div className="mt-8 grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[
                            { label: 'Total', value: stats.total, color: 'text-white' },
                            { label: 'Pendientes', value: stats.pending, color: 'text-yellow-200' },
                            { label: 'En curso', value: stats.in_progress, color: 'text-blue-200' },
                            { label: 'Completadas', value: stats.completed, color: 'text-green-200' },
                            { label: 'Urgentes', value: stats.urgent, color: 'text-red-200' },
                        ].map(s => (
                            <div key={s.label} className="bg-white/10 backdrop-blur rounded-xl px-4 py-3 border border-white/15">
                                <div className={clsx('text-2xl font-bold', s.color)}>{s.value}</div>
                                <div className="text-blue-100/70 text-xs mt-0.5">{s.label}</div>
                            </div>
                        ))}
                    </div>

                    {/* Progress bar */}
                    {stats.total > 0 && (
                        <div className="mt-5">
                            <div className="flex justify-between text-xs text-blue-100/70 mb-1.5">
                                <span>Progreso del equipo</span>
                                <span>{completionPct}% completado</span>
                            </div>
                            <div className="h-2 rounded-full bg-white/15 overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${completionPct}%` }}
                                    transition={{ duration: 0.8, ease: 'easeOut' }}
                                    className="h-full bg-gradient-to-r from-green-400 to-emerald-300 rounded-full"
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="sticky top-0 z-20 bg-white/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-800 px-6 py-3">
                <div className="max-w-5xl mx-auto flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">

                    {/* Filter tabs */}
                    <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 flex-shrink-0">
                        {([
                            { key: 'all', label: 'Todas' },
                            { key: 'pending', label: 'Pendiente' },
                            { key: 'in_progress', label: 'En curso' },
                            { key: 'completed', label: 'Completadas' },
                        ] as { key: FilterStatus; label: string }[]).map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilterStatus(tab.key)}
                                className={clsx(
                                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                                    filterStatus === tab.key
                                        ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                )}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-2 flex-1 sm:max-w-sm ml-auto">
                        {/* Search */}
                        <div className="relative flex-1">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Buscar tareas..."
                                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                            />
                        </div>

                        {/* Priority filter */}
                        <select
                            value={filterPriority}
                            onChange={e => setFilterPriority(e.target.value as TodoPriority | 'all')}
                            className="py-2 px-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40 cursor-pointer"
                        >
                            <option value="all">Prioridad</option>
                            <option value="urgent">Urgente</option>
                            <option value="high">Alta</option>
                            <option value="medium">Media</option>
                            <option value="low">Baja</option>
                        </select>

                        {/* View toggle */}
                        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('list')}
                                className={clsx('p-1.5 rounded-md transition-all', viewMode === 'list' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-400 hover:text-gray-600')}
                                title="Vista lista"
                            >
                                <LayoutList size={15} />
                            </button>
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={clsx('p-1.5 rounded-md transition-all', viewMode === 'kanban' ? 'bg-white dark:bg-gray-700 shadow-sm text-blue-600' : 'text-gray-400 hover:text-gray-600')}
                                title="Vista kanban"
                            >
                                <Columns3 size={15} />
                            </button>
                        </div>

                        {/* Refresh */}
                        <button
                            onClick={() => loadTodos(true)}
                            disabled={refreshing}
                            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                            title="Actualizar"
                        >
                            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Content ── */}
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-3">
                        <Loader2 size={36} className="text-blue-500 animate-spin" />
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Cargando tareas...</p>
                    </div>
                ) : filtered.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center justify-center py-24 gap-4"
                    >
                        <div className="h-20 w-20 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                            <CheckSquare size={36} className="text-gray-300 dark:text-gray-600" />
                        </div>
                        <div className="text-center">
                            <p className="text-gray-600 dark:text-gray-300 font-semibold">
                                {search || filterStatus !== 'all' || filterPriority !== 'all'
                                    ? 'Sin resultados'
                                    : '¡Sin tareas todavía!'}
                            </p>
                            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                                {search || filterStatus !== 'all' || filterPriority !== 'all'
                                    ? 'Probá con otros filtros'
                                    : 'Creá la primera tarea del equipo'}
                            </p>
                        </div>
                        {!search && filterStatus === 'all' && filterPriority === 'all' && (
                            <button
                                onClick={() => setShowModal(true)}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/25"
                            >
                                <Plus size={16} />
                                Nueva tarea
                            </button>
                        )}
                    </motion.div>
                ) : viewMode === 'list' ? (
                    /* ── List View ── */
                    <div className="space-y-3">
                        <AnimatePresence mode="popLayout">
                            {filtered.map(todo => (
                                <TodoCard
                                    key={todo.id}
                                    todo={todo}
                                    onEdit={openEdit}
                                    onDelete={handleDelete}
                                    onStatusChange={handleStatusChange}
                                    onTogglePin={handleTogglePin}
                                />
                            ))}
                        </AnimatePresence>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-center text-xs text-gray-400 dark:text-gray-600 pt-4"
                        >
                            {filtered.length} tarea{filtered.length !== 1 ? 's' : ''}
                            {filtered.length !== todos.length && ` de ${todos.length}`}
                        </motion.p>
                    </div>
                ) : (
                    /* ── Kanban View (drag & drop) ── */
                    <TodoKanban
                        todos={filtered}
                        onStatusChange={handleStatusChange}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onTogglePin={handleTogglePin}
                        onNewTodo={() => { setEditingTodo(null); setShowModal(true); }}
                    />
                )}
            </div>

            {/* ── Floating Action Button (mobile) ── */}
            <div className="fixed bottom-6 right-6 sm:hidden z-30">
                <button
                    onClick={() => { setEditingTodo(null); setShowModal(true); }}
                    className="h-14 w-14 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/30 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
                >
                    <Plus size={24} />
                </button>
            </div>

            {/* ── Modal ── */}
            <NewTodoModal
                isOpen={showModal}
                onClose={closeModal}
                onSave={handleSave}
                initialData={editingTodo}
                profiles={profiles}
            />
        </div>
    );
}
