'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { GripVertical, Pencil, Check, X } from 'lucide-react';
import {
    DndContext,
    PointerSensor,
    KeyboardSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    verticalListSortingStrategy,
    useSortable,
    arrayMove,
    sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAuth } from '@/contexts/AuthContext';
import { updateWorkflowOrder, updateWorkflowName } from '@/app/actions/clinical-workflows';
import { toast } from 'sonner';
import type { ClinicalWorkflow } from './types';

interface WorkflowSidebarProps {
    treatmentWorkflows: ClinicalWorkflow[];
    recurrentWorkflows: ClinicalWorkflow[];
    activeWorkflowId: string | null;
}

interface SortableWorkflowItemProps {
    workflow: ClinicalWorkflow;
    isActive: boolean;
    colorClass: string;
    canEdit: boolean;
}

function SortableWorkflowItem({ workflow, isActive, colorClass, canEdit }: SortableWorkflowItemProps) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(workflow.name);
    const [saving, setSaving] = useState(false);
    const [, startTransition] = useTransition();

    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: workflow.id,
        disabled: !canEdit,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    async function handleSaveName() {
        if (!name.trim() || name.trim() === workflow.name) {
            setEditing(false);
            setName(workflow.name);
            return;
        }
        setSaving(true);
        try {
            await updateWorkflowName(workflow.id, name.trim());
            startTransition(() => {});
            toast.success('Workflow renombrado');
            setEditing(false);
        } catch {
            toast.error('No se pudo renombrar');
            setName(workflow.name);
        } finally {
            setSaving(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter') handleSaveName();
        if (e.key === 'Escape') { setEditing(false); setName(workflow.name); }
    }

    return (
        <div ref={setNodeRef} style={style} className="group flex items-center gap-1">
            {canEdit && (
                <button
                    {...attributes}
                    {...listeners}
                    className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                    tabIndex={-1}
                >
                    <GripVertical size={14} />
                </button>
            )}

            {editing ? (
                <div className="flex items-center gap-1 flex-1 min-w-0">
                    <input
                        autoFocus
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={saving}
                        className="flex-1 min-w-0 text-sm px-2 py-1 rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white outline-none"
                    />
                    <button
                        onClick={handleSaveName}
                        disabled={saving}
                        className="p-1 text-emerald-600 hover:text-emerald-700 shrink-0"
                    >
                        <Check size={14} />
                    </button>
                    <button
                        onClick={() => { setEditing(false); setName(workflow.name); }}
                        className="p-1 text-gray-400 hover:text-gray-600 shrink-0"
                    >
                        <X size={14} />
                    </button>
                </div>
            ) : (
                <div className="flex items-center flex-1 min-w-0">
                    <Link
                        href={`/workflows?section=kanban&tab=${workflow.id}`}
                        className={`flex-1 min-w-0 px-2 py-1.5 rounded-lg text-sm font-medium transition-colors truncate ${colorClass}`}
                    >
                        {workflow.name}
                    </Link>
                    {canEdit && (
                        <button
                            onClick={() => setEditing(true)}
                            className="p-1 text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        >
                            <Pencil size={12} />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default function WorkflowSidebar({ treatmentWorkflows, recurrentWorkflows, activeWorkflowId }: WorkflowSidebarProps) {
    const { categoria } = useAuth();
    const canEdit = categoria === 'owner' || categoria === 'admin';

    const [treatments, setTreatments] = useState(treatmentWorkflows);
    const [recurrents, setRecurrents] = useState(recurrentWorkflows);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    function handleDragEnd(event: DragEndEvent, group: 'treatment' | 'recurrent') {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const list = group === 'treatment' ? treatments : recurrents;
        const setList = group === 'treatment' ? setTreatments : setRecurrents;

        const oldIdx = list.findIndex(w => w.id === active.id);
        const newIdx = list.findIndex(w => w.id === over.id);
        if (oldIdx < 0 || newIdx < 0) return;

        const reordered = arrayMove(list, oldIdx, newIdx);
        setList(reordered);

        // Persist: combine both groups for global display_order
        const allReordered = group === 'treatment'
            ? [...reordered, ...recurrents]
            : [...treatments, ...reordered];

        updateWorkflowOrder(
            allReordered.map((w, i) => ({ id: w.id, display_order: i + 1 }))
        ).catch(() => toast.error('No se pudo guardar el orden'));
    }

    function renderGroup(
        label: string,
        list: ClinicalWorkflow[],
        group: 'treatment' | 'recurrent',
        activeColor: string,
        inactiveColor: string,
    ) {
        return (
            <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-2">{label}</h3>
                {list.length === 0 ? (
                    <p className="text-xs text-gray-400 px-2">Sin workflows</p>
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={e => handleDragEnd(e, group)}
                    >
                        <SortableContext items={list.map(w => w.id)} strategy={verticalListSortingStrategy}>
                            <nav className="space-y-0.5">
                                {list.map(wf => (
                                    <SortableWorkflowItem
                                        key={wf.id}
                                        workflow={wf}
                                        isActive={activeWorkflowId === wf.id}
                                        colorClass={activeWorkflowId === wf.id ? activeColor : inactiveColor}
                                        canEdit={canEdit}
                                    />
                                ))}
                            </nav>
                        </SortableContext>
                    </DndContext>
                )}
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            {canEdit && (
                <p className="text-[10px] text-gray-400 dark:text-gray-600 px-2 -mb-4">
                    Arrastrá para reordenar · Lápiz para renombrar
                </p>
            )}
            {renderGroup(
                'Tratamientos',
                treatments,
                'treatment',
                'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400',
                'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50',
            )}
            {renderGroup(
                'Recurrentes',
                recurrents,
                'recurrent',
                'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-400',
                'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/50',
            )}
        </div>
    );
}
