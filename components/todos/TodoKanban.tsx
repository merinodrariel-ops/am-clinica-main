'use client';

import { useState } from 'react';
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    KeyboardSensor,
    useSensor,
    useSensors,
    useDroppable,
    useDraggable,
    closestCenter,
    DragStartEvent,
    DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AlertCircle,
    ArrowUp,
    Minus,
    ArrowDown,
    Calendar,
    User,
    Clock,
    Pencil,
    Trash2,
    Pin,
    CheckCircle2,
    Circle,
    GripVertical,
    Plus,
} from 'lucide-react';
import clsx from 'clsx';
import { format, isAfter, parseISO, isToday, isTomorrow } from 'date-fns';
import { es } from 'date-fns/locale';
import type { Todo, TodoPriority, TodoStatus } from '@/lib/supabase';

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TodoPriority, {
    label: string;
    badgeBg: string;
    icon: React.ComponentType<{ size?: number }>;
}> = {
    urgent: { label: 'Urgente', badgeBg: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300', icon: AlertCircle },
    high:   { label: 'Alta',    badgeBg: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', icon: ArrowUp },
    medium: { label: 'Media',   badgeBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: Minus },
    low:    { label: 'Baja',    badgeBg: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300', icon: ArrowDown },
};

const COLUMNS: { key: TodoStatus; label: string; accent: string; headerBg: string; dot: string; emptyMsg: string }[] = [
    {
        key: 'pending',
        label: 'Pendiente',
        accent: 'border-t-gray-400 dark:border-t-gray-500',
        headerBg: 'bg-gray-50 dark:bg-gray-800/60',
        dot: 'bg-gray-400',
        emptyMsg: 'Sin tareas pendientes',
    },
    {
        key: 'in_progress',
        label: 'En curso',
        accent: 'border-t-blue-500',
        headerBg: 'bg-blue-50 dark:bg-blue-900/20',
        dot: 'bg-blue-500',
        emptyMsg: 'Arrastrá una tarea acá',
    },
    {
        key: 'completed',
        label: 'Completada',
        accent: 'border-t-emerald-500',
        headerBg: 'bg-emerald-50 dark:bg-emerald-900/20',
        dot: 'bg-emerald-500',
        emptyMsg: 'Todavía sin completar',
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDueDate(dateStr: string | null) {
    if (!dateStr) return null;
    const d = parseISO(dateStr);
    if (isToday(d)) return { label: 'Hoy', overdue: false, soon: true };
    if (isTomorrow(d)) return { label: 'Mañana', overdue: false, soon: true };
    const now = new Date(); now.setHours(0, 0, 0, 0);
    if (isAfter(now, d)) return { label: format(d, 'd MMM', { locale: es }), overdue: true, soon: false };
    return { label: format(d, 'd MMM', { locale: es }), overdue: false, soon: false };
}

// ─── Draggable Card ───────────────────────────────────────────────────────────

function DraggableCard({
    todo,
    onEdit,
    onDelete,
    onTogglePin,
    isDragOverlay = false,
}: {
    todo: Todo;
    onEdit: (t: Todo) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
    isDragOverlay?: boolean;
}) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: todo.id });
    const pCfg = PRIORITY_CONFIG[todo.priority];
    const PIcon = pCfg.icon;
    const due = formatDueDate(todo.due_date);
    const isCompleted = todo.status === 'completed';

    return (
        <div
            ref={isDragOverlay ? undefined : setNodeRef}
            className={clsx(
                'group relative bg-white dark:bg-gray-900 rounded-xl border shadow-sm transition-all duration-150',
                isDragging && !isDragOverlay
                    ? 'opacity-30 shadow-none scale-98 border-dashed border-gray-300 dark:border-gray-600'
                    : 'border-gray-200 dark:border-gray-700/60',
                isDragOverlay && 'shadow-2xl shadow-black/20 rotate-1 scale-105 border-blue-300 dark:border-blue-600 cursor-grabbing',
                todo.is_pinned && !isDragOverlay && 'ring-1 ring-amber-300 dark:ring-amber-700 border-amber-300 dark:border-amber-700',
            )}
        >
            {/* Pin badge */}
            {todo.is_pinned && (
                <div className="absolute -top-1.5 -right-1.5 z-10 bg-amber-400 rounded-full p-1">
                    <Pin size={8} className="text-white fill-white" />
                </div>
            )}

            <div className="p-3.5">
                <div className="flex items-start gap-2.5">
                    {/* Drag handle */}
                    <button
                        {...listeners}
                        {...attributes}
                        className={clsx(
                            'mt-0.5 flex-shrink-0 text-gray-300 dark:text-gray-600 touch-none',
                            isDragOverlay ? 'cursor-grabbing' : 'cursor-grab hover:text-gray-400 dark:hover:text-gray-500'
                        )}
                        aria-label="Arrastrar"
                        tabIndex={-1}
                    >
                        <GripVertical size={15} />
                    </button>

                    {/* Status icon */}
                    <div className="mt-0.5 flex-shrink-0">
                        {isCompleted
                            ? <CheckCircle2 size={15} className="text-emerald-500" />
                            : todo.status === 'in_progress'
                                ? <div className="relative"><Circle size={15} className="text-blue-300" /><div className="absolute inset-0 flex items-center justify-center"><div className="h-1.5 w-1.5 rounded-full bg-blue-500" /></div></div>
                                : <Circle size={15} className="text-gray-300 dark:text-gray-600" />
                        }
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                        <p className={clsx(
                            'text-sm font-semibold text-gray-900 dark:text-white leading-snug',
                            isCompleted && 'line-through text-gray-400 dark:text-gray-500'
                        )}>
                            {todo.title}
                        </p>

                        {todo.description && (
                            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-relaxed">
                                {todo.description}
                            </p>
                        )}

                        {/* Meta row */}
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className={clsx('inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold', pCfg.badgeBg)}>
                                <PIcon size={9} />
                                {pCfg.label}
                            </span>

                            {due && (
                                <span className={clsx(
                                    'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md',
                                    due.overdue
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                        : due.soon
                                            ? 'bg-orange-100 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                )}>
                                    <Calendar size={9} />
                                    {due.label}
                                </span>
                            )}

                            {todo.assigned_to_name && (
                                <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-md">
                                    <User size={9} />
                                    {todo.assigned_to_name}
                                </span>
                            )}
                        </div>

                        {todo.created_by_name && (
                            <div className="mt-2 flex items-center gap-1 text-[10px] text-gray-300 dark:text-gray-600">
                                <Clock size={9} />
                                {todo.created_by_name}
                            </div>
                        )}
                    </div>
                </div>

                {/* Hover actions */}
                {!isDragOverlay && (
                    <div className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-800 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => onTogglePin(todo.id, !todo.is_pinned)}
                            className={clsx(
                                'p-1.5 rounded-lg text-xs transition-colors',
                                todo.is_pinned
                                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'
                                    : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-800'
                            )}
                            title={todo.is_pinned ? 'Desfijar' : 'Fijar'}
                        >
                            <Pin size={13} className={todo.is_pinned ? 'fill-amber-400' : ''} />
                        </button>
                        <button
                            onClick={() => onEdit(todo)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                            title="Editar"
                        >
                            <Pencil size={13} />
                        </button>
                        <button
                            onClick={() => onDelete(todo.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Eliminar"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Droppable Column ─────────────────────────────────────────────────────────

function DroppableColumn({
    col,
    todos,
    isOver,
    onEdit,
    onDelete,
    onTogglePin,
    onNewTodo,
}: {
    col: typeof COLUMNS[number];
    todos: Todo[];
    isOver: boolean;
    onEdit: (t: Todo) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
    onNewTodo: () => void;
}) {
    const { setNodeRef } = useDroppable({ id: col.key });

    return (
        <div className="flex flex-col gap-3 min-w-0">
            {/* Column header */}
            <div className={clsx(
                'rounded-2xl border-t-4 px-4 py-3 flex items-center gap-2',
                col.accent,
                col.headerBg,
                'border border-gray-200 dark:border-gray-700/50',
            )}>
                <div className={clsx('h-2 w-2 rounded-full', col.dot)} />
                <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{col.label}</span>
                <span className={clsx(
                    'ml-auto h-5 min-w-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center',
                    todos.length > 0
                        ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600'
                )}>
                    {todos.length}
                </span>
                <button
                    onClick={onNewTodo}
                    className="p-1 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-white/80 dark:hover:bg-gray-700 transition-colors"
                    title="Nueva tarea"
                >
                    <Plus size={14} />
                </button>
            </div>

            {/* Drop zone */}
            <div
                ref={setNodeRef}
                className={clsx(
                    'flex-1 flex flex-col gap-2.5 min-h-[200px] rounded-2xl p-2 transition-all duration-200',
                    isOver
                        ? 'bg-blue-50/80 dark:bg-blue-900/10 ring-2 ring-blue-400/50 ring-dashed'
                        : 'bg-gray-100/50 dark:bg-gray-800/30'
                )}
            >
                <AnimatePresence mode="popLayout">
                    {todos.length === 0 ? (
                        <motion.div
                            key="empty"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex-1 flex flex-col items-center justify-center gap-2 py-10"
                        >
                            <div className={clsx('h-8 w-8 rounded-full flex items-center justify-center', col.headerBg)}>
                                <div className={clsx('h-2.5 w-2.5 rounded-full opacity-40', col.dot)} />
                            </div>
                            <p className="text-xs text-gray-400 dark:text-gray-600 text-center">{col.emptyMsg}</p>
                        </motion.div>
                    ) : (
                        todos.map(todo => (
                            <motion.div
                                key={todo.id}
                                layout
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ type: 'spring', damping: 22, stiffness: 280 }}
                            >
                                <DraggableCard
                                    todo={todo}
                                    onEdit={onEdit}
                                    onDelete={onDelete}
                                    onTogglePin={onTogglePin}
                                />
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

// ─── Main Kanban Component ────────────────────────────────────────────────────

interface TodoKanbanProps {
    todos: Todo[];
    onStatusChange: (id: string, status: TodoStatus) => Promise<void>;
    onEdit: (t: Todo) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string, pinned: boolean) => void;
    onNewTodo: () => void;
}

export default function TodoKanban({
    todos,
    onStatusChange,
    onEdit,
    onDelete,
    onTogglePin,
    onNewTodo,
}: TodoKanbanProps) {
    const [activeId, setActiveId] = useState<string | null>(null);
    const [overId, setOverId] = useState<TodoStatus | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const activeTodo = activeId ? todos.find(t => t.id === activeId) ?? null : null;

    function handleDragStart({ active }: DragStartEvent) {
        setActiveId(active.id as string);
    }

    function handleDragOver({ over }: { over: DragEndEvent['over'] }) {
        setOverId(over ? (over.id as TodoStatus) : null);
    }

    async function handleDragEnd({ active, over }: DragEndEvent) {
        setActiveId(null);
        setOverId(null);
        if (!over) return;

        const draggedTodo = todos.find(t => t.id === active.id);
        if (!draggedTodo) return;

        const newStatus = over.id as TodoStatus;
        if (draggedTodo.status === newStatus) return;

        await onStatusChange(draggedTodo.id, newStatus);
    }

    function getTodosForColumn(status: TodoStatus) {
        return todos
            .filter(t => t.status === status)
            .sort((a, b) => {
                // Pinned first
                if (a.is_pinned && !b.is_pinned) return -1;
                if (!a.is_pinned && b.is_pinned) return 1;
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            });
    }

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
        >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {COLUMNS.map(col => (
                    <DroppableColumn
                        key={col.key}
                        col={col}
                        todos={getTodosForColumn(col.key)}
                        isOver={overId === col.key}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onTogglePin={onTogglePin}
                        onNewTodo={onNewTodo}
                    />
                ))}
            </div>

            <DragOverlay dropAnimation={{
                duration: 180,
                easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)',
            }}>
                {activeTodo ? (
                    <DraggableCard
                        todo={activeTodo}
                        onEdit={() => {}}
                        onDelete={() => {}}
                        onTogglePin={() => {}}
                        isDragOverlay
                    />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}
