'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    AlertCircle,
    ArrowUp,
    Minus,
    ArrowDown,
    ChevronDown,
    Calendar,
    User,
    AlignLeft,
    Tag,
    Pin,
    Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import type { Todo, TodoPriority, TodoStatus } from '@/lib/supabase';

export interface ProfileOption {
    id: string;
    full_name: string | null;
    categoria: string;
    user_id?: string | null;
}

interface NewTodoModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Omit<Todo, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => Promise<void>;
    initialData?: Todo | null;
    profiles?: ProfileOption[];
}

const PRIORITY_CONFIG: Record<TodoPriority, { label: string; color: string; bg: string; icon: React.ComponentType<{ size?: number }> }> = {
    urgent: { label: 'Urgente', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800', icon: AlertCircle },
    high:   { label: 'Alta',    color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800', icon: ArrowUp },
    medium: { label: 'Media',   color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',   icon: Minus },
    low:    { label: 'Baja',    color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',  icon: ArrowDown },
};

const STATUS_CONFIG: Record<TodoStatus, { label: string; color: string }> = {
    pending:     { label: 'Pendiente',  color: 'text-gray-600 dark:text-gray-400' },
    in_progress: { label: 'En curso',   color: 'text-blue-600 dark:text-blue-400' },
    completed:   { label: 'Completada', color: 'text-green-600 dark:text-green-400' },
};

export default function NewTodoModal({ isOpen, onClose, onSave, initialData, profiles = [] }: NewTodoModalProps) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<TodoPriority>('medium');
    const [status, setStatus] = useState<TodoStatus>('pending');
    const [assignedToId, setAssignedToId] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [isPinned, setIsPinned] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState<{ title?: string }>({});

    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title);
            setDescription(initialData.description || '');
            setPriority(initialData.priority);
            setStatus(initialData.status);
            setAssignedToId(initialData.assigned_to_id || '');
            setDueDate(initialData.due_date || '');
            setIsPinned(initialData.is_pinned);
        } else {
            setTitle('');
            setDescription('');
            setPriority('medium');
            setStatus('pending');
            setAssignedToId('');
            setDueDate('');
            setIsPinned(false);
        }
        setErrors({});
    }, [initialData, isOpen]);

    useEffect(() => {
        if (!isOpen || !initialData?.assigned_to_id) return;

        const directOption = profiles.find((p) => p.id === initialData.assigned_to_id);
        if (directOption) {
            setAssignedToId(directOption.id);
            return;
        }

        const byUserId = profiles.find((p) => p.user_id === initialData.assigned_to_id);
        if (byUserId) {
            setAssignedToId(byUserId.id);
        }
    }, [initialData, isOpen, profiles]);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const newErrors: { title?: string } = {};
        if (!title.trim()) newErrors.title = 'El título es obligatorio';
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }

        const selectedProfile = profiles.find(p => p.id === assignedToId);
        const assignedToUserId = selectedProfile?.user_id || null;

        setSaving(true);
        try {
            await onSave({
                title: title.trim(),
                description: description.trim() || null,
                priority,
                status,
                assigned_to_id: assignedToUserId,
                assigned_to_name: selectedProfile?.full_name || null,
                created_by_name: null,
                due_date: dueDate || null,
                is_pinned: isPinned,
            });
            onClose();
        } finally {
            setSaving(false);
        }
    }

    const isEdit = !!initialData;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
                    >
                        <form
                            onSubmit={handleSubmit}
                            onClick={e => e.stopPropagation()}
                            className="pointer-events-auto w-full max-w-lg bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                        >
                            {/* Header */}
                            <div className="relative px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-800">
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                                        <Tag size={18} className="text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                                            {isEdit ? 'Editar tarea' : 'Nueva tarea'}
                                        </h2>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {isEdit ? 'Modificá los datos de la tarea' : 'Agregá una tarea al equipo'}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="absolute top-5 right-5 p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">

                                {/* Title */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        Título <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={title}
                                        onChange={e => { setTitle(e.target.value); setErrors({}); }}
                                        placeholder="¿Qué hay que hacer?"
                                        className={clsx(
                                            'w-full px-3.5 py-2.5 rounded-xl border text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 transition-all',
                                            'focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400',
                                            errors.title
                                                ? 'border-red-400 dark:border-red-600'
                                                : 'border-gray-200 dark:border-gray-700'
                                        )}
                                        autoFocus
                                    />
                                    {errors.title && (
                                        <p className="mt-1 text-xs text-red-500">{errors.title}</p>
                                    )}
                                </div>

                                {/* Description */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        <AlignLeft size={14} />
                                        Descripción
                                    </label>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Detalle opcional de la tarea..."
                                        rows={3}
                                        className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
                                    />
                                </div>

                                {/* Priority */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Prioridad
                                    </label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {(Object.entries(PRIORITY_CONFIG) as [TodoPriority, typeof PRIORITY_CONFIG[TodoPriority]][]).map(([key, cfg]) => {
                                            const Icon = cfg.icon;
                                            return (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setPriority(key)}
                                                    className={clsx(
                                                        'flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 text-xs font-medium transition-all',
                                                        priority === key
                                                            ? `${cfg.bg} ${cfg.color} border-current scale-105`
                                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                                                    )}
                                                >
                                                    <Icon size={16} />
                                                    {cfg.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Status */}
                                <div>
                                    <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                        <ChevronDown size={14} />
                                        Estado
                                    </label>
                                    <div className="flex gap-2">
                                        {(Object.entries(STATUS_CONFIG) as [TodoStatus, typeof STATUS_CONFIG[TodoStatus]][]).map(([key, cfg]) => (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => setStatus(key)}
                                                className={clsx(
                                                    'flex-1 py-2 px-3 rounded-lg border-2 text-xs font-medium transition-all',
                                                    status === key
                                                        ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                                                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                                                )}
                                            >
                                                {cfg.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Assigned to + Due date */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            <User size={14} />
                                            Asignado a
                                        </label>
                                        <div className="relative">
                                            <select
                                                value={assignedToId}
                                                onChange={e => setAssignedToId(e.target.value)}
                                                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all appearance-none pr-8"
                                            >
                                                <option value="">Sin asignar</option>
                                                {profiles.map(p => (
                                                    <option key={p.id} value={p.id}>
                                                        {p.full_name || p.categoria}{p.user_id ? '' : ' (sin usuario)'}
                                                    </option>
                                                ))}
                                            </select>
                                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                            <Calendar size={14} />
                                            Fecha límite
                                        </label>
                                        <input
                                            type="date"
                                            value={dueDate}
                                            onChange={e => setDueDate(e.target.value)}
                                            className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Pin */}
                                <button
                                    type="button"
                                    onClick={() => setIsPinned(!isPinned)}
                                    className={clsx(
                                        'flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 text-sm font-medium w-full transition-all',
                                        isPinned
                                            ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'
                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300'
                                    )}
                                >
                                    <Pin size={16} className={isPinned ? 'fill-amber-500' : ''} />
                                    {isPinned ? 'Tarea destacada (fijada arriba)' : 'Fijar tarea al tope'}
                                </button>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex gap-3 justify-end bg-gray-50/50 dark:bg-gray-900/50">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-5 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-6 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60 flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                                >
                                    {saving && <Loader2 size={14} className="animate-spin" />}
                                    {isEdit ? 'Guardar cambios' : 'Crear tarea'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
